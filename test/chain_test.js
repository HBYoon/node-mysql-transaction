// transaction test

//           (yy/mm/dd)
// 0.1.0 pass 13/09/11
// 0.2.0 pass 15/02/09: node-mysql 2.5.4, mariaDB 10.0.16

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


// result vaule -> 1 ~ 7 / 19 ~ 29 / 

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
		// auto commit on
		chain.
		query('insert transaction_test set test=?',[4]).
    on('commit', function(){
      console.log('chain1-2 commit msg');
    }).
		query('insert transaction_test set test=?',[5]).
		query('insert transaction_test set test=?',[6]).
		query('insert transaction_test set test=?',[7]);
	
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
query('insert transaction_test set test=?',[8]).
on('result', function(result){
	chain2.
	query('insert transaction_test set test=?',[9]).
  
	query('insert transaction_test set test=?',[10]).
	on('result',function(result){
		// chain with error
		chain2.
		query('insert transaction_test set test=?',['errrrr']).
		query('insert transaction_test set test=?',[12])
	}).autoCommit(false);
}).autoCommit(false);

// timeout test
var chain3 = test.chain();
chain3.
on('commit', function(){
	console.log('chain3 commit');
}).
on('rollback', function(err){
  console.log('chain3 rollback');
	console.log(err);
}).
query('insert transaction_test set test=?',[13]).
query('insert transaction_test set test=?',[14]).
query('insert transaction_test set test=?',[15]).
query('insert transaction_test set test=?',[16]).
query('insert transaction_test set test=?',[17]).
query('insert transaction_test set test=?',[18]).
autoCommit(false);

// transaction chain with loop!!!
var chain4 = test.chain();
chain4.
on('commit', function(){
	console.log('chain4 commit');
}).
on('rollback', function(err){
	console.log(err);
});

for(var i = 19; i < 30; i+=1) {
	// working good :)
	chain4.query('insert transaction_test set test=?',[i]);
}

var chain5 = test.chain();
chain5.
on('commit', function(){
	console.log('chain5 commit');
}).
on('rollback', function(err){
	console.log('chain5 rollback');
	console.log(err);
});

var k
for(var i = 30; i < 90; i+=1) {
  k = i;
	if (i===88) { k='error maker' }
	chain5.query('insert transaction_test set test=?',[k]);
}

//chain error test-2
var chain6 = test.chain();

chain6.
on('commit', function(){
	console.log('chain6 commit');
}).
on('rollback', function(err){
  console.log('chain6 rollback');
  console.log(err);
}).
query('insert transaction_test set test=?',[91]).
on('result', function(result){
	chain6.
	query('insert transaction_test set test=?',[92]).
  
	query('insert transaction_test set test=?',[93]).
	on('result',function(result){
		// chain with error
		chain6.
		query('insert transaction_test set test=?',['eroror']).
    on('error', function(err){
      console.log('error on chain6, manual rollback, after 800 ms');
      setTimeout(function(){
        chain6.rollback(err);
      }, 800);
    }).
		query('insert transaction_test set test=?',[95]);
	}).autoCommit(false);
}).autoCommit(false);

// */