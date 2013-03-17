// minimum safty timer for chain work commit
// safeCon._count is count of not finished query
var events = require("events");

module.exports = chainFactory
function chainFactory (queue) {
  var chain = Object.create(chainObj);
  chain.tool = {};
  chain.tool.set = Object.getPrototypeOf(queue).set.bind(queue);
  
  return function chainSet (){
    return chain.newObject(true);
  };
};

var chainObj = {
  chainOn: function(mainObj) {
    return function(){
      var newObj = this.newObject(false);
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
  },
  
  newConnection: function(mainObj, arg){
    // set point
    this.tool.set(function(err, safeCon){
      if (err) {
        return mainObj.emit('rollback', err);
      }
      safeCon._count = 0;
      chainQueryRun(safeCon, arg, mainObj);
    });
    return mainObj;
  },
  
  queryFactory: function(mainObj){
    var that = this;
    return function(){
      if (this._firstRun) {
        this._firstRun = false;
        return that.newConnection(mainObj, arguments);
      }
      return that.chainOn(mainObj).apply(that,arguments);
    }.bind(mainObj);
  },
  
  newObject: function(firstRun){
    var obj = new events.EventEmitter();
	obj.setMaxListeners(0);
    obj._autoCommit = true;
    obj.autoCommit = function(select){
      obj._autoCommit = select;
      return obj;
    };
    obj.query = this.queryFactory(obj);
    obj._firstRun = firstRun;
    obj._safeCon;
    return obj;
  }
};


function commitLoop (safeCon) {
  if (!safeCon.usable()){
    return;
  }
  if (safeCon._count === 0){
    return safeCon.commit.bind(safeCon)()
  }
  return setImmediate(commitLoop.bind(null,safeCon));
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
  mainObj.commit = commitLoop.bind(null,safeCon);
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