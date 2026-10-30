'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { RegistryWatermark, DistributionWatermarkStore, markerManifest, MARKER, PREFIX, MEDIA } = require('./registry-watermark.cjs');
const { sha256 } = require('./candidates.cjs');
const repository = 'registry.example/team/portal';
const reservation = (pipeline = 20, attempt = 1, fingerprint = sha256(`${pipeline}/${attempt}`)) => ({
  identity: { revision: 'a'.repeat(40), workflow: `workflow-${pipeline}-${attempt}`, pipeline, attempt },
  fingerprint, destinations: ['develop', 'develop-pdfgen'],
});

// Distribution semantics: tag GET/PUT, paginated inventory, immutable reservation
// tags, read-after-write visibility. Not a CAS API or a fencing service.
function fixture() {
  const manifests = new Map([[MARKER, markerManifest(repository)]]), calls = [];
  const state = { pageSize: 2 };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const path = new URL(url);
    if (state.status) return new Response('', { status: state.status });
    if (path.pathname.endsWith('/tags/list')) {
      const sorted = [...manifests.keys()].sort();
      const last = path.searchParams.get('last');
      const start = last ? sorted.indexOf(last) + 1 : 0;
      const tags = sorted.slice(start, start + state.pageSize);
      const next = start + state.pageSize < sorted.length;
      return new Response(JSON.stringify({ name: 'team/portal', tags }), { status: 200, headers: next ? {
        Link: `</v2/team/portal/tags/list?n=2&last=${tags.at(-1)}>; rel="next"`,
      } : {} });
    }
    const tag = path.pathname.split('/').at(-1);
    if (options.method === 'PUT') {
      if (state.beforePut) await state.beforePut(tag, options.body);
      if (state.immutable && manifests.has(tag)) return new Response('', { status: 409 });
      if (manifests.has(tag) && manifests.get(tag) !== options.body) return new Response('', { status: 409 });
      manifests.set(tag, options.body);
      return new Response('', { status: 201, headers: { 'Docker-Content-Digest': sha256(options.body) } });
    }
    if (!manifests.has(tag)) return new Response('', { status: 404 });
    const body = manifests.get(tag);
    return new Response(body, { status: 200, headers: {
      'Content-Type': MEDIA, 'Docker-Content-Digest': state.badDigest ? sha256('wrong bytes') : sha256(body),
    } });
  };
  const store = new DistributionWatermarkStore({ origin: 'https://registry.example', repositoryPath: 'team/portal',
    authorization: 'Bearer test-only', fetch });
  const journal = () => new RegistryWatermark({ repository, store });
  return { manifests, store, journal, calls, state };
}

test('append-only reservations survive failed publications/restarted executors and reject stale idle reruns', async () => {
  const f = fixture();
  await f.journal().recordReservation(reservation(21, 2));
  f.state.immutable = true;
  // No completion is required: the high-water reservation remains after a crash.
  for (const older of [reservation(20, 99), reservation(21, 1)]) {
    await assert.rejects(f.journal().recordReservation(older), /stale/);
  }
  await f.journal().recordReservation(reservation(21, 2));
  assert.equal((await f.journal().read()).destinations.develop.identity.pipeline, 21);
  await assert.rejects(f.journal().recordReservation(reservation(21, 2, sha256('changed catalog'))), /fingerprint/);
  const rerun = reservation(21, 2);
  rerun.identity.workflow = 'full-rerun-different-workflow';
  await assert.rejects(f.journal().recordReservation(rerun), /workflow changed/);
  assert.ok(f.calls.every(({ options }) => !['DELETE', 'PATCH'].includes(options.method)));
});

test('all destinations must pass before appending a reservation; manual workflows share the same namespace', async () => {
  const f = fixture();
  await f.journal().recordReservation({ ...reservation(30), destinations: ['develop-pdfgen'] });
  const count = f.manifests.size;
  await assert.rejects(f.journal().recordReservation(reservation(20)), /stale/);
  assert.equal(f.manifests.size, count);
  await f.journal().recordReservation({ ...reservation(10), destinations: ['develop'] });
  // A new/manual publisher instance sees exactly the same durable high-water state.
  await assert.rejects(f.journal().recordReservation(reservation(29)), /stale/);
});

test('registry inventory is paginated and each record is verified against its content-derived tag', async () => {
  const f = fixture();
  for (let i = 20; i < 26; i++) await f.journal().recordReservation(reservation(i));
  const state = await f.journal().read();
  assert.equal(state.records.length, 6);
  assert.equal(state.destinations.develop.identity.pipeline, 25);
  assert.ok(f.calls.some(({ url }) => url.includes('&last=')));
  assert.ok(f.calls.every(({ options }) => options.headers.Authorization === 'Bearer test-only' && options.redirect === 'error'));
  const tag = [...f.manifests.keys()].find(tag => tag !== MARKER);
  f.manifests.set(tag, markerManifest('registry.example/foreign/repo'));
  await assert.rejects(f.journal().read(), /watermark/);
});

