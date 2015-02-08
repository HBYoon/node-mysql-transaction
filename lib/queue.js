var queueConnection = require("./queueConnection");

module.exports = queue

function queue (mainObj){
  var queue = Object.create(queueObj);
  
  queue.mainObj         = mainObj;
  queue.config          = mainObj.config;
  queue.connections     = [];
  queue.queue           = [];
  queue.idleConnections = [];
  queue.cutoffTimer     = null;

  return queue;
};

var queueObj = {
  set: function (setPoint){
    this.queue.push(setPoint);
    var usableCon = this.usableConnnection();
    if (usableCon) {
      return usableCon.nextQuery();
    }
    if (this.connections.length >= (this.config.staticConnection + this.config.dynamicConnection)) {
      return
    }
    this.createConnection()
  },

  usableConnnection: function(){
    if (this.idleConnections.length) {
      if (this.idleConnections.length === 1) {
        clearTimeout(this.cutoffTimer);
        this.cutoffTimer = null;
      }
      return this.idleConnections.pop();
    }
    return false;
  },
  
  idleIn : function (connection) {
    this.idleConnections.push(connection);
    this.cutoffSet();
  },
  
  cutoffSet: function(){
    if (this.cutoffTimer) {
      return;
    }
    if (this.idleConnections.length > this.config.staticConnection) {
      this.cutoffTimer = setTimeout(this.cutoffRun.bind(this), this.config.idleConnectionCutoffTime)
    }
  },
  
  cutoffRun: function(){
    this.cutoffTimer = null;
    if (!this.idleConnections[0]) {
      return;
    }
    var cutNow = this.idleConnections.shift();
    this.removeConnection(cutNow);
    this.cutoffSet();
  },
  
  removeConnection: function(connection){
    connection.connectionCut();
    var len = this.connections.length
    while (len > 0) {
      len -= 1;
      if (this.connections[len] === connection) {
        this.connections.splice(len, 1);
        break;
      }
    }
  },

  createConnection: function(){
    var newCon = queueConnection(this);
    newCon.nextQuery();
    this.connections.push(newCon);
  },
  
  topLevelError: function(connection, err){
    this.mainObj.emit('error', err);
    this.removeConnection(connection);
    if (this.queue.length > 0) {
      this.createConnection();
    }
  },
  
  connectionFactory: function(){
    return this.config.connection[0](this.config.connection[1]);
  },

  queueLength: function(){
    return this.queue.length;
  },

  end: function(){
    this.set = dummySet;
    this.queueCleaner(this.queue);
    this.queue = [];
    var len = this.connections.length;
    while (len > 0) {
      len -= 1;
      this.removeConnection(this.connections[len]);
    };
  },

  queueCleaner: function(queue){
    queue = queue || this.queue;
    
    (function inLoop() {
      var setPoint = queue.pop();
      if (!setPoint || typeof setPoint !== 'function') {
        return;
      }
      setPoint(new Error('transaction queue cleaner work'));
      setImmediate(inLoop);
    });
  },
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