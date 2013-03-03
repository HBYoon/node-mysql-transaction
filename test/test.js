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
	connectionNumber:3,
	
	// when queue length increase or queue length is longer than connectionNumber * 32, 
	// make temporary connection for increased volume of async work.
	dynamicConnection:3,
	
	// auto time out rollback in ms
	timeOut:600
});

/* //<<<<<<<<<<<<<block

// simple loop test
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
				
				
				// query can not work after transaction end(commit or rollback)
				// query('insert transaction_test set test=?',[num],function(err,result){
					// console.log(err);//[Error: out of transaction]
				// });
			}
			
			// when after commit...oops!
			// even code has a logical error, it works well
			safeCon.rollback();
			if (num === to) {
				console.timeEnd('test');
				
				
				// time per connectionNumber in 10000 loop in my pc with mariaDB 5.5
				// better speed == more cpu usage
				// 32 -> 112xx ~ 114xx ms
				// 16 -> 113xx ~ 114xx ms -> full single cpu usage
				// 8  -> 127xx ~ 128xx ms
				// 6  -> 137xx ~ 140xx ms
				// 4  -> 164xx ~ 165xx ms
				// 2  -> 272xx ~ 276xx ms
				// 1  -> 395xx ~ 403xx ms
			}
		});
	});
}
//*/


/* //<<<<<<<<<<<<<block

// odd number test
var to = 10000;
for (var i = 0; i < to; i+=1) {
	test.query('select test from transaction_test where num=?',[i+1],function(err,result){
		if (result) {
			if (result[0]) {
				if (result[0].test) {
					if (result[0].test%2) {
						console.log('odd number!!!!!!  '+result[0].test);
					}
				}
			}
		}
	});
};
// */


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
		
		// finally auto commit run
	
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
query('insert transaction_test set test=?',[20])

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

for(var i = 0; i < 10; i+=1) {
	// working good :)
	chain4.query('insert transaction_test set test=?',[i*100]);
}

var chain5 = test.chain();
chain5.
on('commit', function(){
	console.log('chain4 commit');
}).
on('rollback', function(err){
	console.log('chain4 rollback');
	console.log(err);
}).
setMaxListeners(0);

for(var i = 0; i < 10; i+=1) {
	if (i===8) { i='error maker' }
	chain5.query('insert transaction_test set test=?',[i*10000]);
}

// */

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


// /* //<<<<<<<<<<<<<block

// connection.set
// connection.set is the base API for queue reservation
// connection.chain/.query is wrapper of .set
// simply connection.set doesn't have any sugar

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
				},0);
			},0);
		});
	});
});

// Streaming query
test.set(function(err, safeCon){
	safeCon.on('commit', function(){
		console.log('commit!');
	});
	safeCon.on('rollback', function(err){
		console.log(err);
	});
	
	reqQuery1 = safeCon.query('insert transaction_test set test=23');
	reqQuery2 = safeCon.query('insert transaction_test set test=11');
	
	reqQuery1.on('result', function(result){
		// console.log(result);
	});
	reqQuery2.on('result', function(result){
		safeCon.rollback('23 / 11 rollback yeap!')
	});
});

test.set(function(err, safeCon){
	safeCon.on('commit', function(){
		console.log('23371 commit!');
	});
	safeCon.on('rollback', function(err){
		console.log(err);
	});
	reqQuery1 = safeCon.query('insert transaction_test set test=23371');
	reqQuery2 = safeCon.query('insert transaction_test set test=23371');
	
	reqQuery1.on('result', function(result){
		console.log('23371: ' + result.insertId);
	});
	reqQuery2.on('result', function(result){
		safeCon.commit()
	});
});

test.set(function(err, safeCon){
	safeCon.on('commit', function(){
		console.log('23731 commit!');
	});
	safeCon.on('rollback', function(err){
		console.log('23731 rollback');
		console.log(err);
	});
	
	// input type error value
	reqQuery1 = safeCon.query('insert transaction_test set test=23731');
	reqQuery2 = safeCon.query('insert transaction_test set test=?',['errrrrr']);
	
	reqQuery1.on('result', function(result){
		console.log('23731: ' + result.insertId);
	});
	reqQuery2.on('result', function(result){
		safeCon.commit()
	}).on('error', function(err){
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
	
	reqQuery1.on('result', function(result){
		console.log('37301: ' + result.insertId);
	});
	// time out rollback
	reqQuery2.on('result', function(result){
		setTimeout(function(){
			safeCon.commit()
		},1000);
	});
});
//*/