// MySQL/MariaDB  transactions link
var queue = require('./lib/queue');
var dynamicConnection = require('./lib/dynamicConnection');
var chain = require('./lib/chain');
var query = require('./lib/query');

module.exports = function interfaceFun (opt) {
  opt.connection = opt.connection;
  opt.staticConnection = opt.connectionNumber || opt.staticConnection || 0;
  opt.dynamicConnection = opt.dynamicConnection || 4;
  opt.dynamicConnectionLoopTime = opt.dynamicConnectionLoopTime || 200;
  opt.timeOut = opt.timeOut || 0;
  
  return setup(opt);
};

function setup (opt) {
  var newQueue               = queue(opt);
  newQueue.dynamicConnection = dynamicConnection(newQueue);
  newQueue.chain             = chain(newQueue);
  newQueue.query             = query(newQueue);
  return newQueue;
};