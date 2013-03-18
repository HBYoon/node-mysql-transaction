var events = require("events");

module.exports = quaryFactory
function quaryFactory (queueControl) {
  var query = Object.create(queryObj);
  
  query.chainOn    = false;
  query.stateQuery = query.stateUp();
  
  query.tool     = {};
  query.tool.set = queueControl.set.bind(queueControl);
  
  return function(){
    return query.stateQuery.apply(query, arguments);
  };
};

var queryObj = {
  callbackQuery: function(safeCon, arg, position, eventObj) {
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
      this.stateQuery = this.stateUp(safeCon, eventObj);
      
      this.chainOn = false;
      
      callback(err, result, raw);
      
      // state query function rollback
      // ready to take new transaction queue
      this.stateQuery = this.stateUp();
      
      // auto commit
      if (!this.chainOn && result._autoCommit) {
        return safeCon.commit();
      }
      this.chainOn = false;
    }.bind(this);
    safeCon.query.apply(null, arg);
    return eventObj;
  },
  
  newCallbackQuery: function(arg, position) {
    var eventObj = new events.EventEmitter();
    
    // set point
    this.tool.set(function(err, safeCon){
      if (err) {
        if (eventObj.listeners('rollback').length) {
          return eventObj.emit('rollback', err);
        }
        return arg[position](err);
      }
      
      if (!eventObj.listeners('rollback').length) {
        safeCon.timeOut = 0;
      }
      
      safeCon.on('commit',function(){
        eventObj.emit('commit');
      });
      safeCon.on('rollback',function(err){
        eventObj.emit('rollback', err);
      });
      
      this.callbackQuery(safeCon, arg, position, eventObj);
    }.bind(this));
    return eventObj;
  },
  
  stateUp: function(currentConnection, eventObj){
    var readyState = !!(currentConnection);
    return function(){
      this.chainOn = readyState;
      for (var position in arguments) {
        if (typeof arguments[position] === 'function') {
          if (readyState) {
            return this.callbackQuery(currentConnection, arguments, position, eventObj);
          }
          return this.newCallbackQuery(arguments, position);
        }
      };
      if (readyState) {
        return skipCallbackQuery(currentConnection, arguments, eventObj)
      }
      return null;
    }
  },
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