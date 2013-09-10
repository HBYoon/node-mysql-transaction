// transaction test
// tested with mysql 2.0 alpha

// test table query -> CREATE TABLE `transaction_test` (`num` INT(10) NULL AUTO_INCREMENT, `test` INT(10) NULL DEFAULT '0',PRIMARY KEY (`num`))COLLATE='latin1_swedish_ci'ENGINE=InnoDB;

var mysql = require('mysql');

var transaction =  require('../index.js');
var test = transaction({
	connection: [mysql.createConnection,{
		user: 'test',
		password: 'test',
		database: 'test'
	}],
	// parallel connection queue number
	staticConnection:0,
	
	// when queue length increase or queue length is longer than connectionNumber * 32, 
	// make temporary connection for increased volume of async work.
	dynamicConnection:6,
	
	// auto time out rollback in ms
	timeOut:600
});


// /* //<<<<<<<<<<<<<block

// chain transaction API test
var chain = test.chain();

chain.
on('commit', function(){
	console.log('chain1 commit');
}).
// if you don't make error event handler for query
// each query take auto error event handler to the auto rollback
on('rollback', function(err){
	console.log(err);
});

chain.
query('insert transaction_test set test=?',[1]).
on('result', function(result){
	chain.
	query('insert transaction_test set test=?',[2]).
	on('result', function(result){
		// you can make event listener for each query like this
		console.log('lol');
	}).
	query('insert transaction_test set test=?',[3]).
	on('result',function(result){
		console.log('3: '+result.insertId);
		// chain rush
		chain.
		query('insert transaction_test set test=?',[result.insertId]).
		query('insert transaction_test set test=?',[7]).
		query('insert transaction_test set test=?',[8]).
		query('insert transaction_test set test=?',[9]).
		on('result', function(){
			chain.commit();
		}).
		autoCommit(false);
	
	// each chain set it's own auto commit function if you did not set auto commit off
	// so must need auto commit off for make chain stream to after event loop
	}).autoCommit(false);
}).autoCommit(false);

//chain error test
var chain2 = test.chain();

chain2.
on('commit', function(){
	console.log('chain2 commit');
}).
on('rollback', function(err){
	console.log('chain2 rollback');
	console.log(err);
}).
query('insert transaction_test set test=?',[10]).
on('result', function(result){
	chain2.
	query('insert transaction_test set test=?',[11]).
	query('insert transaction_test set test=?',[12]).
	on('result',function(result){
		// chain with error
		chain2.
		query('insert transaction_test set test=?',['err']).
		query('insert transaction_test set test=?',[14])
	}).autoCommit(false);
}).autoCommit(false);

var chain3 = test.chain();
chain3.
on('commit', function(){
	console.log('chain3 commit');
}).
on('rollback', function(err){
	console.log(err);
}).
query('insert transaction_test set test=?',[15]).
query('insert transaction_test set test=?',[16]).
query('insert transaction_test set test=?',[17]).
query('insert transaction_test set test=?',[18]).
query('insert transaction_test set test=?',[19]).
query('insert transaction_test set test=?',[20]);

// transaction chain with loop!!!
var chain4 = test.chain();
chain4.
on('commit', function(){
	console.log('chain4 commit');
}).
on('rollback', function(err){
	console.log(err);
}).
setMaxListeners(0);

for(var i = 0; i < 5; i+=1) {
	// working good :)
	chain4.query('insert transaction_test set test=?',[i*100]);
}

var chain5 = test.chain();
chain5.
on('commit', function(){
	console.log('chain5 commit');
}).
on('rollback', function(err){
	console.log('chain5 rollback');
	console.log(err);
}).
setMaxListeners(0);

for(var i = 0; i < 30; i+=1) {
	if (i===8) { i='error maker' }
	chain5.query('insert transaction_test set test=?',[i*10000]);
}

// */