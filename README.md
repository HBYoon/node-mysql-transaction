node-mysql-transaction
===
make transaction connection
---
```
var mysql = require('mysql');

var transaction =  require('node-mysql-transaction');
var trCon = transaction({
    connection: [mysql.createConnection,{
    user: 'test',
    password: 'test',
    database: 'test'
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

When after transaction complete, autocommit run and 'commit' event emit.
If any error occur in transaction query chain, auto rollback run and 'rollback' event emit.

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
	}).autoCommit(false);
}).autoCommit(false);

```