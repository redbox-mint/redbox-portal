'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { FilesystemCoordinator } = require('./coordinator.cjs');
const { sha256 } = require('./candidates.cjs');

const repository = 'example.invalid/team/portal';
const order = (pipeline = 10, attempt = 1) => ({ revision: 'a'.repeat(40), pipeline, workflow: `workflow-${pipeline}`, attempt });
const reservation = (pipeline = 10, attempt = 1, fingerprint = sha256(`${pipeline}/${attempt}`)) => ({
  identity: order(pipeline, attempt), fingerprint, destinations: ['develop', 'develop-pdfgen'],
});
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'redbox-promotion-state-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, coordinator: new FilesystemCoordinator({ root, scope: 'shared-posix' }) };
}

test('requires explicit shared POSIX scope; an executor-local path is never silently selected', () => {
  assert.throws(() => new FilesystemCoordinator({ root: '/tmp/a' }), /shared-posix/);
  assert.throws(() => new FilesystemCoordinator({ root: './relative', scope: 'shared-posix' }), /absolute root/);
});

test('atomic exclusive directory excludes an overlapping independent coordinator instance', async t => {
  const { root, coordinator } = await setup(t);
  const other = new FilesystemCoordinator({ root, scope: 'shared-posix' });
  await coordinator.withExclusive(repository, async lease => {
    await lease.assertHeld();
    await assert.rejects(other.withExclusive(repository, async () => assert.fail('must not enter')), /lock is held/);
    await lease.reserve(reservation());
  });
  await other.withExclusive(repository, async lease => lease.assertHeld());
});

test('reservation survives failed publishing and process-instance replacement; older source/rerun is blocked', async t => {
  const { root, coordinator } = await setup(t);
  await assert.rejects(coordinator.withExclusive(repository, async lease => {
    await lease.reserve(reservation(11, 2));
    throw new Error('registry unavailable');
  }), /registry unavailable/);
  const restarted = new FilesystemCoordinator({ root, scope: 'shared-posix' });
  for (const old of [reservation(10, 9), reservation(11, 1)]) {
    await assert.rejects(restarted.withExclusive(repository, async lease => lease.reserve(old)), /stale/);
  }
  await restarted.withExclusive(repository, async lease => {
    const same = reservation(11, 2);
    await lease.reserve(same);
    await lease.complete({ identity: same.identity, fingerprint: same.fingerprint, manifests: [] });
  });
  const state = JSON.parse(await fs.readFile(path.join(root, `${sha256(repository).slice(7)}.json`)));
  assert.equal(state.destinations.develop.status, 'complete');
  assert.equal(state.destinations['develop-pdfgen'].identity.attempt, 2);
  assert.equal(state.lastReceipt.fingerprint, reservation(11, 2).fingerprint);
});

test('same-order fingerprint substitution and unreserved completion fail closed', async t => {
  const { coordinator } = await setup(t);
  await coordinator.withExclusive(repository, async lease => lease.reserve(reservation()));
  await assert.rejects(coordinator.withExclusive(repository, async lease =>
    lease.reserve(reservation(10, 1, sha256('changed artifacts')))), /fingerprint changed/);
  await assert.rejects(coordinator.withExclusive(repository, async lease => lease.complete({})), /reservation/);
});

test('multi-destination high-water reservation is all or nothing', async t => {
  const { coordinator } = await setup(t);
  await coordinator.withExclusive(repository, async lease => lease.reserve({ ...reservation(20), destinations: ['develop-pdfgen'] }));
  await assert.rejects(coordinator.withExclusive(repository, async lease => lease.reserve(reservation(10))), /stale/);
  // The failed two-tag reservation did not accidentally advance develop to 10.
  await coordinator.withExclusive(repository, async lease => lease.reserve({ ...reservation(5), destinations: ['develop'] }));
});

test('an abandoned lock or corrupt state is not reset to allow publication', async t => {
  const { root, coordinator } = await setup(t);
  const key = sha256(repository).slice(7);
  const lock = path.join(root, `${key}.lock`);
  await fs.mkdir(lock);
  await assert.rejects(coordinator.withExclusive(repository, async () => {}), /crashed/);
  // Test setup simulates an operator recovery ONLY after no publisher can still be alive.
  await fs.rm(lock, { recursive: true });
  await fs.writeFile(path.join(root, `${key}.json`), 'corrupt state');
  await assert.rejects(coordinator.withExclusive(repository, async () => assert.fail('must not enter')), /Unexpected token/);
});

test('malformed durable destination records fail before any publisher enters', async t => {
  const { root, coordinator } = await setup(t);
  const file = path.join(root, `${sha256(repository).slice(7)}.json`);
  for (const destinations of [[], { develop: null }, { develop: { identity: order(), fingerprint: 'bad', status: 'complete' } },
    { develop: { identity: order(), fingerprint: sha256('ok'), status: 'unknown' } }]) {
    await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, repository, destinations }));
    await assert.rejects(coordinator.withExclusive(repository, async () => assert.fail('must not enter')), /invalid durable promotion state/);
  }
  for (const badIdentity of [{ ...order(), revision: ['a'.repeat(40)] }, { ...order(), workflow: ['workflow-10'] }]) {
    await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, repository, destinations: {
      develop: { identity: badIdentity, fingerprint: sha256('ok'), status: 'complete' },
    } }));
    await assert.rejects(coordinator.withExclusive(repository, async () => assert.fail('must not enter')), /revision|workflow/);
  }
  await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, repository, destinations: {
    develop: { identity: order(), fingerprint: [sha256('ok')], status: 'complete' },
  } }));
  await assert.rejects(coordinator.withExclusive(repository, async () => assert.fail('must not enter')), /invalid durable promotion state/);
  await fs.unlink(file);
  await assert.rejects(coordinator.withExclusive(repository, lease => lease.reserve({ ...reservation(), fingerprint: [sha256('ok')] })), /invalid promotion reservation/);
});
