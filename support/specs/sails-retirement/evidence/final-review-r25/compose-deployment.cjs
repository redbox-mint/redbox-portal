'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '../../../../..');
const wsu = '/home/andrew/src/bitbucket/redbox-hook-wsu-v6';
const results = [];
for (const row of [
  {name:'development-defaults', file:'support/development/docker-compose.yml', ports:[1500,9876,27017,8983,9000,9001]},
  {name:'development-selected-ports', file:'support/development/docker-compose.yml', ports:[18599,19876,29017,18983,19000,19001]},
  {name:'development-proxy-prefix', file:'support/development/docker-compose.yml', ports:[18599,19876,29017,18983,19000,19001], publicUrl:'https://wsu.example.invalid/research', override:true},
  {name:'retired-development-core-mount', file:'support/development/docker-compose.core-mount.yml', refusal:true},
  {name:'integration-disposable', file:'support/v6/docker-compose.test.yml'},
  {name:'retired-integration', file:'support/integration-testing/docker-compose.mocha.yml', refusal:true},
]) {
  const env = {PATH:process.env.PATH, REDBOX_BUILD_IMAGE:'qualified/builder:fixture', REDBOX_PORTAL_IMAGE:'qualified/runtime:fixture', REDBOX_SESSION_SECRET:'disposable-r25-compose-session-secret-32'};
  const keys=['REDBOX_PORTAL_HOST_PORT','REDBOX_PORTAL_DEBUG_HOST_PORT','REDBOX_MONGODB_HOST_PORT','REDBOX_SOLR_HOST_PORT','REDBOX_S3_API_HOST_PORT','REDBOX_S3_ADMIN_HOST_PORT'];
  row.ports?.forEach((value,index)=>env[keys[index]]=String(value));
  if(row.publicUrl)env.REDBOX_PORTAL_APP_URL=row.publicUrl;
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sr-r25-compose-'));
  try {
    const args=['compose','--env-file','/dev/null','-f',wsu+'/'+row.file];
    if(row.mount)args.push('-f',wsu+'/support/development/docker-compose.core-mount.yml');
    if(row.override) {
      const override=path.join(directory,'override.json');
      fs.writeFileSync(override,JSON.stringify({services:{rbportal:{environment:{REDBOX_ROOT_CONTEXT:'/research',REDBOX_TRUST_PROXY:'["loopback"]'}}}}));
      args.push('-f',override);
    }
    args.push('config','--format','json');
    if(row.refusal) {
      let diagnostic='';
      try {execFileSync('docker',args,{env,encoding:'utf8',stdio:['pipe','pipe','pipe']});} catch(error) {diagnostic=error.stderr;}
      assert.match(diagnostic,/This v5 Compose workflow is retired/);
      results.push({case:row.name,result:'expected-refusal',reason:'retired v5 entrypoint'});
      continue;
    }
    const model=JSON.parse(execFileSync('docker',args,{env,encoding:'utf8'}));
    const portal=model.services.rbportal;
    assert.equal(portal.build.args.REDBOX_BUILD_IMAGE,env.REDBOX_BUILD_IMAGE);
    assert.equal(portal.build.args.REDBOX_PORTAL_IMAGE,env.REDBOX_PORTAL_IMAGE);
    const source=wsu+(row.ports?'/support/v6/application.cjs':'/support/v6/test.cjs');
    const config=require(source);
    assert.equal(new URL(config.datastores.mongodb.url).hostname,'mongodb');
    assert.equal(new URL(config.datastores.redboxStorage.url).hostname,'storage-mongodb');
    assert.equal(new URL(config.redboxSession.mongoUrl).hostname,'mongodb');
    assert.equal(new URL(config.agendaQueue.options.db).hostname,'mongodb');
    assert.equal(config.solr.cores.default.options.host,'solr');
    assert.equal(config.solr.cores.default.options.port,8983);
    assert.equal(portal.environment.HOOK_S3_ENDPOINT,'http://seaweedfs:8333');
    assert.equal(portal.environment.HOOK_S3_BUCKET,model.services.seaweedfs.environment.S3_BUCKET);
    assert.equal(portal.environment.HOOK_S3_ACCESS_KEY,model.services.seaweedfs.environment.AWS_ACCESS_KEY_ID);
    assert.equal(portal.environment.HOOK_S3_SECRET_KEY,model.services.seaweedfs.environment.AWS_SECRET_ACCESS_KEY);
    if(row.ports) {
      const actual=[...portal.ports,...model.services.mongodb.ports,...model.services.solr.ports,...model.services.seaweedfs.ports];
      for(const port of row.ports)assert(actual.some(x=>x.published===String(port)));
      assert.equal(portal.environment.REDBOX_PUBLIC_URL,row.publicUrl||'http://localhost:'+row.ports[0]);
    } else assert.equal(portal.environment.WSU_DISPOSABLE,'true');
    if(row.override) {
      assert.equal(portal.environment.REDBOX_ROOT_CONTEXT,'/research');
      assert.equal(portal.environment.REDBOX_TRUST_PROXY,'["loopback"]');
    }
    results.push({case:row.name,result:'pass',publishedPorts:row.ports,publicUrl:portal.environment.REDBOX_PUBLIC_URL,connectionTargets:{core:config.datastores.mongodb.url,storage:config.datastores.redboxStorage.url,session:config.redboxSession.mongoUrl,queue:config.agendaQueue.options.db,solr:config.solr.cores.default.options,s3:portal.environment.HOOK_S3_ENDPOINT},s3Bucket:portal.environment.HOOK_S3_BUCKET});
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
}
fs.writeFileSync(root+'/.tmp/sails-retirement/final-review-r25/compose-deployment-results.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({cases:results.length,passed:results.filter(x=>x.result==='pass').length,expectedRefusals:results.filter(x=>x.result==='expected-refusal').length}));
