// MySQL/MariaDB  transactions link
var events = require("events");

module.exports = function interfaceFun (opt) {
	opt.connection = opt.connection;
	opt.connectionNumber = opt.connectionNumber || 1;
	opt.dynamicConnection = opt.dynamicConnection || opt.connectionNumber;
	opt.dynamicConnectionLoopTime = opt.dynamicConnectionLoopTime || 600;
	opt.timeOut = opt.timeOut || 0;
	
	return setup(opt);
};

function setup (opt) {
	return (
		quaryFactory(
			chainFactory(
				dynamicConnectionFactory(
					queueFactory(opt)))));
};

function queueFactory (opt){
	var queue = [];
	var connectionsArr = [];
	
	function queueCleaner (setPoint) {
		var err = new Error('queue cleaner work');
		if (typeof setPoint === 'function') {
			setPoint(err);
		}
	};
	function arrCleaner (arr, CleanerFun) {
		var length = arr.length;
		CleanerFun(queue.pop());
		if (arr.length) {
			return arrCleaner(arr, CleanerFun);
		}
	};
	function dummySet () {
		var err = new Error('transaction connection closed');
		for (var i in arguments) {
			if (typeof arguments[i] === 'function') {
				return arguments[i](err);
			}
		};
		throw err;
	};
	
	var queueControl = {
		connections: connectionsArr,
		
		set: function(setPoint){
			queue.unshift(setPoint);
			var usableCon = this.usableConnnection();
			if (usableCon) {
				return usableCon.nextQuery();
			}
		},
		
		usableConnnection: function(){
			var length = connectionsArr.length;
			while(length){
				length -= 1;
				if (!connectionsArr[length].lockCheck()){
					return connectionsArr[length];
				}
			};
			return;
		},
		
		decreaseConnection: function(){
			var last = connectionsArr.pop();
			if (last) {
				return last.connectionCut();
			}
		},
		
		increaseConnection: function(){
			return (
				queueConnection(
					connectionFactory(opt), 
					this._opt.timeOut, 
					queue, 
					this.connections));
		},
		
		queueLength: function(){
			return queue.length;
		},
		
		end: function(){
			arrCleaner(queue, queueCleaner);
			arrCleaner(connectionsArr, this.decreaseConnection);
			if (this.dynamicConnection) {
				this.dynamicConnection.loopOff();
			}
			this.set = dummySet;
		},
		
		_opt: opt,
	};
	
	for (var i = 0; i < opt.connectionNumber; i += 1) {
		queueControl.increaseConnection();
	};
	
	return queueControl;
};

function connectionFactory (opt) {
	// connection = mysql.createConnection();
	return opt.connection[0](opt.connection[1]);
};

function queueConnection (connection, timeOut, queue, connectionsArr){

	connectionsArr.push(connection);
	
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
		
		// if request is not a current transaction...
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

/*
tested 
yymmdd
130303
*/
function dynamicConnectionFactory (queueControl) {
	var number = queueControl._opt.dynamicConnection;
	
	var baseConnectionNumber = queueControl._opt.connectionNumber;
	var baseLine = baseConnectionNumber * 32
	var loopTime = queueControl._opt.dynamicConnectionLoopTime;
	var on = false;
	var dynamicCount = 0;
	var lastQueueLength = 0;
	
	function increaseDynamicConnection(){
		if (dynamicCount >= number) {
			return
		}
		dynamicCount += 1;
		try {
			queueControl.increaseConnection();
		} catch(e) {
			console.error(e);
		}
		queueControl.usableConnnection().nextQuery();
	};
	
	function decreaseDynamicConnection(){
		if (0 >= dynamicCount) {
			return
		}
		dynamicCount -= 1;
		try {
			queueControl.decreaseConnection();
		} catch(e) {
			console.error(e);
		}
	};
	
	function dynamicLoop () {
		var length = queueControl.queueLength();
		var delta = length - lastQueueLength;
		if (delta > 0 || length > baseLine) {
			increaseDynamicConnection();
		} else {
			decreaseDynamicConnection();
		}
		
		lastQueueLength = length;
		if (on) {
			setTimeout(dynamicLoop,loopTime);
		}
	};
	
	function offLoop () {
		if (dynamicCount > 0) {
			decreaseDynamicConnection()
			return offLoop()
		}
	}
	
	queueControl.dynamicConnection = {
		loopOn: function (){
			if (on) {
				return;
			}
			on = true;
			dynamicLoop();
		},
		loopOff: function (){
			on = false;
			offLoop();
		},
		isOn: function(){
			return on;
		},
	};
	
	if (number) {
		queueControl.dynamicConnection.loopOn();
	}
	
	return queueControl;
};


// after here, all factory function is wrapper factory of queue.set method

/*
chain query transaction wrapper
test pass 130301
*/
function chainFactory (queue) {
	
	// minimum safty timer for chain work commit
	// safeCon._count is count of not finished query
	function commitLoopFactory (safeCon) {
		return function commitLoop () {
			if (safeCon.usable()){
				if (safeCon._count === 0){
					return safeCon.commit.bind(safeCon)()
				}
				return process.nextTick(commitLoop);
			}
			return;
		};
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
		queue.set(function(err, safeCon){
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
	
	queue.chain = function(){
		return newObject(true);
	};
	return queue;
};

/*
query transaction wrapper
test pass 130302
*/

function quaryFactory (queue) {

	var chainOn = false;
	var errDummy = {
		rollback: function(){},
		commit: function(){},
		autoCommit: function(){},
	};
	
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
	
	function callbackQuery (safeCon, arg, position, eventObj) {
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
			
			chainOn = false;
			
			callback(err, result, raw);
			
			// state query function rollback
			// ready to take new transaction queue
			stateQuery = stateUp();
			
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
		queue.set(function(err, safeCon){
			if (err) {
				if (eventObj.listeners('rollback').length) {
					return eventObj.emit('rollback', err);
				}
				return arg[position](err, errDummy);
			}
			
			safeCon.on('commit',function(){
				eventObj.emit('commit');
			});
			safeCon.on('rollback',function(err){
				eventObj.emit('rollback', err);
			});
			
			callbackQuery(safeCon, arg, position, eventObj);
		});
		return eventObj;
	};
	
	var stateUp;
	var stateQuery = (stateUp = function(currentConnection, eventObj){
		var readyState = !!(currentConnection);
		
		return function(){
			chainOn = readyState;
			for (var position in arguments) {
				if (typeof arguments[position] === 'function') {
					if (readyState) {
						return callbackQuery(currentConnection, arguments, position, eventObj);
					}
					return newCallbackQuery(arguments, position);
				}
			};
			if (readyState) {
				return skipCallbackQuery(currentConnection, arguments, eventObj)
			}
			return null;
		}
	})();
	
	queue.query = function(){
		return stateQuery.apply(null, arguments);
	};
	return queue;
};
