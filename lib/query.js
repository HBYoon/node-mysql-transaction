var events = require("events");

module.exports = quaryFactory

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
