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
	staticConnection:0,
	
	dynamicConnection:64,
	idleConnectionCutoffTime: 100,
	// auto time out rollback in ms
	timeOut:600
});

// don't use this test for compare of  set_loop test.
// this test has 3 times insert query in each round.

// chain transaction API test
console.time('test');
var number = 0;
var to = 10000;

var numberTo = 0;

for (var i = 0; i < to; i+=1) {
  (function(){
  var num = number+=1;
  
  var chain = test.chain();
  
  chain.
  on('commit', function(){
    if (num === to) {
      console.timeEnd('test');
    }
  }).
  on('rollback', function(err){
    if (num === to) {
      console.timeEnd('test');
    }
  });

  
  chain.
  // query chaining is important and most heavy process in a chain method.
  query('insert transaction_test set test=?',[num]).
  query('insert transaction_test set test=?',[num]).
  query('insert transaction_test set test=?',[num]).
  on('result', function(result){
    if (num%2) {
      // I don't want any odd number!
      chain.rollback();
    }
  });
  })();
}

// 0.1.0 
// mariaDB 5.5.x intel i5 cpu
// time per dynamicConnection
// 64 ->  72xx  ~  73xx ms
// 32 ->  74xx  ~  76xx ms
// 16 ->  88xx  ~  89xx ms
//  8 ->  119xx ~ 120xx ms

// */