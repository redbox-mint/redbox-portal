const assert=require('node:assert/strict');
const {sourceModule,baseline,extract}=require('./probe-utils.cjs');
const text=extract(baseline('packages/redbox-core/src/services/UsersService.ts'),'openIdConnectAuthVerifyCallback');
const run=sourceModule('packages/redbox-core/src/services/UsersService.ts',{},`const _=require('lodash');const sails={config:{auth:{}}};const BrandingService={getDefault:()=>({name:'default'}),getBrand:()=>({roles:[]})};const RolesService={getDefAuthenticatedRole:()=>null,getNestedRoles:()=>[]};exports.run=function(oidcConfig,issuer,req,tokenSet,userinfo,done)${text}`).run;
const session={logoutUrl:'https://previous.example.invalid/logout'};
let called=false;
run.call({updateChronicle(){}},{opts:{client:{client_id:'matrix'}},claimMappings:{}},{},{session},{claims:()=>({})},undefined,()=>{called=true});
assert(called);assert.equal(session.logoutUrl,undefined);
console.log(JSON.stringify({baseline:'a49366803',priorLogout:'https://previous.example.invalid/logout',providerHasLogoutEndpoint:false,oldLogoutCleared:session.logoutUrl===undefined},null,2));
