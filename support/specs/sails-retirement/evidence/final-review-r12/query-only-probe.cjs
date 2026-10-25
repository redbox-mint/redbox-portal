const assert = require('node:assert/strict');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const vm = require('node:vm');
const root = process.cwd();
process.env.TS_NODE_PROJECT = path.join(root, 'packages/redbox-core/test/tsconfig.json');
process.env.TS_NODE_CACHE = 'false';
require('ts-node/register/transpile-only');
const ts = require('typescript');
const express = require('express');
const session = require('express-session');
const {httpBodyParser} = require(path.join(root, 'packages/redbox-core/src/http/express/middleware.ts'));
const {mountConfigurationWriteRoutes} = require(path.join(root, 'packages/redbox-core/src/http/express/configurationWrites.ts'));
const {createHttpCsrf, mountCsrfTokenRoute} = require(path.join(root, 'packages/redbox-core/src/http/express/csrf.ts'));
const {createHttpPolicies} = require(path.join(root, 'packages/redbox-core/src/http/express/policies.ts'));
const brand = {id:'brand-1', name:'default', roles:[]};
const actor = {id:'actor-1', roles:[{id:'admin-1', name:'Admin', brandId:brand.id}]};
const calls = [];
const translations = {updateBundleEnabled:async (_brand,locale,namespace,enabled) => {calls.push({locale,namespace,enabled});return {locale,namespace,enabled};}};
async function baseline() {
  const source = execFileSync('git',['show','a49366803:packages/redbox-core/src/controllers/webservice/TranslationController.ts'],{encoding:'utf8'});
  const file = ts.createSourceFile('baseline.ts', source, ts.ScriptTarget.Latest, true);
  let body;
  function visit(n) {if (ts.isMethodDeclaration(n) && n.name.getText(file)==='updateBundleEnabled') body = n.body.getText(file); ts.forEachChild(n,visit);}
  visit(file); assert(body);
  const js = ts.transpileModule('async function baseline(req,res) '+body+'; baseline;', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const fn = vm.runInNewContext(js, {BrandingService:{getBrandNameFromReq:()=>brand.name,getBrand:()=>brand}, I18nEntriesService:translations,TranslationService:{reloadResources:async()=>{}},sails:{log:{warn:()=>{}}}});
  return fn.call({sendResp:(_req,_res,value)=>value,asError:e=>e,getNoCacheHeaders:()=>({})}, {params:{locale:'en',namespace:'translation'},query:{enabled:'true'},body:undefined},{});
}
(async()=>{
 const before = await baseline();
 assert.equal(before.data.enabled,true);
 calls.length = 0;
 const app = express();
 app.use(httpBodyParser());
 app.use(session({secret:'review-only-memory-session',resave:false,saveUninitialized:false}));
 const csrf = createHttpCsrf({origins:['http://127.0.0.1']});
 mountCsrfTokenRoute(app,csrf);
 const policies = createHttpPolicies({branding:{getBrand:async()=>brand},pathRules:{getRulesFromPath:()=>undefined},portals:['rdmp'],defaultUnauthenticatedRole:()=>undefined,emitRequestFailure:async()=>{},authenticate:async()=>actor});
 const pass = (_req,_res,next)=>next();
 mountConfigurationWriteRoutes(app, {appConfigs:{},dashboardConfig:{},translations,reloadTranslations:async()=>{},csrf,policyConfiguration:{'*':['brandingandportal','browseractor','browserauthenticated','brandactor']},policies:new Proxy(policies,{get:(obj,key)=>obj[key]??pass})});
 app.use((err,_req,res,_next)=>res.status(500).json({error:err.message}));
 const server = app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 try {
  const base = 'http://127.0.0.1:'+server.address().port;
  const tokenResponse = await fetch(base+'/csrfToken');
  const cookie = tokenResponse.headers.getSetCookie()[0].split(';')[0];
  const token = (await tokenResponse.json())._csrf;
  const headers = {'Cookie':cookie,'X-CSRF-Token':token};
  const queryOnly = await fetch(base+'/default/rdmp/app/i18n/bundles/en/translation/enabled?enabled=true',{method:'POST',headers});
  const queryOnlyBody = await queryOnly.json();
  const afterQueryOnlyCalls = calls.length;
  const emptyJson = await fetch(base+'/default/rdmp/app/i18n/bundles/en/translation/enabled?enabled=true',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'});
  const emptyJsonBody = await emptyJson.json();
  console.log(JSON.stringify({node:process.version,base:'a49366803',head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),baseline:{status:before.status??200,enabled:before.data.enabled},currentQueryOnly:{status:queryOnly.status,body:queryOnlyBody,domainCalls:afterQueryOnlyCalls},currentEmptyJsonControl:{status:emptyJson.status,body:emptyJsonBody,domainCalls:calls.length}},null,2));
  assert.equal(queryOnly.status,200);
  assert.equal(afterQueryOnlyCalls,1);
  assert.equal(emptyJson.status,200);
  assert.equal(emptyJsonBody.enabled,true);
 } finally {await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
})().catch(error=>{console.error(error);process.exitCode=1;});
