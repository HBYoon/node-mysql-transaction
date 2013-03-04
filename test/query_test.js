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

// connection.query function test
// it also transaction, but range of chance to make transaction link is 
// <<< only limited in a query's callback function in a same event loop >>>
// conclusion -> use connection.chain transaction


test.query('insert transaction_test set test=?',[199],function(err,result){
	result.rollback();
});

test.query('insert transaction_test set test=?',[133],function(err,result){
	//auto commit
});

// you can make connect.query transaction chain in callback function 
test.query('insert transaction_test set test=?',[1000],function(err,result){
	// formal error handling way -> this is bad idea, because you cannot take any information about timeout rollback event
	if (err) {
		result.rollback();// result.rollback === otherResult.rollback;
	}
	test.query('insert transaction_test set test=?',['err'],function(err,otherResult){
		// again...
		if (err) {
			// oops! there is no return...
			otherResult.rollback();
		}
		test.query('insert transaction_test set test=?',[998],function(err,theOtherResult){
			// and again...
			if (err) {
				console.log(err) // occur out of transaction error
				theOtherResult.rollback();// result.rollback === otherResult.rollback === theOtherResult.rollback;
			}
		});
	});
});

test.query('insert transaction_test set test=?',[2000],function(err,result){

	test.query('insert transaction_test set test=?',['err'],function(err,otherResult){
	
		console.log('because of error, you cannot see this message on console');
		
		test.query('insert transaction_test set test=?',[1998],function(err,theOtherResult){
			// now auto rollback is working
			// if you setup 'rollback' listener, auto rollback also ready to working
			// you don't need any error handling in the middle of transaction
		});
	});
}).
on('rollback', function(err){
	// error to here
	console.log('test.query auto rollback');
});

test.query('insert transaction_test set test=?',[3000],function(err,result){
	test.query('insert transaction_test set test=?',[2999],function(err,otherResult){
		test.query('insert transaction_test set test=?',[2998],function(err,theOtherResult){
			// auto commit off
			theOtherResult.autoCommit(false);
			
			// time out rollback test
			setTimeout(function(){
				theOtherResult.commit();// result.rollback === otherResult.rollback;
			},1000);
		});
	});
}).
on('commit', function(){
	console.log('time out test commit??');
}).
on('rollback',function(err){
	console.log(err);
});

test.query('insert transaction_test set test=?',[4000],function(err,result){
	test.query('insert transaction_test set test=?',[3999],function(err,otherResult){
		// you can skip the final callback function if you setup commit and rollback event listeners
		// if you are not make event listeners, function throw error
		test.query('insert transaction_test set test=?',[3998]);
	});
}).
on('commit', function(){
	console.log('nice auto commit');
}).
on('rollback',function(err){
	console.log(err);
});


var testQuery = test.query('insert transaction_test set test=?',[5000],function(err,result){
	test.query('insert transaction_test set test=?',[4999],function(err,otherResult){
		test.query('insert transaction_test set test=?',[4998]);
	});
})

testQuery.
on('commit', function(){
	console.log('nice auto commit 2');
}).
on('rollback',function(err){
	console.log(err);
});

// */