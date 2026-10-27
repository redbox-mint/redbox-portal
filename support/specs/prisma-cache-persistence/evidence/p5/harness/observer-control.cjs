const {MongoClient}=require('mongodb');
(async()=>{
 const url=process.env.P5_CACHE_MONGO_URL;
 if(!/^mongodb:\/\/127\.0\.0\.1:[0-9]+\/redbox_cache_p5_observer$/.test(url)) throw Error('Private observer control required');
 const client=await new MongoClient(url).connect();
 try {
  const counts=[];
  for(let n=0;n<22;n++){
   counts.push((await client.db().admin().serverStatus()).connections.current);
   await new Promise(ok=>setTimeout(ok,1000));
  }
  console.log(JSON.stringify({p5:'observer-only control; no application/backend started',node:process.version,mongo:(await client.db().command({buildInfo:1})).version,connectionCountsEvery1000ms:counts}));
  if(counts.at(-1)!==3) throw Error('Unexpected observer-only baseline');
 }finally{await client.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
