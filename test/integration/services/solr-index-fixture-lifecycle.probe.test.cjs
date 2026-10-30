// Run independently: node --test test/integration/services/solr-index-fixture-lifecycle.probe.test.cjs
// Uses installed Agenda Job + MongoJobRepository against a deterministic atomic
// collection double. No Sails lift, Docker, Mongo server, or Solr is required.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { performance } = require('node:perf_hooks');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' } });
const { SolrIndexFixtureLifecycle, solrFixtureQueueSettings, beforeSolrFixtureDeadline } = require('./solr-index-fixture-lifecycle.ts');
const requireCore = createRequire(require('node:path').resolve('packages/redbox-core/package.json'));
const { ObjectId } = createRequire(requireCore.resolve('@agendajs/mongo-backend'))('mongodb');
const implementations = Promise.all([
  import(new URL('Job.js', pathToFileURL(requireCore.resolve('agenda')))),
  import(new URL('MongoJobRepository.js', pathToFileURL(requireCore.resolve('@agendajs/mongo-backend'))))
]);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const field = (doc, path) => path.split('.').reduce((value, key) => value?.[key], doc);
function matches(doc, query) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some(branch => matches(doc, branch));
    const actual = field(doc, key);
    if (expected === null) return actual == null;
    if (expected && typeof expected === 'object' && '$ne' in expected) return actual !== expected.$ne;
    if (expected && typeof expected === 'object' && '$eq' in expected) return expected.$eq === null ? actual == null : actual === expected.$eq;
    if (expected && typeof expected === 'object' && '$lte' in expected) return actual != null && Number(actual) <= Number(expected.$lte);
    if (expected && typeof expected.toHexString === 'function') return String(actual) === String(expected);
    if (expected instanceof Date) return Number(actual) === Number(expected);
    return actual === expected;
  });
}
class Collection {
  constructor(docs = []) { this.docs = docs; this.operations = []; }
  async findOne(query) { return structuredClone(this.docs.find(doc => matches(doc, query)) ?? null); }
  async deleteOne(query) {
    this.operations.push(['delete', query]);
    if (this.beforeDelete) await this.beforeDelete();
    const index = this.docs.findIndex(doc => matches(doc, query));
    if (index !== -1) this.docs.splice(index, 1);
    return { acknowledged: true, deletedCount: index === -1 ? 0 : 1 };
  }
  async updateOne(query, update) {
    this.operations.push(['update', query, update]);
    const doc = this.docs.find(doc => matches(doc, query));
    if (doc) Object.assign(doc, update.$set);
    return { acknowledged: true, matchedCount: doc ? 1 : 0 };
  }
  async findOneAndUpdate(query, update) {
    // Pause before the atomic Mongo operation, after Agenda built its timestamp.
    if (this.beforeClaim) await this.beforeClaim(query, update);
    const doc = this.docs.find(doc => matches(doc, query));
    if (!doc) return null;
    await this.updateOne(query, update);
    return { ...structuredClone(doc), _id: new ObjectId(doc._id) };
  }
}
function setup() {
  const doc = { _id: '0123456789abcdef01234567', type: 'normal', name: 'index',
    data: { id: 'fixture', metaMetadata: { searchCore: 'core-a' } }, nextRunAt: new Date() };
  const query = { name: 'index', 'data.id': 'fixture', 'data.metaMetadata.searchCore': 'core-a' };
  const jobs = new Collection([doc]);
  const history = new Collection();
  let present = false;
  const events = [];
  const s = { doc, jobs, history, query, events, action: async () => s.write(),
    get present() { return present; },
    write() { events.push('worker commit'); present = true; },
    async deleteFixture() { events.push('final deletion'); present = false; } };
  s.lifecycle = new SolrIndexFixtureLifecycle(jobs, history, query, 'core-a/fixture', job => s.action(job));
  return s;
}
async function worker(s, claimedJob, lockLifetime = 10000) {
  const [{ Job }, { MongoJobRepository }] = await implementations;
  const repo = new MongoJobRepository({ mongo: {} });
  repo.collection = s.jobs;
  const agenda = Object.assign(new EventEmitter(), { attrs: {}, db: repo,
    definitions: { index: { fn: s.lifecycle.handler, lockLifetime } }, logJobEvent() {}, publishJobStateNotification() {} });
  const claimed = claimedJob ?? await repo.lockJob(s.doc);
  assert(claimed, 'real Mongo repository must atomically claim this job');
  const job = new Job(agenda, claimed, true);
  return { job, run: () => job.run(), repo };
}
const deadline = (ms = 2000) => performance.now() + ms;
const cleanup = (s, ms) => s.lifecycle.cleanup(Promise.resolve(true), deadline(ms), () => s.deleteFixture());

