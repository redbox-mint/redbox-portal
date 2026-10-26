'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const root=path.resolve(__dirname,'../../../../..'),wsu='/home/andrew/src/bitbucket/redbox-hook-wsu-v6';
for(const [key,value] of Object.entries({HOOK_S3_BUCKET:'fixture',HOOK_S3_REGION:'us-east-1',HOOK_S3_ACCESS_KEY:'fixture',HOOK_S3_SECRET_KEY:'fixture'}))process.env[key]=value;
const {createRequire}=require('node:module'),coreRequire=createRequire(root+'/packages/redbox-core/package.json');
const express=coreRequire('express');
const {loadPortalConfiguration}=require(root+'/packages/redbox-core/dist/configuration');
const http=require(root+'/packages/redbox-core/dist/http/express');
const {createHttpAuthentication}=require(root+'/packages/redbox-core/dist/http/express/authentication');
const {composeHttpSession}=require(root+'/packages/redbox-core/dist/http/express/session');
const {ApplicationRuntime}=require(root+'/packages/redbox-core/dist/application');
async function availablePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
(async()=>{
  const results=[];
  for(const row of [{name:'default-browser',prefix:'',tls:false,brand:'default',portal:'rdmp'},{name:'selected-host-port',prefix:'',tls:false,brand:'default',portal:'rdmp'},{name:'tls-proxy-prefix-and-brand',prefix:'/research',tls:true,brand:'institution',portal:'research'}]){
    const port=await availablePort(),publicUrl=row.tls?'https://wsu.example.invalid/research':`http://localhost:${port}`;
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sr-r25-live-'));let host,session,artifacts;
    try{
      const application=path.join(dir,'app.cjs');fs.writeFileSync(application,`module.exports={...require(${JSON.stringify(wsu+'/support/v6/application.cjs')}), server:${JSON.stringify({port,hostname:'127.0.0.1',publicUrl,rootContext:row.prefix,trustProxy:row.tls?['loopback']:false})},redboxSession:{cookie:${JSON.stringify({secure:row.tls,path:row.prefix||'/',sameSite:'lax',httpOnly:true})}},auth:{defaultBrand:${JSON.stringify(row.brand)},defaultPortal:${JSON.stringify(row.portal)}},page:{landingPath:${JSON.stringify('/'+row.brand+'/'+row.portal+'/home')}}};`);
      const declaration=require(wsu+'/dist').registerRedboxExtension();
      const c=await loadPortalConfiguration({extensions:{providers:[{name:'wsu',declaration}]},files:{application},env:{REDBOX_SESSION_SECRET:'disposable-r25-live-session-secret-32-characters'},argv:[]});
      const base=row.prefix+'/'+row.brand+'/'+row.portal, origin=new URL(publicUrl).origin;
      const owner={config:{},log:console},runtime=new ApplicationRuntime(owner);
      const actor={id:'fixture-user',username:'fixture-user',roles:[{name:'Researcher',brandId:'fixture-brand'}]};
      const identity={local:async()=>actor,session:async()=>actor,profile:async()=>({username:'fixture-user'}),bearer:async()=>false};
      const auth=createHttpAuthentication(identity),csrf=http.createHttpCsrf({origins:[origin]});
      const {adapter,mongoUrl,mongoOptions,dbName,...memoryConfig}=c.redboxSession;
      session=composeHttpSession(memoryConfig);
      artifacts=new http.PageArtifacts([wsu+'/views'],[wsu+'/assets']);await artifacts.initialize();
      host=new http.ExpressHost(runtime,{...c.server,prepare:async router=>{
        router.use(express.urlencoded({extended:false}),express.json(),session.middleware,auth.initialize,auth.session);
        router.get('/token',(req,res)=>res.json({token:csrf.generateToken(req)}));
        http.mountAuthenticationRoutes(router,{passport:auth.passport,identity,rootContext:c.server.rootContext,defaultBrand:c.auth.defaultBrand,defaultPortal:c.auth.defaultPortal,validContext:(b,p)=>b===row.brand&&p===row.portal,brandId:()=> 'fixture-brand',postLoginPath:()=>base+'/home',audit:async()=>{},loginFailure:async()=>{},csrf:csrf.protect,sessionCookie:c.redboxSession});
        http.mountPageRoot(router,row.prefix,c.page.landingPath);
        router.get('/'+row.brand+'/'+row.portal+'/home',(_req,res)=>res.type('html').send(artifacts.render(artifacts.view('homepage',row.brand,row.portal),{page:{base,t:k=>k},req:{query:{},session:{}},_:{isUndefined:v=>v===undefined}})));
        router.use('/styles',express.static(wsu+'/assets/styles'));
      }});
      await host.initialize();await host.activate();
      const transport=`http://127.0.0.1:${port}`,headers=row.tls?{'x-forwarded-proto':'https'}:{};
      let response=await fetch(transport+row.prefix+'/token',{headers});assert.equal(response.status,200);const cookie=response.headers.get('set-cookie');assert(cookie.includes('Path='+(row.prefix||'/')));assert(cookie.includes('Secure')===row.tls);
      const {token}=await response.json();const browserHeaders={...headers,cookie:cookie.split(';')[0],origin,'content-type':'application/x-www-form-urlencoded'};
      response=await fetch(transport+row.prefix+'/user/login_local',{method:'POST',headers:browserHeaders,body:new URLSearchParams({username:'fixture-user',password:'fixture-password',_csrf:token}),redirect:'manual'});assert.equal(response.status,302,await response.text());assert.equal(response.headers.get('location'),base+'/home');
      response=await fetch(transport+row.prefix+'/user/login_local',{method:'POST',headers:{...browserHeaders,origin:'https://foreign.example.invalid'},body:new URLSearchParams({username:'fixture-user',password:'fixture-password',_csrf:token}),redirect:'manual'});assert.equal(response.status,403);
      response=await fetch(transport+row.prefix+'/user/login_local',{method:'POST',headers:browserHeaders,body:new URLSearchParams({username:'fixture-user',password:'fixture-password',_csrf:'invalid'}),redirect:'manual'});assert.equal(response.status,403);
      response=await fetch(transport+(row.prefix||'/'),{headers,redirect:'manual'});assert.equal(response.status,302);assert.equal(response.headers.get('location'),base+'/home');
      response=await fetch(transport+base+'/home',{headers});assert.equal(response.status,200);assert((await response.text()).includes('href="'+base+'/researcher/home"'));
      response=await fetch(transport+row.prefix+'/styles/wsu-branding.css',{headers});assert.equal(response.status,200);
      results.push({case:row.name,port,publicUrl,rootContext:row.prefix,cookie:{path:row.prefix||'/',secure:row.tls},login:302,loginRedirect:base+'/home',foreignOrigin:403,invalidToken:403,home:200,asset:200});
    }finally{await host?.stop();await session?.drain();await artifacts?.close();fs.rmSync(dir,{recursive:true,force:true});}
  }
  fs.writeFileSync(root+'/.tmp/sails-retirement/final-review-r25/live-http-results.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify({starts:results.length,results}));
})().catch(e=>{console.error(e);process.exitCode=1});
