// transaction test - bind all test
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
	// static parallel connection queue number
	staticConnection:10,
	
	// when queue length increase or queue length is longer than connectionNumber * 32, 
	// make temporary connection for increased volume of async work.
	dynamicConnection:1,
	
	// auto time out rollback in ms
	timeOut:600
});

setTimeout(function(){
  console.log('end to end');
  test.end();
},10000)

/* //<<<<<<<<<<<<<block

// simple loop test
setTimeout(function(){
	var number = 0;
	var to = 10000;
	console.time('test');
	for (var i = 0; i < to; i+=1) {
		// transaction set, most low level queue method
		test.set(function(err, safeCon){
			var num = number+=1;
			safeCon.query('insert transaction_test set test=?',[num],function(err,result){
				if (!(num%2)) {
					// I don't want any odd number!
					safeCon.commit();
					
				}
				
				// when after commit...oops!
				// even code has a logical error, it works well
				safeCon.rollback();
				if (num === to) {
					console.timeEnd('test');
				}
			});
		});
	}
},1000);
//*/

/* //<<<<<<<<<<<<<block

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


/* //<<<<<<<<<<<<<block

// connection.set
// connection.set is the base API for queue reservation
// connection.chain is wrapper of .set
// simply connection.set doesn't have any transaction helper
// in real world, you must to check error for every query request. 
// and you must to select rollback or commit for each transaction capsule.

// commit after event loop
test.set(function(err, safeCon){
	safeCon.on('commit', function(){
		console.log('79 / 71 commit, after several event loop');
	});
	safeCon.on('rollback', function(err){
		console.log(err);
	});
	safeCon.query('insert transaction_test set test=?',[79],function(err,result){
		if (err) {
			safeCon.rollback(err);
		}
		safeCon.query('insert transaction_test set test=?',[71],function(err,result){
			if (err) {
				safeCon.rollback(err);
			}
			setTimeout(function(){
				setTimeout(function(){
					// .set transaction can work after several event loop.
					safeCon.commit();
          // if you forget commit or rollback work with only set, connection will be leak.
				},0);
			},0);
		});
	});
});

// event query
test.set(function(err, safeCon){
	safeCon.
  on('commit', function(){
		console.log('commit!');
	}).
  on('rollback', function(err){
		console.log(err);
	});
	
	reqQuery1 = safeCon.query('insert transaction_test set test=23');
	reqQuery2 = safeCon.query('insert transaction_test set test=11');
	
	reqQuery1.
  on('result', function(result){
		// console.log(result);
	});
  
	reqQuery2.
  on('result', function(result){
		safeCon.rollback('23 / 11 rollback yeap!')
	});
});

test.set(function(err, safeCon){
	safeCon.
  on('commit', function(){
		console.log('23371 commit!');
	}).
  on('rollback', function(err){
		console.log(err);
	});
  
	reqQuery1 = safeCon.query('insert transaction_test set test=23371');
	reqQuery2 = safeCon.query('insert transaction_test set test=23371');
	
	reqQuery1.
  on('result', function(result){
		console.log('23371: ' + result.insertId);
	});
	reqQuery2.
  on('result', function(result){
		safeCon.commit()
	});
});

// error handling with event query
test.set(function(err, safeCon){
	safeCon.on('commit', function(){
		console.log('23731 commit!');
	}).
  on('rollback', function(err){
		console.log('23731 rollback');
		console.log(err);
	});
	
	// input type error value
	reqQuery1 = safeCon.query('insert transaction_test set test=23731');
	reqQuery2 = safeCon.query('insert transaction_test set test=?',['errrrrr']);
	
	reqQuery1.
  on('result', function(result){
		console.log('23731: ' + result.insertId);
	});
  
	reqQuery2.
  on('result', function(result){
		safeCon.commit()
	}).
  on('error', function(err){
		safeCon.rollback(err);
	});
});

test.set(function(err, safeCon){
	safeCon.on('commit', function(){
		console.log('37301 commit!');
	});
	safeCon.on('rollback', function(err){
		console.log('37301 rollback');
		console.log(err);
	});
	reqQuery1 = safeCon.query('insert transaction_test set test=?',[37301]);
	reqQuery2 = safeCon.query('insert transaction_test set test=?',[37301]);
	
	reqQuery1.
  on('result', function(result){
		console.log('37301: ' + result.insertId);
	});
	
  // time out rollback
	reqQuery2.
  on('result', function(result){
		setTimeout(function(){
			safeCon.commit()
		},1000);
	});
});
//*/