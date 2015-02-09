var events = require("events");

module.exports = chainFactory
function chainFactory (queue) {
  return function chainSet (){
    return chainObj.create(queue).init();
  };
};

var chainObj = {
  linkedObj: [],
  
  evBubble: function(type, err) {
    var arr = this.linkedObj
    var t;
    for (var i = 0; i < arr.length; i += 1) {
      t = arr[i];
      if (eventCheck(t, type)) {
        t.emit(type, err);
      }
    }
  },
  
  chainOn: function(currentObj, arg) {
    var newObj = this.newObject(false);
    
    currentObj._autoCommit = false;
    
    currentObj.once('nextChain', function(newSafeCon){
      chainQueryRun(newSafeCon, arg, newObj);
    });
    
    if (currentObj._safeCon) {
      process.nextTick(function(){
        currentObj.emit('nextChain', currentObj._safeCon);
      });
    }
    
    return newObj;
  },
  
  newConnection: function(currentObj, arg){
    
    var self = this;
    currentObj.
    on('rollback', function(err){
      self.evBubble('rollback', err);
    }).
    on('commit', function(){
      self.evBubble('commit');
    });
    
    // set point
    self.set(function(err, safeCon){
      if (err) {
        return currentObj.emit('rollback', err);
      }
      
      onewayEventConnect(safeCon, currentObj);
      
      safeCon._count = 0;
      safeCon._errorState = false;
      chainQueryRun(safeCon, arg, currentObj);
    });
    return currentObj;
  },
  
  queryFactory: function(obj){
    var self = this;
    return function(){
      if (obj._firstRun) {
        obj._firstRun = false;
        return self.newConnection(obj, arguments);
      }
      return self.chainOn(obj, arguments);
    };
  },
  
  autoCommitFactory: function(obj){
    return function(select){
      obj._autoCommit = select;
      return obj;
    }
  },
  
  newObject: function(firstRun){
    var obj = new events.EventEmitter();
    
	  obj.setMaxListeners(0);
    obj._autoCommit = true;
    
    obj._firstRun = firstRun;
    obj._safeCon;
    
    obj.autoCommit = this.autoCommitFactory(obj);
    obj.query = this.queryFactory(obj);
    if (!firstRun) {
      this.linkedObj.push(obj);
    }
    return obj;
  },
  
  init: function(){
    this.linkedObj = [];
    return this.newObject(true);
  },
  
  create: function(queue){
    var chain = Object.create(this);
    chain.set = Object.getPrototypeOf(queue).set.bind(queue);
    return chain;
  },
};


//====== util functions ======
function eventCheck(obj, type) {
  var t;
  
  if (!obj._events) {
    return false;
  }
  
  t = obj._events[type]
  
  if (typeof t === 'function') {
    return true;
  }
  if (Array.isArray(t) && t.length) {
    return true;
  }
  return false;
};

function onewayEventConnect (evo, evt) {
  var emit = evo.emit;
  evo.emit = function(){
    emit.apply(evo, arguments);
    evt.emit.apply(evt, arguments);
  };
};


//====== chain work functions ======
function commitFactory (safeCon, currentObj, auto) {
  return function loop () {
    if (!safeCon.usable()){
      return;
    }
    if (auto) {
      if (safeCon._errorState) {
        return;
      }
      if (!currentObj._autoCommit) {
        return;
      }
    }
    if (safeCon._count === 0){
      return safeCon.commit();
    }
    return setImmediate(loop);
  };
};

// rollback doesn't need any safety timer
function rollbackFacroty (safeCon) {
  return function(err){
    safeCon._count = 0;
    safeCon.rollback(err);
  };
};

function objAdder (safeCon, currentObj) {
  currentObj._safeCon = safeCon;
  currentObj.commit = commitFactory(safeCon, currentObj, false);
  currentObj.rollback = rollbackFacroty(safeCon);
};

function autoErrorRollback (currentObj) {
  if (eventCheck(currentObj, 'error')) {
    return;
  }
  currentObj.on('error', function(err) {
    currentObj.rollback(err);
  });
};

function autoCommitReady (safeCon, currentObj) {
  currentObj.on('end', function(){
    (commitFactory(safeCon, currentObj, true))();
  });
};

// main procedure function
function chainQueryRun (safeCon, arg, currentObj) {
  
  objAdder(safeCon, currentObj);
  
  var stream;
  try {
    stream = safeCon.query.apply(safeCon, arg);
  } catch(e) {
    return currentObj.rollback(e);
  }
  
  autoErrorRollback(currentObj);
  onewayEventConnect(stream, currentObj);
  
  if (currentObj._autoCommit) {
    autoCommitReady(safeCon, currentObj);
  }
  
  stream.on('error', function(e){
    safeCon._errorState = true;
  });
  
  currentObj.on('end', function(){
    safeCon._count -= 1;
  });
  
  safeCon._count += 1;
  currentObj.stream = stream;
  currentObj.emit('nextChain', safeCon);
};