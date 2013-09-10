var events = require("events");

// MySQL/MariaDB  transactions link
var queue = require('./lib/queue');
var chain = require('./lib/chain');

module.exports = function interfaceFun (opt) {
  opt.connection = opt.connection;
  opt.staticConnection = opt.connectionNumber || opt.staticConnection || 0;
  opt.dynamicConnection = opt.dynamicConnection || 8;
  opt.idleConnectionCutoffTime = opt.dynamicConnectionLoopTime || opt.idleConnectionCutoffTime || 600;
  opt.timeout = opt.timeOut || opt.timeout || 0;
  
  return setup(opt);
};

function setup (opt) {
  var transactionObj = new events.EventEmitter();
  
  transactionObj.config = opt;
  transactionObj.queue  = queue(transactionObj);
  transactionObj.chain  = chain(transactionObj.queue);
  
  transactionObj.set    = transactionObj.queue.set.bind(transactionObj.queue);
  transactionObj.end    = transactionObj.queue.end.bind(transactionObj.queue);
  
  return transactionObj;
};