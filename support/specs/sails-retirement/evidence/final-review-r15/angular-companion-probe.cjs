'use strict';
// Installed Uppy RequestClient + source-extracted component configuration + native
// mount and real session CSRF. Provider dispatch is a controlled boundary, no OAuth.
const fs = require('node:fs');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const ts = require(process.cwd()+'/node_modules/typescript');
require(process.cwd()+'/node_modules/ts-node').register({project:'packages/redbox-core/test/tsconfig.json',transpileOnly:true});
const session = require(process.cwd()+'/node_modules/express-session');
const {httpRouteFixture} = require(process.cwd()+'/packages/redbox-core/test/helpers/httpRouteFixture.ts');
const {createHttpCsrf} = require(process.cwd()+'/packages/redbox-core/src/http/express/csrf.ts');
const {mountCompanionRoutes} = require(process.cwd()+'/packages/redbox-core/src/http/express/companion.ts');
async function options(file, version, url, token) {
  const code=version==='incoming'?cp.execFileSync('git',['show','e4a198691:'+file],{encoding:'utf8'}):fs.readFileSync(file,'utf8');
  const tree=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true), methods=[];
  const names=new Set(['initialiseUppy','buildTusHeaders','buildCompanionHeaders','resolveImmediateCsrfToken','readCsrfToken']);
  function visit(n){if(ts.isMethodDeclaration(n)&&names.has(n.name.getText(tree)))methods.push(n.getText(tree));ts.forEachChild(n,visit);}visit(tree);
  const js=ts.transpileModule(`class Consumer { ${methods.join('\n')} }`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const Consumer=new Function(js+';return Consumer;')(), consumer=new Consumer(), plugins=[];
  class Uppy { use(plugin,opts){plugins.push({provider:plugin.name,opts});return this;} on(){return this;} }
  Object.assign(consumer, {isEditMode:()=>true,isUploadBlockedByMissingOid:()=>false,isVisible:true,isUploadEnabled:()=>true,
    getUppyDependencies:async()=>({UppyCtor:Uppy,DashboardPlugin:class Dashboard{},TusPlugin:class Tus{},DropboxPlugin:class Dropbox{},GoogleDrivePlugin:class GoogleDrive{},OneDrivePlugin:class OneDrive{}}),
    resolveOidForUpload:()=>'record',buildTusEndpoint:()=>url+'/tus',translateText:x=>x,ensureTusHeadersContainCsrf:()=>{},
    installProviderAuthFallback:()=>{},companionUrl:url+'/companion',enabledSources:['dropbox','googleDrive','onedrive'],
    tusHeaders:{},configService:{csrfToken:token,getConfig:()=>({csrfToken:token})}});
  await consumer.initialiseUppy();
  return plugins;
}
async function main(){
  const {default:RequestClient}=await import(pathToFileURL(process.cwd()+'/angular/node_modules/@uppy/core/lib/companion-client/RequestClient.js'));
  const dispatches=[],observations=[],delayedControls=[];
  const f=await httpRouteFixture((router,input)=>{
    router.use(session({secret:'synthetic-proof-session-secret',resave:false,saveUninitialized:false}));
    const csrf=createHttpCsrf({origins:['http://127.0.0.1']});
    router.get('/csrfToken',csrf.token);
    mountCompanionRoutes(router,{...input,csrf,path:'/companion',context:()=>({branding:'default',portal:'portal'}),
      audit:async()=>{},uploads:{handle(req,res){dispatches.push({path:req.path,method:req.method,outerToken:!!req.get('X-CSRF-Token'),nestedToken:!!req.body?.headers?.['X-CSRF-Token']});res.json({token:'controlled-provider-token'});}}});
  });
  const originalFetch=globalThis.fetch;
  try {
    const tokenResponse=await originalFetch(f.url+'/csrfToken'), token=(await tokenResponse.json())._csrf;
    const cookie=tokenResponse.headers.getSetCookie()[0].split(';')[0];
    // Node fetch lacks a cookie jar; emulate the browser's same-origin session.
    let lastStatus;
    globalThis.fetch=async(url,init={})=>{const res=await originalFetch(url,{...init,headers:{...init.headers,Cookie:cookie}});lastStatus=res.status;return res;};
    const uppy={getState:()=>({}),setState:()=>{}};
    for(const name of ['file-upload','data-location']){
      const file=`angular/projects/researchdatabox/form/src/app/component/${name}.component.ts`;
      for(const version of ['incoming','current']){
        const plugins=await options(file,version,f.url,token),tus=plugins.find(x=>x.provider==='Tus');
        for(const provider of plugins.filter(x=>['Dropbox','GoogleDrive','OneDrive'].includes(x.provider))){
          for(const corrected of [false,true]){
            const opts={...provider.opts,...(corrected?{companionHeaders:{'X-CSRF-Token':token}}:{})};
            const client=new RequestClient(uppy,opts),before=dispatches.length;
            let rejected=false,error;
            try {await client.post('drive/get',{protocol:'tus',endpoint:f.url+'/tus',headers:tus.opts.headers});}catch(e){rejected=true;error=e.cause?.message??e.message;}
            const expectedPass=corrected||!!provider.opts.companionHeaders?.['X-CSRF-Token'];
            assert.equal(rejected,!expectedPass);assert.equal(dispatches.length-before,expectedPass?1:0);
            assert.equal(lastStatus,expectedPass?200:403);
            if(!expectedPass) assert.match(error,/Invalid CSRF token/);
            observations.push({file,version,provider:provider.provider,corrected,httpStatus:lastStatus,outerCsrf:!!opts.companionHeaders?.['X-CSRF-Token'],nestedCsrf:!!tus.opts.headers['X-CSRF-Token'],rejected,error,providerReached:dispatches.length>before});
          }
        }
      }
    }
    const delayedOptions={companionUrl:f.url+'/companion',companionHeaders:{}};
    const delayedClient=new RequestClient(uppy,delayedOptions);
    delayedOptions.companionHeaders={'X-CSRF-Token':token};
    await assert.rejects(()=>delayedClient.post('drive/get',{headers:{'X-CSRF-Token':token}}));
    assert.equal(lastStatus,403);
    delayedControls.push({case:'changing public options after construction leaves private RequestClient headers unchanged',httpStatus:lastStatus});
    delayedClient.setCompanionHeaders({'X-CSRF-Token':token});
    await delayedClient.post('drive/get',{headers:{'X-CSRF-Token':token}});
    assert.equal(lastStatus,200);
    delayedControls.push({case:'setCompanionHeaders updates existing RequestClient',httpStatus:lastStatus});
    fs.writeFileSync('support/specs/sails-retirement/evidence/final-review-r15/angular-companion-results.json',JSON.stringify({node:process.version,proof:'Actual installed RequestClient, extracted component methods, native mountCompanionRoutes and createHttpCsrf with express-session. Controlled provider dispatch; no OAuth/cloud transfer claimed.',observations,delayedControls,dispatches},null,2)+'\n');
    console.log(`${observations.length} installed-client/native-CSRF observations and ${delayedControls.length} delayed update controls passed`);
  } finally {globalThis.fetch=originalFetch;await f.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
