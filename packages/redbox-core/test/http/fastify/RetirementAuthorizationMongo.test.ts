import assert from 'node:assert/strict';
import { withoutSideEffects } from './noSideEffects';
import sinon from 'sinon';
import { ObjectId } from 'mongodb';
import { getSiemRepository } from '../../../src/persistence/siem/runtime';
import { getReferenceRepositories } from '../../../src/persistence/reference/runtime';
import { identityLinkRoutes } from '../../../src/http/identityRoutes';
import { getMetaRoute, getPermissionsRoute } from '../../../src/api-routes/groups/records';
import { recordQueryReadDeclarations } from '../../../src/http/readRoutes';
import { resumableUploadRoutes } from '../../../src/http/uploadRoutes';
import { referenceProductionFixture } from './referenceProductionFixture';
import { session, wire, type Wire } from './mutationDifferentialSupport';
import { assertGolden, goldenControls } from './goldenContracts';

function stableWire(response: Wire) {
  const headers = { ...response.headers };
  for (const key of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[key];
  if (headers['set-cookie'])
    headers['set-cookie'] = (headers['set-cookie'] as string[]).map(cookie =>
      cookie.replace(/^([^=]+)=[^;]*/, '$1=<session>').replace(/Expires=[^;]+/i, 'Expires=<time>')
    );
  return { ...response, headers };
}

const secret = 'fm043-configured-companion-attachment-secret';
const providerHeaders = { 'X-Companion-Secret': secret };
const tus = { 'Tus-Resumable': '1.0.0' };
const uploadPath = '/default/rdmp/companion/record/reference-record/attach';
const uploadCases: { title: string; method: 'POST' | 'HEAD' | 'PATCH'; headers: Record<string, string> }[] = [
  { title: 'absent secret', method: 'POST', headers: {} },
  { title: 'wrong secret', method: 'POST', headers: { 'X-Companion-Secret': 'wrong' } },
  { title: 'valid secret', method: 'POST', headers: providerHeaders },
  {
    title: 'valid secret through trusted private proxy',
    method: 'POST',
    headers: { ...providerHeaders, 'X-Forwarded-For': '10.0.2.15, 172.18.0.5', 'X-Real-IP': '10.0.2.15' },
  },
  {
    title: 'valid secret through trusted proxy with public origin',
    method: 'POST',
    headers: { ...providerHeaders, 'X-Forwarded-For': '203.0.113.10, 172.18.0.5' },
  },
  {
    title: 'valid secret with RFC 7239 forwarding',
    method: 'POST',
    headers: { ...providerHeaders, Forwarded: 'for="[::1]";proto=https;by=127.0.0.1' },
  },
  { title: 'valid secret', method: 'HEAD', headers: providerHeaders },
  { title: 'valid secret', method: 'PATCH', headers: providerHeaders },
  {
    title: 'valid secret through trusted proxy with IPv6 client',
    method: 'HEAD',
    headers: { ...providerHeaders, 'X-Forwarded-For': '::1, 172.18.0.5' },
  },
  {
    title: 'valid secret through trusted proxy with mapped IPv6 client',
    method: 'PATCH',
    headers: { ...providerHeaders, 'X-Forwarded-For': '::ffff:192.168.107.1, 172.18.0.5' },
  },
];

describe('Companion attachment credentials on the production host', function () {
  this.timeout(120000);
  for (const { title, method, headers } of uploadCases)
    it(`rejects anonymous ${method} with ${title} before staging`, async () => {
      const f = await referenceProductionFixture(true, undefined, undefined, {
        declarations: resumableUploadRoutes,
        pages: {},
        configuration: {
          companion: { attachmentSecret: secret, attachmentSecretHeader: 'x-companion-secret' },
          record: { maxUploadSize: 1024 * 1024, diskSpaceThreshold: 0 },
        },
      });
      const observe = sinon.createSandbox();
      try {
        assert.equal(f.portal.config.companion.attachmentSecret, secret);
        assert.equal(f.portal.config.server.trustProxy, true);
        const base = f.url + uploadPath;
        const disk = f.data.disks.get().stagingDisk();
        let target = base;
        let infoKey: string | undefined;
        const auth = { Authorization: 'Bearer pilot-api-token' };
        if (method !== 'POST') {
          // A valid, owned upload exists. A nonexistent ID would let a staging lookup hide a bypass.
          const created = await wire(base, 'POST', { ...tus, ...auth, 'Upload-Length': '6' });
          assert.equal(created.status, 201, created.text);
          const location = String(created.headers.location);
          assert.match(location, /\/attach\/[a-f0-9]{32}$/);
          const id = location.split('/').at(-1)!;
          target += '/' + id;
          infoKey = `tus/${id}/info.json`;
        }
        const storageState = async () => {
          const { objects } = await disk.listAll('', { recursive: true });
          const keys = Array.from(objects, file => (file as { key: string }).key).sort();
          return {
            keys: keys.map(key => (key === infoKey ? 'tus/<owned-upload>/info.json' : key)),
            info: infoKey ? await disk.get(infoKey) : null,
          };
        };
        const before = await storageState();
        assert.deepEqual(before.keys, infoKey ? ['tus/<owned-upload>/info.json'] : []);
        const methods = [
          'exists',
          'get',
          'getBytes',
          'getMetaData',
          'getStream',
          'put',
          'putStream',
          'delete',
          'deleteAll',
          'listAll',
        ] as const;
        const calls = methods.map(key => [key, observe.spy(disk, key)] as const);
        const response = await withoutSideEffects(
          f,
          () =>
            wire(
              target,
              method,
              {
                ...tus,
                ...headers,
                ...(method === 'POST' ? { 'Upload-Length': '6' } : {}),
                ...(method === 'PATCH'
                  ? { 'Upload-Offset': '0', 'Content-Type': 'application/offset+octet-stream' }
                  : {}),
              },
              method === 'PATCH' ? 'abc' : ''
            ),
          {
            // This witness already spies the staging reads and writes so that
            // even a staging lookup before denying the request is prohibited.
            skipStagingSnapshot: true,
            ignorePorts: ['staging:put', 'staging:putStream', 'staging:delete', 'staging:deleteAll'],
          }
        );
        const counts = Object.fromEntries(calls.map(([name, spy]) => [name, spy.callCount]));
        observe.restore();
        assert.equal(response.status, 401, response.text);
        assert.equal(response.headers['www-authenticate'], 'Bearer');
        assert.deepEqual(Object.values(counts), Array(methods.length).fill(0));
        const after = await storageState();
        assert.deepEqual(after, before);
        if (infoKey) {
          const owned = await wire(target, 'HEAD', { ...tus, ...auth });
          assert.equal(owned.status, 200, owned.text);
          assert.equal(owned.headers['upload-offset'], '0');
        }
        assertGolden('companionAttachmentCredentials', `${method}/${title}`, {
          wire: stableWire(response),
          state: { calls: counts, keys: after.keys, infoUnchanged: after.info === before.info },
        });
      } finally {
        observe.restore();
        await f.close();
      }
    });
});
goldenControls('companionAttachmentCredentials');

const browserGraph = '/default/rdmp/record/reference-record/relatedRecords?relationshipDepth=0';
const apiGraph =
  '/default/rdmp/api/records/metadata/reference-record?include=relationships&relationshipDepth=2&relationshipIds=related,%20extra&recordTypes=dataRecord,publication&fields=summary';
describe('Relationship graph authorization on the production host', function () {
  this.timeout(120000);
  for (const variant of ['browser mixed graph', 'browser traversal root lost access', 'API mixed graph'])
    it(`filters both graph endpoints and reports omissions: ${variant}`, async () => {
      const f = await referenceProductionFixture(true, undefined, undefined, {
        declarations: [...recordQueryReadDeclarations, getMetaRoute],
      });
      const sandbox = sinon.createSandbox();
      try {
        const api = variant.startsWith('API');
        const rootDenied = variant === 'browser traversal root lost access';
        const record = (redboxOid: string, brandId: string, visible: boolean) => ({
          redboxOid,
          metaMetadata: { brandId, type: 'dataRecord' },
          metadata: { title: `Metadata for ${redboxOid}` },
          authorization: visible ? { view: ['pilot-admin'], viewRoles: [] } : { view: [], viewRoles: [] },
        });
        const root = record('reference-record', f.brand.id, !rootDenied);
        const visible = record('allowed-node', f.brand.id, true);
        const denied = record('private-node', f.brand.id, false);
        const foreign = record('foreign-node', f.otherBrand.id, true);
        const edge = (sourceOid: string, targetOid: string) => ({
          relationId: 'related',
          sourceOid,
          targetOid,
          targetRecordType: 'dataRecord',
        });
        const allowedEdges = [edge(root.redboxOid, visible.redboxOid), edge(visible.redboxOid, root.redboxOid)];
        // Supply the storage result only. Production auth, controller, filters and serialization run untouched.
        const traversal = sandbox.stub(f.data.storage(), 'getRelatedRecords').resolves({
          rootOid: root.redboxOid,
          relatedObjects: { dataRecord: [root, visible, denied, foreign] },
          edges: [
            ...allowedEdges,
            edge(root.redboxOid, denied.redboxOid),
            edge(denied.redboxOid, root.redboxOid),
            edge(foreign.redboxOid, visible.redboxOid),
          ],
          omittedByAccess: {},
        });
        const auth: Record<string, string> = api
          ? { Authorization: 'Bearer pilot-api-token' }
          : { Cookie: (await session(f)).Cookie };
        const response = await wire(f.url + (api ? apiGraph : browserGraph), 'GET', {
          ...auth,
          'X-ReDBox-Api-Version': '2.0',
        });
        assert.equal(response.status, 200, response.text);
        const data = JSON.parse(response.text).data;
        const graph = api ? data.relationships : data;
        assert.deepEqual(graph, {
          rootOid: root.redboxOid,
          edges: rootDenied ? [] : allowedEdges,
          relatedObjects: { dataRecord: rootDenied ? [visible] : [root, visible] },
          omittedByAccess: { related: rootDenied ? 5 : 3 },
          ...(!api ? { processedRelationships: ['dataRecord'] } : {}),
        });
        assert.doesNotMatch(response.text, /private-node|foreign-node/);
        sinon.assert.calledOnce(traversal);
        const [oid, brand, options] = traversal.firstCall.args;
        assert.equal(oid, root.redboxOid);
        assert(brand && typeof brand === 'object' && 'id' in brand);
        assert.equal(brand.id, f.brand.id);
        assert.deepEqual(
          options,
          api
            ? {
                depth: 2,
                includeRelationIds: ['related', 'extra'],
                includeRecordTypes: ['dataRecord', 'publication'],
                fields: 'summary',
              }
            : { depth: 0, includeRelationIds: undefined, includeRecordTypes: undefined, fields: 'full' }
        );
        assertGolden('relationshipAuthorization', variant, {
          wire: stableWire(response),
          calls: { oid, brandId: brand.id, options: JSON.parse(JSON.stringify(options)) },
        });
      } finally {
        sandbox.restore();
        await f.close();
      }
    });
  it('refuses traversal of a stored root without a tenant', async () => {
    const f = await referenceProductionFixture(true, undefined, undefined, {
      declarations: recordQueryReadDeclarations,
    });
    const sandbox = sinon.createSandbox();
    try {
      const collection = f.client.db().collection('record');
      assert.equal(
        (await collection.updateOne({ redboxOid: 'reference-record' }, { $unset: { 'metaMetadata.brandId': '' } }))
          .modifiedCount,
        1
      );
      const traversal = sandbox.spy(f.data.storage(), 'getRelatedRecords');
      const { Cookie } = await session(f);
      const response = await wire(f.url + browserGraph, 'GET', { Cookie, 'X-ReDBox-Api-Version': '2.0' });
      assert.equal(response.status, 404, response.text);
      sinon.assert.notCalled(traversal);
      assertGolden('relationshipAuthorization', 'browser root without tenant', {
        wire: stableWire(response),
        calls: traversal.callCount,
      });
    } finally {
      sandbox.restore();
      await f.close();
    }
  });
});
goldenControls('relationshipAuthorization');

const admin = { Authorization: 'Bearer pilot-api-token', 'X-ReDBox-Api-Version': '2.0' };
const brandPath = '/default/rdmp';
describe('Tenant-filtered identity and monitoring results on the production host', function () {
  this.timeout(120000);
  it('strips credentials and foreign roles from live audit and account projections', async () => {
    const f = await referenceProductionFixture(true, undefined, undefined, { declarations: identityLinkRoutes });
    const sandbox = sinon.createSandbox();
    try {
      const users = f.data.users.get();
      const member = '000000000000000000000017';
      const memberRole = '000000000000000000000014';
      const foreignRole = '000000000000000000000016';
      const requireMember = users.requireUserInBrand.bind(users);
      const enrich = users.enrichUsersWithEffectiveDisabledState.bind(users);
      const projection = <T extends Awaited<ReturnType<typeof requireMember>>>(user: T) => {
        if (!user || user.id !== member) return user;
        const localRole = user.roles?.[0];
        assert(localRole);
        return {
          ...user,
          password: 'private-provider-password',
          token: 'private-provider-token',
          roles: [localRole, { ...localRole, id: foreignRole, branding: f.otherBrand.id }],
        };
      };
      sandbox.stub(users, 'requireUserInBrand').callsFake(async (...args) => projection(await requireMember(...args)));
      sandbox
        .stub(users, 'enrichUsersWithEffectiveDisabledState')
        .callsFake(async rows => (await enrich(rows)).map(projection));
      const audit = await wire(f.url + brandPath + '/api/users/' + member + '/audit', 'GET', admin);
      const lookup = await wire(f.url + brandPath + '/api/users/find?searchBy=id&query=' + member, 'GET', admin);
      for (const [result, auditResponse] of [
        [audit, true],
        [lookup, false],
      ] as const) {
        assert.equal(result.status, 200, result.text);
        assert.doesNotMatch(result.text, /private-provider-|000000000000000000000016/);
        const { data } = JSON.parse(result.text);
        const account = auditResponse ? data.user : data;
        assert.equal(account.id, member);
        assert.deepEqual(
          account.roles.map((role: { id: string }) => role.id),
          [memberRole]
        );
        assert(!Object.hasOwn(account, 'password'));
        assert(!Object.hasOwn(account, 'token'));
      }
    } finally {
      sandbox.restore();
      await f.close();
    }
  });

  it('refuses the same-brand permissions representation after view access is withdrawn', async () => {
    const f = await referenceProductionFixture(true, undefined, undefined, { declarations: [getPermissionsRoute] });
    try {
      const target = f.url + brandPath + '/api/records/permissions/reference-record';
      const control = await wire(target, 'GET', admin);
      assert.equal(control.status, 200, control.text);
      assert.deepEqual(JSON.parse(control.text).data.view, ['pilot-admin']);
      assert.equal(
        (
          await f.client
            .db()
            .collection('record')
            .updateOne(
              { redboxOid: 'reference-record' },
              { $set: { authorization: { view: [], edit: [], viewRoles: [], editRoles: [] } } }
            )
        ).modifiedCount,
        1
      );
      const denied = await wire(target, 'GET', admin);
      assert.equal(denied.status, 403, denied.text);
      assert.equal(denied.headers.etag, undefined);
      assert.deepEqual(JSON.parse(denied.text), { errors: [{ detail: 'Access Denied' }], meta: {} });
    } finally {
      await f.close();
    }
  });

  it('checks membership before returning a filtered account, on get and find aliases', async () => {
    const f = await referenceProductionFixture(true, undefined, undefined, { declarations: identityLinkRoutes });
    const sandbox = sinon.createSandbox();
    try {
      const collection = f.client.db().collection('user');
      const foreign = '000000000000000000000018';
      const member = '000000000000000000000017';
      // Insert the foreign candidate first so a find that takes the first hit leaks it.
      const ids = [new ObjectId(foreign), new ObjectId(member)];
      const candidates = await Promise.all(ids.map(_id => collection.findOne({ _id })));
      assert(candidates[0] && candidates[1]);
      assert.equal((await collection.deleteMany({ _id: { $in: ids } })).deletedCount, 2);
      const stamp = '2026-01-01T00:00:00.000Z';
      await collection.insertMany(
        candidates.map(candidate => ({
          ...candidate!,
          name: 'Shared name',
          createdAt: stamp,
          updatedAt: stamp,
        }))
      );
      assert.equal(
        (
          await f.client
            .db()
            .collection('role')
            .updateOne(
              { _id: new ObjectId('000000000000000000000014') },
              { $set: { createdAt: stamp, updatedAt: stamp } }
            )
        ).modifiedCount,
        1
      );
      const users = f.data.users.get();
      const find = sandbox.spy(users, 'findUsersWithQuery');
      const membership = sandbox.spy(users, 'requireUserInBrand');
      const list = sandbox.spy(users, 'getUsersForBrand');
      for (const alias of ['get', 'find']) {
        const filtered = await wire(
          f.url + brandPath + `/api/users/${alias}?searchBy=name&query=Shared%20name`,
          'GET',
          admin
        );
        assert.equal(filtered.status, 200, filtered.text);
        assert.equal(JSON.parse(filtered.text).data.id, member);
        assert.doesNotMatch(filtered.text, new RegExp(foreign));
        sinon.assert.calledOnceWithExactly(find, { name: 'Shared name' }, null);
        const membershipResults = (await Promise.all(membership.returnValues)).map(user => user?.id ?? null);
        assert.deepEqual(membershipResults, [null, member]);
        assert.deepEqual(membership.args, [
          [foreign, f.brand.id],
          [member, f.brand.id],
        ]);
        const foreignOnly = await wire(
          f.url + brandPath + `/api/users/${alias}?searchBy=id&query=${foreign}`,
          'GET',
          admin
        );
        assert.equal(foreignOnly.status, 404, foreignOnly.text);
        sinon.assert.calledWithExactly(find, { id: foreign }, null);
        assert.deepEqual(membership.lastCall.args, [foreign, f.brand.id]);
        assert.equal(await membership.lastCall.returnValue, null);
        sinon.assert.notCalled(list);
        assertGolden('tenantFilteredReads', `identity/${alias}`, {
          filtered: stableWire(filtered),
          foreignOnly: stableWire(foreignOnly),
          calls: {
            search: find.args,
            member: membership.lastCall.args,
            matches: membershipResults,
            broadList: list.callCount,
          },
        });
        find.resetHistory();
        membership.resetHistory();
      }
      const response = await wire(f.url + brandPath + '/api/users?searchBy=name&query=Shared%20name', 'GET', admin);
      assert.equal(response.status, 200, response.text);
      assert.deepEqual(
        JSON.parse(response.text).data.records.map((user: { id: string }) => user.id),
        [member]
      );
      assert.doesNotMatch(response.text, new RegExp(foreign));
      assertGolden('tenantFilteredReads', 'identity/list', stableWire(response));
    } finally {
      sandbox.restore();
      await f.close();
    }
  });

  for (const route of ['events', 'delivery-status'])
    it(`uses the actor's brand for page two of SIEM ${route} despite a foreign brand query`, async () => {
      const f = await referenceProductionFixture(true, undefined, undefined, {
        declarations: recordQueryReadDeclarations,
      });
      const sandbox = sinon.createSandbox();
      try {
        const repository = getSiemRepository(f.owner);
        const deliveries = route === 'delivery-status';
        const listEvents = sandbox.spy(repository, 'listEvents');
        const listAttempts = sandbox.spy(repository, 'listAttempts');
        const stamp = '2026-01-01T00:00:00.000Z';
        for (const [tenant, brandId] of [
          ['local', f.brand.id],
          ['foreign', f.otherBrand.id],
        ]) {
          for (let i = 1; i <= 26; i++) {
            const suffix = String(i).padStart(2, '0');
            const at = `2026-01-01T00:00:${suffix}.000Z`;
            const common = {
              id: (tenant === 'local' ? '04' : '05') + String(i).padStart(22, '0'),
              eventId: `${tenant}-${suffix}`,
              brandId,
              createdAt: stamp,
              updatedAt: stamp,
            };
            if (deliveries)
              await repository.appendAttempt({
                ...common,
                destinationId: 'fixture',
                adapterType: 'json',
                attemptNumber: 1,
                status: 'success',
                startedAt: at,
              });
            else
              await repository.capture({
                ...common,
                eventType: 'fixture',
                category: 'test',
                severity: 'info',
                source: 'fixture',
                deliveryState: 'delivered',
                occurredAt: at,
              });
          }
        }
        const response = await wire(
          f.url + brandPath + `/api/siem/${route}?offset=25&limit=25&brandId=${f.otherBrand.id}`,
          'GET',
          admin
        );
        assert.equal(response.status, 200, response.text);
        const { rows, total } = JSON.parse(response.text).data;
        assert.equal(total, 26);
        assert.deepEqual(
          rows.map((row: { eventId: string; brandId: string }) => [row.eventId, row.brandId]),
          [['local-01', f.brand.id]]
        );
        const list = deliveries ? listAttempts : listEvents;
        sinon.assert.calledOnceWithExactly(list, { brandId: f.brand.id }, 25, 25);
        assertGolden('tenantFilteredReads', `siem/${route}`, {
          wire: stableWire(response),
          calls: list.firstCall.args,
        });
      } finally {
        sandbox.restore();
        await f.close();
      }
    });
});
goldenControls('tenantFilteredReads');

const schemaBase = brandPath + '/api/records/schemas';
describe('Schema credentials on the production host', function () {
  this.timeout(120000);
  it('rejects a genuine immutable schema grant without current create access', async () => {
    const f = await referenceProductionFixture(true, undefined, undefined, {
      declarations: recordQueryReadDeclarations,
      configuration: {
        auth: {
          rules: [
            { path: '/:branding/:portal(/*)', role: 'Admin', can_update: true },
            { path: '/:branding/:portal/api(/*)', role: 'Researcher', can_read: true },
          ],
        },
      },
    });
    const sandbox = sinon.createSandbox();
    try {
      const refs = getReferenceRepositories(f.owner);
      await refs.recordTypes.reviseDefinition('000000000000000000000021', { searchCore: 'default' });
      const created = await wire(f.url + schemaBase + '/create/dataRecord', 'GET', admin);
      assert.equal(created.status, 200, created.text);
      const etag = String(created.headers.etag);
      assert.match(etag, /^"sha256:[a-f0-9]{64}"$/);
      const digest = etag.slice(8, -1);
      const resolved = await wire(f.url + schemaBase + '/' + digest, 'GET', admin);
      assert.equal(resolved.status, 200, resolved.text);
      assert.equal(resolved.headers.etag, etag);
      assert.deepEqual(JSON.parse(resolved.text), JSON.parse(created.text));
      const authorizeCreate = sandbox.spy(f.data.records.get(), 'hasCreateAccess');
      const denied = await withoutSideEffects(f, () =>
        wire(f.url + schemaBase + '/' + digest, 'GET', {
          Authorization: 'Bearer reader-token',
          'If-None-Match': etag,
        })
      );
      assert.equal(denied.status, 404, denied.text);
      assert.equal(denied.headers.etag, undefined);
      assert.equal(JSON.parse(denied.text).status, 404);
      sinon.assert.calledOnce(authorizeCreate);
      assert.equal(await authorizeCreate.firstCall.returnValue, false);
      assertGolden('schemaCredentialSubstitution', 'valid-grant-without-create-access', {
        create: stableWire(created),
        access: stableWire(resolved),
        denial: stableWire(denied),
        calls: { createAccess: false },
      });
    } finally {
      sandbox.restore();
      await f.close();
    }
  });

  it('does not substitute partial or malformed client actor hints for authentication', async () => {
    const f = await referenceProductionFixture(true, undefined, undefined, {
      declarations: recordQueryReadDeclarations,
    });
    const sandbox = sinon.createSandbox();
    try {
      const schemas = f.data.reference.schema.get();
      const cases = [
        ['create/dataRecord', sandbox.spy(schemas, 'resolveCreate')],
        ['update/reference-record', sandbox.spy(schemas, 'resolveUpdate')],
        ['a'.repeat(64), sandbox.spy(schemas, 'resolveImmutable')],
      ] as const;
      for (const [path, resolver] of cases) {
        const plain = await withoutSideEffects(f, () => wire(f.url + schemaBase + '/' + path, 'GET'));
        assert.equal(plain.status, 401, plain.text);
        const inputs = [
          { id: '000000000000000000000015', username: 'pilot-admin', roles: [] },
          { id: '000000000000000000000015', username: ' ', roles: ['Admin'] },
          {
            id: '000000000000000000000015',
            username: 'pilot-admin',
            roles: [{ id: '000000000000000000000013', name: 42 }],
          },
        ];
        const attempts = [];
        for (const user of inputs) {
          const response = stableWire(
            await withoutSideEffects(f, () =>
              wire(f.url + schemaBase + '/' + path, 'GET', { 'X-User': JSON.stringify(user) })
            )
          );
          assert.deepEqual(response, stableWire(plain));
          attempts.push(response);
        }
        sinon.assert.notCalled(resolver);
        assertGolden('schemaCredentialSubstitution', 'untrusted-hint/' + path, {
          wire: attempts,
          calls: resolver.callCount,
        });
      }
    } finally {
      sandbox.restore();
      await f.close();
    }
  });
});
goldenControls('schemaCredentialSubstitution');
