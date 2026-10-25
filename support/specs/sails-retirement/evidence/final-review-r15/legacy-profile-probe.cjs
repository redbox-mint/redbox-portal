const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { once } = require('node:events');
const root = path.resolve(__dirname, '../../../../..');
process.env.TS_NODE_PROJECT = path.join(root, 'packages/redbox-core/test/tsconfig.json');
require(path.join(root,'node_modules/ts-node/register/transpile-only'));
const express = require(path.join(root,'node_modules/express'));
const { PageArtifacts } = require(path.join(root,'packages/redbox-core/src/pages/Artifacts.ts'));
const { mountStaticPageArtifacts } = require(path.join(root,'packages/redbox-core/src/http/express/pageAssets.ts'));
(async()=>{
 const file = 'views/default/default/user/profile.ejs';
 const baseline = execFileSync('git',['show','a49366803:'+file],{cwd:root,encoding:'utf8'});
 const current = fs.readFileSync(path.join(root,file),'utf8');
 const pattern = /\/angular\/userProfile\/[A-Za-z.]+\.js/g;
 const before = [...baseline.matchAll(pattern)].map(x=>x[0]);
 const after = [...current.matchAll(pattern)].map(x=>x[0]);
 assert.equal(after.length,6);assert.deepEqual(after,before);
 const projects = version=>Object.keys(JSON.parse(version==='current'?fs.readFileSync(path.join(root,'angular/angular.json'),'utf8'):execFileSync('git',['show','a49366803:angular/angular.json'],{cwd:root,encoding:'utf8'})).projects).filter(x=>/user.?profile/i.test(x));
 assert.deepEqual(projects('baseline'),[]);assert.deepEqual(projects('current'),[]);
 const artifacts = new PageArtifacts([path.join(root,'views')],[process.env.SR_PROFILE_PUBLIC_ROOT || path.join(root,'.tmp/public'),path.join(root,'assets')]);
 await artifacts.initialize();
 const app=express();const router=express.Router();mountStaticPageArtifacts(router,artifacts);app.use(router);
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 try {
  const results=[];
  for (const url of after){const response=await fetch(`http://127.0.0.1:${server.address().port}${url}`);await response.text();assert.equal(response.status,404);results.push({url,status:response.status});}
  console.log(JSON.stringify({kind:'actual-static-mount-http-plus-baseline-source-comparison',inherited:true,baselineProjects:projects('baseline'),currentProjects:projects('current'),referencesUnchanged:true,results},null,2));
 }finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await artifacts.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