test('preflight rejects unsupported queues, backends and separate databases', () => {
  const datastore = { manager: { collection() {} } };
  const config = { queue: { serviceName: 'agendaqueueservice' }, solr: { createOrUpdateJobName: 'index' },
    agendaQueue: { options: { backend: 'mongodb', collection: 'customJobs' }, jobs: {
      index: { fnName: 'solrsearchservice.solrAddOrUpdate', backend: 'mongodb' }
    } } };
  assert.deepEqual(solrFixtureQueueSettings(config, datastore, datastore), { collectionName: 'customJobs' });
  for (const change of [
    c => { c.agendaQueue.jobs.index.backend = 'sqs'; },
    c => { c.agendaQueue.options.backend = 'sqs'; },
    c => { c.queue.serviceName = 'anotherqueue'; },
    c => { c.agendaQueue.options.db = 'mongodb://separate/jobs'; },
    c => { c.agendaQueue.jobs.index.schedule = { method: 'every' }; },
    c => { c.agendaQueue.jobs.index.fnName = 'custom.handler'; }
  ]) {
    const unsupported = structuredClone(config); change(unsupported);
    assert.throws(() => solrFixtureQueueSettings(unsupported, datastore, datastore), /fixture unsupported/);
  }
  assert.throws(() => solrFixtureQueueSettings(config, datastore, { manager: new Collection() }), /shared User\/mongodb datastore/);
  config.agendaQueue.jobs = [{ name: 'index', fnName: 'solrsearchservice.solrAddOrUpdate', backend: 'mongodb' }];
  assert.equal(solrFixtureQueueSettings(config, datastore, datastore).collectionName, 'customJobs');
});

test('another real Agenda processor cannot scan or receive notifications for the private fixture name', async () => {
  const s = setup(); const [, { MongoJobRepository }] = await implementations;
  const { JobProcessor } = await import(new URL('JobProcessor.js', pathToFileURL(requireCore.resolve('agenda'))));
  const repo = new MongoJobRepository({ mongo: {} }); repo.collection = s.jobs;
  const scanned = []; const original = repo.getNextJobToRun.bind(repo);
  repo.getNextJobToRun = async (name, ...args) => { scanned.push(name); return original(name, ...args); };
  const agenda = Object.assign(new EventEmitter(), { attrs: {}, db: repo,
    definitions: { 'regular-index': { fn: async () => assert.fail('unrelated handler'), lockLifetime: 10000 } } });
  const processor = new JobProcessor(agenda, 1, 0, 60000);
  try {
    await processor.process();
    const scansBefore = scanned.length;
    await processor.handleNotification({ jobName: s.doc.name, jobId: s.doc._id });
    assert(scansBefore > 0, 'other worker really scanned the shared queue');
    assert.equal(scanned.length, scansBefore, 'unknown-name notification must not initiate a scan');
    assert(scanned.every(name => name === 'regular-index'));
    assert.equal(s.doc.lockedAt, undefined);
    assert.equal(s.lifecycle.admittedCount, 0);
  } finally { processor.stop(); }
});

test('normal real Agenda completion permits final deletion, including a job archived in history', async () => {
  for (const archived of [false, true]) {
    const s = setup(); const w = await worker(s); await w.run();
    assert(s.jobs.docs[0].lastFinishedAt);
    assert.equal(s.lifecycle.admittedCount, 1);
    if (archived) s.history.docs.push(s.jobs.docs.pop());
    await cleanup(s);
    assert.equal(s.present, false);
    assert.deepEqual(s.events, ['worker commit', 'final deletion']);
  }
});

