var events = require("events");

module.exports = queueConnection;
function queueConnection (connection, config, queue){
  var con = Object.create(queueObj);
  
  con.lock       = false;
  con.workCut    = false;
  con.timeOut    = config.timeOut;
  con.connection = connection;

  con._queue              = queue;
  con._currentTransaction = null;
  
  con.tool                 = {};
  con.tool.query           = Object.getPrototypeOf(con.connection).query;
  con.tool.connectionQuery = Object.getPrototypeOf(con.connection).query.bind(con.connection);
  return con;
};

var queueObj = {
  safeConnectionFactory: function(target){
    var safeConnection = new events.EventEmitter();
    
    safeConnection.timeOut = this.timeOut;
    safeConnection.timer   = null;
    safeConnection.target  = target;
    
    safeConnection.usable   = safeConMethod.usable.bind(safeConnection, this);
    safeConnection.query    = safeConMethod.query.bind(safeConnection);
    safeConnection.commit   = safeConMethod.commit.bind(safeConnection);
    safeConnection.rollback = safeConMethod.rollback.bind(safeConnection);
    
    safeConnection.tool                  = {};
    safeConnection.tool.query            = this.tool.query;
    safeConnection.tool.connection       = this.connection;
    safeConnection.tool.commitReq        = this.commitReq.bind(this);
    safeConnection.tool.rollbackReq      = this.rollbackReq.bind(this);
    safeConnection.tool.nullCurrentState = safeConMethod.nullCurrentState.bind(null, this);
    
    return safeConnection;
  },

  _next: function(){
    if (!this._queue.length || this.workCut) {
      this.lock = false;
      return;
    }
    this.lock = true;
    this._currentTransaction = this._queue.pop();
    
    var safeConnection = this.safeConnectionFactory(this._currentTransaction);
    this.tool.connectionQuery('START TRANSACTION', function(err){
      if (!this._currentTransaction) {
        return;
      }
      if (err) {
        this.nextQuery();
        return this._currentTransaction(err);
      }
      this._currentTransaction(undefined, safeConnection);
    }.bind(this));
  },

  // internal commit and rollback request query sender
  commitReq: function  (callback){
    this.tool.connectionQuery('COMMIT', function(err, result){
      if(callback){
        callback(err);
      }
    });
    this._next();
  },

  rollbackReq: function(reason, callback){
    this.tool.connectionQuery('ROLLBACK', function(err, result){
      if (callback) {
        if (err) {
          callback(err);
        }
        callback(reason);
      }
    });
    this._next();
  },
  
  nextQuery: function(){
    if (this.lock) {
      return;
    }
    this._next();
  },
  
  connectionCut: function(){
    this.workCut = true;
    var endLoop
    (endLoop = function(){
      if (this.lock) {
        return setTimeout(endLoop,50);
      }
      this.connection.end(function(err){
        return;
      });
    }.bind(this))();
  },
};

var safeConMethod = {
  query: function(){
    // if current transaction on, new timer set and, query start.
    var err;
    if (!this.usable()) {
      err = new Error('out of transaction');
      // if request is not a current transaction, query try send error to callback and throw error
      for (var i in arguments) {
        if (typeof arguments[i] === 'function') {
          return arguments[i](err);
        }
      };
      throw err;
    }
    
    if (this.timeOut) {
      if (this.timer) {
        clearTimeout(this.timer);
      }
      this.timer = setTimeout(function(){
        this.rollback(new Error('transaction request time over'));
      }.bind(this),this.timeOut);
    }
    return this.tool.query.apply(this.tool.connection, arguments);
  },

  commit: function(callback){
    if (!this.usable()) {
      return;
    }
    this.emit('commit');
    this.removeAllListeners();
    this.tool.nullCurrentState(); 
    return this.tool.commitReq(callback);
  },

  rollback: function(reason, callback){
    if (!this.usable()) {
      return;
    }
    if (typeof reason === 'function') {
      callback = reason;
      reason = undefined;
    }
    
    this.emit('rollback', reason);
    this.removeAllListeners();
    this.tool.nullCurrentState();
    return this.tool.rollbackReq(reason, callback);
  },

  usable: function(obj){
    return (obj._currentTransaction === this.target);
  },

  nullCurrentState: function(obj){
    obj._currentTransaction = null;
  },
};