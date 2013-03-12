// MySQL/MariaDB  transactions link
var chainFactory = require("./lib/chain");
var quaryFactory = require("./lib/query");
var dynamicConnectionFactory = require("./lib/dynamic");
var queueConnection = require("./lib/queueConnection");

module.exports = function interfaceFun (opt) {
	opt.connection = opt.connection;
	opt.connectionNumber = opt.connectionNumber || opt.staticConnection || 0;
	opt.dynamicConnection = opt.dynamicConnection || 4;
	opt.dynamicConnectionLoopTime = opt.dynamicConnectionLoopTime || 200;
	opt.timeOut = opt.timeOut || 0;
	
	return setup(opt);
};

function setup (opt) {
	return (
		quaryFactory(
			chainFactory(
				dynamicConnectionFactory(
					new QueueFactory(opt)))));
};

function QueueFactory (opt){
	this.queue = [];
	this.connections = [];
	this.config = opt;
};

QueueFactory.prototype.set = function (setPoint){
	this.queue.unshift(setPoint);
	var usableCon = this.usableConnnection();
	if (usableCon) {
		usableCon.nextQuery();
	}
	if (this.config.dynamicConnection) {
		this.dynamicConnection.loopOn();
	}
};
	
QueueFactory.prototype.usableConnnection = function(){
	var length = this.connections.length;
	while(length){
		length -= 1;
		if (!this.connections[length].lockCheck()){
			return this.connections[length];
		}
	};
	return;
};
	
QueueFactory.prototype.decreaseConnection = function(){
	var last = this.connections.pop();
	if (last) {
		return last.connectionCut();
	}
};
	
QueueFactory.prototype.increaseConnection = function(){
	this.connections.push(
		queueConnection(
			connectionFactory(this.config), 
			this.config.timeOut, 
			this.queue, 
			this.connections));
};
	
QueueFactory.prototype.queueLength = function(){
	return this.queue.length;
};
	
QueueFactory.prototype.end = function(){
	this.set = dummySet;
	this.queueCleaner;
	if (this.dynamicConnection) {
		this.dynamicConnection.loopOff();
	}
	for (var i = 0; i < this.config.staticConnection; i += 1) {
		this.decreaseConnection();
	};
};
	
QueueFactory.prototype.queueCleaner = function(){
	var err = new Error('transaction queue cleaner work')
	var inLoop;
	(inLoop = function () {
		var setPoint = this.queue.pop();
		if (!setPoint) {
			return;
		}
		setPoint(err);
		process.nextTick(inLoop);
	}.bind(this));
};

function connectionFactory (opt) {
	// connection = mysql.createConnection();
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