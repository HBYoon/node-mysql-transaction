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
	connectionNumber:4,
	
	// when queue length increase or queue length is longer than connectionNumber * 32, 
	// make temporary connection for increased volume of async work.
	dynamicConnection:2,
	
	// auto time out rollback in ms
	timeOut:600
});

// /* //<<<<<<<<<<<<<block

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