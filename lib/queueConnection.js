var events = require("events");

module.exports = queueConnection;
function queueConnection (queueObj) {
  var con = Object.create(queueConnectionObj);
  
  con.queueObj    = queueObj;
  con.lock        = false;
  con.workCut     = false;
  con.timeout     = queueObj.config.timeout;
  con.connection  = queueObj.connectionFactory();
  
  con.queryMethod = Object.getPrototypeOf(con.connection).query;
  
  con._errorBubble        = queueObj.topLevelError.bind(queueObj, con);
  con._queue              = queueObj.queue;
  con._currentTransaction = null;
  
  con.connection.connect(con._connectionErrorCheck.bind(con));
  
  return con;
};

var queueConnectionObj = {
  safeConnectionFactory: function(target){
    var safeConnection = new events.EventEmitter();
    
    safeConnection.timeout = this.timeout;
    safeConnection.timer   = null;
    safeConnection.target  = target;
    
    safeConnection.usable   = safeConMethod.usable.bind(safeConnection, this);
    safeConnection.query    = safeConMethod.query.bind(safeConnection);
    safeConnection.commit   = safeConMethod.commit.bind(safeConnection);
    safeConnection.rollback = safeConMethod.rollback.bind(safeConnection);
    
    safeConnection.tool                  = {};
    safeConnection.tool.next             = this._next.bind(this);
    safeConnection.tool.trQueryError     = this._trQueryError.bind(this);
    safeConnection.tool.query            = this.queryMethod
    safeConnection.tool.connection       = this.connection;
    safeConnection.tool.nullCurrentState = safeConMethod.nullCurrentState.bind(null, this);
    
    return safeConnection;
  },
  
  _runErrorBubble: function(err){
    this.lock = false;
    this._errorBubble(err);
  },
  
  _connectionErrorCheck: function(err){
    if (!err) {
      return;
    }
    if (err.fatal === true) {
      this._runErrorBubble(err);
    }
  },
  
  _trQueryError: function(err, safeCon){
    // fatal error is handled in connection.connect callback.
    if (!err.fatal) {
      this._runErrorBubble(err);
    }
    
    if (safeCon) {
      safeCon.emit('rollback', err);
    }
  },
  
  _next: function(){
    if (this._queue.length === 0 || this.workCut) {
      this.lock = false;
      if (!this.workCut) {
        this.queueObj.idleIn(this);
      }
      return;
    }
    
    this.lock = true;
    this._currentTransaction = this._queue.shift();
    
    if (typeof this._currentTransaction !== 'function') {
      this._runErrorBubble(new TypeError ('transaction set callback must be a function'));
      return;
    }

    this.connection.query('START TRANSACTION', this._nextCallback.bind(this));
  },
  
  _nextCallback: function(err){
    
    var safeConnection = this.safeConnectionFactory(this._currentTransaction);
    
    if (err) {
      // this._next();
      this._trQueryError(err);
      return this._currentTransaction(err);
    }
    this._currentTransaction(undefined, safeConnection);
  },
  
  nextQuery: function(){
    if (this.lock || this.workCut) {
      return;
    }
    this._next();
  },
  
  connectionCut: function(){
    if (this.workCut) {
      return;
    }
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
      err = new Error('Query request error, Transaction was closed');
      // if request is not a current transaction, query try send error to callback and throw error
      for (var i in arguments) {
        if (typeof arguments[i] === 'function') {
          return arguments[i](err);
        }
      };
      throw err;
    }
    
    if (this.timeout) {
      if (this.timer) {
        clearTimeout(this.timer);
      }
      this.timer = setTimeout(function(){
        this.rollback(new Error('transaction request time over'));
      }.bind(this),this.timeout);
    }
    return this.tool.query.apply(this.tool.connection, arguments);
  },

  commit: function(callback){
    if (!this.usable()) {
      if (callback) {
        callback(new Error('Commit request error. Transaction was closed.'));
      }
      return;
    }
    
    this.tool.nullCurrentState(); 
    
    var self = this;
    this.tool.connection.query('COMMIT', function(err){
      if (callback) {
        callback(err);
      }
      
      if (err) {
        return self.tool.trQueryError(err, self);
      }
      self.emit('commit');
      self.tool.next();
        
    });
  },

  rollback: function(reason, callback){
    if (typeof reason === 'function') {
      callback = reason;
      reason = undefined;
    }
    
    if (!this.usable()) {
      if (callback) {
        callback(new Error('Rollback request error. Transaction was closed.'));
      }
      return;
    }
    
    this.tool.nullCurrentState();
    
    var self = this;
    this.tool.connection.query('ROLLBACK', function(err){
      if (callback) {
        callback(err || reason);
      }
      
      if (err) {
        return self.tool.trQueryError(err, self);
      }
      self.emit('rollback', reason);
      self.tool.next()
    });
  },

  usable: function(obj){
    return (obj._currentTransaction === this.target);
  },

  nullCurrentState: function(obj){
    obj._currentTransaction = null;
  },
};