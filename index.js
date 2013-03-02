// MySQL/MariaDB  transactions link
var events = require("events");

module.exports = function interfaceFun (opt) {
	opt.connection = opt.connection;
	opt.connectionNumber = opt.connectionNumber || 1;
	opt.timeOut = opt.timeOut || 0;
	
	if (opt.connectionNumber === 1) {
		return (
		// make connection and each factory function will add some method to connection object
			quaryFactory(
				chainFactory(
					queueHandlerFactory(
						singleQueueFactory(
							connectionFactory(opt))))));
	}
	return multi(opt);
};

function multi (opt) {
	var connectionNumber = opt.connectionNumber;
	var connectionArr = [];
	for (var i = 0; i < connectionNumber; i += 1) {
		connectionArr[i] = (
			quaryFactory(
				chainFactory(
					queueHandlerFactory(
						singleQueueFactory(
							connectionFactory(opt))))));
	};
	return {
		// method for parallel connection queue management
		connections: connectionArr,
		set: function(){
			var bestQueue = this.bestQueue();
			return bestQueue.set.apply(null, arguments);
		},
		query: function(){
			var chain = this.chainQueue();
			if (chain) {
				return chain.query.apply(null, arguments);
			}
			var bestQueue = this.bestQueue();
			return bestQueue.query.apply(null, arguments);
		},
		chain: function(){
			var bestQueue = this.bestQueue();
			return bestQueue.chain.apply(null, arguments);
		},
		queuesLength: function(){
			var returnArr = [];
			for (var i = 0; i < this.connections.length; i += 1) {
				returnArr[i] = this.connections[i].queueLength;
			}
			return returnArr;
		},
		chainQueue: function(){
			// return connection if transaction callback function is on
			for (var i = 0; i < this.connections.length; i += 1) {
				if (this.connections[i].chainReady) {
					return this.connections[i];
				}
			}
		},
		bestQueue: function(){
			var betterQueue = [NaN,Infinity];
			var queue;
			for (var i = 0; i < this.connections.length; i += 1) {
				queue = [i, this.connections[i].queueLength()];
				if (queue[1] < betterQueue[1]) {
					betterQueue = queue;
				}
			}
			return this.connections[betterQueue[0]];
		},
	};
};

function connectionFactory (opt) {
	// connection = mysql.createConnection();
	var connection = opt.connection[0](opt.connection[1]);
	
	// set option value;
	connection._trOpt = opt;
	
	return connection;
};

/*
base transaction queue
yy mm dd
13 03 01 queue design frozen
13 03 02 unlock function update
*/
function singleQueueFactory (connection) {
	
// option var
	// Timeout is always check from last query request
	var timeOut = connection._trOpt.timeOut;
	
// base transaction queue
// internal var
	// internal connection.query function
	var query = Object.getPrototypeOf(connection).query;
	var connectionQuery = Object.getPrototypeOf(connection).query.bind(connection);
	
	// timer if opt.timeOut existed
	var timer;
	
	// callback function queue store
	var store = [];
	
	// block new query start when transaction working
	var lock = false;
	
	// current transaction function -> from store.pop();
	var currentTransaction;
	
	// current connection -> only for unlock function
	var currentConnection;
	
	// return transaction connection(safeConnection)
	// safeConnection has commit and rollback API for transaction finish
	function safeConnectionFactory (target) {
		// main query function
		var safeConnection = new events.EventEmitter();
		
		safeConnection.usable = function(){
			return (currentTransaction === target);
		};
		
		safeConnection.query = function(){
			// if current transaction on, new timer set and, query start.
			var err;
			if (currentTransaction !== target) {
				err = new Error('out of transaction');
				// if request is not a current transaction, query try send error to callback and emit error event
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
					safeConnection.rollback(new Error('transaction request time over'));
				},timeOut);
			}
			return query.apply(connection, arguments);
		};
		
		// if request is not a current trans..
		safeConnection.commit = function(callback){
			if (currentTransaction !== target) {
				return;
			}
			
			currentTransaction = null;
			safeConnection.emit('commit');
			safeConnection.removeAllListeners();
				
			return commitReq(callback);
		};
		
		// also...
		safeConnection.rollback = function(reason, callback){
			if (currentTransaction !== target) {
				return;
			}
			
			currentTransaction = null;
			
			if (typeof reason === 'function') {
				callback = reason;
				reason = undefined;
			}
			
			safeConnection.emit('rollback', reason);
			safeConnection.removeAllListeners();
			
			return rollbackReq(reason, callback);

		};
		
		return safeConnection;
	};
	
	// call the next transaction function
	function nextQuery () {
		if (!store.length) {
			lock = false;
			return
		}
		lock = true;
		currentTransaction = store.pop();
		
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
	
	// transaction start point set
	// start point is the callback function what will receive error or safeConnection
	connection.set = function(setPoint) {
		store.unshift(setPoint);
		if (!lock) {
			return nextQuery();
		}
	};
	
	// unlock can forced commit and rollback from the outside
	connection.unlock = function(forced){
		if (forced === 'commit') {
			return currentConnection.commit();
		}
		currentConnection.rollback(new Error('forced rollback'));
	}
	
	connection.queueLength = function(){
		return store.length;
	};
	
	connection._store = store;
	
	return connection;
};