test('missing, corrupt, or unavailable state never resets ordering or initializes itself', async () => {
  for (const mutate of [
    f => f.manifests.clear(),
    f => f.manifests.set(MARKER, markerManifest('registry.example/wrong/repository')),
    f => f.manifests.set(`${PREFIX}bad`, '{}'),
    f => { f.state.badDigest = true; },
    f => { f.state.status = 404; },
    f => { f.state.status = 401; },
    f => { f.state.status = 429; },
    f => { f.state.status = 500; },
  ]) {
    const f = fixture(); mutate(f);
    await assert.rejects(f.journal().recordReservation(reservation()));
    assert.equal(f.calls.filter(({ options }) => options.method === 'PUT').length, 0);
  }
});

test('delayed lower reservation cannot roll back durable high-water state', async () => {
  const f = fixture();
  let release, entered;
  const blocked = new Promise(resolve => { release = resolve; });
  const waiting = new Promise(resolve => { entered = resolve; });
  f.state.beforePut = async tag => {
    if (tag.startsWith(`${PREFIX}20-`)) { entered(); await blocked; }
  };
  const older = f.journal().recordReservation(reservation(20));
  const rejectedOlder = assert.rejects(older, /stale/);
  await waiting;
  await f.journal().recordReservation(reservation(21));
  release();
  await rejectedOlder;
  assert.equal((await f.journal().read()).destinations.develop.identity.pipeline, 21);
  assert.equal((await f.journal().read()).records.length, 2);
});

test('concurrent conflicting reruns fail closed instead of silently choosing a fingerprint', async () => {
  const f = fixture();
  let entered, release;
  const waiting = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  const first = reservation(20, 1), second = reservation(20, 1, sha256('rebuilt rerun'));
  f.state.beforePut = async (tag, bytes) => {
    if (bytes.includes(first.fingerprint)) { entered(); await blocked; }
  };
  const pending = f.journal().recordReservation(first);
  const rejected = assert.rejects(pending, /conflicting/);
  await waiting;
  await f.journal().recordReservation(second);
  release();
  await rejected;
  await assert.rejects(f.journal().read(), /conflicting/);
});

test('counterexample: serial-group cancellation plus durable watermark and fresh Git cannot fence an in-flight final-tag PUT', async () => {
  const f = fixture();
  let releaseOldPUT, accepted;
  const waiting = new Promise(resolve => { accepted = resolve; });
  const inFlight = new Promise(resolve => { releaseOldPUT = resolve; });
  let destination;
  const gitHead = 'a'.repeat(40); // Both pipelines build the SAME still-current revision.
  await f.journal().recordReservation(reservation(20));
  assert.equal(reservation(20).identity.revision, gitHead);
  const oldRegistryWrite = (async () => {
    accepted();
    await inFlight; // Registry accepted the request before CircleCI canceled the job.
    destination = 'older-index';
  })();
  await waiting;
  // Documented serial-group behavior: cancellation releases the group. Nothing
  // in OCI Distribution makes a client's disconnect undo an accepted request.
  await f.journal().recordReservation(reservation(21));
  assert.equal(reservation(21).identity.revision, gitHead);
  destination = 'newer-index';
  releaseOldPUT();
  await oldRegistryWrite;
  assert.equal((await f.journal().read()).destinations.develop.identity.pipeline, 21);
  assert.equal(destination, 'older-index'); // Unsafe design demonstrated, not endorsed.
  assert.equal(typeof f.journal().withExclusive, 'undefined');
});

test('registry adapter rejects escaped pagination, digest substitution and bootstrap writes', async () => {
  for (const link of [
    '<https://evil.example/v2/team/portal/tags/list>; rel="next"',
    '</v2/other/repo/tags/list>; rel="next"',
    '</v2/team/portal/tags/list?n=100>; rel="next"', // repeats initial page
  ]) {
    const store = new DistributionWatermarkStore({ origin: 'https://registry.example', repositoryPath: 'team/portal',
      fetch: async () => new Response('{"tags":[]}', { headers: { Link: link } }) });
    await assert.rejects(store.listTags(), /pagination/);
  }
  const f = fixture();
  await assert.rejects(f.store.putManifest(MARKER, markerManifest(repository)), /only immutable/);
  await assert.rejects(f.store.putManifest('develop', '{}'), /only immutable/);
  const store = new DistributionWatermarkStore({ origin: 'https://registry.example', repositoryPath: 'team/portal',
    fetch: async () => new Response('', { status: 201, headers: { 'Docker-Content-Digest': sha256('wrong') } }) });
  await assert.rejects(store.putManifest(`${PREFIX}test`, '{}'), /exact watermark digest/);
});