test('cancel/watchdog cannot hide an active handler: cleanup joins its actual promise', async () => {
  const s = setup(); const started = deferred(); const release = deferred();
  s.action = async () => { started.resolve(); await release.promise; s.write(); };
  const w = await worker(s); const run = w.run(); await started.promise;
  w.job.cancel(new Error('watchdog timeout'));
  const cleaning = cleanup(s);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.jobs.docs[0].disabled, true);
  assert.deepEqual(s.events, []);
  release.resolve(); await run; await cleaning;
  assert.equal(s.present, false);
  assert.deepEqual(s.events, ['worker commit', 'final deletion']);
});

test('prefetched claim can enter only after final deletion and cannot write', async () => {
  const s = setup(); const prefetched = await worker(s);
  await cleanup(s);
  await prefetched.run();
  assert.equal(s.lifecycle.admittedCount, 0);
  assert.equal(s.present, false);
  assert.deepEqual(s.events, ['final deletion']);
});

for (const beforeSubmission of [false, true]) {
  test(`delayed old claim predates ${beforeSubmission ? 'submission' : 'observation'}; newer completion does not hide its admitted writer`, async () => {
    const s = setup();
    if (beforeSubmission) s.jobs.docs = [];
    const [, { MongoJobRepository }] = await implementations;
    const repo = new MongoJobRepository({ mongo: {} }); repo.collection = s.jobs;
    const pending = deferred(); const allowClaim = deferred();
    const oldStarted = deferred(); const oldRelease = deferred();
    const claimTime = new Date(); const lockLifetime = 1000;
    s.jobs.beforeClaim = async (_query, update) => {
      assert.equal(Number(update.$set.lockedAt), Number(claimTime));
      pending.resolve(); await allowClaim.promise;
    };
    const oldClaim = repo.getNextJobToRun('index', claimTime, new Date(Number(claimTime) - lockLifetime), claimTime);
    await pending.promise;
    if (beforeSubmission) s.jobs.docs.push(s.doc);
    const pristine = await s.lifecycle.observe(deadline());
    assert.equal(pristine.lockedAt, undefined);
    s.jobs.beforeClaim = undefined; allowClaim.resolve();
    s.action = async job => {
      if (job === old.job) { oldStarted.resolve(); await oldRelease.promise; }
      s.write();
    };
    const old = await worker(s, await oldClaim, lockLifetime);
    const oldRun = old.run(); await oldStarted.promise;
    // Supply the scan's clock directly to the real repository: no elapsed-lock
    // sleep, global clock mock, or heuristic in the implementation under test.
    const now = new Date(Number(claimTime) + lockLifetime + 1);
    const reclaimed = await repo.getNextJobToRun('index', now, new Date(Number(now) - lockLifetime), now);
    assert(reclaimed, 'actual repository must reclaim the delayed expired claim');
    const newer = await worker(s, reclaimed); await newer.run();
    assert(s.jobs.docs[0].lastFinishedAt);
    assert.equal(s.jobs.docs[0].lockedAt, null);
    assert.equal(s.lifecycle.admittedCount, 2);
    const cleaning = cleanup(s);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(s.events, ['worker commit'], 'newer completion must not license deletion');
    oldRelease.resolve(); await oldRun; await cleaning;
    assert.deepEqual(s.events, ['worker commit', 'worker commit', 'final deletion']);
    // An already-prefetched duplicate may enter arbitrarily late as well.
    const late = await worker(s, reclaimed); await late.run();
    assert.equal(s.lifecycle.admittedCount, 2);
    assert.equal(s.present, false);
  });
}

test('Mongo claim in flight across cleanup cannot enter the closed fence', async () => {
  const s = setup(); const [, { MongoJobRepository }] = await implementations;
  const repo = new MongoJobRepository({ mongo: {} }); repo.collection = s.jobs;
  const pending = deferred(); const release = deferred();
  s.jobs.beforeClaim = async () => { pending.resolve(); await release.promise; };
  const claiming = repo.lockJob(s.doc); await pending.promise;
  await cleanup(s); release.resolve();
  assert.equal(await claiming, undefined, 'disable stops an unfulfilled atomic claim');
  assert.deepEqual(s.events, ['final deletion']);
});