/*
queue handling wrapper
reserve for connections._store handling method(not yet)
*/
function queueHandlerFactory (connection) {
	
	return connection;
};

// after here, all factory function is wrapper maker of connection.set method

/*
chain query transaction wrapper
test pass 130301
*/
function chainFactory (connection) {
	
	// minimum safty timer for chain work commit
	// safeCon._count is count of not finished query
	function commitLoopFactory (safeCon) {
		return (function commitLoop () {
			if (safeCon.usable()){
				if (safeCon._count === 0){
					return safeCon.commit.bind(safeCon)()
				}
				return process.nextTick(commitLoop);
			}
			return;
		});
	};
	
	// rollback dose't need any safty timer
	function rollbackFacroty (safeCon) {
		return function(err){
			safeCon._count = 0;
			safeCon.rollback.bind(safeCon)(err);
		}
	};
	
	function objAdder (safeCon, mainObj) {
		mainObj._safeCon = safeCon;
		mainObj.commit = commitLoopFactory(safeCon);
		mainObj.rollback = rollbackFacroty(safeCon);
	};
	
	function autoErrorRollback (mainObj) {
		var errorEvent = mainObj.listeners('error');
		if (errorEvent.length === 0) {
			mainObj.on('error', function(err) {
				mainObj.rollback(err);
			});
		}
	};
	
	function mainEventMover (safeCon, mainObj) {
		var commitEvent = mainObj.listeners('commit');
		var rollbackEvent = mainObj.listeners('rollback');
		if (commitEvent) {
			for (var k = 0; k < commitEvent.length; k += 1) {
				safeCon.once('commit', commitEvent[k]);
			}
		}
		if (rollbackEvent) {
			for (var i = 0; i < rollbackEvent.length; i += 1) {
				safeCon.once('rollback', rollbackEvent[i]);
			}
		}
		mainObj.removeAllListeners('commit');
		mainObj.removeAllListeners('rollback');
	};
	
	function streamEventMover (mainObj, stream) {
		var tempArr = [];
		var tempLength;
		
		for (var i in stream._events) {
			tempArr = stream.listeners(i);
			tempLength = tempArr.length;
			if (tempLength) {
				for (var k = 0; k < tempLength; k += 1) {
					mainObj.on(i, tempArr[k]);
				}
			}
		}
		stream.removeAllListeners();
	};
	
	function eventConnector (mainObj, stream) {
		// it also can write o.__proto__.__proto... chain
		var streamEvent = (
			Object.getPrototypeOf(
				Object.getPrototypeOf(
					Object.getPrototypeOf(stream)
				)
			)
		);
		for (var evMethod in streamEvent) {
			stream[evMethod] = stream[evMethod].bind(mainObj);
		}
	};
	
	function autoCommitReady (mainObj) {
		mainObj.on('end', function(){
			mainObj.commit();
		});
	};
	
	// main procedure function
	function chainQueryRun (safeCon, arg, mainObj) {
		
		objAdder(safeCon, mainObj);
		autoErrorRollback(mainObj);
		mainEventMover(safeCon, mainObj);
		
		var stream;
		try {
			stream = safeCon.query.apply(null, arg);
		} catch(e) {
			return mainObj.rollback(e);
		}
		
		safeCon._count += 1;
		mainObj.stream = stream;
		mainObj.emit('nextChain', safeCon);
		
		streamEventMover(mainObj, stream);
		eventConnector(mainObj, stream);
		
		if (mainObj._autoCommit) {
			autoCommitReady(mainObj);
		}
		mainObj.on('end', function(){
			safeCon._count -= 1;
		});
	};
	
	function chainOn (mainObj) {
		return function(){
			var newObj = newObject(false);
			var arg = arguments;
			
			mainObj._autoCommit = false;
			
			mainObj.once('nextChain', function(newSafeCon){
				chainQueryRun(newSafeCon, arg, newObj);
			});	
			
			if (mainObj._safeCon) {
				process.nextTick(function(){
					mainObj.emit('nextChain', mainObj._safeCon);
				});
			}
			
			return newObj;
		};
	};
	
	function newConnection (mainObj, arg) {
	
		// set point
		connection.set(function(err, safeCon){
			if (err) {
				return mainObj.emit('rollback', err);
			}
			safeCon._count = 0;
			chainQueryRun(safeCon, arg, mainObj);
		});
		return mainObj;
	};
	
	function queryFactory (mainObj) {
		return function(){
			if (this._firstRun) {
				this._firstRun = false;
				return newConnection(mainObj, arguments);
			}
			return chainOn(mainObj).apply(null,arguments);
		}.bind(mainObj);
	};
	
	var newObject = function(firstRun){
		var obj = new events.EventEmitter();
		obj._autoCommit = true;
		obj.autoCommit = function(select){
			obj._autoCommit = select;
			return obj;
		};
		obj.query = queryFactory(obj);
		obj._firstRun = firstRun;
		obj._safeCon;
		return obj;
	};
	
	connection.chain = function(){
		return newObject(true);
	};
	return connection;
};

