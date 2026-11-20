import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';
import sinon from 'sinon';
import { testSiemDestinationRoute } from '../../../src/api-routes/groups/siem';
import type { DeletedRecordModel } from '../../../src/model/storage/DeletedRecordModel';
import type { RecordModel } from '../../../src/model/storage/RecordModel';
import type { RecordSaveResponse } from '../../../src/RecordSaveResponse';
import { BrandingModel } from '../../../src/model/storage/BrandingModel';
import { assertGolden, goldenControls } from './goldenContracts';
import { referenceProductionFixture } from './referenceProductionFixture';
import { wire, session, seedMutationState, type Fixture, type Wire } from './mutationDifferentialSupport';
import { recordMutationRoutes } from '../../../src/http/mutationRoutes';
import { uploadDeclarations } from '../../../src/http/uploadRoutes';
import { formatRecordEntityTag } from '../../../src/RecordEntityTag';
import { getReferenceRepositories } from '../../../src/persistence/reference/runtime';
import { Services as Siem } from '../../../src/integrations/SiemForwarding';
import { observeNoSideEffects, withoutSideEffects } from './noSideEffects';

const family = 'retirementDenials';
const privateTitle = 'private concurrent winner';
const privateAcl = { view: ['different-user'], edit: ['different-user'], viewRoles: [], editRoles: [] };
const auth = { Authorization: 'Bearer pilot-api-token' };
const oid = 'reference-record';
const multipartHeaders = { 'Content-Type': 'multipart/form-data; boundary=retirement-denial' };
const multipartBody =
  '--retirement-denial\r\nContent-Disposition: form-data; name="attachmentFields"; filename="staged.txt"\r\n' +
  'Content-Type: application/octet-stream\r\n\r\nstaged bytes\r\n--retirement-denial--\r\n';

