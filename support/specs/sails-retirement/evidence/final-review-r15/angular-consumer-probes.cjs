'use strict';
// Real Express route responses drive actual extracted Angular consumer methods.
// This supplements browser Karma; it is not a full deployed browser/persistence test.
const fs=require('node:fs');
const cp=require('node:child_process');
const ts=require(process.cwd()+'/node_modules/typescript');
const assert=require('node:assert/strict');
const _=require(process.cwd()+'/node_modules/lodash');
const {throwError}=require(process.cwd()+'/node_modules/rxjs');
require(process.cwd()+'/node_modules/ts-node').register({project:'packages/redbox-core/test/tsconfig.json',transpileOnly:true});
const {httpIdentityFixture}=require(process.cwd()+'/packages/redbox-core/test/helpers/httpIdentityFixture.ts');
const root='angular/projects/researchdatabox/';
const paths={users:root+'manage-users/src/app/manage-users.component.ts',roles:root+'manage-roles/src/app/manage-roles.component.ts'};
function consumer(path,version) {
  const code=version==='incoming'?cp.execFileSync('git',['show','bda01cb25:'+path],{encoding:'utf8'}):fs.readFileSync(path,'utf8');
  const tree=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true);
  const selected=new Set(['genKey','revokeKey','updateUserSubmit','newUserSubmit','saveCurrentUser','setUpdateMessage','setNewUserMessage','setSaveMessage','requestFailureMessage']);
  const methods=[];
  function visit(n){if(ts.isMethodDeclaration(n)&&selected.has(n.name.getText(tree)))methods.push(n.getText(tree));ts.forEachChild(n,visit);}visit(tree);
  const js=ts.transpileModule(`class Consumer { ${methods.join('\n')} }`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  return new Function('_',js+'; return Consumer;')(_);
}
async function main(){
  const results=[];const f=await httpIdentityFixture();
  try {
    f.roles.getRolesWithBrand.callsFake(()=>throwError(()=>new Error('private database credential')));
    for(const [kind,method,action,body] of [
      ['users','genKey','/admin/users/genKey',{userid:'111111111111111111111111'}],
      ['users','revokeKey','/admin/users/revokeKey',{userid:'111111111111111111111111'}],
      ['users','updateUserSubmit','/admin/users/update',{userid:'111111111111111111111111',details:{name:'Draft'}}],
      ['users','newUserSubmit','/admin/users/newUser',{username:'new-user',details:{name:'Draft'}}],
      ['roles','saveCurrentUser','/admin/roles/user',{userid:'111111111111111111111111',roles:['Researcher']}],
    ]) {
      const response=await f.request('/default/portal'+action,{method:'POST',body});
      assert.equal(response.status,500);assert(!JSON.stringify(response.body).includes('credential'));
      for(const version of ['incoming','current']) {
        const Consumer=consumer(paths[kind],version);const app=new Consumer();
        const error={status:response.status,error:response.body};
        app.userService=new Proxy({},{get:()=>()=>Promise.reject(error)});
        app.currentUser={id:'111111111111111111111111',newRoles:[{name:'Researcher',hasRole:true}],roles:['Admin'],roleStr:'Admin'};
        app.translationService={t:k=>k};app.refreshUsers=()=>{throw new Error('must retain draft');};
        app.hideDetailsModal=()=>{throw new Error('must keep modal');};
        app.setUpdateMessage?.('');app.setNewUserMessage?.('');app.setSaveMessage?.('');
        let rejected=false;
        try {await app[method](method==='genKey'||method==='revokeKey'?'111111111111111111111111':{userid:'111111111111111111111111',username:'new-user',name:'Draft',email:'',passwords:{password:''},roles:[{name:'Researcher'}]},true);}catch(e){assert.equal(e,error);rejected=true;}
        const message=kind==='roles'?app.saveMsg:method==='newUserSubmit'?app.newUserMsg:app.updateDetailsMsg;
        if(version==='incoming'){assert(rejected);assert.match(message,/Saving|Generating|Revoking/);}
        else {assert(!rejected);assert.equal(message,'User administration failed.');}
        results.push({kind,method,version,httpStatus:response.status,body:response.body,rejected,message});
      }
    }
  } finally {await f.close();}
  fs.writeFileSync('support/specs/sails-retirement/evidence/final-review-r15/angular-consumer-results.json',JSON.stringify({node:process.version,proof:'Real Express loopback + selected extracted Angular methods, controlled identity ports. Policy/session/CSRF deployed qualification remains parent-owned.',results},null,2)+'\n');
  console.log(`${results.length} consumer/HTTP observations passed`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