/*
query transaction wrapper
test pass 130302
*/

function quaryFactory (connection) {
	connection.chainReady = false;
	var chainOn = false;
	
	function resultObjectSet (result, safeCon) {
		result = result || {};
		result.rollback = safeCon.rollback.bind(safeCon);
		result.commit = safeCon.commit.bind(safeCon);
		result._autoCommit = true;
		result.autoCommit = function(select){
			this._autoCommit = select;
		};
		return result;
	};
	
	function skipCallbackQuery (safeCon, arg, eventObj) {
		if (!(eventObj.listeners('rollback').length) || !(eventObj.listeners('commit').length)) {
			throw new Error('skip callback query must need rollback and commit event listener');
		}
		
		var query;
		try {
			query = safeCon.query.apply(null, arg);
		} catch(e) {
			return safeCon.rollback(e);
		}
		
		query.
		on('error', function(err){
			safeCon.rollback(err);
		}).
		on('end', function(result){
			safeCon.commit();
		});
	};
	
	function callbackQuery (safeCon, arg, position, eventObj){
		var callback = arg[position];
		
		arg[position] = function (err, result, raw) {
			if (err) {
				if (eventObj.listeners('rollback').length) {
					return safeCon.rollback(err);
				}
			}
			// if is not a array result
			if (!Array.isArray(result)) {
				result = resultObjectSet(result, safeCon)
			}
			// state query function change
			// ready to link to the next transaction query
			stateQuery = stateUp(safeCon, eventObj);
			connection.chainReady = true;
			chainOn = false;
			
			callback(err, result, raw);
			
			// state query function rollback
			// ready to take new transaction queue
			stateQuery = stateUp();
			connection.chainReady = false;
			
			// auto commit
			if (!chainOn && result._autoCommit) {
				return safeCon.commit();
			}
			chainOn = false;
		};
		safeCon.query.apply(null, arg);
		return eventObj;
	};
	function newCallbackQuery (arg, position) {
		var eventObj = new events.EventEmitter();
		
		// set point
		connection.set(function(err, safeCon){
			safeCon.on('commit',function(){
				eventObj.emit('commit');
			});
			safeCon.on('rollback',function(err){
				eventObj.emit('rollback', err);
			});
			
			if (err) {
				return arg[position](err);
			}
			callbackQuery(safeCon, arg, position, eventObj);
		});
		return eventObj;
	};
	
	var stateUp;
	var stateQuery = (stateUp = function(currentConnection, eventObj){
		return function(){
			var position;
			for (var i in arguments) {
				if (typeof arguments[i] === 'function') {
					position = i;
				}
			};
			if (currentConnection) {
				chainOn = true;
				
				if (position) {
					return callbackQuery(currentConnection, arguments, position, eventObj);
				}
				return skipCallbackQuery(currentConnection, arguments, eventObj)
			}
			return newCallbackQuery(arguments, position);
		}
	})();
	
	connection.query = function(){
		return stateQuery.apply(null, arguments);
	};
	return connection;
};
