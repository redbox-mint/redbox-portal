const { resolve } = require('node:path');
const { start } = require(resolve('packages/redbox-core/test/fixtures/cache-persistence/transition-client.cjs'));
const { MongoClient } = require('mongodb');
(async () => {
 const url = process.env.P5_CACHE_MONGO_URL;
 if (!/^mongodb:\/\/127\.0\.0\.1:[0-9]+\/redbox_cache_p5_rollback$/.test(url)) throw Error('Isolated rollback database required');
 const native = await new MongoClient(url).connect();
 const collection = native.db().collection('cacheentry');
 let w;
 try {
 await collection.createIndex({name:1}, {unique:true, name:'cacheentry_name_unique'});
 await collection.deleteMany({});
 w = await start('prisma');
  console.log('P5 rollback writer active backend=prisma', JSON.stringify(w.ready));
  const now = Math.floor(Date.now()/1000);
  for(const [n,data] of [{nested:[false,null,'rollback']},[1,2],false,0,'',null].entries()) await w.call('create',{name:`rollback-${n}`,data,ts_added:now});
  await w.call('cacheSet','restart-old',{completed:true});
  await w.call('notification',['failed']);
  const deadline=Date.now()+5000;
  while((!(await collection.findOne({name:'restart-old'})) || !(await collection.findOne({name:'intnotif:p5-brand:p5-oid:figshare'}))) && Date.now()<deadline) await new Promise(ok=>setTimeout(ok,10));
  if (!(await collection.findOne({name:'restart-old'}))) throw Error('Incomplete persistence');
  for(const [token,age] of [['p5-valid',0],['p5-expired',310],['p5fullvalid',0]]) await w.call('create',{name:`branding-preview:${token}`,data:{css:'/* Prisma-written preview */',branding:'default',portal:'rdmp',hash:'p5'},ts_added:now-age});
 } finally {try {if(w) await w.close();}finally{await native.close();}}
})().catch(error=>{console.error(error);process.exitCode=1;});
