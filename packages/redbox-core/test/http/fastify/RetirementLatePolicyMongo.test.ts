import assert from 'node:assert/strict';
import sinon from 'sinon';
import { removeUserEditRoute } from '../../../src/api-routes/groups/records';
import type { DeletedRecordModel } from '../../../src/model/storage/DeletedRecordModel';
import { BrandingModel } from '../../../src/model/storage/BrandingModel';
import { assertGolden, goldenControls } from './goldenContracts';
import { referenceProductionFixture } from './referenceProductionFixture';
import { wire, session, seedMutationState, type Fixture, type Wire } from './mutationDifferentialSupport';
import { recordMutationRoutes } from '../../../src/http/mutationRoutes';
import { uploadDeclarations } from '../../../src/http/uploadRoutes';
import { formatRecordEntityTag } from '../../../src/RecordEntityTag';
import { getReferenceRepositories } from '../../../src/persistence/reference/runtime';
import { withoutSideEffects } from './noSideEffects';

const family = 'retirementLatePolicy';
const visibleTitle = 'visible concurrent winner';
const visibleAcl = { view: ['pilot-admin'], edit: ['different-user'], viewRoles: [], editRoles: [] };
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
  const text = response.text.replace(
    /("requestId":")[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}(?=")/g,
    (_match, field: string) => field + '00000000-0000-0000-0000-000000000000'
  );
  return { ...response, headers, text };
}
async function strict(f: Fixture) {
  await getReferenceRepositories(f.owner).recordTypes.reviseDefinition('000000000000000000000021', {
    concurrentModification: { mode: 'strict' },
  });
}
function assertEditRevoked(response: Wire, version: string, id: string, revision: number) {
  assert.equal(response.status, version === '1.0' ? 500 : 403, response.text);
  assert.equal(response.headers.etag, formatRecordEntityTag(id, revision));
  if (version === '2.0') {
    const body = JSON.parse(response.text);
    assert.equal(body.errors[0].code, 'record-validation-edit-unauthorized');
    assert.deepEqual(body.meta.metadata, { title: visibleTitle });
  }
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
      { ...previous, metadata: { title: visibleTitle }, authorization: visibleAcl },
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

const multipartRoute = uploadDeclarations.find(route => route.action === 'addDataStreams')!;
const basePath = '/default/rdmp';

describe('Multipart authorization rechecks on the production host', function () {
  this.timeout(120000);
  for (const version of ['1.0', '2.0']) {
    it(`reclassifies a stale upload claim after only edit permission is lost in API ${version}`, async () => {
      const f = await referenceProductionFixture(true, undefined, undefined, { declarations: [multipartRoute] });
      const observe = sinon.createSandbox();
      try {
        await strict(f);
        const storage = f.data.storage();
        const initial = await storage.getMeta(oid);
        assert(initial);
        const race = activeRace(f, observe);
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
        assertEditRevoked(response, version, oid, initial.revision! + 1);
        assert.equal(race.claim.callCount, 1);
        assert.equal(finalize.callCount, 0);
        assert.deepEqual(await staged(f), []);
        const latest = await storage.getMeta(oid);
        assert(latest);
        assert.deepEqual(latest, race.winner());
        assert.deepEqual(latest.metadata, { title: visibleTitle });
        assert.deepEqual(latest.authorization, visibleAcl);
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
    for (const action of ['restoreRecord'] as const)
      it(`reclassifies ${action} when a concurrent winner revokes only edit permission in API ${version}`, async () => {
        const route = recordMutationRoutes.find(route => route.action === action && route.path.includes('/api/'))!;
        const f = await referenceProductionFixture(true, undefined, undefined, { declarations: [route] });
        const observe = sinon.createSandbox();
        try {
          await seedMutationState(f, await session(f));
          await strict(f);
          const storage = f.data.storage();
          const id = 'deleted-record';
          const brand = Object.assign(new BrandingModel(), f.brand);
          const previous = await storage.getTombstone!(brand, id);
          assert(previous);
          const restore = storage.updateTombstone!.bind(storage);
          const race = (() => {
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
                      metadata: { title: visibleTitle },
                      authorization: visibleAcl,
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
              concurrentWinner: { collection: 'deletedrecord', oid: id },
              expectedCalls: { 'record:restoreRecord': 1, 'storage:updateTombstone': 1 },
            }
          );
          assertEditRevoked(response, version, id, previous.revision + 1);
          assert.equal(race.claim.callCount, 1);
          const latest = await storage.getTombstone!(brand, id);
          assert(latest);
          assert.deepEqual(latest, race.winner());
          const snapshot = latest.deletedRecordMetadata;
          assert.deepEqual(snapshot.metadata, { title: visibleTitle });
          assert.deepEqual(snapshot.authorization, visibleAcl);
          assert.equal(latest.revision, previous.revision + 1);
          assert.equal(latest.lifecycleState, 'deleted');
          assert.equal(await storage.getMeta(id), undefined);
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

describe('Permissions response authorization on the production host', function () {
  this.timeout(120000);
  for (const version of ['1.0', '2.0'])
    it(`withholds the updated ACL when the caller removed their last effective permission in API ${version}`, async () => {
      const f = await referenceProductionFixture(true, undefined, undefined, { declarations: [removeUserEditRoute] });
      try {
        const store = f.client.db().collection('record');
        const before = await store.findOne({ redboxOid: oid });
        assert(before);
        const acl = { view: ['private-user'], edit: ['pilot-admin'], viewRoles: [], editRoles: [] };
        assert.equal((await store.updateOne({ redboxOid: oid }, { $set: { authorization: acl } })).modifiedCount, 1);
        const response = await wire(
          f.url + basePath + '/api/records/permissions/edit/' + oid,
          'DELETE',
          {
            ...auth,
            'Content-Type': 'application/json',
            'X-ReDBox-API-Version': version,
          },
          JSON.stringify({ users: ['pilot-admin'] })
        );
        assert.equal(response.status, 200, response.text);
        const committed = await store.findOne({ redboxOid: oid });
        assert(committed);
        assert.deepEqual(committed.authorization, { ...acl, edit: [], editPending: null, viewPending: null });
        assert.deepEqual(committed.metadata, before.metadata);
        assert.equal(committed.revision, before.revision + 1);
        assert.equal(response.headers.etag, formatRecordEntityTag(oid, committed.revision));
        const body = JSON.parse(response.text);
        assert.equal(version === '1.0' ? body : body.data, null);
        assert.doesNotMatch(response.text, /private-user/);
        assertGolden(family, `permission-redaction/${version}`, {
          wire: stable(response),
          state: {
            revision: committed.revision,
            metadata: committed.metadata,
            authorization: committed.authorization,
          },
        });
      } finally {
        await f.close();
      }
    });
});
goldenControls(family);
