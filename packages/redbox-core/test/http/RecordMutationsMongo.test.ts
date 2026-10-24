import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { recordWriteFixture } from './recordWriteFixture';
import { recordMutationRoutes } from '../../src/http/express/recordMutations';
import { getReferenceRepositories } from '../../src/persistence/reference/runtime';
import { BrandingModel } from '../../src/model/storage/BrandingModel';
import { formatRecordEntityTag } from '../../src/RecordEntityTag';

describe('owned record mutation pipeline on real Mongo Solr HTTP', function () {
  this.timeout(45000);
  let f: Awaited<ReturnType<typeof recordWriteFixture>>;
  before(async () => {
    f = await recordWriteFixture();
  });
  after(async () => {
    await f?.close();
  });
  async function request(method: string, route: string, body?: unknown, headers: Record<string, string> = f.headers) {
    const response = await fetch(f.url + '/default/rdmp' + route, {
      method,
      headers: { ...headers, 'Content-Type': 'application/json', 'X-ReDBox-Api-Version': '2.0' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { response, body: text ? JSON.parse(text) : {} };
  }
  let oid: string;
  it('mounts 21 independent declarations and creates through schema validation audit and actual Solr', async () => {
    assert.equal(recordMutationRoutes.length, 21);
    const created = await request('POST', '/api/records/metadata/dataRecord', { metadata: { title: 'Owned record' } });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.meta.outcome, 'saved', JSON.stringify(created.body));
    oid = created.body.data.oid;
    assert(created.response.headers.get('etag'));
    assert.match(created.response.headers.get('location')!, /\/portal\/default\/rdmp\/api\/records\/metadata\//);
    assert.match(created.response.headers.get('link')!, /describedby/);
    assert.equal((await f.storage.getMeta(oid)).metadata.title, 'Owned record');
    assert.equal(await f.native.db().collection('recordschemareference').countDocuments({ oid }), 1);
    const indexed = await fetch(
      'http://127.0.0.1:' + process.env.HTTP_READ_SOLR_PORT + '/solr/redbox/select?q=id:' + encodeURIComponent(oid)
    );
    assert.equal((await indexed.json()).response.numFound, 1);
    const deadline = Date.now() + 5000;
    while ((await f.native.db().collection('recordaudit').countDocuments({ redboxOid: oid })) === 0) {
      assert(Date.now() < deadline, 'Queued record audit must persist');
      await delay(25);
    }
  });
  it('accepts the legacy raw empty authorization field without treating it as an ACL envelope', async () => {
    const created = await request('POST', '/api/records/metadata/dataRecord', {
      title: 'Legacy raw API metadata',
      authorization: [],
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    const saved = await f.storage.getMeta(created.body.data.oid);
    assert.deepEqual(saved.metadata.authorization, []);
    assert(saved.authorization.edit.includes('pilot-admin'));
    assert(saved.authorization.view.includes('pilot-admin'));
    for (const invalid of [['someone-else'], []]) {
      const body = invalid.length
        ? { title: 'invalid', authorization: invalid }
        : { metadata: { title: 'invalid' }, authorization: invalid };
      assert.equal((await request('POST', '/api/records/metadata/dataRecord', body)).response.status, 400);
    }
  });
  it('replaces and merges metadata, preserves API negotiation and monotonic revisions', async () => {
    const replaced = await request('PUT', '/api/records/metadata/' + oid, { title: 'Updated', preserved: true });
    assert.equal(replaced.response.status, 200, JSON.stringify(replaced.body));
    assert.equal(replaced.body.meta.outcome, 'saved', JSON.stringify(replaced.body));
    const merged = await request('PUT', '/api/records/metadata/' + oid + '?merge=true', { title: 'Merged' });
    assert.equal(merged.response.status, 200, JSON.stringify(merged.body));
    assert.equal((await f.storage.getMeta(oid)).metadata.preserved, true);
    assert(merged.body.meta.concurrency.revision > replaced.body.meta.concurrency.revision);
  });
  it('denies unauthenticated foreign-brand and object authorization before effects', async () => {
    const baseline = await f.storage.getMeta(oid);
    assert([401, 403].includes((await request('PUT', '/api/records/metadata/' + oid, {}, {})).response.status));
    await f.storage.create(
      Object.assign(new BrandingModel(), f.otherBrand),
      {
        redboxOid: 'foreign',
        metadata: { title: 'foreign' },
        metaMetadata: { brandId: f.otherBrand.id, type: 'dataRecord' },
        authorization: { edit: ['pilot-admin'], view: ['pilot-admin'] },
      },
      'dataRecord'
    );
    assert.equal((await request('PUT', '/api/records/metadata/foreign', {})).response.status, 400);
    await f.native
      .db()
      .collection('record')
      .updateOne(
        { redboxOid: oid },
        { $set: { authorization: { edit: ['someone-else'], view: ['someone-else'], editRoles: [], viewRoles: [] } } }
      );
    assert.equal((await request('PUT', '/api/records/metadata/' + oid, {})).response.status, 403);
    await f.native
      .db()
      .collection('record')
      .updateOne({ redboxOid: oid }, { $set: { authorization: baseline.authorization } });
    assert.equal((await f.storage.getMeta(oid)).revision, baseline.revision);
  });
  it('rejects malformed bodies and invalid transitions without persistence', async () => {
    const before = await f.storage.getMeta(oid);
    assert.equal((await request('PUT', '/api/records/metadata/' + oid, [])).response.status, 400);
    assert.equal(
      (await request('PUT', '/api/records/metadata/' + oid, {}, { ...f.headers, 'If-Match': 'invalid' })).response
        .status,
      400
    );
    const transition = await request('POST', '/api/records/workflow/step/missing/' + oid, {});
    assert.equal(transition.response.status, 500, JSON.stringify(transition.body));
    assert.equal((await f.storage.getMeta(oid)).revision, before.revision);
  });
  it('enforces stored strict concurrency for absent and stale If-Match and allows one racing writer', async () => {
    const refs = getReferenceRepositories(f.owner);
    const type = await refs.recordTypes.findByName(f.brand.id, 'dataRecord');
    await refs.recordTypes.reviseDefinition(String(type!.id), { concurrentModification: { mode: 'strict' } });
    try {
      assert.equal((await request('PUT', '/api/records/metadata/' + oid, { title: 'missing' })).response.status, 428);
      const current = await f.storage.getMeta(oid);
      const tag = formatRecordEntityTag(oid, current.revision!);
      const headers = { ...f.headers, 'If-Match': tag };
      const writes = await Promise.all([
        request('PUT', '/api/records/metadata/' + oid, { title: 'race A' }, headers),
        request('PUT', '/api/records/metadata/' + oid, { title: 'race B' }, headers),
      ]);
      assert.deepEqual(writes.map(r => r.response.status).sort(), [200, 412], JSON.stringify(writes.map(r => r.body)));
      const stale = await request('PUT', '/api/records/metadata/' + oid, { title: 'stale' }, headers);
      assert.equal(stale.response.status, 412, JSON.stringify(stale.body));
    } finally {
      await refs.recordTypes.reviseDefinition(String(type!.id), {
        concurrentModification: { mode: 'last-write-wins' },
      });
    }
  });
  it('honors stored observe and last-write-wins modes, schema refusals and workflow role grants', async () => {
    const refs = getReferenceRepositories(f.owner),
      type = await refs.recordTypes.findByName(f.brand.id, 'dataRecord');
    for (const mode of ['observe', 'last-write-wins']) {
      await refs.recordTypes.reviseDefinition(String(type!.id), { concurrentModification: { mode } });
      const current = await f.storage.getMeta(oid);
      const result = await request('PUT', '/api/records/metadata/' + oid, { title: mode });
      assert.equal(result.response.status, 200, JSON.stringify(result.body));
      assert(result.body.meta.outcome.startsWith('saved'));
      assert.equal(result.body.meta.concurrency.mode, mode);
      assert.equal(
        (
          await request(
            'PUT',
            '/api/records/metadata/' + oid,
            { title: 'explicit stale' },
            { ...f.headers, 'If-Match': formatRecordEntityTag(oid, current.revision!) }
          )
        ).response.status,
        412
      );
    }
    await refs.workflows.createDefinition({
      name: 'restricted',
      recordType: type!.id,
      starting: false,
      hidden: false,
      config: {
        form: 'dataRecord',
        workflow: { stage: 'restricted' },
        authorization: { editRoles: ['Admin'], transitionRoles: ['Librarians'] },
      },
    });
    const before = await f.storage.getMeta(oid);
    assert.equal((await request('POST', '/api/records/workflow/step/restricted/' + oid, {})).response.status, 403);
    assert.equal((await f.storage.getMeta(oid)).revision, before.revision);
    await refs.workflows.createDefinition({
      name: 'approved',
      recordType: type!.id,
      starting: false,
      hidden: false,
      config: {
        form: 'dataRecord',
        workflow: { stage: 'approved' },
        authorization: { editRoles: ['Admin'], transitionRoles: ['Admin'] },
      },
    });
    const transition = await request('POST', '/api/records/workflow/step/approved/' + oid, {});
    assert.equal(transition.response.status, 200, JSON.stringify(transition.body));
    assert.equal((await f.storage.getMeta(oid)).workflow.stage, 'approved');
    assert.equal(
      (await request('PUT', '/api/records/metadata/' + oid + '?operation=unknown', { title: 'denied' })).response
        .status,
      400
    );
    await f.identities.replaceMemberships('user', f.user.id, [f.reader.id]);
    try {
      assert.equal(
        (await request('POST', '/api/records/metadata/dataRecord', { metadata: { title: 'denied' } })).response.status,
        403
      );
    } finally {
      await f.identities.replaceMemberships('user', f.user.id, [f.role.id]);
    }
  });
  it('persists permission changes and checks CSRF for browser aliases', async () => {
    const change = await request('POST', '/api/records/permissions/view/' + oid, { users: ['viewer'] });
    assert.equal(change.response.status, 200, JSON.stringify(change.body));
    assert(change.body.data.view.includes('viewer'));
    assert.equal((await request('PUT', '/recordmeta/' + oid, { title: 'bad token' })).response.status, 403);
    const login = await fetch(f.url + '/__test/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' }),
    });
    assert.equal(login.status, 200);
    await login.json();
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const token = await fetch(f.url + '/csrfToken', { headers: { Cookie: cookie } });
    const { _csrf } = await token.json();
    assert.equal(
      (await request('PUT', '/recordmeta/' + oid, { title: 'bad token' }, { Cookie: cookie, 'X-CSRF-Token': 'wrong' }))
        .response.status,
      403
    );
    const saved = await request(
      'PUT',
      '/recordmeta/' + oid,
      { title: 'Browser save' },
      { Cookie: cookie, 'X-CSRF-Token': _csrf }
    );
    assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.meta.outcome, 'saved', JSON.stringify(saved.body));
    assert.equal(saved.body.meta.metadata.title, 'Browser save');
  });
  it('harvests tracked and compatibility records with persisted duplicate chunk checkpoints', async () => {
    const payload = {
      sourceRunId: 'http-run',
      sourceName: 'test',
      chunk: { index: 0 },
      records: [{ harvestId: 'tracked', operation: 'create', recordRequest: { metadata: { title: 'Tracked' } } }],
    };
    const first = await request('POST', '/api/records/harvest/dataRecord', payload);
    assert.equal(first.response.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.data.chunk.responseSummary.created, 1, JSON.stringify(first.body));
    const duplicate = await request('POST', '/api/records/harvest/dataRecord', payload);
    assert.equal(duplicate.response.status, 200, JSON.stringify(duplicate.body));
    assert.equal(await f.native.db().collection('record').countDocuments({ harvestId: 'tracked' }), 1);
    assert.equal(await f.native.db().collection('harvestrun').countDocuments({ sourceRunId: 'http-run' }), 1);
    const compat = await request('POST', '/api/records/harvest/dataRecord', {
      records: [{ harvestId: 'compat', recordRequest: { metadata: { title: 'Compatibility' } } }],
    });
    assert.equal(compat.response.status, 200, JSON.stringify(compat.body));
    assert.equal(compat.body.data[0].status, true, JSON.stringify(compat.body));
    const legacy = await request('POST', '/api/mint/harvest/dataRecord', {
      records: [{ harvest_id: 'legacy', metadata: { data: { title: 'Legacy' } } }],
    });
    assert.equal(legacy.response.status, 200, JSON.stringify(legacy.body));
    assert.equal(legacy.body.data[0].status, true, JSON.stringify(legacy.body));
    assert.equal(
      (await request('POST', '/api/records/harvest/dataRecord', { sourceRunId: 'bad', records: [] })).response.status,
      400
    );
    assert(
      [401, 403].includes((await request('POST', '/api/records/harvest/dataRecord', payload, {})).response.status)
    );
  });
  it('denies harvest no-op disclosure and compensates an event failure before retry', async () => {
    const existing = await f.native.db().collection('record').findOne({ harvestId: 'tracked' });
    assert(existing);
    await f.native
      .db()
      .collection('record')
      .updateOne(
        { _id: existing._id },
        { $set: { authorization: { edit: ['someone-else'], view: ['someone-else'] } } }
      );
    const denied = await request('POST', '/api/records/harvest/dataRecord', {
      records: [{ harvestId: 'tracked', recordRequest: { metadata: { title: 'Tracked' } } }],
    });
    assert.equal(denied.response.status, 200, JSON.stringify(denied.body));
    assert.equal(denied.body.data[0].status, false);
    assert.equal(denied.body.data[0].oid, '');
    const payload = {
      sourceRunId: 'compensated',
      sourceName: 'test',
      chunk: { index: 0 },
      records: [
        { harvestId: 'compensated', operation: 'create', recordRequest: { metadata: { title: 'Compensated' } } },
      ],
    };
    f.failNextHarvestEvent();
    const failed = await request('POST', '/api/records/harvest/dataRecord', payload);
    assert.equal(failed.response.status, 500, JSON.stringify(failed.body));
    assert.equal(await f.native.db().collection('record').countDocuments({ harvestId: 'compensated' }), 0);
    const retried = await request('POST', '/api/records/harvest/dataRecord', payload);
    assert.equal(retried.response.status, 200, JSON.stringify(retried.body));
    assert.equal(retried.body.data.chunk.responseSummary.created, 1, JSON.stringify(retried.body));
    assert.equal(await f.native.db().collection('record').countDocuments({ harvestId: 'compensated' }), 1);
  });
  it('links accounts through the owned writer without rewriting records in another brand', async () => {
    const secondary = await f.identities.create('user', {
      username: 'secondary',
      name: 'Secondary',
      email: 'secondary@example.test',
      type: 'local',
      token: '',
    });
    await f.identities.replaceMemberships('user', String(secondary.id), [f.reader.id]);
    const primary = await f.identities.one('user', { username: 'pilot-admin' });
    await f.native
      .db()
      .collection('record')
      .updateOne({ redboxOid: oid }, { $set: { 'authorization.view': ['secondary'] } });
    await f.native
      .db()
      .collection('record')
      .updateOne({ redboxOid: 'foreign' }, { $set: { 'authorization.view': ['secondary'] } });
    const foreignRevision = (await f.storage.getMeta('foreign')).revision;
    const linked = await request('POST', '/api/users/link', {
      primaryUserId: primary!.id,
      secondaryUserId: secondary.id,
    });
    assert.equal(linked.response.status, 200, JSON.stringify(linked.body));
    assert.equal(linked.body.data.impact.recordsRewritten, 1, JSON.stringify(linked.body));
    assert((await f.storage.getMeta(oid)).authorization.view.includes('pilot-admin'));
    assert.deepEqual((await f.storage.getMeta('foreign')).authorization.view, ['secondary']);
    assert.equal((await f.storage.getMeta('foreign')).revision, foreignRevision);
    assert.equal((await f.identities.one('user', { id: String(secondary.id) }))!.accountLinkState, 'linked-alias');
    const users = await request('GET', '/api/users');
    assert.equal(users.response.status, 200, JSON.stringify(users.body));
    assert(
      users.body.data.records.every((u: Record<string, unknown>) => u.password === undefined && u.token === undefined)
    );
    assert.equal((await request('GET', '/api/users?searchBy=password&query=x')).response.status, 400);
    const foreign = await f.identities.create('user', {
      username: 'foreign-user',
      name: 'Foreign',
      email: 'foreign@example.test',
      type: 'local',
    });
    const foreignRole = await f.identities.create('role', { name: 'ForeignReader', branding: f.otherBrand.id });
    await f.identities.replaceMemberships('user', String(foreign.id), [foreignRole.id]);
    assert.equal((await request('GET', '/api/users/' + foreign.id + '/audit')).response.status, 404);
    assert.equal(
      (await request('POST', '/api/users/link', { primaryUserId: foreign.id, secondaryUserId: secondary.id })).response
        .status,
      404
    );
  });
  it('executes all eight existing Bruno permission mutations on actual persisted records', async () => {
    const collection = path.resolve('../../test/bruno');
    const names = [
      'Give role view permissions to RDMP',
      'Remove role view permissions to RDMP',
      'Give role edit permissions to RDMP',
      'Remove role edit permissions to RDMP',
      'Give user view permissions to Existing Locations',
      'Remove user view permissions to Existing Locations',
      'Give user edit permissions to RDMP',
      'Remove user edit permissions to RDMP',
    ];
    const result = await promisify(execFile)(
      process.execPath,
      [
        path.join(collection, 'node_modules/@usebruno/cli/bin/bru.js'),
        'run',
        ...names.map(name => '1 - REST API/1 - Record Management/' + name + '.bru'),
        '--env',
        'int-test',
        '--env-var',
        'host=' + f.url,
        '--env-var',
        'token=pilot-api-token',
        '--env-var',
        'dmpOid=' + oid,
        '--env-var',
        'existingLocationsOid=' + oid,
        '--reporter-skip-all-headers',
      ],
      { cwd: collection, timeout: 30000, maxBuffer: 1024 * 1024 }
    );
    console.log(result.stdout);
  });
  it('deletes restores and purges using the same lifecycle CAS and incarnation owner', async () => {
    const deleted = await request('DELETE', '/api/records/metadata/' + oid);
    assert.equal(deleted.response.status, 200, JSON.stringify(deleted.body));
    assert.equal(await f.storage.getMeta(oid), undefined);
    const restored = await request('PUT', '/api/deletedrecords/' + oid);
    assert.equal(restored.response.status, 200, JSON.stringify(restored.body));
    assert.equal((await f.storage.getMeta(oid)).redboxOid, oid);
    assert.equal((await request('DELETE', '/api/records/metadata/' + oid)).response.status, 200);
    const purged = await request('DELETE', '/api/deletedrecords/' + oid);
    assert.equal(purged.response.status, 200, JSON.stringify(purged.body));
    assert.equal(await f.storage.getDeletedRecordMeta(oid), null);
  });
});