function stable(response: Wire) {
  const headers = { ...response.headers };
  for (const name of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[name];
  if (headers['set-cookie'])
    headers['set-cookie'] = (headers['set-cookie'] as string[]).map(cookie =>
      cookie.replace(/^([^=]+)=[^;]*/, '$1=<session>').replace(/Expires=[^;]+/i, 'Expires=<time>')
    );
  return { ...response, headers };
}
async function strict(f: Fixture) {
  await getReferenceRepositories(f.owner).recordTypes.reviseDefinition('000000000000000000000021', {
    concurrentModification: { mode: 'strict' },
  });
}
function assertRedacted(response: Wire) {
  assert.equal(response.status, 403, response.text);
  assert.equal(response.headers.etag, undefined);
  assert.doesNotMatch(
    response.text,
    /private concurrent winner|different-user|"(?:recordRevision|revision|metadata)"/i
  );
}
function precondition(id: string, revision: number) {
  return { 'If-Match': formatRecordEntityTag(id, revision) };
}

// Interpose at the real storage claim: a winning write advances the revision
// while keeping the original request's in-flight snapshot and precondition.
function activeRace(f: Fixture, observe: sinon.SinonSandbox) {
  const storage = f.data.storage();
  const update = storage.updateMeta.bind(storage);
  let winnerRecord: Awaited<ReturnType<typeof storage.getMeta>>;
  const claim = observe.stub(storage, 'updateMeta').callsFake(async (brand, id, candidate, actor, options) => {
    const previous = await storage.getMeta(id);
    assert(previous);
    const winner = await update(
      brand,
      id,
      { ...previous, metadata: { title: privateTitle }, authorization: privateAcl },
      actor,
      options
    );
    assert.equal(winner.applicationState, 'applied');
    winnerRecord = await storage.getMeta(id);
    assert(winnerRecord);
    const refusal = await update(brand, id, candidate, actor, options);
    assert.equal(refusal.applicationState, 'not-applied');
    assert.equal(refusal.nonApplicationReason, 'stale-revision');
    return refusal;
  });
  return { claim, winner: () => winnerRecord };
}
async function staged(f: Fixture) {
  return Array.from((await f.data.disks.get().stagingDisk().listAll('', { recursive: true })).objects);
}

function losingProjection(f: Fixture, observe: sinon.SinonSandbox, restore: boolean) {
  const records = f.data.records.get();
  let rejected: RecordSaveResponse | undefined;
  const retain = (result: RecordSaveResponse) => {
    assert.equal(result.outcome, 'not-saved');
    result.setProjectedMetadata({ title: privateTitle });
    result.setConcurrencyMetadata({ mode: 'strict', currentRevision: 73 });
    rejected = result;
    return result;
  };
  if (restore) {
    const run = records.restoreRecord.bind(records);
    observe.stub(records, 'restoreRecord').callsFake(async (...args) => retain(await run(...args)));
  } else {
    const run = records.updateMeta.bind(records);
    observe.stub(records, 'updateMeta').callsFake(async (...args) => retain(await run(...args)));
  }
  return (clearConcurrency: boolean) => {
    assert(rejected, 'The real losing save supplied the stale response projection');
    assert.equal(rejected.metadata, null);
    if (clearConcurrency) assert.equal(rejected.concurrency, undefined);
  };
}

const multipartRoute = uploadDeclarations.find(route => route.action === 'addDataStreams')!;
const basePath = '/default/rdmp';

describe('Multipart authorization rechecks on the production host', function () {
  this.timeout(120000);
  for (const version of ['1.0', '2.0']) {
    it(`rejects revoked edit access after staging without dispatch or finalization in API ${version}`, async () => {
      const f = await referenceProductionFixture(true, undefined, undefined, { declarations: [multipartRoute] });
      const observe = sinon.createSandbox();
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const deadline = new AbortController();
      let pending: Promise<Wire> | undefined;
      let effects: Awaited<ReturnType<typeof observeNoSideEffects>> | undefined;
      try {
        const disk = f.data.disks.get().stagingDisk();
        const put = disk.putStream.bind(disk);
        const write = observe.stub(disk, 'putStream').callsFake(async (...args) => {
          const outcome = await put(...args);
          entered.resolve();
          await release.promise;
          return outcome;
        });
        const save = observe.spy(f.data.records.get(), 'updateMeta');
        const finalize = observe.spy(f.data.datastream.get(), 'addDatastreams');
        const stored = f.client.db().collection('record');
        effects = await observeNoSideEffects(f, {
          concurrentWinner: { collection: 'record', oid },
          expectedCalls: { 'staging:putStream': 1, 'staging:delete': 1 },
        });
        pending = wire(
          f.url + basePath + '/api/records/datastreams/' + oid,
          'POST',
          {
            ...auth,
            ...multipartHeaders,
            'X-ReDBox-API-Version': version,
          },
          multipartBody
        );
        await Promise.race([
          entered.promise,
          pending.then(response => assert.fail('Denied before staging: ' + response.text)),
          pause(10000, undefined, { signal: deadline.signal }).then(() => assert.fail('Staging did not complete')),
        ]);
        assert.equal((await staged(f)).length, 1);
        assert.equal(
          (await stored.updateOne({ redboxOid: oid }, { $set: { 'authorization.edit': ['different-user'] } }))
            .modifiedCount,
          1
        );
        const winner = await stored.findOne({ redboxOid: oid });
        assert(winner);
        release.resolve();
        const response = await pending;
        assertRedacted(response);
        await effects.assertNone();
        assert.deepEqual(await stored.findOne({ redboxOid: oid }), winner);
        assert.equal(write.callCount, 1);
        assert.equal(save.callCount, 0);
        assert.equal(finalize.callCount, 0);
        assert.deepEqual(await staged(f), []);
        assertGolden(family, 'multipart-edit-' + version, {
          wire: stable(response),
          state: {
            written: write.callCount,
            saves: save.callCount,
            finalizations: finalize.callCount,
            staged: await staged(f),
          },
        });
      } finally {
        deadline.abort();
        release.resolve();
        await pending?.catch(() => undefined);
        effects?.restore();
        observe.restore();
        await f.close();
      }
    });
    it(`redacts a stale upload claim after view is revoked in API ${version}`, async () => {
      const f = await referenceProductionFixture(true, undefined, undefined, { declarations: [multipartRoute] });
      const observe = sinon.createSandbox();
      try {
        await strict(f);
        const storage = f.data.storage();
        const initial = await storage.getMeta(oid);
        assert(initial);
        const race = activeRace(f, observe);
        const assertProjectionCleared = losingProjection(f, observe, false);
        const finalize = observe.spy(f.data.datastream.get(), 'addDatastreams');
        const response = await withoutSideEffects(
          f,
          () =>
            wire(
              f.url + basePath + '/api/records/datastreams/' + oid,
              'POST',
              {
                ...auth,
                ...multipartHeaders,
                ...precondition(oid, initial.revision!),
                'X-ReDBox-API-Version': version,
              },
              multipartBody
            ),
          {
            concurrentWinner: { collection: 'record', oid },
            expectedCalls: {
              'staging:putStream': 1,
              'staging:delete': 1,
              'record:updateMeta': 1,
              'storage:updateMeta': 1,
            },
          }
        );
        assertRedacted(response);
        assertProjectionCleared(false);
        assert.equal(race.claim.callCount, 1);
        assert.equal(finalize.callCount, 0);
        assert.deepEqual(await staged(f), []);
        const latest = await storage.getMeta(oid);
        assert(latest);
        assert.deepEqual(latest, race.winner());
        assert.deepEqual(latest.metadata, { title: privateTitle });
        assert.deepEqual(latest.authorization, privateAcl);
        assert.equal(latest.revision, initial.revision! + 1);
        assertGolden(family, 'multipart-view-' + version, {
          wire: stable(response),
          state: {
            claims: race.claim.callCount,
            finalizations: finalize.callCount,
            staged: await staged(f),
            metadata: latest.metadata,
            acl: latest.authorization,
          },
        });
      } finally {
        observe.restore();
        await f.close();
      }
    });
  }
});

describe('Mutation conflict redaction on the production host', function () {
  this.timeout(120000);
  for (const version of ['1.0', '2.0'])
    for (const action of ['updateMeta', 'restoreRecord'] as const)
      it(`redacts ${action} when a concurrent winner revokes view in API ${version}`, async () => {
        const route = recordMutationRoutes.find(route => route.action === action && route.path.includes('/api/'))!;
        const f = await referenceProductionFixture(true, undefined, undefined, { declarations: [route] });
        const observe = sinon.createSandbox();
        try {
          await seedMutationState(f, await session(f));
          await strict(f);
          const storage = f.data.storage();
          const deleted = action === 'restoreRecord';
          const id = deleted ? 'deleted-record' : oid;
          const brand = Object.assign(new BrandingModel(), f.brand);
          const previous = deleted ? await storage.getTombstone!(brand, id) : await storage.getMeta(id);
          assert(previous);
          const restore = storage.updateTombstone!.bind(storage);
          const race =
            action === 'updateMeta'
              ? activeRace(f, observe)
              : (() => {
                  let winningTombstone: DeletedRecordModel | null;
                  const claim = observe
                    .stub(storage, 'updateTombstone')
                    .callsFake(async (targetBrand, targetId, candidate, options) => {
                      const tombstone = await storage.getTombstone!(brand, id);
                      assert(tombstone?.lifecycleOperation);
                      const winner = await restore(
                        targetBrand,
                        targetId,
                        {
                          lifecycleState: 'deleted',
                          lifecycleOperation: {
                            ...tombstone.lifecycleOperation,
                            targetRevision: tombstone.revision + 1,
                          },
                          deletedRecordMetadata: {
                            ...tombstone.deletedRecordMetadata,
                            metadata: { title: privateTitle },
                            authorization: privateAcl,
                          },
                        },
                        options
                      );
                      assert.equal(winner.applicationState, 'applied');
                      winningTombstone = await storage.getTombstone!(brand, id);
                      assert(winningTombstone);
                      const refusal = await restore(targetBrand, targetId, candidate, options);
                      assert.equal(refusal.applicationState, 'not-applied');
                      assert.equal(refusal.nonApplicationReason, 'stale-revision');
                      return refusal;
                    });
                  return { claim, winner: () => winningTombstone };
                })();
          const path = route.path.replace('/:branding/:portal', basePath).replace(':oid', id);
          const schemaAttempts = f.client.db().collection('recordschemareference');
          // Strict schema resolution precedes the losing storage claim.
          const schemaFilter = { oid: id, kind: 'grant', operation: 'strict-all' };
          const previousSchemaAttempts = await schemaAttempts.countDocuments(schemaFilter);
          const assertProjectionCleared = losingProjection(f, observe, deleted);
          const response = await withoutSideEffects(
            f,
            () =>
              wire(
                f.url + path,
                route.method.toUpperCase(),
                {
                  ...auth,
                  ...precondition(id, previous.revision!),
                  'X-ReDBox-API-Version': version,
                  'Content-Type': 'application/json',
                },
                JSON.stringify({ title: 'losing mutation' })
              ),
            {
              concurrentWinner: { collection: deleted ? 'deletedrecord' : 'record', oid: id },
              expectedStrictSchemaGrant: deleted ? undefined : id,
              expectedCalls: deleted
                ? { 'record:restoreRecord': 1, 'storage:updateTombstone': 1 }
                : { 'record:updateMeta': 1, 'storage:updateMeta': 1 },
            }
          );
          assertRedacted(response);
          assertProjectionCleared(true);
          assert.equal(await schemaAttempts.countDocuments(schemaFilter), previousSchemaAttempts + (deleted ? 0 : 1));
          assert.equal(race.claim.callCount, 1);
          const latest = deleted ? await storage.getTombstone!(brand, id) : await storage.getMeta(id);
          assert(latest);
          assert.deepEqual(latest, race.winner());
          const snapshot = deleted ? (latest as DeletedRecordModel).deletedRecordMetadata : (latest as RecordModel);
          assert.deepEqual(snapshot.metadata, { title: privateTitle });
          assert.deepEqual(snapshot.authorization, privateAcl);
          assert.equal(latest.revision, previous.revision! + 1);
          if (deleted) {
            assert.equal((latest as DeletedRecordModel).lifecycleState, 'deleted');
            assert.equal(await storage.getMeta(id), undefined);
          }
          assertGolden(family, `${action}-${version}`, {
            wire: stable(response),
            state: {
              claims: race.claim.callCount,
              metadata: snapshot.metadata,
              acl: snapshot.authorization,
              revisionIncrement: latest.revision! - previous.revision!,
            },
          });
        } finally {
          observe.restore();
          await f.close();
        }
      });
});

const destination = {
  id: 'fixture',
  enabled: false,
  endpointUrl: 'https://collector.example.invalid/ingest',
  adapterType: 'splunk-hec-json',
  token: 'fixture-private-token',
  password: 'fixture-private-password',
  headers: { 'X-Api-Key': 'fixture-private-key' },
};
const masked = {
  ...destination,
  token: '__REDACTED__',
  password: '__REDACTED__',
  headers: { 'x-api-key': '__REDACTED__', 'X-Missing': '__REDACTED__', 'X-Trace': 'retirement-denial' },
};
const changedTargets = {
  'unknown ID': { id: 'not-configured' },
  'changed URL': { endpointUrl: 'https://different.example.invalid/ingest' },
  'changed query': { endpointUrl: destination.endpointUrl + '?new=target' },
  'changed adapter': { adapterType: 'leef' },
};
describe('SIEM destination authorization on the production host', function () {
  this.timeout(120000);
  let f: Fixture;
  before(async () => {
    f = await referenceProductionFixture(true, undefined, undefined, {
      declarations: [testSiemDestinationRoute],
      configuration: { brandingConfigurationDefaults: { siem: { enabled: true, destinations: [destination] } } },
    });
  });
  after(async () => f?.close());
  async function send(proposed: typeof masked, version: string) {
    return wire(
      f.url + basePath + '/api/siem/test',
      'POST',
      {
        ...auth,
        'Content-Type': 'application/json',
        'X-ReDBox-API-Version': version,
      },
      JSON.stringify({ destination: proposed })
    );
  }
  for (const version of ['1.0', '2.0']) {
    for (const [name, change] of Object.entries(changedTargets))
      it(`rejects a SIEM test with ${name} before forwarding in API ${version}`, async () => {
        const forward = sinon
          .stub(Siem.SiemForwardingService.prototype, 'testDestination')
          .resolves({ status: 'success' });
        try {
          const response = await withoutSideEffects(f, () => send({ ...masked, ...change }, version));
          assert.equal(response.status, 400, response.text);
          assert.equal(forward.callCount, 0);
          assertGolden(family, `siem-${version}-${name}`, { wire: stable(response), calls: forward.callCount });
        } finally {
          forward.restore();
        }
      });
    for (const kind of ['same target', 'echoed diagnostic', 'thrown diagnostic'] as const)
      it(`handles SIEM ${kind} with scoped masks and redacted diagnostics in API ${version}`, async () => {
        const forward = sinon.stub(Siem.SiemForwardingService.prototype, 'testDestination');
        const privateDiagnostic = 'fixture-private-token fixture-private-password fixture-private-key';
        if (kind === 'same target') forward.resolves({ status: 'success', httpStatusCode: 200 });
        else if (kind === 'echoed diagnostic')
          forward.resolves({ status: 'failed', errorSummary: { message: privateDiagnostic } });
        else forward.rejects(new Error(privateDiagnostic));
        try {
          const response =
            kind === 'thrown diagnostic'
              ? await withoutSideEffects(f, () => send(masked, version))
              : await send(masked, version);
          assert.equal(response.status, kind === 'thrown diagnostic' ? 400 : 200, response.text);
          assert.equal(forward.callCount, 1);
          const resolved = forward.firstCall.args[0].destination;
          assert.deepEqual(resolved.headers, { 'x-api-key': 'fixture-private-key', 'X-Trace': 'retirement-denial' });
          assert.equal(resolved.token, destination.token);
          assert.equal(resolved.password, destination.password);
          assert.equal(resolved.endpointUrl, destination.endpointUrl);
          assert.doesNotMatch(response.text, /fixture-private-/);
          assertGolden(family, `siem-${version}-${kind}`, {
            wire: stable(response),
            calls: JSON.parse(JSON.stringify(forward.firstCall.args)),
          });
        } finally {
          forward.restore();
        }
      });
  }
});

goldenControls(family);
