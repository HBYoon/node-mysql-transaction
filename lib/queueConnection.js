var events = require("events");

module.exports = queueConnection;
function queueConnection (connection, timeOut, queue, connectionsArr){
	
	var timer;
	
	var query = Object.getPrototypeOf(connection).query;
	var connectionQuery = Object.getPrototypeOf(connection).query.bind(connection);
	
	// current transaction function -> from store.pop();
	var currentTransaction;
	
	// current connection -> only for unlock function
	var currentConnection
	
	// for soft transaction cut
	var workCut = false;
	
	var lock = false;
	
	var safeConMethod = {
		query: function(){
			// if current transaction on, new timer set and, query start.
			var err;
			if (currentTransaction !== this.target) {
				err = new Error('out of transaction');
				// if request is not a current transaction, query try send error to callback and throw error
				for (var i in arguments) {
					if (typeof arguments[i] === 'function') {
						return arguments[i](err);
					}
				};
				throw err;
			}
			
			if (timeOut) {
				if (timer) {
					clearTimeout(timer);
				}
				timer = setTimeout(function(){
					this.rollback(new Error('transaction request time over'));
				}.bind(this),timeOut);
			}
			return query.apply(connection, arguments);
		},
		commit: function(callback){
			if (currentTransaction !== this.target) {
				return;
			}
			
			currentTransaction = null;
			this.emit('commit');
			this.removeAllListeners();
				
			return commitReq(callback);
		},
		rollback: function(reason, callback){
			if (currentTransaction !== this.target) {
				return;
			}
			
			currentTransaction = null;
			
			if (typeof reason === 'function') {
				callback = reason;
				reason = undefined;
			}
			
			this.emit('rollback', reason);
			this.removeAllListeners();
			
			return rollbackReq(reason, callback);

		},
		usable: function(){
			return (currentTransaction === this.target);
		}
	};
	
	// return transaction connection(safeConnection)
	// safeConnection has commit and rollback API for transaction finish
	function safeConnectionFactory (target) {
		// main query function
		var safeConnection = new events.EventEmitter();
		safeConnection.target = target;
		safeConnection.usable = safeConMethod.usable.bind(safeConnection);
		
		safeConnection.query = safeConMethod.query.bind(safeConnection);
		
		// if request is not a current transaction...
		safeConnection.commit = safeConMethod.commit.bind(safeConnection);
		
		// also...
		safeConnection.rollback = safeConMethod.rollback.bind(safeConnection);
		
		return safeConnection;
	};
	
	function nextQuery () {
		if (!queue.length || workCut) {
			lock = false;
			return
		}
		lock = true;
		currentTransaction = queue.pop();
		
		var safeConnection = safeConnectionFactory(currentTransaction);
		currentConnection = safeConnection;
		
		connectionQuery('START TRANSACTION', function(err){
			
			if (!currentTransaction) {
				return;
			}
			if (err) {
				nextQuery();
				return currentTransaction(err);
			}
			currentTransaction(undefined, safeConnection);
		});
	};
	
	// internal commit and rollback request query sender
	function commitReq (callback) {
		connectionQuery('COMMIT', function(err, result){
			if(callback){
				callback(err);
			}
		});
		nextQuery();
	};
	
	function rollbackReq (reason, callback) {
		connectionQuery('ROLLBACK', function(err, result){
			if (callback) {
				if (err) {
					callback(err);
				}
				callback(reason);
			}
		});
		nextQuery();
	};
	
	connection.unlock = function(forced){
		if (forced === 'commit') {
			return currentConnection.commit();
		}
		currentConnection.rollback(new Error('forced rollback'));
	};
	
	connection.lockCheck = function(){
		return lock;
	};
	
	connection.nextQuery = function(){
		if (lock) {
			return;
		}
		nextQuery();
	};
	
	// connection soft cut off, guaranteed current transaction's safety
	// before 
	connection.connectionCut = function(){
		var i = connectionsArr.length;
		while (i) {
			i-=1;
			if (connectionsArr[i] === connection) {
				throw new Error('unprepared cut off request');
			}
		};
		workCut = true;
		(function endLoop () {
			if (lock) {
				return setTimeout(endLoop,50);
			}
			connection.end(function(err){
				return;
			});
		})();
	};
	
	connection.query = function(){
		throw new Error('unsafe query try');
	};
	
	return connection;
};