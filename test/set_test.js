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
}).
on('error', function(err){
  console.log('on connection error');
  console.log(err);
});

// /* //<<<<<<<<<<<<<block

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
      safeCon.rollback();
    }
    safeCon.query('insert transaction_test set test=?',[71],function(err,result){
      if (err) {
        safeCon.rollback(err);
      }
      setTimeout(function(){
        setTimeout(function(){
          // .set transaction can work after several event loop.
          safeCon.commit();
          // if you forget commit or rollback, connection will be leak.
        },0);
      },0);
    });
  });
});

// /*

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
  }).
  on('error', function(err){
    safeCon.rollback(err);
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

// */