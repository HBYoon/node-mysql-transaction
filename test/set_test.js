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
		database: 'test',
    //port: 9090,
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
  console.log('on top level error');
  console.log(err);
});

// this type error will occur to the top level error.
test.set('what?');

// ** request work concurrently. so, result order can different.
// test result vaule -> 1, 2, 7, 8

// /* //<<<<<<<<<<<<<block

// connection.set
// connection.set is the base API for queue reservation
// connection.chain is wrapper of .set
// simply connection.set doesn't have any transaction helper
// in real world, you must to check error for every query request. 
// and you must to select rollback or commit for each transaction capsule.

// commit after event loop
test.set(function(err, safeCon){
  if (err) {
    return console.error(err);
  }
  safeCon.on('commit', function(){
    console.log('1 / 2 commit, after several event loop');
  });
  safeCon.on('rollback', function(err){
    console.log(err);
  });
  safeCon.query('insert transaction_test set test=?',[1],function(err,result){
    if (err) {
      safeCon.rollback();
    }
    safeCon.query('insert transaction_test set test=?',[2],function(err,result){
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

// timeout rollback
test.set(function(err, safeCon){
  if (err) {
    return console.error(err);
  }
  safeCon.on('commit', function(){
    console.log('3 / 4 commit, after several event loop');
  });
  safeCon.on('rollback', function(err){
    console.log('3 / 4 rollback');
    console.log(err);
  });
  safeCon.query('insert transaction_test set test=?',[3],function(err,result){
    if (err) {
      safeCon.rollback();
    }
    safeCon.query('insert transaction_test set test=?',[4],function(err,result){
      if (err) {
        safeCon.rollback(err);
      }
      setTimeout(function(){
        // .set transaction can work after several event loop.
        safeCon.commit();
        // if you forget commit or rollback, connection will be leak.
      },1000);
    });
  });
});

// /*

// event query
test.set(function(err, safeCon){
  if (err) {
    return console.error(err);
  }
	safeCon.
  on('commit', function(){
		console.log('commit!');
	}).
  on('rollback', function(err){
		console.log(err);
	});
	
	reqQuery1 = safeCon.query('insert transaction_test set test=5');
	reqQuery2 = safeCon.query('insert transaction_test set test=6');
	
	reqQuery1.
  on('result', function(result){
		console.log(result);
	});
  
	reqQuery2.
  on('result', function(result){
		safeCon.rollback('5 / 6 rollback!')
	});
});

test.set(function(err, safeCon){
  if (err) {
    return console.error(err);
  }
	safeCon.
  on('commit', function(){
		console.log('7 / 8 commit!');
	}).
  on('rollback', function(err){
		console.log(err);
	});
  
	reqQuery1 = safeCon.query('insert transaction_test set test=7');
	reqQuery2 = safeCon.query('insert transaction_test set test=8');
  
  var insertNumber = 2;
  var resultCount = 0;
  
  function resultOn (result) {
    resultCount += 1;
    if (resultCount === insertNumber) {
      safeCon.commit();
    }
  };
	
	reqQuery1.
  on('result', function(result){
		console.log('7: ' + result.insertId);
	}).
  on('result', resultOn);
  
	reqQuery2.
  on('result', resultOn);
});

// error handling with event query
test.set(function(err, safeCon){
  if (err) {
    return console.error(err);
  }
  safeCon.on('commit', function(){
    console.log('9 / errrrrr commit!');
  }).
  on('rollback', function(err){
    console.log('9 / errrrrr rollback');
    console.log(err);
  });

  // input type error value
  reqQuery1 = safeCon.query('insert transaction_test set test=9');
  reqQuery2 = safeCon.query('insert transaction_test set test=?',['errrrrr']);

  reqQuery1.
  on('result', function(result){
    console.log('9: ' + result.insertId);
  }).
  on('error', function(err){
    safeCon.rollback(err);
  });

  reqQuery2.
  on('result', function(result){
    safeCon.commit()
  }).
  on('error', safeCon.rollback.bind(safeCon));
});

test.set(function(err, safeCon){
  if (err) {
    return console.error(err);
  }
	safeCon.on('commit', function(){
		console.log('11 / 12 commit!');
	});
	safeCon.on('rollback', function(err){
		console.log('11 / 12 rollback');
		console.log(err);
	});
	reqQuery1 = safeCon.query('insert transaction_test set test=?',[11]);
	reqQuery2 = safeCon.query('insert transaction_test set test=?',[12]);
	
	reqQuery1.
  on('result', function(result){
		console.log('11: ' + result.insertId);
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