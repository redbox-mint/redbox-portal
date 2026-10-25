// Institution qualification driver. Run only against explicitly disposable local equivalents.
'use strict';
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const appRequire=createRequire(require('node:path').resolve(process.cwd(),'package.json'));
const {createWsuPortal}=appRequire('redbox-hook-wsu/deployment');
const core=appRequire('@researchdatabox/redbox-core/portal');
const persistence=appRequire('@researchdatabox/redbox-core/extensions/storage');
const {MongoClient}=appRequire('mongodb');
const {nothingLogger:log}=appRequire('@researchdatabox/sails-ng-common');
const {REDBOX_APPLICATION_CONFIG,REDBOX_ENVIRONMENT_CONFIG,REDBOX_LOCAL_CONFIG,...env}=process.env;
const options={appPath:process.cwd(),files:{application:REDBOX_APPLICATION_CONFIG},env,log};
(async()=>{
  assert.equal(process.env.SR_WSU_DISPOSABLE,'true');assert.equal(process.version,'v26.11.1');
  let portal=await createWsuPortal(options,false),releaseWork;
  const config=portal.config;
  for(const url of [config.datastores.mongodb.url,config.datastores.redboxStorage.url,config.agendaQueue.options.db,config.redboxSession.mongoUrl]){
    const parsed=new URL(url);assert.equal(parsed.hostname,'127.0.0.1');assert.match(parsed.pathname,/^\/sr_wsu_/);
  }
  const clients=[];
  try {
    const metadata=[];
    for(const url of [config.datastores.mongodb.url,config.datastores.redboxStorage.url]){
      const client=await new MongoClient(url).connect();clients.push(client);
      const build=await client.db().command({buildInfo:1}),fcv=await client.db('admin').command({getParameter:1,featureCompatibilityVersion:1});
      assert.equal(build.version,process.env.SR_WSU_MONGO_VERSION);assert.equal(fcv.featureCompatibilityVersion.version,process.env.SR_WSU_FCV);
      const hello=await client.db().command({hello:1});assert.equal(hello.setName,undefined);
      metadata.push({version:build.version,fcv:fcv.featureCompatibilityVersion.version,standalone:true});
    }
    assert.notEqual(new URL(config.datastores.mongodb.url).host,new URL(config.datastores.redboxStorage.url).host);
    const selected={storage:portal.preflight,agenda:core.selectedAgendaMongoOptions(config.agendaQueue),session:config.redboxSession};
    const before=await core.prepareSelectedPersistenceIndexes(portal.owner,'inspect',selected);
    assert.equal((await core.prepareSelectedPersistenceIndexes(portal.owner,'ensure',selected)).ready,true);
    assert.equal((await core.prepareSelectedPersistenceIndexes(portal.owner,'inspect',selected)).ready,true);
    await core.cleanupPersistence(portal.owner);
    portal=await createWsuPortal(options);
    await portal.host.initialize();
    assert.equal(portal.application.status().ready,false);
    const brand=portal.data.reference.branding.get().getDefault();
    const types=await clients[0].db().collection('recordtype').find().toArray();
    for(const name of ['rdmp','dataRecord','dataPublication','instrument','ror'])assert(types.some(t=>t.name===name));
    const ledger=await clients[0].db().collection('migration').find().toArray();
    assert.equal(typeof portal.resolveHook('wsu.plan.preserveIds'),'function');
    assert.equal(typeof portal.resolveHook('wsu.publication.produceMetadataFiles'),'function');
    assert.throws(()=>portal.resolveHook('sails.services.planattachmentservice.preserveIds'));
    const storedForms=await clients[0].db().collection('form').find().toArray();const forms=storedForms.length;
    for(const steps of Object.values(config.workflow))for(const step of Object.values(steps))assert(storedForms.some(form=>form.name===step.config.form),step.config.form);
    await portal.host.activate();
    const base=config.server.publicUrl;
    assert.equal((await fetch(base+'/readyz')).status,200);
    const csrf=await fetch(base+'/csrfToken');assert.equal(csrf.status,200);
    const cookie=csrf.headers.getSetCookie().map(v=>v.split(';')[0]).join('; '),token=(await csrf.json())._csrf;
    const login=await fetch(base+'/user/login_local',{method:'POST',headers:{'Content-Type':'application/json','X-Source':'jsclient','X-CSRF-Token':token,Cookie:cookie},body:JSON.stringify({username:'admin',password:'rbadmin',branding:'default',portal:'rdmp'})});
    assert.equal(login.status,200);assert.equal((await login.json()).user.username,'admin');
    const sessionCookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');assert(sessionCookie);
    let publicationOid;
    for(const name of ['rdmp','dataRecord','dataPublication','instrument','ror']){
      const result=await portal.data.storage().create(brand,{metaMetadata:{brandId:brand.id,type:name,form:Object.values(config.workflow[name])[0].config.form},metadata:{title:'Sanitized WSU '+name},authorization:{view:['admin'],edit:['admin'],viewRoles:['Admin'],editRoles:['Admin']},workflow:{stage:'draft'}},{});
      assert.equal(result.success,true);if(name==='dataPublication')publicationOid=result.oid;
      const headers={Cookie:sessionCookie,'X-Source':'jsclient'};
      assert.equal((await fetch(base+'/default/rdmp/api/records/metadata/'+result.oid,{headers})).status,200);
      assert.equal((await fetch(base+'/default/rdmp/api/forms/get?name='+encodeURIComponent(Object.values(config.workflow[name])[0].config.form),{headers})).status,200);
      assert.equal((await fetch(base+'/default/rdmp/record/wfSteps/'+name,{headers})).status,200);
    }
    const regenerate=base+'/default/rdmp/regenLandingPages/'+publicationOid;
    assert.equal((await fetch(regenerate,{method:'POST'})).status,401);
    assert.equal((await fetch(regenerate,{method:'POST',headers:{Cookie:sessionCookie}})).status,403);
    const freshToken=await (await fetch(base+'/csrfToken',{headers:{Cookie:sessionCookie}})).json();
    assert.equal((await fetch(regenerate,{method:'POST',headers:{Cookie:sessionCookie,'X-CSRF-Token':freshToken._csrf}})).status,200);
    const key='qualification/wsu-'+process.env.SR_WSU_FCV+'.txt',disk=portal.data.disks.get().primaryDisk();
    await disk.put(key,Buffer.from('sanitized WSU S3 bytes'));const stream=await disk.getStream(key);const parts=[];for await(const chunk of stream)parts.push(chunk);
    assert.equal(Buffer.concat(parts).toString(),'sanitized WSU S3 bytes');await disk.delete(key);
    const id='wsu-owned-worker-'+Date.now();
    await portal.data.queue.get().now('SecurityEventService-StoreSecurityEvent',{event:{brandId:brand.id,eventId:id,eventType:'qualification',category:'record',severity:'info',deliveryState:'pending',source:'qualification',occurredAt:new Date().toISOString()}});
    const deadline=Date.now()+20000;while(!await clients[0].db().collection('securityevent').findOne({eventId:id})){assert(Date.now()<deadline);await new Promise(r=>setTimeout(r,100));}
    const entered=Promise.withResolvers(),release=Promise.withResolvers();releaseWork=release.resolve;
    const accepted=persistence.runAcceptedPersistenceWork(portal.owner,async()=>{entered.resolve();await release.promise;assert.equal((await portal.data.storage().create(brand,{metaMetadata:{brandId:brand.id,type:'rdmp'},metadata:{title:'WSU accepted completion'}},{})).success,true);});
    await entered.promise;
    await assert.rejects(portal.host.stop({deadlineMs:30}),/deadline|drain/i);assert(core.persistenceStatus(portal.owner).pools>0);
    release.resolve();await accepted;await portal.host.stop({deadlineMs:20000});
    assert.equal(core.persistenceStatus(portal.owner).pools,0);assert.equal(core.persistenceStatus(portal.owner).prismaClients,0);
    portal=await createWsuPortal(options);await portal.host.initialize();await portal.host.activate();
    assert.equal(portal.data.reference.branding.get().getDefault().id,brand.id);assert.equal(await clients[0].db().collection('form').countDocuments(),forms);
    await portal.host.stop({deadlineMs:20000});assert.equal(core.persistenceStatus(portal.owner).pools,0);
    assert.equal(global.sails,undefined);
    console.log(JSON.stringify({institution:'Western Sydney University',runtime:process.version,datastores:metadata,maintenanceBeforeReady:before.ready,maintenance:true,types:5,forms,ledgerDocuments:ledger.length,csrfLogin:true,recordFormWorkflowReads:5,extensionCsrf:true,s3RoundTrip:true,workerWrite:true,failedDrainRetainsPools:true,successfulDrainPools:0,restart:true}));
  } finally {releaseWork?.();await portal?.host?.stop({deadlineMs:30000});for(const client of clients)await client.close();console.log(JSON.stringify({cleanup:core.persistenceStatus(portal.owner),activeResources:process.getActiveResourcesInfo()}));}
})().catch(error=>{console.error(error);process.exitCode=1;});
