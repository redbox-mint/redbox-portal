'use strict';
// Actual pinned controller/helper methods with explicit fixture ports, not a baseline server.
const assert = require('node:assert/strict');
const { method, core, baseline } = require('./baseline-method.cjs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { of } = core('rxjs');
const ts = core('typescript');
const _ = core('lodash');
process.env.TS_NODE_PROJECT = path.resolve('packages/redbox-core/test/tsconfig.json');
core('ts-node/register/transpile-only');
const mutation = require(path.resolve('packages/redbox-core/src/RecordSaveResponse.ts'));
const { formatRecordEntityTag } = require(path.resolve('packages/redbox-core/src/RecordEntityTag.ts'));
const concurrency = require(path.resolve('packages/redbox-core/src/RecordHttpConcurrency.ts'));
const controller = 'packages/redbox-core/src/controllers/webservice/RecordController.ts';
const coreController = 'packages/redbox-core/src/CoreController.ts';
const results = [];
(async () => {
 for (const failure of ['returned','thrown']) {
  let pending, response;
  const saved = new mutation.RecordSaveResponse('00000000-0000-4000-8000-000000000000');
  saved.oid='record-1'; saved.outcome='saved'; saved.success=true;
  saved.setConcurrencyMetadata({revision:6,entityTag:formatRecordEntityTag('record-1',6)});
  const record = {metadata:{title:'Existing'},metaMetadata:{brandId:'brand-1'}};
  const log = new Proxy({}, {get:()=>()=>{}});
  const receiver = {
   mutationSaveContext:()=>({valid:true,context:{}}),requireRecordInBrand:async()=>record,
   hasEditAccess:()=>true,retainRequestCallback(){},getNoCacheHeaders:()=>({'Cache-Control':'no-cache, private'}),
   asError:e=>e, RecordsService:{updateMeta:async()=>saved},
   DatastreamService:{removeStagedDatastream:async()=>{},addDatastreams:async()=>{
    if(failure==='thrown')throw new Error('PRIVATE');
    return {message:'failed',isSuccessful:()=>false};
   }},
   sendResp(_req,_res,value){response=value;}
  };
  const fn=method(controller,'addDataStreams',{
   getValidatedApiRequest:()=>({params:{oid:'record-1'}}),BrandingService:{getBrand:()=>({id:'brand-1'})},
   sails:{config:{record:{attachments:{stageDir:'/stage'}}},log},path, UUIDGenerator:()=> 'upload-id',
   validateApiRouteFiles:()=>({valid:true}), addDataStreamsRoute:{}, Datastream:class {constructor(data){this.metadata=data}},
   _:_, recordSaveResultHeaders:concurrency.recordSaveResultHeaders
  });
  await fn.call(receiver,{session:{branding:'default'},user:{username:'alice'},file:()=>({upload(_options,callback){pending=callback(null,[{fd:'/stage/upload-id',filename:'a.txt',type:'text/plain',size:1}]);}})},{});
  await pending;
  assert.equal(response.meta.outcome,'saved-with-warnings');
  assert.equal(response.meta.oid,'record-1');
  assert.equal(response.meta.problems[0].issues[0].code,'datastream-finalization-failed',JSON.stringify(response));
  assert.equal(response.headers.ETag,formatRecordEntityTag('record-1',6));
  const status=method(coreController,'resolveResponseStatus',{sails:{log}}).call({},200,response.displayErrors);
  assert.equal(status,500);
  results.push({case:'datastream-finalization-'+failure,status,metaOutcome:response.meta.outcome,headers:response.headers});
 }
 for (const version of ['1.0','2.0']) {
  const result=new mutation.RecordSaveResponse();result.outcome='not-saved';result.problems=[{kind:'validation',phase:'pre-save',issues:[{code:'invalid',message:'@invalid'}]}];
  let response;
  const fn=method(controller,'sendSaveFailure',{...mutation, recordSaveResultHeaderOption:concurrency.recordSaveResultHeaderOption});
  fn.call({getApiVersion:()=>version,recordSchemaPreconditionFailureStatus:()=>undefined,sendResp(_req,_res,r){response=r;}},{},{},result,'Error sending datastreams upstream.');
  assert.equal(response.status,version==='1.0'?500:400);
  if(version==='2.0')assert.equal(response.meta.outcome,'not-saved');
  results.push({case:'datastream-refusal-'+version,status:response.status,typedMeta:!!response.meta});
 }
 const selected=[];
 const view=method('packages/redbox-core/src/controllers/RecordController.ts','view',{_:_,firstValueFrom:core('rxjs').firstValueFrom,sails:{log:{error(){}}}});
 await view.call({getReqBrand:()=>({id:'brand-1'}),recordsService:{getMeta:async()=>({metadata:{title:'Title'},metaMetadata:{brandId:'brand-1'}})},hasViewAccess:()=>of(true),getSavedRecordPageTitle:()=> 'Title',formatDocumentTitle:x=>x,sendView(_req,_res,name){selected.push(name);}},{param:()=> 'record-1',options:{locals:{view:'record/view-orig'}}},{});
 assert.deepEqual(selected,['record/view-orig']);results.push({case:'original-record-view',view:selected[0]});
 console.log(JSON.stringify({baseline,kind:'actual-baseline-methods-with-fixture-ports',checks:results.length,results},null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
