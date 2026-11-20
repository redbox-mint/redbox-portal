import assert from 'node:assert/strict';
import sinon from 'sinon';
import { formVocabularyRoutes } from '../../../src/http/integrationRoutes';
import {
  addDataStreamsRoute,
  getMetaRoute,
  getPermissionsRoute,
  updateMetaRoute,
} from '../../../src/api-routes/groups/records';
import { resumableUploadRoutes } from '../../../src/http/uploadRoutes';
import { referenceOrigin, referenceProductionFixture } from './referenceProductionFixture';
import { wire, type Wire } from './mutationDifferentialSupport';
import { assertGolden, goldenControls } from './goldenContracts';
import { withoutSideEffects } from './noSideEffects';

const family = 'retirementActionAuthorization';
const base = '/default/rdmp';
const id = 'reference-record';
const tus = { 'Tus-Resumable': '1.0.0', 'Upload-Length': '3' };
const form = formVocabularyRoutes.find(route => route.action === 'get')!;
const attach = resumableUploadRoutes.find(route => route.path.endsWith('/record/:oid/attach'))!;
const multipart = {
  headers: { 'Content-Type': 'multipart/form-data; boundary=denied' },
  body: '--denied\r\nContent-Disposition: form-data; name="attachmentFields"; filename="test.txt"\r\n\r\nx\r\n--denied--\r\n',
};
const scenarios = [
  { title: 'form vocabulary', route: form, path: '/vocab/undisclosed', method: 'GET' },
  { title: 'metadata read', route: getMetaRoute, path: '/api/records/metadata/' + id, method: 'GET' },
  { title: 'permissions read', route: getPermissionsRoute, path: '/api/records/permissions/' + id, method: 'GET' },
  {
    title: 'metadata update',
    route: updateMetaRoute,
    path: '/api/records/metadata/' + id,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: '{"title":"forbidden"}',
  },
  {
    title: 'multipart upload',
    route: addDataStreamsRoute,
    path: '/api/records/datastreams/' + id,
    method: 'POST',
    ...multipart,
  },
  { title: 'resumable upload', route: attach, path: '/record/' + id + '/attach', method: 'POST', headers: tus },
] as const;
function stable(reply: Wire) {
  const headers = { ...reply.headers };
  for (const name of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[name];
  return { ...reply, headers };
}
for (const actor of ['none', 'foreign'] as const)
  describe(`Production action guard with ${actor} actor`, function () {
    this.timeout(120000);
    let f: Awaited<ReturnType<typeof referenceProductionFixture>>;
    before(async () => {
      f = await referenceProductionFixture(
        true,
        { '*': ['noCache', 'brandingAndPortal', ...(actor === 'foreign' ? ['browserActor'] : [])] },
        undefined,
        {
          declarations: scenarios.map(scenario => scenario.route),
          configuration: {
            auth: { roles: [{ name: 'Admin' }, { name: 'Researcher' }, { name: 'Guest' }], rules: [] },
          },
        }
      );
    });
    after(async () => f?.close());
    for (const scenario of scenarios)
      for (const version of ['1.0', '2.0']) {
        if (actor === 'foreign' && scenario.title.endsWith('read')) continue;
        it(`refuses ${scenario.title} in API ${version}`, async () => {
          const observe = sinon.createSandbox();
          const ports = [
            observe.spy(f.data.records.get(), 'getMeta'),
            observe.spy(f.data.lookups.get(), 'findInExternalService'),
            observe.spy(f.data.lookups.get(), 'findInServiceLookup'),
          ];
          try {
            const before = await f.data.storage().getMeta(id);
            assert(before);
            const response = await withoutSideEffects(f, () =>
              wire(
                f.url + base + scenario.path,
                scenario.method,
                {
                  Authorization: 'Bearer ' + (actor === 'none' ? 'pilot-api-token' : 'foreign-token'),
                  'X-ReDBox-API-Version': version,
                  Origin: referenceOrigin,
                  ...('headers' in scenario ? scenario.headers : {}),
                },
                'body' in scenario ? scenario.body : undefined
              )
            );
            assert.equal(response.status, actor === 'none' ? 401 : 403, response.text);
            assert.equal(
              response.headers['www-authenticate'],
              undefined,
              'The earlier host bearer challenge did not answer'
            );
            assert.equal(response.headers.etag, undefined);
            assert.match(response.text, actor === 'none' ? /Authentication required/ : /Access Denied/);
            const after = await f.data.storage().getMeta(id);
            assert.deepEqual(after, before);
            const staged = Array.from(
              (await f.data.disks.get().stagingDisk().listAll('', { recursive: true })).objects
            );
            assert.deepEqual(staged, []);
            for (const port of ports) sinon.assert.notCalled(port);
            assertGolden(family, `${scenario.title}/${actor}/${version}`, {
              wire: stable(response),
              state: { metadata: after?.metadata, acl: after?.authorization, revision: after?.revision, staged },
            });
          } finally {
            observe.restore();
          }
        });
      }
  });
goldenControls(family);

const ownerHeaders = { Authorization: 'Bearer pilot-api-token', Origin: referenceOrigin };
const otherHeaders = { Authorization: 'Bearer reader-token', Origin: referenceOrigin };
const uploadPath = (record: string) => base + '/record/' + record + '/attach';
describe('TUS upload owner, record edit and pending create checks on the production host', function () {
  this.timeout(120000);
  let f: Awaited<ReturnType<typeof referenceProductionFixture>>;
  before(async () => {
    f = await referenceProductionFixture(true, undefined, undefined, {
      declarations: resumableUploadRoutes,
      configuration: { auth: { roles: [{ name: 'Admin' }, { name: 'Researcher' }, { name: 'Guest' }], rules: [] } },
    });
  });
  after(async () => f?.close());
  const staged = async () => {
    const disk = f.data.disks.get().stagingDisk();
    return Array.from((await disk.listAll('', { recursive: true })).objects);
  };
  for (const version of ['1.0', '2.0']) {
    const versioned = { 'X-ReDBox-API-Version': version };
    for (const [title, record] of [
      ['record edit', id],
      ['pending create', 'pending-oid'],
    ] as const)
      it(`enforces ${title} before staging in API ${version}`, async () => {
        const before = await staged();
        assert.deepEqual(before, []);
        const response = await withoutSideEffects(f, () =>
          wire(f.url + uploadPath(record), 'POST', { ...tus, ...otherHeaders, ...versioned })
        );
        assert.equal(response.status, 403, response.text);
        assert.match(response.text, /Access Denied/);
        assert.equal(response.headers.location, undefined);
        const after = await staged();
        assert.deepEqual(after, []);
        assertGolden(family, `tus ${title}/${version}`, { wire: stable(response), state: { staging: after } });
      });
  }

  it('will not resume another actor’s upload even when the record is editable', async () => {
    const db = f.client.db();
    const record = db.collection('record');
    const before = await record.findOne({ redboxOid: id });
    assert(before);
    const acl = { ...before.authorization, edit: ['pilot-admin', 'reader'], view: ['pilot-admin', 'reader'] };
    assert.equal((await record.updateOne({ redboxOid: id }, { $set: { authorization: acl } })).modifiedCount, 1);
    const disk = f.data.disks.get().stagingDisk();
    const upload = async (actor: typeof ownerHeaders) => {
      const response = await wire(f.url + uploadPath(id), 'POST', { ...tus, ...actor });
      assert.equal(response.status, 201, response.text);
      const location = response.headers.location;
      assert.equal(typeof location, 'string');
      const url = new URL(location as string, f.url);
      const uploadId = url.pathname.split('/').at(-1)!;
      assert.match(uploadId, /^[a-f0-9]{32}$/);
      return { url: url.href, id: uploadId };
    };
    // Both actors independently have permission to edit the persisted record.
    const other = await upload(otherHeaders);
    assert.equal((await wire(other.url, 'DELETE', { 'Tus-Resumable': '1.0.0', ...otherHeaders })).status, 204);
    const owned = await upload(ownerHeaders);
    const policy = { 'Tus-Resumable': '1.0.0' };
    const infoKey = `tus/${owned.id}/info.json`;
    try {
      const info = await disk.get(infoKey);
      const bytes = await staged();
      const head = await wire(owned.url, 'HEAD', { ...policy, ...otherHeaders });
      const patch = await withoutSideEffects(f, () =>
        wire(
          owned.url,
          'PATCH',
          {
            ...policy,
            ...otherHeaders,
            'Upload-Offset': '0',
            'Content-Type': 'application/offset+octet-stream',
          },
          'x'
        )
      );
      assert.equal(head.status, 403, head.text);
      assert.equal(head.text, '');
      assert.equal(patch.status, 403, patch.text);
      assert.match(patch.text, /Access Denied/);
      assert.equal(head.headers['upload-offset'], undefined);
      assert.equal(patch.headers['upload-offset'], undefined);
      const stored = await disk.get(infoKey);
      assert.deepEqual(stored, info);
      assert.deepEqual(await staged(), bytes);
      const control = await wire(owned.url, 'HEAD', { ...policy, ...ownerHeaders });
      assert.equal(control.status, 200, control.text);
      assert.equal(control.headers['upload-offset'], '0');
      assertGolden(family, 'tus distinct owner', {
        wire: [head, patch, control].map(stable),
        state: { staged: bytes.length, infoUnchanged: stored === info },
      });
    } finally {
      assert.equal((await wire(owned.url, 'DELETE', { ...policy, ...ownerHeaders })).status, 204);
      await record.updateOne({ redboxOid: id }, { $set: { authorization: before.authorization } });
    }
    assert.deepEqual(await staged(), []);
  });
});