test('admission registers before handler invocation, even when cleanup starts in the same turn', async () => {
  const s = setup();
  const pending = s.lifecycle.handler({ attrs: s.doc });
  const cleaning = cleanup(s);
  await pending; await cleaning;
  assert.deepEqual(s.events, ['worker commit', 'final deletion']);
});

test('partial write and rejected handler are joined without skipping final deletion', async () => {
  const s = setup(); s.action = async () => { s.write(); throw new Error('commit failed'); };
  const w = await worker(s); await w.run();
  assert.equal(s.jobs.docs[0].failReason, 'commit failed');
  await cleanup(s);
  assert.equal(s.present, false);
  assert.deepEqual(s.events, ['worker commit', 'final deletion']);
});

test('lost Agenda completion persistence does not lose the actual handler join', async () => {
  const s = setup(); const w = await worker(s);
  const original = w.repo.saveJobState.bind(w.repo); let saves = 0;
  w.repo.saveJobState = async (...args) => {
    if (++saves > 1) throw new Error('completion database unavailable');
    return original(...args);
  };
  await w.run();
  assert.equal(s.jobs.docs[0].lastFinishedAt, null);
  await cleanup(s);
  assert.equal(s.present, false);
});

test('hanging admitted handler times out safely, retaining fixture and permanently closing admission', async () => {
  const s = setup(); const started = deferred(); const release = deferred();
  s.action = async () => { started.resolve(); await release.promise; s.write(); };
  const w = await worker(s); const run = w.run(); await started.promise;
  await assert.rejects(cleanup(s, 25), /core-a\/fixture: cleanup failed; join admitted handlers; Solr fixture retained: deadline exceeded/);
  assert.deepEqual(s.events, []);
  release.resolve(); await run;
  await s.lifecycle.handler({ attrs: s.doc });
  assert.equal(s.lifecycle.admittedCount, 1);
  assert.deepEqual(s.events, ['worker commit'], 'timeout must never schedule a later deletion');
});

test('late submission after timeout still reaches a permanently closed handler', async () => {
  const s = setup(); const submit = deferred(); s.jobs.docs = [];
  await assert.rejects(s.lifecycle.cleanup(submit.promise, deadline(25), () => s.deleteFixture()), /waiting for submission: deadline/);
  s.jobs.docs.push(s.doc); submit.resolve(true);
  const w = await worker(s); await w.run();
  assert.deepEqual(s.events, []);
  assert.equal(s.lifecycle.admittedCount, 0);
});

test('fixture fence rejects unrelated id/core/name and disable touches only the exact fixture', async () => {
  const s = setup();
  const unrelated = [
    { ...structuredClone(s.doc), name: 'other' },
    { ...structuredClone(s.doc), data: { id: 'other', metaMetadata: { searchCore: 'core-a' } } },
    { ...structuredClone(s.doc), data: { id: 'fixture', metaMetadata: { searchCore: 'other' } } }
  ];
  s.jobs.docs.push(...unrelated);
  for (const doc of unrelated) await assert.rejects(s.lifecycle.handler({ attrs: doc }), /unexpected fixture job/);
  await cleanup(s);
  assert.equal(s.doc.disabled, true);
  for (const doc of unrelated) assert.equal(doc.disabled, undefined);
  assert.equal(s.lifecycle.admittedCount, 0);
});

test('unacknowledged submission, hanging disable and deletion errors retain context', async () => {
  const s = setup();
  await assert.rejects(s.lifecycle.cleanup(Promise.resolve(false), deadline(), () => s.deleteFixture()), /submission was not acknowledged/);
  assert.deepEqual(s.events, []);
  const operation = deferred(); s.jobs.updateOne = () => operation.promise;
  await assert.rejects(cleanup(s, 25), /disable fixture job: deadline/);
  operation.resolve({ acknowledged: true }); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(s.events, []);
  const other = setup(); const cause = new Error('Solr unavailable');
  await assert.rejects(other.lifecycle.cleanup(Promise.resolve(true), deadline(), async () => { throw cause; }), error => {
    assert.match(error.message, /core-a\/fixture: cleanup failed; Solr unavailable/);
    assert.equal(error.cause, cause); return true;
  });
});
