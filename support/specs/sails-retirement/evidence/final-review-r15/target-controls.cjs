/* R15 native HTTP controls over the actual route mounts and explicit domain ports. */
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../../..');
process.env.TS_NODE_PROJECT = path.join(root, 'packages/redbox-core/test/tsconfig.json');
require(path.join(root, 'node_modules/ts-node/register/transpile-only'));
const { of } = require(path.join(root, 'node_modules/rxjs'));
const { httpIdentityFixture } = require(path.join(root, 'packages/redbox-core/test/helpers/httpIdentityFixture.ts'));
const { httpRecordMutationsFixture } = require(path.join(root, 'packages/redbox-core/test/helpers/httpRecordMutationsFixture.ts'));
const results = [];
const selected = '111111111111111111111111', other = '222222222222222222222222';
async function identity() {
  const f = await httpIdentityFixture();
  try {
    f.users.getUserWithId.callsFake(id => of({ id, username: id, roles: [{name:'Researcher', branding:'brand-1'}] }));
    f.users.setUserKey.callsFake(id => of({id}));
    for (const action of ['generate','revoke']) {
      f.users.setUserKey.resetHistory();
      const response = await f.request(`/default/portal/api/users/token/${action}?id=${selected}&userid=${other}`, {method:'POST',body:{id:other,userid:other}});
      assert.equal(response.status,200);
      assert.equal(f.users.setUserKey.firstCall.args[0], selected);
      results.push({scope:'identity',route:`POST /api/users/token/${action}`,selection:'query.id',status:response.status});
    }
    for (const prefix of ['api','admin']) for (const action of ['links','audit']) {
      f.users.getUserWithId.resetHistory();
      const response = await f.request(`/default/portal/${prefix}/users/${selected}/${action}?id=${other}&userid=${other}`);
      assert.equal(response.status,200);
      assert.equal(f.users.getUserWithId.firstCall.args[0],selected);
      const operation = action==='links' ? 'getLinkedAccounts':'getUserAudit';
      assert.equal(f.users[operation].lastCall.args[0], selected);
      results.push({scope:'identity',route:`GET /${prefix}/users/:id/${action}`,selection:'path.id',status:response.status});
    }
    for (const prefix of ['api','admin']) {
      const response = await f.request(`/default/portal/${prefix}/users/link/candidates?primaryUserId=${selected}&query=abc&id=${other}`);
      assert.equal(response.status,200);
      assert.equal(f.users.searchLinkCandidates.lastCall.args[2],selected);
      results.push({scope:'identity',route:`GET /${prefix}/users/link/candidates`,selection:'query.primaryUserId',status:response.status});
      const linked = await f.request(`/default/portal/${prefix}/users/link?primaryUserId=${other}&secondaryUserId=${selected}`,{method:'POST',body:{primaryUserId:selected,secondaryUserId:other,id:other}});
      assert.equal(linked.status,200);
      assert.deepEqual(f.users.linkAccounts.lastCall.args.slice(0,2),[selected,other]);
      results.push({scope:'identity',route:`POST /${prefix}/users/link`,selection:'body.primaryUserId,body.secondaryUserId',status:linked.status});
    }
  } finally {await f.close();}
}
async function records() {
  const descriptors = [
    ['PUT','/api/records/metadata/record-1','updateMeta'],
    ['PUT','/api/records/objectmetadata/record-1','updateMeta'],
    ['PUT','/api/deletedrecords/record-1','restoreRecord'],
    ['DELETE','/api/deletedrecords/record-1','destroyDeletedRecord'],
    ['DELETE','/api/records/metadata/record-1','delete',false,'delete'],
    ['DELETE','/api/records/metadata/record-1?permanent=true','delete',true,'purge'],
    ...['edit','view','editRole','viewRole'].flatMap(subject=>['POST','DELETE'].map(method=>[method,`/api/records/permissions/${subject}/record-1`,'updateMeta'])),
    ['POST','/api/records/workflow/step/review/record-1','updateMeta'],
    ['PUT','/recordmeta/record-1','updateMeta'],
    ['DELETE','/record/delete/record-1?permanent=true','delete',false,'delete'],
    ['PUT','/record/delete/record-1','restoreRecord'],
    ['DELETE','/record/destroy/record-1','destroyDeletedRecord'],
    ['POST','/record/workflow/step/review/record-1','updateMeta'],
  ];
  for (const [method,suffix,operation,permanent,intent] of descriptors) {
    const f = await httpRecordMutationsFixture();
    try {
      const response = await f.request('/default/portal'+suffix+(suffix.includes('?')?'&':'?')+'oid=record-2&id=record-2', {method,body:{oid:'record-2',id:'record-2',title:'Updated',users:[],roles:[],pendingUsers:[]}});
      assert.equal(response.status,200, `${method} ${suffix}: ${response.text}`);
      const call = f.records[operation].firstCall;
      const idOffset = operation==='updateMeta'?1:0;
      assert.equal(call.args[idOffset],'record-1');
      if (operation==='delete') {
        assert.equal(call.args[1],permanent);
        assert.equal(call.args[5].operation,intent);
      }
      const load = operation==='restoreRecord'||operation==='destroyDeletedRecord'?f.records.getDeletedRecordMeta:f.records.getMeta;
      assert.equal(load.firstCall.args[0],'record-1');
      results.push({scope:'record',route:method+' '+suffix,selection:'path.oid',status:response.status,...(intent?{permanent,intent}:{})});
    } finally {await f.close();}
  }
}
(async()=>{await identity();await records();console.log(JSON.stringify({kind:'native-http-with-domain-ports',baselineServer:false,count:results.length,results},null,2));})().catch(error=>{console.error(error);process.exitCode=1;});
