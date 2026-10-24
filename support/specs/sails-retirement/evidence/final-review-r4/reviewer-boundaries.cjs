const assert = require('node:assert/strict');
const path = require('node:path');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const vm=require('node:vm');
const root=process.cwd();
const pinned='62ac54cb8';
const service=require('ts-node').register({project:path.join(root,'packages/redbox-core/test/tsconfig.json'),transpileOnly:true});
const previous=require.extensions['.ts'];
require.extensions['.ts']=(module,filename)=>{
 const rel=path.relative(root,filename).split(path.sep).join('/');
 if(rel.startsWith('packages/')&&rel.includes('/src/')&&!rel.includes('/node_modules/')) {
  const text=execFileSync('git',['show',pinned+':'+rel],{encoding:'utf8',maxBuffer:32*1024*1024});
  module._compile(service.compile(text,filename),filename);
 } else previous(module,filename);
};
const {composeExtensionApplication,resolveExtensions,bindExtensionFactory}=require(path.join(root,'packages/redbox-core/src/extensions/index.ts'));
const {ExpressHost}=require(path.join(root,'packages/redbox-core/src/http/express/ExpressHost.ts'));
const {httpAction}=require(path.join(root,'packages/redbox-core/src/http/express/middleware.ts'));
const {hasActivePersistenceWork}=require(path.join(root,'packages/redbox-core/src/persistence/runtime.ts'));
const log=new Proxy({}, {get:()=>()=>{}});
async function extensionLifetime(wrapped) {
 let release; const gate=new Promise(r=>release=r);let finished=false,live;
 const owner={config:{},log};
 const resolved=resolveExtensions([{name:'review-hook',root:'.',declaration:{apiVersion:1,
 handlers:[{name:'write',create:()=>async(_req,res)=>{res.json({accepted:true});await gate;live=hasActivePersistenceWork(owner);finished=true;}}],
 routes:[{name:'write',method:'post',path:'/hook',handler:'write',access:'public'}]}}]);
 const composition=composeExtensionApplication(owner,resolved,{
 module:()=>{throw Error('unused');},
 handler:item=>()=>{const fn=bindExtensionFactory(item.declaration,undefined)();return wrapped?httpAction(fn):fn;}
 });
 const host=new ExpressHost(composition.application,{owner,port:0,hostname:'127.0.0.1',prepare:composition.prepare});
 await host.initialize();await host.activate();
 const response=await fetch('http://127.0.0.1:'+host.address().port+'/hook',{method:'POST'});await response.json();
 let stopError;
 try{await host.stop({deadlineMs:50});}catch(e){stopError=e;}
 const state=composition.application.status().state;
 const unfinishedAtStop=!finished;
 release();await new Promise(r=>setTimeout(r,20));
 await host.stop({deadlineMs:1000});
 assert.equal(finished,true);
 console.log(JSON.stringify({probe:'extensionLifetime',wrapped,state,unfinishedAtStop,activePersistenceAtLateCompletion:live,stopRejected:!!stopError}));
 if(wrapped){assert(stopError);assert(live);}else{assert.equal(state,'stopped');assert.equal(live,false);}
}
async function maintenanceSelection(){
 const code=execFileSync('git',['show',pinned+':app.express.cjs'],{encoding:'utf8'});
 const calls=[];
 const portal={config:{logging:{level:'info'},agendaQueue:{options:{backend:'sqs',db:'mongodb://unselected.invalid/unused',collection:'agendaJobs'},jobs:{only:{backend:'sqs'}}}},owner:{},preflight:{},application:{status:()=>({}),stop:async()=>{}}};
 const fakeLogger=new Proxy({}, {get:()=>()=>{},set:()=>true});const pino=()=>fakeLogger;pino.destination=()=>({});
 const appProcess={env:{},argv:['node','app.express.cjs','--maintenance=indexes:ensure'],chdir(){},stdout:{write(){}},uptime:()=>0,exit:code=>{throw Error('unexpected exit '+code);}};
 const fakeRequire=id=>id==='node:path'?path:id==='pino'?pino:id.endsWith('/configuration')?{ConfigurationError:class extends Error{}}:id.endsWith('/portal')?{
 createPortalApplication:async()=>portal,
 prepareSelectedPersistenceIndexes:async(_owner,mode,selected)=>{calls.push({mode,agenda:selected.agenda});return{ready:true};},
 cleanupPersistence:async()=>{},persistenceStatus:()=>({}),
 }:require(id);
 vm.runInNewContext(code,{require:fakeRequire,process:appProcess,__dirname:root,console});
 await new Promise(r=>setImmediate(r));
 assert.equal(calls.length,1);assert.equal(calls[0].agenda.backend,'sqs');
 console.log(JSON.stringify({probe:'maintenanceSelection',calls}));
}
(async()=>{await extensionLifetime(false);await extensionLifetime(true);await maintenanceSelection();})().catch(e=>{console.error(e);process.exitCode=1;});
