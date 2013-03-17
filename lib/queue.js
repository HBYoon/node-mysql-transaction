var queueConnection = require("./queueConnection");

module.exports = queue

function queue (opt){
  var queue = Object.create(queueObj);
  
  queue.queue       = [];
  queue.connections = [];
  queue.config      = opt;
  
  for (var i = 0; i < opt.staticConnection; i += 1) {
    queue.increaseConnection();
  };
  return queue;
};

var queueObj = {
  set: function (setPoint){
    this.queue.unshift(setPoint);
    var usableCon = this.usableConnnection();
    if (usableCon) {
      usableCon.nextQuery();
    }
    if (this.config.dynamicConnection) {
      this.dynamicConnection.loopOn();
    }
  },
    
  usableConnnection: function(){
    var length = this.connections.length;
    while(length){
      length -= 1;
      if (!this.connections[length].lock){
        return this.connections[length];
      }
    };
    return;
  },
    
  decreaseConnection: function(){
    var last = this.connections.pop();
    if (last) {
      return last.connectionCut();
    }
  },
    
  increaseConnection: function(){
    this.connections.push(
      queueConnection(
        connectionFactory(this.config), 
        this.config, 
        this.queue));
  },
    
  queueLength: function(){
    return this.queue.length;
  },
    
  end: function(){
    this.set = dummySet;
    this.queueCleaner;
    if (this.dynamicConnection) {
      this.dynamicConnection.loopOff();
    }
    for (var i = 0; i < this.config.staticConnection; i += 1) {
      this.decreaseConnection();
    };
  },
    
  queueCleaner: function(){
    var err = new Error('transaction queue cleaner work')
    var inLoop;
    (inLoop = function () {
      var setPoint = this.queue.pop();
      if (!setPoint) {
        return;
      }
      setPoint(err);
      setImmediate(inLoop);
    }.bind(this));
  },
};
  
function connectionFactory (opt) {
  // connection = mysql.createConnection
  return opt.connection[0](opt.connection[1]);
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