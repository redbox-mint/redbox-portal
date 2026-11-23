'use strict';
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {readFileSync} = require('node:fs');
const {createRequire} = require('node:module');
const appRequire = createRequire('/opt/redbox-portal/package.json');
const {MongoClient, BSON} = appRequire('mongodb');
const coreRequire = createRequire(appRequire.resolve('@researchdatabox/redbox-core'));
const {S3Client, CreateBucketCommand, HeadBucketCommand, ListObjectsV2Command, GetObjectCommand, PutObjectCommand} = coreRequire('@aws-sdk/client-s3');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const namespace = process.env.FM049_NAMESPACE;
const bucket = process.env.FM049_BUCKET || namespace;
const port = Number(process.env.FM049_BASE_PORT);
assert.match(namespace, /^fm049(?:-[a-z][a-z0-9-]{0,19})?$/);
assert.match(bucket, /^fm049(?:-[a-z][a-z0-9-]{0,19})?$/);
assert(Number.isInteger(port) && port >= 1024 && port <= 65530);
const database = 'sr_wsu_' + namespace.replaceAll('-', '_');
const endpoint = `http://127.0.0.1:${port + 3}`;
const mongo = [
  ['core', port, database],
  ['storage', port + 1, database + '_storage'],
  ['agenda', port, database + '_agenda'],
  ['sessions', port, database + '_sessions'],
];
(async () => {
  assert.equal(process.env.FM049_DISPOSABLE, 'true');
  const mode = process.argv[2];
  if (['bucket', 'objects', 'restore-objects'].includes(mode)) {
    const client = new S3Client({endpoint, region:'ap-southeast-2', forcePathStyle:true,
      credentials:{accessKeyId:'seaweedadmin',secretAccessKey:'seaweedadmin'}});
    try {
      if (mode === 'bucket') {
        try {await client.send(new HeadBucketCommand({Bucket:bucket}));}
        catch (error) {
          if (error.$metadata?.httpStatusCode !== 404) throw error;
          await client.send(new CreateBucketCommand({Bucket:bucket}));
        }
        return;
      }
      if (mode === 'restore-objects') {
        const empty = await client.send(new ListObjectsV2Command({Bucket:bucket}));
        assert.equal(empty.KeyCount, 0);
        const entries = JSON.parse(readFileSync('/fm049-provider-input.json', 'utf8'));
        const keys = new Set();
        for (const entry of entries) {
          assert.match(entry.key, /^attachments\/[a-z0-9-]+\/[a-z0-9-]+$/);
          assert(!keys.has(entry.key));
          keys.add(entry.key);
          const body = Buffer.from(entry.base64, 'base64');
          assert.equal(body.length, entry.bytes);
          assert.equal(sha256(body), entry.sha256);
          await client.send(new PutObjectCommand({Bucket:bucket, Key:entry.key, Body:body}));
        }
        return;
      }
      const objects = [];
      let ContinuationToken;
      do {
        const page = await client.send(new ListObjectsV2Command({Bucket:bucket, ContinuationToken}));
        for (const {Key} of page.Contents ?? []) {
          const {Body} = await client.send(new GetObjectCommand({Bucket:bucket,Key}));
          const bytes = Buffer.from(await Body.transformToByteArray());
          objects.push({key:Key, bytes:bytes.length, sha256:sha256(bytes), base64:bytes.toString('base64')});
        }
        ContinuationToken = page.NextContinuationToken;
      } while (ContinuationToken);
      assert(objects.length >= 2);
      console.log(JSON.stringify(objects.sort((a,b) => a.key.localeCompare(b.key)), null, 2));
    } finally {client.destroy();}
    return;
  }
  const snapshot = {};
  const selected = ['token', 'migration'].includes(mode) ? mongo.slice(0, 1)
    : mode === 'jobs' ? mongo.filter(([name]) => name === 'agenda') : mongo;
  for (const [name, port, database] of selected) {
    const client = await new MongoClient(`mongodb://127.0.0.1:${port}/${database}`, {serverSelectionTimeoutMS:5000}).connect();
    try {
      const db = client.db();
      if (mode === 'token') {
        const hash = createHash('sha256').update(process.env.FM049_BEARER).digest('base64');
        const result = await db.collection('user').updateOne({username:'admin'}, {$set:{token:hash}});
        assert.equal(result.modifiedCount, 1);
      } else if (mode === 'jobs') {
        const collections = await db.listCollections().toArray();
        for (const {name: collectionName} of collections) {
          snapshot[collectionName] = await db.collection(collectionName).find({}, {
            projection: {name:1, type:1, disabled:1, lockedAt:1, lastModifiedBy:1, repeatInterval:1,
              lastRunAt:1, lastFinishedAt:1, nextRunAt:1, failedAt:1, failCount:1},
          }).sort({_id:1}).toArray();
        }
      } else {
        assert(['inventory', 'migration'].includes(mode));
        const collections = await db.listCollections().toArray();
        snapshot[name] = {database, collections:[]};
        for (const {name: collectionName} of collections.sort((a,b) => a.name.localeCompare(b.name))) {
          if (mode === 'migration' && collectionName !== 'migration') continue;
          const collection = db.collection(collectionName);
          const documents = await collection.find().sort({_id:1}).toArray();
          const indexes = (await collection.indexes()).sort((a,b) => a.name.localeCompare(b.name));
          snapshot[name].collections.push({name:collectionName, count:documents.length, indexCount:indexes.length,
            checksum:sha256(BSON.EJSON.stringify({documents,indexes}, {relaxed:false}))});
        }
      }
    } finally {await client.close();}
  }
  if (['inventory', 'jobs', 'migration'].includes(mode)) console.log(JSON.stringify(snapshot, null, 2));
})().catch(error => {console.error(error);process.exitCode = 1;});
