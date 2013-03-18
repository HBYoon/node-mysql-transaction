node-mysql-transaction
===
#### transaction wrapper for mysql driver
based on node-mysql: https://github.com/felixge/node-mysql

node-mysql-transaction is run by single callback function queue with dynamic multi connection structure.

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
  // mysql driver set 
  connection: [mysql.createConnection,{
    user: ...,
    password: ...,
    database: ...,
    ...
  }],
  
  // number of static parallel connection
  // you can chose it 0, if you want to use only dynamic connection.
  staticConnection:3,
  
  // when queue length is more than 0, 
  // make temporary connection for increased volume of async work.
  dynamicConnection:3,
  
  // auto time out rollback in ms
  // turn off is 0
  timeOut:600
});
```


Introduction
---

###transaction chain

.chain method is transaction version of original mysql driver's Streaming query. Easily, you can make a bundling query request.


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
    query('insert ...',[result.insertId]).
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
  // now auto rollback is turned off
}).
// other queries auto rollback is still works
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

###Terminating

Call end method. Method sending error to all callback function in the queue and connection terminating after current transaction finished.

```
trCon.end()
```

###transaction query

query is not recommended method. The query method can be removal in a next version.

.query style transaction can usable. But, in some case, the method is slower than chain. And you will make a lot of indent.

```
// With old style error handling
// if you choose this way, auto rollback and timeout rollback is turn off
trCon.query('insert ...',[...],function(err,result){
  if (err) {
    return result.rollback();
  }
  trCon.query('insert ...',[...],function(err,otherResult){
    if (err) {
      return otherResult.rollback();
    }
    trCon.query('insert ...',[...],function(err,theOtherResult){
      if (err) {
        return theOtherResult.rollback();
      }
      theOtherResult.commit(function(err){
        if (!err) {
          console.log('complete')
        }
      });
    });
  });
})
```

You can choose rollback event for an error handling. In this way, you can turn on auto rollback and timeout rollback.

```
// now auto rollback and timeout rollback is working.
// you don't need any error handling in the middle of transaction
// If you call the query method after call end method, error occurred to callback function

trCon.query('insert ...',[...],function(err,result){

  trCon.query('insert ...',['err'],function(err,otherResult){
    
    trCon.query('insert ...',[...],function(err,theOtherResult){
      
    });
  });
}).
on('rollback', function(err){
  // normal error linked to here after rollback occur
  console.log('trCon.query auto rollback');
});
```

auto commit can turn off.

```
// result.rollback === otherResult.rollback === theOtherResult.rollback;

trCon.query('insert ...',[...],function(err,result){
  trCon.query('insert ...',[...],function(err,otherResult){
    trCon.query('insert ...',[...],function(err,theOtherResult){
      // auto commit off
      theOtherResult.autoCommit(false);
      
      setTimeout(function(){
        theOtherResult.commit();
        
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

Unlike chain method, .query method cannot linked to other event loop. even auto commit is off.

```
trCon.query('insert ...',[...],function(err,result){
  trCon.query('insert ...',[...],function(err,theOtherResult){
    // auto commit off
    theOtherResult.autoCommit(false);
    
    setTimeout(function(){
      trCon.query('insert ...',[...],function(err,otherTransactionResult){
        // This is new transaction!!
        // Now, earlier 2 insert query  just waiting timeout rollback.
        ...
      });
    },0);
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

0.0.2: Improvement of queue set structure. before, multi queue, multi connections -> now, single queue multi connections. Minor API change, but not about query, chain method

0.0.22: Transaction can work only dynamic connection without any static connection.

0.0.23: fix process.nextTick recursive. now module fit to the node.js 0.10

0.0.3: default chain method setMaxListeners is 0. code and internal API update.

0.0.31: query method update.