// Guarded, sanitized WSU source/candidate and complete-checkpoint verifier.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {createRequire} = require('node:module');
const appRequire = createRequire(path.resolve(process.cwd(), 'package.json'));
const {MongoClient, BSON} = appRequire('mongodb');
const hash = value => createHash('sha256').update(value).digest('hex');

(async () => {
  assert.equal(process.env.SR_WSU_DISPOSABLE, 'true');
  const mode = process.argv[2], prefix = process.env.SR_WSU_DATABASE_PREFIX;
  assert.match(prefix, /^sr_wsu_(release|upgrade)$/);
  const corePort = Number(process.env.SR_WSU_CORE_PORT), storagePort = Number(process.env.SR_WSU_STORAGE_PORT);
  assert([29701, 29711].includes(corePort)); assert([29702, 29712].includes(storagePort));
  const clients = [], databases = [];
  try {
    for (const [port, suffix] of [[corePort, ''], [storagePort, '_storage'], [corePort, '_agenda'], [corePort, '_sessions']]) {
      const client = await new MongoClient(`mongodb://127.0.0.1:${port}/${prefix}${suffix}`).connect();
      clients.push(client); databases.push(client.db());
    }
    if (mode.startsWith('s3-')) {
      const {S3Client,ListObjectsV2Command,GetObjectCommand,PutObjectCommand,DeleteObjectCommand} = appRequire('@aws-sdk/client-s3');
      const s3 = new S3Client({endpoint:'http://127.0.0.1:28333', region:'ap-southeast-2', forcePathStyle:true,
        credentials:{accessKeyId:'seaweedadmin',secretAccessKey:'seaweedadmin'}});
      const Bucket = 'wsu-attachments';
      try {
        const list = async () => {
          const rows = []; let ContinuationToken;
          do {
            const page = await s3.send(new ListObjectsV2Command({Bucket,ContinuationToken}));
            for(const {Key} of page.Contents || []) {
              const {Body} = await s3.send(new GetObjectCommand({Bucket,Key})); const bytes = await Body.transformToByteArray();
              rows.push({key:Key,sha256:hash(bytes),base64:Buffer.from(bytes).toString('base64')});
            }
            ContinuationToken = page.NextContinuationToken;
          } while (ContinuationToken);
          return rows.sort((a,b)=>a.key.localeCompare(b.key));
        };
        if(mode === 's3-seed') await s3.send(new PutObjectCommand({Bucket,Key:'attachments/wsu-checkpoint.txt',Body:'sanitized WSU checkpoint S3 bytes'}));
        else if(mode === 's3-damage') {
          await s3.send(new PutObjectCommand({Bucket,Key:'attachments/wsu-checkpoint.txt',Body:'candidate-damaged'}));
          await s3.send(new PutObjectCommand({Bucket,Key:'attachments/candidate-only.txt',Body:'candidate-only'}));
        } else if(mode === 's3-snapshot') await fs.writeFile(process.argv[3],JSON.stringify(await list(),null,2)+'\n');
        else if(mode === 's3-verify') assert.deepEqual(await list(),JSON.parse(await fs.readFile(process.argv[3],'utf8')));
        else if(mode === 's3-restore') {
          for(const row of await list()) await s3.send(new DeleteObjectCommand({Bucket,Key:row.key}));
          for(const row of JSON.parse(await fs.readFile(process.argv[3],'utf8'))) await s3.send(new PutObjectCommand({Bucket,Key:row.key,Body:Buffer.from(row.base64,'base64')}));
        } else throw Error('Unknown S3 operation');
        console.log(JSON.stringify({mode, objects:(await list()).length}));
      } finally {s3.destroy();}
    } else if (mode === 'snapshot' || mode === 'verify') {
      const snapshot = [];
      for (let index = 0; index < databases.length; index++) {
        const database = databases[index];
        for (const {name} of (await database.listCollections().toArray()).sort((a,b) => a.name.localeCompare(b.name))) {
          const collection = database.collection(name);
          const documents = await collection.find().sort({_id: 1}).toArray();
          const indexes = (await collection.listIndexes().toArray()).sort((a,b) => a.name.localeCompare(b.name));
          snapshot.push({store: index, collection: name, count: documents.length,
            checksum: hash(BSON.EJSON.stringify({documents, indexes}, {relaxed: false}))});
        }
      }
      if (mode === 'snapshot') await fs.writeFile(process.argv[3], JSON.stringify(snapshot, null, 2) + '\n');
      else assert.deepEqual(snapshot, JSON.parse(await fs.readFile(process.argv[3], 'utf8')));
      console.log(JSON.stringify({mode, stores: 4, collections: snapshot.length, documents: snapshot.reduce((sum,row) => sum + row.count, 0)}));
    } else if (mode === 'drop') {
      for (const database of databases) await database.dropDatabase();
      console.log(JSON.stringify({mode, stores: databases.length}));
    } else if (mode === 'review-index') {
      const collection = databases[1].collection('record');
      const index = (await collection.indexes()).find(row => row.name === 'redboxOid_1');
      assert.deepEqual(index.key, {redboxOid: 1}); assert.notEqual(index.unique, true);
      assert(!index.sparse && !index.partialFilterExpression && !index.hidden);
      assert.equal(index.expireAfterSeconds, undefined); assert(!index.collation || index.collation.locale === 'simple');
      assert.equal((await collection.aggregate([{$group: {_id:'$redboxOid', count:{$sum:1}}}, {$match:{count:{$gt:1}}}]).toArray()).length, 0);
      const count = await collection.countDocuments();
      assert.equal(await collection.countDocuments({redboxOid: {$type:'string', $ne:''}}), count);
      await collection.dropIndex('redboxOid_1'); assert.equal(await collection.countDocuments(), count);
      console.log(JSON.stringify({mode, reviewedNonuniqueOidIndex: true, count}));
    } else if (mode === 'fail-initialize') {
      const {createWsuPortal} = appRequire('redbox-hook-wsu/deployment');
      const core = appRequire('@researchdatabox/redbox-core/portal');
      const {nothingLogger:log} = appRequire('@researchdatabox/sails-ng-common');
      const {REDBOX_APPLICATION_CONFIG, REDBOX_ENVIRONMENT_CONFIG, REDBOX_LOCAL_CONFIG, ...env} = process.env;
      const portal = await createWsuPortal({appPath:process.cwd(), files:{application:REDBOX_APPLICATION_CONFIG}, env, log,
        postBootstrap:[{name:'wsu-deliberate-partial-failure', run:async () => {
          await databases[0].collection('wsu_candidate_only').insertOne({stage:'core-written'});
          assert.equal((await databases[1].collection('record').updateOne({'metadata.title':'Sanitized WSU rdmp'}, {$set:{'metadata.partialFailure':true}})).modifiedCount, 1);
          throw Error('deliberate WSU initialization interruption');
        }}]}, false);
      try {
        await assert.rejects(portal.application.initialize(), /deliberate WSU initialization interruption/);
        assert.equal(portal.application.status().ready, false);
        assert.equal(await databases[0].collection('wsu_candidate_only').countDocuments(), 1);
        assert.equal(await databases[1].collection('record').countDocuments({'metadata.partialFailure':true}), 1);
      } finally {await portal.application.stop();}
      assert.equal(core.persistenceStatus(portal.owner).pools, 0);
      console.log(JSON.stringify({mode, realInitializationFailed:true, coreWrite:true, storageWrite:true, activated:false, pools:0}));
    } else if (mode === 'seed' || mode === 'probe') {
      const base = process.env.SR_WSU_ORIGIN;
      assert(['http://127.0.0.1:18556','http://127.0.0.1:18560'].includes(base));
      const v6 = base.endsWith('18560');
      const csrf = v6 ? await fetch(base+'/csrfToken') : undefined;
      if (csrf) assert.equal(csrf.status,200);
      const cookie = csrf?.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
      const token = csrf ? (await csrf.json())._csrf : undefined;
      const login = await fetch(base+'/user/login_local', {method:'POST', redirect:'manual', headers:{'Content-Type':'application/json',Accept:'application/json','X-Source':'jsclient', ...(cookie ? {Cookie:cookie,'X-CSRF-Token':token} : {})}, body:JSON.stringify({username:'admin',password:'rbadmin',branding:'default',portal:'rdmp'})});
      assert.equal(login.status,200); assert.equal((await login.json()).user.username,'admin');
      const session = login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; '); assert(session);
      if (v6) assert(session.includes('wsu.v6.sid='));
      const headers = {Cookie:session,Accept:'application/json','X-Source':'jsclient'};
      if (mode === 'seed') {
        assert.equal(v6,false);
        const records = [];
        for (const type of ['rdmp','dataRecord','dataPublication','instrument','ror']) {
          const metadata = {title:'Sanitized WSU '+type, description:'Synthetic institution upgrade fixture; no personal data.',
            'dc:subject_anzsrc:for':[{notation:'01', label:'MATHEMATICAL SCIENCES'}],
            'dc:subject_anzsrc:seo':[], contributors:[], finalKeywords:['qualification']};
          if (type === 'ror') Object.assign(metadata, {display_name:metadata.title, id:'https://ror.org/synthetic-wsu-fixture', types:['Education'], status:'active'});
          const response = await fetch(base+'/default/rdmp/api/records/metadata/'+type, {method:'POST', headers:{Authorization:'Bearer wsu-qualification-token','Content-Type':'application/json',Accept:'application/json'}, body:JSON.stringify(metadata)});
          assert.equal(response.status,201, type+': '+await response.clone().text());
          const {oid} = await response.json(); assert(oid); records.push({type,oid,title:metadata.title});
        }
        await fs.writeFile(process.argv[3], JSON.stringify(records,null,2)+'\n');
        console.log(JSON.stringify({mode, records:records.length, sourceHttpWrites:true}));
      } else {
        const records = JSON.parse(await fs.readFile(process.argv[3],'utf8'));
        assert.equal(records.length,5);
        for(const endpoint of ['/default/rdmp/home','/default/rdmp/user/login']) {
          const page=await fetch(base+endpoint);assert.equal(page.status,200,endpoint);assert.match(await page.text(),/<html/i);
        }
        if(v6) for(const endpoint of ['/healthz','/readyz']) assert.equal((await fetch(base+endpoint)).status,200);
        for(const record of records) {
          const response = await fetch(base+'/default/rdmp/api/records/metadata/'+record.oid,{headers});
          assert.equal(response.status,200); assert(JSON.stringify(await response.json()).includes(record.title));
          const stored = await databases[1].collection('record').findOne({redboxOid:record.oid});
          assert(stored); assert.equal(stored.metaMetadata.type,record.type);
          const form = await fetch(base+'/default/rdmp/api/forms/get?name='+encodeURIComponent(stored.metaMetadata.form),{headers});
          assert.equal(form.status,200); await form.json();
          const workflow = await fetch(base+'/default/rdmp/record/wfSteps/'+record.type,{headers});
          assert.equal(workflow.status,200); assert((await workflow.json()).length>0);
          const page = await fetch(base+'/default/rdmp/record/edit/'+record.oid,{headers:{Cookie:session,Accept:'text/html'}});
          assert.equal(page.status,200); assert((await page.text()).includes('form'));
        }
        console.log(JSON.stringify({mode, v6, localLogin:true, anonymousPages:2, records:5, forms:5, workflows:5, pages:5, ...(v6?{freshCsrf:true,health:200,ready:200}:{})}));
      }
    } else throw Error('Unknown WSU recovery verifier mode');
  } finally {for(const client of clients) await client.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
