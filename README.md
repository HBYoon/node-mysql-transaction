node-mysql-transaction
===
#### transaction wrapper for mysql driver
based on node-mysql: https://github.com/felixge/node-mysql

node-mysql-transaction is run by single callback function queue with dynamic connection pool structure.

Install
---
```
npm install node-mysql-transaction
```


Make transaction object
---
```
// tested mysql2.0.0-alpha7
var mysql = require('mysql');

var transaction = require('node-mysql-transaction');
var trCon = transaction({
  // mysql driver set 
  connection: [mysql.createConnection,{
    // mysql connection config
    user: ...,
    password: ...,
    database: ...,
    ...
  }],
  
  // create temporary connection for increased volume of async work.
  // if request queue became empty, 
  // start soft removing process of the connection.
  // recommended for normal usage.
  dynamicConnection: 32,
  
  // set dynamicConnection soft removing time.
  idleConnectionCutoffTime: 1000,
  
  // auto timeout rollback time in ms
  // turn off is 0
  timeout:600
});

```


Introduction
---

###transaction chain

Transaction chain method is a transaction version of original mysql driver's Streaming query. Easily, you can make a bundling query request.


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
query('insert ...').
query('insert ...');

```

When after transaction complete, auto commit run and emit 'commit' event. If error occur in a transaction query chain, then auto rollback run and emit 'rollback' event.

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
query('insert ...').
query('insert ...').
query('insert ...').
query('insert ...').
on('result', function(result){
  chain.commit();
}).
autoCommit(false);

```

Query chain can linked after turn off an auto commit.

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
query('insert ...').
on('result', function(result){
  chain.
  query('insert ...').
  on('result', function(result){
    console.log('lol');
  }).
  query('insert ...').
  on('result',function(result){
    chain.
    query('insert ...',[...]).
    query('insert ...').
    query('insert ...').
    query('insert ...')
    // auto commit run
    // all of this is a single transaction
  }).autoCommit(false);
}).autoCommit(false);
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
query('insert ...').
on('result', function(result){
  console.log(result.insertId);
}).
query('insert ...').
on('result', function(result){
  chain.commit();
}).
autoCommit(false);

```

Unlike autocommit, auto rollback is always running. But if you attach error event listener to the query, auto rollback is turn off in that query.

```
var chain = trCon.chain();

...

chain.
query('insert ...').
on('error', function(err){
  console.log(err);
  // now auto rollback is turned off for this error.
}).
// other queries auto rollback is still works.
query('insert ...').
...
```

chain can make a loop.

```
var chain = trCon.chain();
chain.
on('commit', function(){
  console.log('chain commit');
}).
on('rollback', function(err){
  console.log(err);
});

for(var i = 0; i < 10; i+=1) {
  // loop in transaction
  chain.query('insert ...',[...]);
}
```

###transaction set
Transaction chain is the application layer of the transaction set. You can use this set method for transaction, also. But connection set doesn't have any transaction helper, unlike transaction chain. So, you must to check error for every query request. And you must to select rollback or commit for each transaction capsule.
```
trCon.set(function(err, safeCon){
  if (err) {
    return console.log(err);
  }
  safeCon.on('commit', function(){
    console.log('commit');
  });
  safeCon.on('rollback', function(err){
    console.log(err);
  });
  safeCon.query('insert ......',[......],function(err,result){
    if (err) {
      safeCon.rollback();
    }
    safeCon.query('insert ......',[......],function(err,result){
      if (err) {
        safeCon.rollback(err);
      }
      // .set transaction can work after several event loop.
      // if you forget commit or rollback, 
      // and no timeout setting, connection will be leak.
      safeCon.commit();
    });
  });
});
```

Event provide better way for transaction in some case.

```
test.set(function(err, safeCon){
  if (err) {
    return console.log(err);
  }
  safeCon.on('commit', function(){
    console.log('commit!');
  }).
  on('rollback', function(err){
    console.log('rollback');
    console.log(err);
  });
  
  var insertNumber = 2;
  var resultCount = 0;
  
  reqQuery1 = safeCon.query('insert ......', [...]);
  reqQuery2 = safeCon.query('insert ......', [...]);
  
  function resultOn (result) {
    resultCount += 1;
	if (resultCount === insertNumber) {
	  safeCon.commit();
	}
  };
  
  reqQuery1.
  on('result', resultOn).
  on('error',  safeCon.rollback.bind(safeCon));

  reqQuery2.
  on('result', resultOn).
  on('error',  function(err){
    // safeCon.rollback.bind(safeCon) doing same work of this function.
    safeCon.rollback(err);
  });
});
```

###top level error handling

Every fatal connection error and basic transaction query(START TRANSACTION, COMMIT, ROLLBACK) error and request queue's type error will bubble to the top transaction object. This bubbled error will link to the current transaction work on failed connections too, if it possible.

```
var transaction =  require('node-mysql-transaction');
var trCon = transaction({ ...... });

// listener of bubbled exception from connections.
var fatalCount = 0;
trCon.on('error', function(err){
  // internal error handling will work after this listener.
  // use for logging or end method caller.
  ...
  fatalCount += 1;
  if (fatalCount > 80) {
    trCon.end();
  }
});
```

If you don't set listener for top level error, the top level error is bubbled to the process and kill the process. For internal error recovery (simply, it will remove failed connection and create new one for next transaction request), you must take top level error event before.

###Terminating

Call end method. Method sending error to all callback function in the queue and connection terminating after current transaction finished.

```
trCon.end()
```

###transaction query

removed


Update
---
0.0.1: start

0.0.2: Improvement of queue set structure. before, multi queue, multi connections -> now, single queue multi connections. Minor API change, but not about query, chain method

0.0.22: Transaction can work only dynamic connection without any static connection.

0.0.23: fix process.nextTick recursive. now module fit to the node.js 0.10

0.0.3: default chain method setMaxListeners is 0. code and internal API update.

0.0.31: query method update.

0.1.0: redesigned internal connection pool and queue. pool and queue performance improved. more solid error handling.  removed query method. bug fix. internal API changed, but minimum userland change.