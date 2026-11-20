import assert from 'node:assert/strict';
import sinon from 'sinon';
import { createRecordRoute } from '../../../src/api-routes/groups/records';
import { BrandingModel } from '../../../src/model/storage/BrandingModel';
import { uploadDeclarations } from '../../../src/http/uploadRoutes';
import { getReferenceRepositories } from '../../../src/persistence/reference/runtime';
import { formatRecordEntityTag } from '../../../src/RecordEntityTag';
import { referenceProductionFixture } from './referenceProductionFixture';
import {
  wire,
  session,
  seedMutationState,
  settleMutationWork,
  normalizeMutation,
  type Wire,
} from './mutationDifferentialSupport';
import { assertGolden, goldenControls } from './goldenContracts';
import { withoutSideEffects } from './noSideEffects';

const family = 'retirementRecordBoundary';
const auth = { Authorization: 'Bearer pilot-api-token' };
function stable(response: Wire) {
  const headers = { ...response.headers };
  for (const name of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[name];
  return { ...response, headers };
}

describe('Multipart conflict recovery isolates tenant records on the production host', function () {
  this.timeout(120000);
  for (const version of ['1.0', '2.0'])
    for (const target of ['active', 'deleted'] as const)
      it(`does not project a foreign ${target} record after a stale claim in API ${version}`, async () => {
        const route = uploadDeclarations.find(r => r.action === 'addDataStreams')!;
        const f = await referenceProductionFixture(true, undefined, undefined, { declarations: [route] });
        const observe = sinon.createSandbox();
        const oid = 'reference-record';
        try {
          await seedMutationState(f, await session(f));
          await getReferenceRepositories(f.owner).recordTypes.reviseDefinition('000000000000000000000021', {
            concurrentModification: { mode: 'strict' },
          });
          const storage = f.data.storage();
          const database = f.client.db();
          // Strict schema resolution precedes the losing storage claim.
          const grants = database.collection('recordschemareference');
          const schemaFilter = { oid, kind: 'grant', operation: 'strict-all' };
          const previousGrants = await grants.countDocuments(schemaFilter);
          const initial = await storage.getMeta(oid);
          assert(initial);
          const update = storage.updateMeta.bind(storage);
          const brand = Object.assign(new BrandingModel(), f.brand);
          const recovery = target === 'deleted' ? await storage.getTombstone!(brand, 'deleted-record') : undefined;
          if (target === 'deleted') assert(recovery);
          const privateMetadata = { title: 'never-project-foreign-tenant' };
          const finalize = observe.spy(f.data.datastream.get(), 'addDatastreams');
          let fallback: sinon.SinonSpy | undefined;
          const claim = observe
            .stub(storage, 'updateMeta')
            .callsFake(async (current, id, candidate, actor, options) => {
              assert.equal(id, oid);
              const winner = await update(current, id, { ...initial, metadata: privateMetadata }, actor, options);
              assert.equal(winner.applicationState, 'applied');
              const refusal = await update(current, id, candidate, actor, options);
              assert.equal(refusal.applicationState, 'not-applied');
              assert.equal(refusal.nonApplicationReason, 'stale-revision');
              // Simulate the conflicting snapshot crossing the storage boundary from
              // a changed tenant or a wrong-tenant recovery result. The route must
              // independently recheck the stored record's tenant before projection.
              if (target === 'active') {
                assert.equal(
                  (
                    await database
                      .collection('record')
                      .updateOne({ redboxOid: oid }, { $set: { 'metaMetadata.brandId': f.otherBrand.id } })
                  ).modifiedCount,
                  1
                );
                fallback = observe.spy(storage, 'getTombstone');
              } else {
                assert.equal((await database.collection('record').deleteOne({ redboxOid: oid })).deletedCount, 1);
                fallback = observe
                  .stub(storage, 'getTombstone')
                  .withArgs(sinon.match.has('id', f.brand.id), oid)
                  .resolves({
                    ...recovery!,
                    deletedRecordMetadata: {
                      ...recovery!.deletedRecordMetadata,
                      metadata: privateMetadata,
                      metaMetadata: { ...recovery!.deletedRecordMetadata.metaMetadata, brandId: f.otherBrand.id },
                    },
                  });
              }
              return refusal;
            });
          const response = await withoutSideEffects(
            f,
            () =>
              wire(
                f.url + '/default/rdmp/api/records/datastreams/' + oid,
                'POST',
                {
                  ...auth,
                  'If-Match': formatRecordEntityTag(oid, initial.revision!),
                  'X-ReDBox-API-Version': version,
                  'Content-Type': 'multipart/form-data; boundary=tenant-projection',
                },
                '--tenant-projection\r\nContent-Disposition: form-data; name="attachmentFields"; filename="staged.txt"\r\n' +
                  'Content-Type: application/octet-stream\r\n\r\nstaged data\r\n--tenant-projection--\r\n'
              ),
            {
              concurrentWinner: { collection: 'record', oid },
              expectedStrictSchemaGrant: oid,
              expectedCalls: {
                'staging:putStream': 1,
                'staging:delete': 1,
                'record:updateMeta': 1,
                'storage:updateMeta': 1,
              },
            }
          );
          assert.equal(response.status, 403, response.text);
          assert.equal(response.headers.etag, undefined);
          assert.doesNotMatch(response.text, /never-project-foreign-tenant|"revision"|"metadata"/);
          assert.equal(claim.callCount, 1);
          assert.equal(await grants.countDocuments(schemaFilter), previousGrants + 1);
          assert.equal(finalize.callCount, 0);
          assert.equal(fallback?.callCount, 1);
          const latest = await storage.getMeta(oid);
          if (target === 'active') {
            assert.equal(latest?.metaMetadata?.brandId, f.otherBrand.id);
            assert.deepEqual(latest?.metadata, privateMetadata);
            assert.equal(latest?.revision, initial.revision! + 1);
          } else assert.equal(latest, undefined);
          const staged = Array.from((await f.data.disks.get().stagingDisk().listAll('', { recursive: true })).objects);
          assert.deepEqual(staged, []);
          assertGolden(family, `${target}/${version}`, {
            wire: stable(response),
            state: { target, finalizations: finalize.callCount, fallbackReads: fallback.callCount, staged },
          });
        } finally {
          observe.restore();
          await f.close();
        }
      });
});

describe('Initial record ACL through the production host', function () {
  this.timeout(120000);
  for (const variant of ['legacy-empty', 'explicit'] as const)
    it(`assigns separate ACL semantics for ${variant} authorization`, async () => {
      const f = await referenceProductionFixture(true, undefined, undefined, { declarations: [createRecordRoute] });
      try {
        await seedMutationState(f, await session(f));
        const before = await f.client.db().collection('record').countDocuments();
        const title = `ACL control ${variant}`;
        const body =
          variant === 'legacy-empty'
            ? { title, authorization: [] }
            : { metadata: { title }, authorization: { edit: ['fixture-editor'], view: ['fixture-reader'] } };
        const response = await wire(
          f.url + '/default/rdmp/api/records/metadata/dataRecord',
          'POST',
          {
            ...auth,
            'X-ReDBox-API-Version': '2.0',
            'Content-Type': 'application/json',
          },
          JSON.stringify(body)
        );
        assert.equal(response.status, 201, response.text);
        await settleMutationWork(f);
        assert.equal(await f.client.db().collection('record').countDocuments(), before + 1);
        const inserted = await f.client.db().collection('record').findOne({ 'metadata.title': title });
        assert(inserted);
        const acl =
          variant === 'legacy-empty'
            ? { edit: ['pilot-admin'], view: ['pilot-admin'] }
            : { edit: ['fixture-editor'], view: ['fixture-reader'] };
        assert.deepEqual(inserted.authorization.edit, acl.edit);
        assert.deepEqual(inserted.authorization.view, acl.view);
        assertGolden(family, variant, { ...(await normalizeMutation(f, response)), acl });
      } finally {
        await f.close();
      }
    });
});

goldenControls(family);
