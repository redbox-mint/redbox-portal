'use strict';
// Current native HTTP and actual baseline helper; deterministic record ports.
// No historical Sails server, production database or browser is exercised.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const express = require(process.cwd() + '/node_modules/express');
const _ = require(process.cwd() + '/node_modules/lodash');
require(process.cwd() + '/node_modules/ts-node').register({project:'packages/redbox-core/test/tsconfig.json',transpileOnly:true});
const {httpRouteFixture} = require(process.cwd() + '/packages/redbox-core/test/helpers/httpRouteFixture.ts');
const {mountQueryReadRoutes} = require(process.cwd() + '/packages/redbox-core/src/http/express/queryReads.ts');
const {mountRecordReadRoutes} = require(process.cwd() + '/packages/redbox-core/src/http/express/recordReads.ts');
const {RecordAuditViews} = require(process.cwd() + '/packages/redbox-core/src/queries/RecordAuditViews.ts');
const {hasViewAccess} = require(process.cwd() + '/packages/redbox-core/src/records/access.ts');
const {method,baseline} = require(process.cwd() + '/support/specs/sails-retirement/evidence/final-review-r14/baseline-method.cjs');
async function main() {
  const record = {redboxOid:'record-1',metadata:{title:'Root context control'},metaMetadata:{brandId:'brand-1',recordRevision:1},authorization:{view:['alice']}};
  const storage = {getMeta:async()=>record,getRecords:()=>{},getDeletedRecords:()=>{}};
  const records = {...storage,getRecordAudit:async()=>[]};
  const audit = new RecordAuditViews({records,forms:{},integrations:{},compareRecords:()=>[],canView:async(...args)=>hasViewAccess(args[0],args[1],args[1].roles,args[2])});
  const observations=[];
  const f=await httpRouteFixture((router,input)=>{
    const rooted=express.Router();
    mountQueryReadRoutes(rooted,{...input,audit});
    mountRecordReadRoutes(rooted,{...input,rootContext:'/research',storage,audit:records,maxRows:20});
    router.use('/research',rooted);
  });
  try {
    const response=await f.request('/research/default/portal/record/viewAudit/record-1/audit');
    assert.equal(response.status,200,JSON.stringify(response.body));
    const raw=response.body.rawAuditUrl;
    assert.equal(raw,'/default/portal/api/records/audit/record-1');
    const unprefixed=await f.request(raw), prefixed=await f.request('/research'+raw);
    assert.equal(unprefixed.status,404);
    assert.equal(prefixed.status,200,JSON.stringify(prefixed.body));
    observations.push({case:'current native audit tab',status:response.status,rawAuditUrl:raw});
    observations.push({case:'actual returned link',status:unprefixed.status});
    observations.push({case:'prefixed control through native raw-audit route',status:prefixed.status,body:prefixed.body});
    const file='packages/redbox-core/src/controllers/RecordAuditController.ts';
    const prior={getReqBrand:()=>f.brand};
    for(const name of ['getSafeRouteSegment','resolveRouteSegment','buildRawAuditUrl']) prior[name]=method(file,name,{_});
    const baselineUrl=prior.buildRawAuditUrl({param:name=>({branding:'default',portal:'portal'})[name],session:{},options:{locals:{}}},'record-1');
    assert.equal(baselineUrl,raw);
    observations.push({case:'actual baseline buildRawAuditUrl method',baseline,rawAuditUrl:baselineUrl,equalsCurrent:true});
    const component=fs.readFileSync('angular/projects/researchdatabox/record-audit/src/app/record-audit.component.ts','utf8');
    const template=fs.readFileSync('angular/projects/researchdatabox/record-audit/src/app/record-audit.component.html','utf8');
    assert(component.includes('this.auditTab.rawAuditUrl = response.rawAuditUrl'));
    assert(template.includes('[href]="auditTab.rawAuditUrl"'));
    observations.push({case:'shipped Angular consumer',directAssignment:true,directHref:true});
    fs.writeFileSync(require('node:path').join(__dirname, 'audit-root-results.json'),JSON.stringify({node:process.version,classification:'B',severity:'P2',proof:'Actual current native HTTP through /research, actual baseline method execution, source-backed shipped direct href. Controlled record ports; no deployed proxy/browser or historical HTTP claim.',observations},null,2)+'\n');
    console.log(`${observations.length} inherited-audit-root observations passed`);
  } finally {await f.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
