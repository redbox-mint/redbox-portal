'use strict';
// Diagnostic control is loopback-only and never part of the timed request path.
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { Readable } = require('node:stream');
const { MongoClient } = require('mongodb');
const { firstValueFrom } = require('rxjs');
const { protocol: p, metadata, attachment, hash } = require('./protocol.cjs');
const {
  createPortalHost,
  prepareSelectedPersistenceIndexes,
  cleanupPersistence,
  persistenceStatus,
} = require('@researchdatabox/redbox-core/portal');
const { nothingLogger: log } = require('@researchdatabox/sails-ng-common');
const runtime = require('../../../packages/redbox-core/dist/persistence/runtime');
const { drainHttpRequests } = require('../../../packages/redbox-core/dist/middleware/requestLifetime');
const { Datastream } = require('@researchdatabox/redbox-core/extensions/storage');
const { SolrDocument } = require('../../../packages/redbox-core/dist/model/SolrDocument');
const repository = process.cwd();
const appPath = '/fm007-state/app';
let portal,
  native,
  seed,
  phase = 'startup',
  telemetry;
const credentials = { token: 'fm007-synthetic-bearer', password: 'fm007-synthetic-local-password' };
const origin = `http://127.0.0.1:${p.portalPort}`;
async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30000), ...options });
  const text = await response.text();
  assert(response.ok, `${response.status}: ${text.slice(0, 1000)}`);
  return { response, body: JSON.parse(text) };
}
async function drain(budgetMs = p.drainMs) {
  const started = Date.now(),
    observations = [];
  assert(budgetMs > 0 && budgetMs <= p.drainMs);
  let timer;
  try {
    await Promise.race([
      drainHttpRequests(portal.owner),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('HTTP request drain deadline')), budgetMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  const jobs = native.db('fm007_agenda').collection('agendaJobs');
  // Repeating future housekeeping is not accepted workload. Failed or due work is.
  while (Date.now() - started < budgetMs) {
    const all = await jobs
      .find({ disabled: { $ne: true } })
      .project({ name: 1, nextRunAt: 1, lockedAt: 1, failedAt: 1, lastFinishedAt: 1 })
      .toArray();
    const pending = all.filter(job => job.lockedAt || (job.nextRunAt && new Date(job.nextRunAt) <= new Date()));
    const failed = all.filter(job => job.failedAt && (!job.lastFinishedAt || job.failedAt > job.lastFinishedAt));
    observations.push({ elapsedMs: Date.now() - started, pending: pending.length, failed: failed.length });
    assert.equal(failed.length, 0, 'failed queue work invalidates sample');
    if (!pending.length) {
      await drainHttpRequests(portal.owner);
      return { observations, durationMs: Date.now() - started, persistence: persistenceStatus(portal.owner) };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('owned queue failed to drain within 60 seconds');
}
async function seedRecords() {
  assert.equal(await native.db('fm007_storage').collection('record').countDocuments(), 0);
  const storage = portal.data.storage();
  const brand = portal.data.reference.branding.get().getBrand('default');
  const type = await firstValueFrom(portal.data.reference.types.get().get(brand, 'dataRecord'));
  const step = portal.config.workflow.dataRecord.draft;
  assert.equal(step.starting, true);
  const form = await firstValueFrom(portal.data.reference.forms.get().getFormByName(step.config.form, true, brand.id));
  assert.equal(form.name, 'dataRecord-1.0-draft');
  const createdOn = '2026-11-04T00:00:00.000Z';
  const template = {
    previousWorkflow: null,
    authorization: {
      edit: ['admin'],
      view: ['admin'],
      editRoles: [...step.config.authorization.editRoles],
      viewRoles: [...step.config.authorization.viewRoles],
      editPending: [],
      viewPending: [],
    },
    dateCreated: createdOn,
    metaMetadata: {
      packageType: type.packageType,
      brandId: brand.id,
      createdBy: 'admin',
      type: 'dataRecord',
      searchCore: type.searchCore,
      createdOn,
      lastSaveDate: createdOn,
      form: form.name,
      attachmentFields: form.configuration.attachmentFields,
    },
    workflow: structuredClone(step.config.workflow),
    recordVersion: 1,
  };
  const records = [],
    warm = [],
    documents = [];
  await runtime.runAcceptedPersistenceWork(portal.owner, async () => {
    for (const warmup of [false, true]) {
      for (let index = 0; index < (warmup ? p.warmRecords : p.records); index++) {
        const oid = `fm007-${warmup ? 'warm' : 'measured'}-${String(index).padStart(4, '0')}`;
        const record = structuredClone(template);
        delete record._id;
        delete record.id;
        delete record.incarnationId;
        record.redboxOid = oid;
        record.metadata = metadata(index, warmup);
        const saved = await storage.create({ id: template.metaMetadata.brandId }, record, 'dataRecord');
        assert.equal(saved.success, true, JSON.stringify(saved));
        const stored = await storage.getMeta(oid);
        assert.equal(stored.revision, p.seedRevision);
        assert.deepEqual(stored.authorization, template.authorization);
        assert.deepEqual(stored.workflow, template.workflow);
        assert.equal(stored.metaMetadata.form, form.name);
        assert.equal(Buffer.byteLength(JSON.stringify(stored.metadata)), p.metadataBytes);
        documents.push(portal.data.search.get().preIndex(new SolrDocument({ ...stored, id: oid })));
        (warmup ? warm : records).push({
          oid,
          title: stored.metadata.title,
          revision: stored.revision,
          metadataHash: hash(JSON.stringify(stored.metadata)),
        });
      }
    }
    const indexed = await fetch(`http://127.0.0.1:${p.solrPort}/solr/redbox/update?commit=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(documents),
    });
    assert(indexed.ok, await indexed.text());
    for (const item of [records[0], warm[0]]) {
      for (const size of [1048576, 33554432]) {
        const buffer = attachment(size),
          fileId = `fm007-${size}.bin`;
        await portal.data.disks.get().stagingDisk().putStream(fileId, Readable.from(buffer), { contentLength: size });
        const result = await portal.data.datastream
          .get()
          .addDatastreams(item.oid, [
            new Datastream({ fileId, name: fileId, mimeType: 'application/octet-stream', contentLength: size }),
          ]);
        assert.equal(result.success, true, JSON.stringify(result));
      }
    }
  });
  const drained = await drain();
  seed = {
    records,
    warm,
    brandId: template.metaMetadata.brandId,
    authorization: template.authorization,
    form: template.metaMetadata.form,
    workflow: template.workflow,
    metadataBytes: p.metadataBytes,
    attachments: [1048576, 33554432].map(size => ({
      size,
      fileId: `fm007-${size}.bin`,
      sha256: hash(attachment(size)),
    })),
    drained,
  };
  return seed;
}
async function inspect({ expected = [], clearWarm = false, budgetMs = p.drainMs } = {}) {
  const drained = await drain(budgetMs);
  const memoryAtDrain = process.memoryUsage();
  const storage = portal.data.storage();
  const measured = [];
  for (const item of seed.records) {
    const stored = await storage.getMeta(item.oid);
    const changed = expected.find(record => record.oid === item.oid);
    assert.equal(stored.revision, changed?.revision ?? item.revision, `revision ${item.oid}`);
    assert.deepEqual(stored.authorization, seed.authorization);
    assert.deepEqual(stored.workflow, seed.workflow);
    assert.equal(stored.metaMetadata.form, seed.form);
    assert.equal(
      hash(JSON.stringify(stored.metadata)),
      changed?.metadataHash ?? item.metadataHash,
      `metadata ${item.oid}`
    );
    measured.push({ oid: item.oid, revision: stored.revision });
  }
  const audits = native.db('fm007_storage').collection('recordaudit');
  const auditCount = await audits.countDocuments({ redboxOid: { $in: seed.records.map(item => item.oid) } });
  if (expected.length)
    assert(
      auditCount >= expected.reduce((sum, item) => sum + item.revision - p.seedRevision, 0),
      'all mutation audits must persist'
    );
  await fetch(`http://127.0.0.1:${p.solrPort}/solr/redbox/update?commit=true`, {
    method: 'POST',
    body: '[]',
    headers: { 'Content-Type': 'application/json' },
  }).then(async res => assert(res.ok, await res.text()));
  for (const item of expected) {
    const result = await jsonRequest(
      `http://127.0.0.1:${p.solrPort}/solr/redbox/select?q=id:${encodeURIComponent(item.oid)}&wt=json`
    );
    assert.equal(result.body.response.numFound, 1, `indexed ${item.oid}`);
    // preIndex can map title into a configured field; require its updated value in the document.
    assert(JSON.stringify(result.body.response.docs[0]).includes(item.title), `updated Solr title ${item.oid}`);
  }
  if (clearWarm) {
    for (const database of ['fm007_core', 'fm007_storage']) {
      const db = native.db(database);
      for (const name of ['useraudit', 'recordaudit', 'integrationaudit']) await db.collection(name).deleteMany({});
    }
    const jobs = native.db('fm007_agenda');
    await jobs
      .collection('agendaJobs')
      .deleteMany({ repeatInterval: { $exists: false }, lockedAt: null, nextRunAt: null });
    await jobs.collection('agendaJobsHistory').deleteMany({});
    await fetch(`http://127.0.0.1:${p.solrPort}/solr/redbox/update?commit=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delete: { query: 'id:fm007-warm-*' } }),
    }).then(res => assert(res.ok));
  }
  return {
    drained,
    measuredCount: measured.length,
    revisions: measured,
    auditCount,
    expectedVerified: expected.length,
    memoryAtDrain,
    memory: process.memoryUsage(),
    phase,
  };
}
async function main() {
  assert.equal(process.version, 'v26.12.1');
  fs.mkdirSync(appPath, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'fixture-package.json'), path.join(appPath, 'package.json'));
  for (const name of ['node_modules', 'views', 'assets'])
    if (!fs.existsSync(path.join(appPath, name))) fs.symlinkSync(path.join(repository, name), path.join(appPath, name));
  native = await new MongoClient(`mongodb://127.0.0.1:${p.mongoPort}/fm007_core`).connect();
  const existing = await native.db().listCollections().toArray();
  assert.equal(existing.length, 0, 'reset all disposable databases before a fresh owner');
  const build = await native.db().command({ buildInfo: 1 });
  const fcv = await native.db('admin').command({ getParameter: 1, featureCompatibilityVersion: 1 });
  assert.equal(build.version, '9.0.4');
  assert.equal(fcv.featureCompatibilityVersion.version, '9.0');
  portal = await createPortalHost({
    appPath,
    environment: 'production',
    log,
    files: { application: path.join(__dirname, 'application.cjs') },
    localesDirectory: path.join(repository, 'language-defaults'),
    viewRoots: [path.join(repository, 'views')],
    assetRoots: [path.join(repository, '.tmp/public'), path.join(repository, 'assets')],
    env: {
      ...process.env,
      REDBOX_ADMIN_TOKEN: credentials.token,
      REDBOX_ADMIN_PASSWORD: credentials.password,
      REDBOX_SESSION_SECRET: 'fm007-only-synthetic-session-secret-at-least-32-characters',
    },
  });
  const maintenance = { config: portal.config, log };
  try {
    const ready = await prepareSelectedPersistenceIndexes(maintenance, 'ensure', {
      storage: portal.preflight,
      agenda: portal.config.agendaQueue.options,
      session: portal.config.redboxSession,
    });
    assert.equal(ready.ready, true);
  } finally {
    await cleanupPersistence(maintenance);
  }
  await portal.host.initialize();
  await portal.host.activate();
  portal.host.installSignalHandlers({
    onStopped: () => process.exit(0),
    onError: () => {
      process.exitCode = 1;
    },
  });
  assert.equal((await fetch(origin + '/readyz')).status, 200);
  telemetry = fs.createWriteStream('/fm007-output/node.jsonl');
  let timer;
  const tick = () =>
    telemetry.write(
      JSON.stringify({
        utc: new Date().toISOString(),
        monotonicMs: Number(process.hrtime.bigint()) / 1e6,
        phase,
        pid: process.pid,
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        resource: process.resourceUsage(),
      }) + '\n'
    );
  tick();
  timer = setInterval(tick, 1000);
  const control = http.createServer(async (req, res) => {
    try {
      assert.equal(req.method, 'POST');
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const command = JSON.parse(Buffer.concat(chunks));
      let result;
      if (command.action === 'seed') result = await seedRecords();
      else if (command.action === 'phase') {
        phase = command.phase;
        tick();
        result = { phase };
      } else if (command.action === 'inspect') result = await inspect(command);
      else if (command.action === 'stop') {
        phase = 'stopping';
        await portal.host.stop({ deadlineMs: 55000 });
        assert.equal(persistenceStatus(portal.owner).pools, 0);
        await native.close();
        clearInterval(timer);
        tick();
        telemetry.end();
        result = { stopped: true, persistence: persistenceStatus(portal.owner) };
        res.end(JSON.stringify(result), () => {
          control.close();
          process.exit(0);
        });
        return;
      } else throw new Error('unknown diagnostic command');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: error.message, stack: error.stack }));
    }
  });
  control.listen(p.controlPort, '127.0.0.1', () =>
    console.log(
      JSON.stringify({
        ready: true,
        build: build.version,
        fcv: fcv.featureCompatibilityVersion.version,
        selected: portal.resolved.providers?.map(item => item.name),
        strict: portal.config.recordtype.dataRecord.concurrentModification,
        config: portal.config.server,
        node: process.version,
      })
    )
  );
}
main().catch(async error => {
  console.error(error.stack);
  try {
    await portal?.host?.stop({ deadlineMs: 10000 });
    await native?.close();
  } catch {}
  process.exitCode = 1;
});
