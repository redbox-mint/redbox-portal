'use strict';
// Native loopback/session/CSRF and extracted Angular onLogin; baseline actual
// localLogin/background-tracker methods execute against controlled ports.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const ts=require(process.cwd()+'/node_modules/typescript');
require(process.cwd()+'/node_modules/ts-node').register({project:'packages/redbox-core/test/tsconfig.json',transpileOnly:true});
const session=require(process.cwd()+'/node_modules/express-session');
const {httpRouteFixture}=require(process.cwd()+'/packages/redbox-core/test/helpers/httpRouteFixture.ts');
const {createHttpAuthentication}=require(process.cwd()+'/packages/redbox-core/src/http/express/authentication.ts');
const {mountAuthenticationRoutes}=require(process.cwd()+'/packages/redbox-core/src/http/express/login.ts');
const {createHttpCsrf}=require(process.cwd()+'/packages/redbox-core/src/http/express/csrf.ts');
const {trackHttpRequestWork}=require(process.cwd()+'/packages/redbox-core/src/middleware/requestLifetime.ts');
const {method,baseline}=require(process.cwd()+'/support/specs/sails-retirement/evidence/final-review-r14/baseline-method.cjs');
const path='angular/projects/researchdatabox/local-auth/src/app/local-auth.component.ts';
const source=require('node:child_process').execFileSync('git',['show','547370ac8:'+path],{encoding:'utf8'}),tree=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true),methods=[];
function visit(n){if(ts.isMethodDeclaration(n)&&['onLogin','getErrors'].includes(n.name.getText(tree)))methods.push(n.getText(tree));ts.forEachChild(n,visit);}visit(tree);
const js=ts.transpileModule('class Consumer {'+methods.join('\n')+'}',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const Consumer=new Function(js+';return Consumer;')();
async function consume(response) {
  const app=new Consumer();
  Object.assign(app,{isLoginDisabled:false,form:{status:'VALID',value:{username:'alice',password:'correct-password'}},loggerService:{debug(){}},window:{location:{href:''}},userService:{loginLocal:async()=>{if(response.status>=400)throw {status:response.status,error:response.body};return response.body;}}});
  let rejected=false;try{await app.onLogin({preventDefault(){}});}catch{rejected=true;}
  return {rejected,isLoginDisabled:app.isLoginDisabled,loginMessage:app.loginMessage??null,redirect:app.window.location.href};
}
async function main(){
  const actor={id:'user-1',username:'alice',roles:[{id:'role-1',name:'Researcher',brandId:'brand-1'}]};
  const identity={local:async()=>actor,session:async()=>actor,profile:async()=>({...actor,name:'Alice'})};
  const observations=[],backgroundErrors=[];
  let failAudit=true,auditCalls=0;
  const f=await httpRouteFixture((router)=>{
    const authentication=createHttpAuthentication(identity);
    router.use(session({secret:'synthetic-login-audit-probe-session-secret',resave:false,saveUninitialized:false}));
    router.use(authentication.initialize,authentication.session);
    const csrf=createHttpCsrf({origins:['http://127.0.0.1']});
    router.get('/csrfToken',csrf.token);
    mountAuthenticationRoutes(router,{passport:authentication.passport,identity,defaultBrand:'default',defaultPortal:'portal',validContext:(b,p)=>b==='default'&&p==='portal',brandId:()=> 'brand-1',postLoginPath:()=>'/default/portal/home',audit:async()=>{auditCalls++;if(failAudit)throw new Error('synthetic useraudit insert failure');},loginFailure:async()=>{},csrf:csrf.protect});
  });
  try{
    const token=await f.request('/csrfToken');
    const cookie=token.headers.getSetCookie()[0].split(';')[0];
    const login=()=>f.request('/user/login_local',{method:'POST',body:{username:'alice',password:'correct-password',branding:'default',portal:'portal'},headers:{Cookie:cookie,'X-CSRF-Token':token.body._csrf,'x-source':'jsclient'}});
    const failed=await login();
    assert.equal(failed.status,500);assert(!JSON.stringify(failed.body).includes('synthetic'));
    const failedConsumer=await consume(failed);
    assert.equal(failedConsumer.rejected,true);assert.equal(failedConsumer.isLoginDisabled,true);assert.equal(failedConsumer.loginMessage,null);assert.equal(failedConsumer.redirect,'');
    observations.push({case:'current correct credentials; useraudit insert rejects',httpStatus:failed.status,body:failed.body,consumer:failedConsumer});
    failAudit=false;
    // Failed login destroys its session. Obtain a new token and cookie.
    const nextToken=await f.request('/csrfToken');
    const success=await f.request('/user/login_local',{method:'POST',body:{username:'alice',password:'correct-password',branding:'default',portal:'portal'},headers:{Cookie:nextToken.headers.getSetCookie()[0].split(';')[0],'X-CSRF-Token':nextToken.body._csrf,'x-source':'jsclient'}});
    assert.equal(success.status,200,JSON.stringify(success.body));
    const successConsumer=await consume(success);assert.equal(successConsumer.rejected,false);assert.equal(successConsumer.redirect,'/default/portal/home');
    observations.push({case:'current successful audit control',httpStatus:success.status,consumer:successConsumer});
    const oldGlobals={
      sails:{config:{passport:{authenticate:(_name,callback)=>(_req,_res)=>callback(null,actor,{})}},getActions:()=>({'user/getpostloginurl':()=>'/default/portal/home'}),log:{error:()=>backgroundErrors.push('recorded'),warn(){}}},
      RequestDetails:class RequestDetails{constructor(req){this.body={...req.body};}},
      UsersService:{addUserAuditEvent:()=>Promise.reject(new Error('synthetic useraudit insert failure'))},
      RequestChronicleHelper:{existing:()=>undefined},trackHttpRequestWork,safeChronicleText:x=>x,toChronicleLogRecord:x=>x,toChronicleError:()=>({message:'synthetic'}),
    };
    const localLogin=method('packages/redbox-core/src/controllers/UserController.ts','localLogin',oldGlobals);
    const background=method('packages/redbox-core/src/CoreController.ts','recordBackgroundOperation',oldGlobals);
    const oldResponse={status:200};
    const controller={recordBackgroundOperation:background,updateChronicle(){},extractUserDetailsForChronicle:()=>({}),extractLoginMessage:()=>'',getNoCacheHeaders:()=>({}),sendResp:(_req,_res,build)=>{oldResponse.status=build.status??200;oldResponse.body=build.data;}};
    localLogin.call(controller,{body:{username:'alice',password:'correct-password'},headers:{'x-source':'jsclient'},logIn:(_user,callback)=>callback()},{});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(oldResponse.status,200);assert.equal(oldResponse.body.user.id,actor.id);assert.equal(backgroundErrors.length,1);
    const oldConsumer=await consume(oldResponse);assert.equal(oldConsumer.rejected,false);assert.equal(oldConsumer.redirect,'/default/portal/home');
    observations.push({case:'baseline actual localLogin/background methods; same audit failure',baseline,httpStatus:oldResponse.status,auditFailureRecorded:true,consumer:oldConsumer});
    fs.writeFileSync(require('node:path').join(__dirname, 'local-login-audit-results.json'),JSON.stringify({node:process.version,classification:'A',severity:'P2',proof:'Native HTTP, real Passport sessions and CSRF; controlled identity/audit ports. Actual extracted Angular onLogin and pinned baseline localLogin/recordBackgroundOperation bodies. No Mongo, historical HTTP server or browser claim.',auditCalls,observations},null,2)+'\n');
    console.log(`${observations.length} local-login audit causality observations passed`);
  }finally{await f.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
