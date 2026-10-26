'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync, execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '../../../../..');
const wsu = '/home/andrew/src/bitbucket/redbox-hook-wsu-v6';
const output = path.join(root, '.tmp/sails-retirement/final-review-r25');
const baseEnv = {HOOK_S3_BUCKET:'fixture-bucket', HOOK_S3_REGION:'ap-southeast-2', HOOK_S3_ACCESS_KEY:'fixture-key', HOOK_S3_SECRET_KEY:'fixture-secret'};
const cases = [
  {name:'defaults'},
  {name:'canonical-listener-and-origin', env:{REDBOX_PORT:'18599',REDBOX_HOSTNAME:'127.0.0.1',REDBOX_PUBLIC_URL:'http://localhost:18599',REDBOX_STOP_DEADLINE_MS:'45000'}, expect:{'server.port':18599,'server.hostname':'127.0.0.1','server.publicUrl':'http://localhost:18599','server.stopDeadlineMs':45000}},
  {name:'listen-port-independent-of-explicit-origin', env:{REDBOX_PORT:'18599'},expect:{'server.port':18599,'server.publicUrl':'http://localhost:1500'}},
  {name:'tls-proxy-root-and-cookie', env:{REDBOX_PUBLIC_URL:'https://wsu.example.invalid/research',REDBOX_ROOT_CONTEXT:'/research',REDBOX_TRUST_PROXY:'["loopback"]'},application:{redboxSession:{cookie:{secure:true,path:'/research',sameSite:'lax'}}},expect:{'server.rootContext':'/research','server.trustProxy':['loopback'],'redboxSession.cookie.secure':true,'redboxSession.cookie.path':'/research'}},
  {name:'numeric-proxy-and-auto-cookie',env:{REDBOX_TRUST_PROXY:'1'},application:{redboxSession:{cookie:{secure:'auto',httpOnly:true,sameSite:'strict',domain:'example.invalid',maxAge:3600000}}},expect:{'server.trustProxy':1,'redboxSession.cookie.secure':'auto','redboxSession.cookie.maxAge':3600000}},
  {name:'explicit-false-proxy',env:{REDBOX_TRUST_PROXY:'false'},expect:{'server.trustProxy':false}},
  {name:'separate-mongo-targets',env:{REDBOX_MONGODB_URL:'mongodb://core.example.invalid:27101/core',REDBOX_STORAGE_MONGODB_URL:'mongodb://objects.example.invalid:27102/objects',REDBOX_SESSION_MONGODB_URL:'mongodb://session.example.invalid:27103/sessions',REDBOX_AGENDA_MONGODB_URL:'mongodb://jobs.example.invalid:27104/jobs'},expect:{'datastores.mongodb.url':'mongodb://core.example.invalid:27101/core','datastores.redboxStorage.url':'mongodb://objects.example.invalid:27102/objects','redboxSession.mongoUrl':'mongodb://session.example.invalid:27103/sessions','agendaQueue.options.db':'mongodb://jobs.example.invalid:27104/jobs'}},
  {name:'replica-tls-and-session-database',application:{datastores:{mongodb:{url:'mongodb://one.example.invalid,two.example.invalid/core?replicaSet=rs&tls=true',maxPoolSize:7}},redboxSession:{dbName:'selected_sessions',collection:'wsu_sessions',ttl:7200,touchAfter:60,stringify:false}},expect:{'datastores.mongodb.maxPoolSize':7,'redboxSession.dbName':'selected_sessions','redboxSession.stringify':false}},
  {name:'queue-environment',env:{REDBOX_AGENDA_BACKEND:'mongodb',REDBOX_AGENDA_COLLECTION:'wsu_jobs',REDBOX_AGENDA_PROCESS_EVERY:'10 seconds',REDBOX_AGENDA_HISTORY_RETENTION_HOURS:'0'},expect:{'agendaQueue.options.backend':'mongodb','agendaQueue.options.collection':'wsu_jobs','agendaQueue.options.processEvery':'10 seconds','agendaQueue.options.historyRetentionHours':0}},
  {name:'s3-role-credentials',env:{HOOK_S3_ACCESS_KEY:undefined,HOOK_S3_SECRET_KEY:undefined},expect:{'storage.disks.primary.config.key':'','storage.disks.primary.config.secret':''}},
  {name:'s3-endpoint-and-prefix',env:{HOOK_S3_ENDPOINT:'http://s3.example.invalid:8333',HOOK_S3_FORCE_PATH_STYLE:'yes',HOOK_S3_BUCKET_ENDPOINT:'off',HOOK_S3_TLS:'false',HOOK_S3_USE_ACCELERATE_ENDPOINT:'0',HOOK_S3_SUPPORTS_ACL:'on',HOOK_S3_KEY_PREFIX:'institution/',HOOK_S3_PRIMARY_PREFIX:'ignored/',HOOK_ATTACHMENTS_STAGE_DIR:'/var/wsu/staging'},expect:{'storage.disks.primary.config.endpoint':'http://s3.example.invalid:8333','storage.disks.primary.config.forcePathStyle':true,'storage.disks.primary.config.bucketEndpoint':false,'storage.disks.primary.config.tls':false,'storage.disks.primary.config.useAccelerateEndpoint':false,'storage.disks.primary.config.supportsACL':true,'storage.keyPrefix':'institution/','storage.disks.staging.config.root':'/var/wsu/staging','record.attachments.file.directory':'/var/wsu/staging'}},
  {name:'s3-prefix-fallback-and-boolean-variants',env:{HOOK_S3_PRIMARY_PREFIX:'primary/',HOOK_S3_FORCE_PATH_STYLE:'1',HOOK_S3_BUCKET_ENDPOINT:'true',HOOK_S3_TLS:'yes',HOOK_S3_USE_ACCELERATE_ENDPOINT:'on',HOOK_S3_SUPPORTS_ACL:'no'},expect:{'storage.keyPrefix':'primary/','storage.disks.primary.config.forcePathStyle':true,'storage.disks.primary.config.bucketEndpoint':true,'storage.disks.primary.config.tls':true,'storage.disks.primary.config.useAccelerateEndpoint':true,'storage.disks.primary.config.supportsACL':false}},
  {name:'s3-empty-defaults',env:{HOOK_S3_KEY_PREFIX:'',HOOK_S3_PRIMARY_PREFIX:'',HOOK_ATTACHMENTS_STAGE_DIR:'',HOOK_S3_FORCE_PATH_STYLE:'',HOOK_S3_SUPPORTS_ACL:''},expect:{'storage.keyPrefix':'attachments/','storage.disks.staging.config.root':'/attachments/staging','storage.disks.primary.config.supportsACL':false}},
  {name:'solr-canonical-and-selected-port',env:{REDBOX_SOLR_HOST:'search.example.invalid',REDBOX_SOLR_CORE:'wsu'},application:{solr:{cores:{default:{options:{port:18983,protocol:'https'}}}}},expect:{'solr.cores.default.options.host':'search.example.invalid','solr.cores.default.options.core':'wsu','solr.cores.default.options.port':18983}},
  {name:'brand-portal-and-landing',application:{auth:{defaultBrand:'institution',defaultPortal:'research',postLogoutRedir:'/institution/research/home'},page:{landingPath:'/institution/research/home'}},expect:{'auth.defaultBrand':'institution','auth.defaultPortal':'research','page.landingPath':'/institution/research/home'}},
  {name:'admin-and-logging',env:{REDBOX_ADMIN_USER:'review-admin',REDBOX_ADMIN_PASSWORD:'fixture-admin-password',REDBOX_ADMIN_EMAIL:'admin@example.invalid',REDBOX_ADMIN_TOKEN:'fixture-token',REDBOX_LOG_LEVEL:'warn',REDBOX_BOOTSTRAP_DATA_PATH:'/etc/wsu/bootstrap'},expect:{'brandingConfigurationDefaults.auth.local.default.adminUser':'review-admin','brandingConfigurationDefaults.auth.local.default.adminPw':'fixture-admin-password','brandingConfigurationDefaults.auth.local.default.email':'admin@example.invalid','brandingConfigurationDefaults.auth.local.default.token':'fixture-token','logging.level':'warn','bootstrap.bootstrapDataPath':'/etc/wsu/bootstrap'}},
  {name:'doi-public-url-environment',env:{REDBOX_PUBLIC_URL:'https://wsu.example.invalid/research'},doiPublic:'https://wsu.example.invalid/research/published/abc',doiInstrument:'https://wsu.example.invalid/research/default/rdmp/record/view/abc'},
  {name:'doi-explicit-urls-and-provider',env:{REDBOX_PUBLIC_URL:'https://wsu.example.invalid/research',DOI_PUBLIC_LANDING_URL:'https://public.example.invalid/pages/',DOI_INSTRUMENT_LANDING_URL:'https://instrument.example.invalid/view/',DATACITE_BASE_URL:'https://api.example.invalid',DATACITE_USERNAME:'fixture-user',DATACITE_PASSWORD:'fixture-password',DATACITE_DOI_PREFIX:'10.12345'},doiPublic:'https://public.example.invalid/pages/abc',doiInstrument:'https://instrument.example.invalid/view/abc',expect:{'brandingConfigurationDefaults.doiPublishing.connection.baseUrl':'https://api.example.invalid','brandingConfigurationDefaults.doiPublishing.connection.username':'fixture-user','brandingConfigurationDefaults.doiPublishing.connection.password':'fixture-password','brandingConfigurationDefaults.doiPublishing.profiles.dataPublication.metadata.prefix.defaultValue':'10.12345'}},
  {name:'mail-figshare-and-pdf',application:{emailnotification:{settings:{enabled:false,serverOptions:'smtps://fixture-user:fixture-pass@mail.example.invalid:465'}},figshareDev:{enabled:true,mode:'fixture',fixtures:{authors:[]}},brandingConfigurationDefaults:{figsharePublishing:{enabled:false,connection:{baseUrl:'https://figshare.example.invalid',token:'fixture-token'}}},pdfgen:{token:'fixture-pdf-token',appUrlOverride:'http://internal-proxy:1500/research',sourceUrlBase:'/institution/research/record/view',readinessStrategy:'selector',waitForSelector:'#ready',maxRetries:0}},expect:{'emailnotification.settings.enabled':false,'emailnotification.settings.serverOptions':'smtps://fixture-user:fixture-pass@mail.example.invalid:465','figshareDev.mode':'fixture','pdfgen.appUrlOverride':'http://internal-proxy:1500/research','pdfgen.maxRetries':0}},
  {name:'configuration-precedence',application:{server:{port:1501}},environment:{server:{port:1502}},local:{server:{port:1503}},env:{REDBOX_PORT:'1504'},argv:['--port=1505'],expect:{'server.port':1505}},
  {name:'selected-environment-and-local',environment:{server:{hostname:'environment-host'}},local:{server:{hostname:'local-host'}},expect:{'server.hostname':'local-host'}},
  {name:'cli-origin-and-root',argv:['--hostname=127.0.0.1','--public-url=https://cli.example.invalid/prefix','--root-context=/prefix','--stop-deadline-ms=60000'],expect:{'server.hostname':'127.0.0.1','server.publicUrl':'https://cli.example.invalid/prefix','server.rootContext':'/prefix','server.stopDeadlineMs':60000}},
  {name:'short-secret-refused',env:{REDBOX_SESSION_SECRET:'short'},error:'redboxSession.secret'},
  {name:'invalid-proxy-refused',env:{REDBOX_TRUST_PROXY:'arbitrary'},error:'server.trustProxy'},
  {name:'retired-doi-alias-refused',env:{SAILS_DOI__PUBLICLANDINGURL:'https://public.example.invalid'},error:'SAILS_DOI__PUBLICLANDINGURL'},
  {name:'unknown-redbox-input-refused',env:{REDBOX_NOT_A_SETTING:'fixture'},error:'REDBOX_NOT_A_SETTING'},
];
const get = (o,k) => k.split('.').reduce((a,b)=>a?.[b],o);
async function resolve(row) {
  const {loadPortalConfiguration}=require(root+'/packages/redbox-core/dist/configuration');
  const declaration=require(wsu+'/dist').registerRedboxExtension();
  const pdfgen=require(root+'/packages/sails-hook-redbox-pdfgen/dist/config/pdfgen').pdfgen;
  if(row.application?.brandingConfigurationDefaults?.figsharePublishing) {
    const {FigsharePublishing}=require(root+'/packages/redbox-core/dist/configmodels/FigsharePublishing');
    const supplied=row.application.brandingConfigurationDefaults.figsharePublishing;
    const defaults=new FigsharePublishing();
    row.application.brandingConfigurationDefaults.figsharePublishing={...defaults,...supplied,connection:{...defaults.connection,...supplied.connection}};
  }
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sr-r25-config-'));
  try {
    const files={application:path.join(directory,'application.cjs')};
    fs.writeFileSync(files.application,`module.exports = {...require(${JSON.stringify(wsu+'/support/v6/application.cjs')}), ...${JSON.stringify(row.application||{})}};`);
    for(const name of ['environment','local']) if(row[name]) {
      files[name]=path.join(directory,name+'.mjs');fs.writeFileSync(files[name],`export default ${JSON.stringify(row[name])};`);
    }
    const c=await loadPortalConfiguration({extensions:{providers:[{name:'pdfgen',declaration:{config:{pdfgen}}},{name:'wsu',declaration}]},files,environment:'production',env:{REDBOX_SESSION_SECRET:'disposable-r25-session-secret-32-characters',...row.env},argv:row.argv||[]});
    for(const [key,value] of Object.entries(row.expect||{})) assert.deepEqual(get(c,key),value,key);
    const {resolveDatastore,resolveSessionDatastore}=require(root+'/packages/redbox-core/dist/persistence/mongodb/configuration');
    const targets={core:resolveDatastore(c.datastores.mongodb).database,storage:resolveDatastore(c.datastores.redboxStorage).database,session:resolveSessionDatastore(c.redboxSession).database,agenda:new URL(c.agendaQueue.options.db).pathname.slice(1)};
    const {createHttpCsrf}=require(root+'/packages/redbox-core/dist/http/express');
    const {buildRedboxSessionOptions}=require(root+'/packages/redbox-core/dist/http/express/session');
    const origin=new URL(c.server.publicUrl).origin, csrf=createHttpCsrf({origins:[origin]});
    for(const [selected,token,expected] of [[origin,true,200],[origin,false,403],['https://foreign.example.invalid',true,403]]) {
      const req={method:'POST',headers:{origin:selected},session:{},query:{},get:()=> 'same-origin'};
      req.headers['x-csrf-token']=token?csrf.generateToken(req):'invalid';
      const res={code:200,status(n){this.code=n;return this},set(){return this},json(){return this}};
      csrf.protect(req,res,e=>assert.ifError(e));assert.equal(res.code,expected);
    }
    const jsonata=require(root+'/packages/redbox-core/node_modules/jsonata');
    const doi=c.brandingConfigurationDefaults.doiPublishing;
    const doiUrls={public:await jsonata(doi.profiles.dataPublication.metadata.url.expression).evaluate({record:{metadata:{}},oid:'abc'}),instrument:await jsonata(doi.profiles.instrument.metadata.url.expression).evaluate({record:{metadata:{}},oid:'abc'})};
    if(row.doiPublic) assert.equal(doiUrls.public,row.doiPublic);
    if(row.doiInstrument) assert.equal(doiUrls.instrument,row.doiInstrument);
    const cookie=buildRedboxSessionOptions(c.redboxSession).cookie;
    return {case:row.name,result:'pass',server:c.server,cookie,targets,doiUrls,config:row.name==='defaults'?c:undefined};
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
}
if(process.argv[2]==='child') {
  const row=JSON.parse(process.argv[3]);
  resolve(row).then(result=>{assert(!row.error,'expected refusal');console.log(JSON.stringify(result))}).catch(e=>{
    if(row.error && (e.path||e.message).includes(row.error)) console.log(JSON.stringify({case:row.name,result:'expected-refusal',path:e.path}));
    else {console.error(e);process.exitCode=1;}
  });
} else {
  (async()=>{
    const rows=[];
    for(const row of cases) {
      const env={PATH:process.env.PATH,...baseEnv,...row.env};for(const key of Object.keys(env)) if(env[key]===undefined)delete env[key];
      const r=spawnSync(process.execPath,[__filename,'child',JSON.stringify(row)],{env,encoding:'utf8',timeout:45000,maxBuffer:16*1024*1024});
      assert.equal(r.status,0,row.name+': '+r.stderr+r.stdout);
      const result=JSON.parse(r.stdout);if(result.config){fs.writeFileSync(path.join(output,'resolved-defaults.json'),JSON.stringify(result.config,null,2));delete result.config;}
      rows.push(result);console.log(row.name+': '+result.result);
    }
    fs.writeFileSync(path.join(output,'configuration-results.json'),JSON.stringify(rows,null,2)+'\n');
    console.log(JSON.stringify({cases:rows.length,passes:rows.filter(x=>x.result==='pass').length,expectedRefusals:rows.filter(x=>x.result==='expected-refusal').length}));
  })().catch(e=>{console.error(e);process.exitCode=1;});
}
