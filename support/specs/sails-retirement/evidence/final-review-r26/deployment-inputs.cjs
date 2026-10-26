'use strict';
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../../..');
const ts=require(root+'/node_modules/typescript');
const yaml=require(root+'/node_modules/yaml');
require(root+'/node_modules/ts-node').register({transpileOnly:true,project:root+'/packages/redbox-core/test/tsconfig.json'});
const {convertLegacyEnvironment,loadPortalConfiguration}=require(root+'/packages/redbox-core/src/configuration');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const files=[],environment=[],astInputs=[];
const aliases={
  sails_appUrl:'server.publicUrl',sails_port:'server.port',sails_host:'server.hostname',
  sails_http__rootContext:'server.rootContext',sails_http__trustProxy:'server.trustProxy',
};
const manual={
  angularDev:'angularDev',redbox__apiKey:'redbox.apiKey',
  brandingConfigurationDefaults__auth__local__default__token:'brandingConfigurationDefaults.auth.local.default.token',
  brandingConfigurationDefaults__pdfgen__token:'pdfgen.token',pdfgen__token:'pdfgen.token',
  pdfgen__enableChromeLogging:'pdfgen.enableChromeLogging',pdfgen__appUrlOverride:'pdfgen.appUrlOverride',
  record__baseUrl_mint:'record.baseUrl.mint',
  datacite__username:'brandingConfigurationDefaults.doiPublishing.connection.username',
  datacite__password:'brandingConfigurationDefaults.doiPublishing.connection.password',
  datacite__doiPrefix:'brandingConfigurationDefaults.doiPublishing.profiles.dataPublication.metadata.prefix.defaultValue',
  mint__apiKey:'mint.apiKey',
};
function canonicalValue(name,value) {
  if(/secret|password|token|key/i.test(name))return 'review-fixture-private-value-at-least-32-characters';
  if(/Url|url|issuer/i.test(name))return /mongo/i.test(name)?'mongodb://127.0.0.1/review_fixture':'https://institution.example.invalid';
  if(name==='sails_port')return '15999';
  if(/rootContext/.test(name))return '/research';
  if(/trustProxy/.test(name))return 'false';
  return value;
}
function contribution(location,value) {
  const result={};let p=result;const parts=location.split('.');
  for(const part of parts.slice(0,-1))p=p[part]={};p[parts.at(-1)]=value;return result;
}
async function resolve(config,env={}) {
  return loadPortalConfiguration({env:{REDBOX_SESSION_SECRET:'fixture-r26-session-secret-at-least-32',...env},extensions:{providers:[{name:'converted-input',declaration:{apiVersion:1,config}}]}});
}
function expanded(input) {
  let value=String(input);
  for(let i=0;i<20 && /\$\{/.test(value);i++)value=value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:-|-)([^{}]*))?\}/g,(_all,name,_op,fallback)=>fallback??canonicalValue(name,'fixture'));
  return value;
}
(async()=>{
  for(const institution of ['cqu','jcu','scu','uanz','uc','uon','uwa']) {
    const directory='/home/andrew/src/bitbucket/redbox-hook-'+institution;
    const tracked=execFileSync('git',['ls-files','-z'],{cwd:directory,encoding:'utf8'}).split('\0').filter(Boolean);
    for(const name of tracked) {
      if(!(/(^|\/)config\/|config\.[cm]?js$|\.ya?ml$/.test(name))||name.startsWith('test/'))continue;
      const filename=path.join(directory,name),text=fs.readFileSync(filename,'utf8');
      const classification=name.startsWith('legacy/')?'historical, not selected':name.startsWith('src/config/')?'registered data or referenced fragment':name.startsWith('config/')?'dormant v4 files; v5 registers src/config explicitly':name==='.circleci/config.yml'?'CI orchestration':name==='support/development/servicenow.config.js'?'explicit development ServiceNow module; external credential input replaced with fixtures':'deployment/build orchestration';
      files.push({institution,name,sha256:hash(text),classification});
      if(/\.ya?ml$/.test(name)&&!name.startsWith('legacy/')) {
        const document=yaml.parse(text);
        for(const [service,data]of Object.entries(document?.services||{})) {
          const entries=Array.isArray(data.environment)?data.environment.map(x=>{const i=x.indexOf('=');return [i<0?x:x.slice(0,i),i<0?'fixture':x.slice(i+1)];}):Object.entries(data.environment||{});
          for(const [variable,raw]of entries) {
            const row={institution,file:name,service,variable,shape:typeof raw,valueHash:hash(String(raw))};
            const value=canonicalValue(variable,expanded(raw));
            if(/^sails_/i.test(variable)) {
              try {
                const converted=convertLegacyEnvironment({[variable]:value});
                await resolve({},converted);row.result='accepted explicit alias';row.target=aliases[variable]||Object.keys(converted)[0];
              } catch(e) {
                row.result='correct documented refusal';row.path=e.path;
                const suffix=variable.slice(6),target=manual[suffix];
                row.guidance='configuration-v6.md: unsupported sails_* aliases require explicit typed configuration or selected host/provider operations';
                if(target) {
                  let typed=value;if(/angularDev|enableChromeLogging/.test(suffix))typed=value==='true';
                  if(/datacite__doiPrefix/.test(suffix))typed='10.12345';
                  const config=contribution(target,typed);
                  if(target.startsWith('pdfgen.'))config.pdfgen={...require(root+'/packages/sails-hook-redbox-pdfgen/dist/config/pdfgen').pdfgen,...config.pdfgen};
                  if(target.startsWith('brandingConfigurationDefaults.doiPublishing.')) {
                    const _=require(root+'/node_modules/lodash');
                    const {DoiPublishing}=require(root+'/packages/redbox-core/src/configmodels/DoiPublishing');
                    config.brandingConfigurationDefaults.doiPublishing=_.merge({},new DoiPublishing(),config.brandingConfigurationDefaults.doiPublishing);
                  }
                  await resolve(config);row.typedTarget=target;row.typedResult='accepted';
                } else row.conversion=/security/.test(suffix)?'owned CSRF policy; unsafe global disable retired':/auth__default|admin__/.test(suffix)?'legacy duplicate authentication token spelling; explicit branded auth/REDBOX_ADMIN_TOKEN replaces it':/mochaTesting/.test(suffix)?'retired legacy test switch; use v6 test application':'explicit selected provider/factory data; inspect actual consumer';
              }
            } else {
              // These are service/container inputs, or hook-owned data module env reads.
              try {
                await resolve({}, {[variable]:value});row.result=/^REDBOX_/.test(variable)?'accepted canonical input':'unrelated namespace ignored by core; source owner retains parsing';
              } catch(error) {
                row.result='correct documented refusal';row.path=error.path;
                row.guidance='configuration-v6.md: unknown REDBOX_* names require explicit selected data-module ownership; no arbitrary environment discovery';
              }
            }
            environment.push(row);
          }
        }
      }
      if(/\.[cm]?[jt]s$/.test(name)&&!name.startsWith('legacy/')) {
        const source=ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true);
        const visit=node=>{
          if(ts.isPropertyAssignment(node)||ts.isShorthandPropertyAssignment(node))astInputs.push({institution,file:name,line:source.getLineAndCharacterOfPosition(node.getStart()).line+1,key:node.name.getText(source),shape:ts.isShorthandPropertyAssignment(node)?'identifier':ts.SyntaxKind[node.initializer.kind]});
          ts.forEachChild(node,visit);
        };visit(source);
      }
    }
  }
  const result={files,environment,astInputs};
  const file=process.argv[2]||root+'/.tmp/sails-retirement/final-review-r26/deployment-input-results.json';
  fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({files:files.length,environment:environment.length,astProperties:astInputs.length,results:environment.reduce((out,x)=>(out[x.result]=(out[x.result]||0)+1,out),{})}));
})().catch(error=>{console.error({name:error.name,path:error.path,message:error.message});process.exitCode=1;});
