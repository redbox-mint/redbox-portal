'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'../../../../..'),wsu='/home/andrew/src/bitbucket/redbox-hook-wsu-v6';
Object.assign(process.env,{HOOK_S3_BUCKET:'fixture',HOOK_S3_REGION:'us-east-1'});
const {loadPortalConfiguration}=require(root+'/packages/redbox-core/dist/configuration');
const {installOidcAuthentication}=require(root+'/packages/redbox-core/dist/http/express/identityProviders');
(async()=>{
  const results=[];
  for(const publicUrl of ['http://localhost:1500','http://localhost:18599','https://institution.example.invalid/research']) {
    const url=new URL(publicUrl),prefix=url.pathname==='/'?'':url.pathname,callback=publicUrl+'/user/login_oidc';
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sr-r25-callback-'));
    try {
      const application=path.join(dir,'app.cjs');
      const provider={identifier:'institution',opts:{
        issuer:{issuer:'https://idp.example.invalid',authorization_endpoint:'https://idp.example.invalid/authorize',token_endpoint:'https://idp.example.invalid/token',jwks_uri:'https://idp.example.invalid/jwks',response_types_supported:['code'],code_challenge_methods_supported:['S256']},
        client:{client_id:'fixture-client',client_secret:'fixture-secret',redirect_uris:[callback],post_logout_redirect_uris:[publicUrl+'/user/logout']},
      }};
      fs.writeFileSync(application,'module.exports='+JSON.stringify({server:{publicUrl,rootContext:prefix},brandingConfigurationDefaults:{auth:{active:['oidc'],oidc:provider}}}));
      const config=await loadPortalConfiguration({extensions:{providers:[{name:'wsu',declaration:require(wsu+'/dist').registerRedboxExtension()}]},files:{application},env:{REDBOX_SESSION_SECRET:'disposable-r25-oidc-session-secret-32'},argv:[]});
      let strategy;
      await installOidcAuthentication({config:config.brandingConfigurationDefaults.auth,passport:{use(name,value){assert.equal(name,'oidc-institution');strategy=value;}},accounts:{},brand(){throw Error('No provider exchange expected');}});
      const redirect=await new Promise((resolve,reject)=>{
        strategy.redirect=location=>resolve(location);strategy.error=reject;
        strategy.authenticate({method:'GET',url:prefix+'/user/login_oidc',originalUrl:prefix+'/user/login_oidc',protocol:url.protocol.slice(0,-1),host:url.host,headers:{host:url.host},session:{},query:{},socket:{remoteAddress:'127.0.0.1'},get:key=>key==='host'?url.host:undefined},{});
      });
      const authorization=new URL(redirect);
      assert.equal(authorization.searchParams.get('redirect_uri'),callback);
      assert.equal(authorization.searchParams.get('client_id'),'fixture-client');
      assert.equal(authorization.searchParams.get('code_challenge_method'),'S256');
      assert(authorization.searchParams.get('state'));
      results.push({publicUrl,rootContext:config.server.rootContext,callback,actualRedirectUri:authorization.searchParams.get('redirect_uri'),pkce:true,state:true,result:'pass'});
    } finally {fs.rmSync(dir,{recursive:true,force:true});}
  }
  fs.writeFileSync(root+'/.tmp/sails-retirement/final-review-r25/callback-results.json',JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify({cases:results.length,passed:results.length}));
})().catch(e=>{console.error(e);process.exitCode=1});
