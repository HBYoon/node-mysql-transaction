node-mysql-transaction
===
#### transaction wrapper for mysql driver
based on node-mysql: https://github.com/felixge/node-mysql

node-mysql-transaction is working by callback function connection queue.

Install
---
```
npm install node-mysql-transaction
```


Make transaction connection
---
```
// tested mysql2.0.0-alpha7
var mysql = require('mysql');

var transaction =  require('node-mysql-transaction');
var trCon = transaction({
	mysql driver connection 
	connection: [mysql.createConnection,{
		user: ...,
		password: ...,
		database: ...,
		...
	}],
	
	// parallel connection queue number
	connectionNumber:6,
	
	// auto time out rollback in ms
	timeOut:600
});

```

Introduction
---

###transaction chain

Make chain

```
var chain = trCon.chain();

chain.
on('commit', function(){
  console.log('number commit');
}).
on('rollback', function(err){
  console.log(err);
});

chain.
query('insert ...).
query('insert ...).
query('insert ...).
query('insert ...);

```

When after transaction complete, auto commit run and 'commit' event emit. If error occur in transaction query chain, auto rollback run and 'rollback' event emit.

Auto commit can off.

```
var chain = trCon.chain();

chain.
on('commit', function(){
	console.log('number commit');
}).
on('rollback', function(err){
	console.log(err);
});

chain.
query('insert ...).
query('insert ...).
query('insert ...).
query('insert ...).
on('result', function(result){
	chain.commit();
}).
autoCommit(false);

```

Every query function return it's event emitter object.

```
var chain = trCon.chain();

chain.
on('commit', function(){
	console.log('number commit');
}).
on('rollback', function(err){
	console.log(err);
});

chain.
query('insert ...).
on('result', function(result){
	console.log(result.insertId);
}).
query('insert ...).
on('result', function(result){
	console.log(result.insertId);
}).
query('insert ...).
on('result', function(result){
	console.log(result.insertId);
}).
query('insert ...).
on('result', function(result){
	chain.commit();
}).
autoCommit(false);

```

Query chain can linked after auto commit off.
```
var chain = trCon.chain();

chain.
on('commit', function(){
	console.log('number commit');
}).
on('rollback', function(err){
	console.log(err);
});

chain.
query('insert ...).
on('result', function(result){
	chain.
	query('insert ...).
	on('result', function(result){
		console.log('lol');
	}).
	query('insert ...]).
	on('result',function(result){
		chain.
		query('insert ...,[result.insertId]).
		query('insert ...).
		query('insert ...).
		query('insert ...)
		// auto commit run
		// they are single transaction
	}).autoCommit(false);
}).autoCommit(false);

```

###transaction query

Also, classic query style transaction can usable.

```
trCon.query('insert ...',[...],function(err,result){

	trCon.query('insert ...',['err'],function(err,otherResult){
		
		trCon.query('insert ...',[...],function(err,theOtherResult){
			// now auto rollback is working
			// if you setup 'rollback' listener, auto rollback also ready to working
			// you don't need any error handling in the middle of transaction
		});
	});
}).
on('rollback', function(err){
	// error to here
	console.log('trCon.query auto rollback');
});
```

Also auto commit can off.
```
trCon.query('insert ...',[...],function(err,result){
	trCon.query('insert ...',[...],function(err,otherResult){
		trCon.query('insert ...',[...],function(err,theOtherResult){
			// auto commit off
			theOtherResult.autoCommit(false);
			
			setTimeout(function(){
				theOtherResult.commit();
				// result.rollback === otherResult.rollback === theOtherResult.rollback;
			},0);
		});
	});
}).
on('commit', function(){
	console.log('manual commit');
}).
on('rollback',function(err){
	console.log(err);
});
```

Update
---
0.0.1: start

0.0.2: Improvement of queue set structure. Multi queue, multi connections -> now, single queue multi connections. Minor API change, but not about query method