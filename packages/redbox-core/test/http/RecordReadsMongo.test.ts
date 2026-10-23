import { BrandingModel } from '../../src/model/storage/BrandingModel';
import { seedReadSearch } from './seedReadSearch';
import { getReferenceRepositories } from '../../src/persistence/reference/runtime';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { readFixture } from './readFixture';
import { recordReadRoutes } from '../../src/http/express/recordReads';
describe('owned record reads exports and schemas on Mongo HTTP', () => {
  let f: Awaited<ReturnType<typeof readFixture>>;
  before(async () => {
    f = await readFixture({ records: true });
    // Permit the reader at the path level so object/operation ACL denials are exercised independently.
    await f.identities.create('pathrule', {
      path: '/:branding/:portal/api(/*)',
      role: f.reader.id,
      branding: f.brand.id,
      can_update: true,
    });
    await f.pathRules.loadRules();
    const snapshot = await f.storage.getMeta('read-record');
    await f.native
      .db()
      .collection('deletedrecord')
      .insertOne({
        redboxOid: 'deleted-record',
        revision: 2,
        brandId: f.brand.id,
        lifecycleState: 'deleted',
        dateDeleted: '2026-01-03T00:00:00Z',
        deletedRecordMetadata: { ...snapshot, redboxOid: 'deleted-record', metadata: { title: 'Deleted title' } },
      });
  });
  after(async () => {
    await f?.close();
  });
  async function read(route: string, headers: Record<string, string> = f.headers) {
    const response = await fetch(f.url + '/default/rdmp' + route, { headers, redirect: 'manual' });
    const text = await response.text();
    return { response, body: text ? JSON.parse(text) : {} };
  }
  it('owns exactly 21 declarations and gives list routes precedence', async () => {
    assert.equal(recordReadRoutes.length, 21);
    for (const route of ['/api/records/list', '/api/deletedrecords/list'])
      assert.equal((await read(route)).response.status, 200);
  });
  it('preserves API and browser list representations and row bounds', async () => {
    const api = await read('/api/records/list?rows=1&apiVersion=2.0');
    assert.equal(api.response.status, 200, JSON.stringify(api.body));
    assert.equal(api.body.data.summary.numFound, 1);
    assert.equal(api.body.data.records[0].oid, 'read-record');
    const browser = await read('/listRecords?rows=1&start=0');
    assert.equal(browser.body.totalItems, 1);
    assert.equal(browser.body.currentPage, 1);
    assert.equal(browser.body.items[0].hasEditAccess, true);
    const deleted = await read('/api/deletedrecords/list');
    assert.equal(deleted.body.records[0].lifecycleState, 'deleted');
    assert.equal((await read('/listDeletedRecords?start=0&rows=10')).body.items[0].title, 'Deleted title');
  });
  it('preserves revision ETag metadata and permissions responses', async () => {
    const meta = await read('/api/records/metadata/read-record?apiVersion=2.0');
    assert.equal(meta.response.status, 200, JSON.stringify(meta.body));
    assert.equal(meta.body.data.title, 'read-record');
    assert.equal(meta.body.meta.revision, 0);
    assert(meta.response.headers.get('etag'));
    assert.equal((await read('/api/records/objectmetadata/read-record')).body.type, 'dataRecord');
    assert.deepEqual((await read('/api/records/permissions/read-record')).body.edit, ['pilot-admin']);
    assert.equal((await read('/record/read-record/permissions')).body.edit[0].username, 'pilot-admin');
  });
  it('projects browser metadata and builds author-time defaults through actual form visitors', async () => {
    const browser = await read('/record/metadata/read-record?apiVersion=2.0');
    assert.equal(browser.response.status, 200, JSON.stringify(browser.body));
    assert.equal(browser.body.data.title, 'read-record', JSON.stringify(browser.body));
    const defaults = await read('/record/default/dataRecord?edit=true&apiVersion=2.0');
    assert.equal(defaults.response.status, 200, JSON.stringify(defaults.body));
    assert.equal(defaults.body.data.title, 'Default title');
    assert.equal(defaults.body.meta.formName, 'dataRecord');
  });
  it('reads tombstones through the provider with lifecycle metadata', async () => {
    for (const route of ['/api/deletedrecords/deleted-record', '/record/delete/deleted-record']) {
      const result = await read(route + '?apiVersion=2.0');
      assert.equal(result.response.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.data.title, 'Deleted title', JSON.stringify(result.body));
      assert.equal(result.body.meta.lifecycleState, 'deleted');
      assert.equal(result.body.meta.revision, 2);
    }
  });
  it('authorizes roots before relationship traversal and exposes filtered graph format', async () => {
    const graph = await read('/record/read-record/relatedRecords?relationshipDepth=0');
    assert.equal(graph.response.status, 200, JSON.stringify(graph.body));
    assert.equal(graph.body.rootOid, 'read-record');
    assert(Array.isArray(graph.body.processedRelationships));
    const meta = await read('/api/records/metadata/read-record?include=relationships');
    assert.equal(meta.response.status, 200);
    assert.equal(meta.body.relationships.rootOid, 'read-record');
    assert.equal((await read('/record/private-record/relatedRecords?relationshipDepth=0')).response.status, 403);
  });
  it('protects raw record audit reads and preserves list envelopes', async () => {
    const audit = await read('/api/records/audit/read-record?apiVersion=2.0');
    assert.equal(audit.response.status, 200);
    assert.equal(audit.body.data.summary.numFound, 2);
    assert.equal((await read('/api/records/audit/private-record')).response.status, 403);
    assert.equal((await read('/api/records/audit/other-record')).response.status, 404);
  });
  it('streams scoped JSON and BOM CSV exports for API and browser clients', async () => {
    for (const mount of ['/api', ''])
      for (const format of ['json', 'csv']) {
        const response = await fetch(
          f.url + '/default/rdmp' + mount + '/export/record/download/' + format + '?recType=dataRecord',
          { headers: f.headers }
        );
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (format === 'csv') assert.deepEqual([...bytes.slice(0, 3)], [239, 187, 191]);
        const text = new TextDecoder().decode(bytes);
        assert.equal(response.status, 200, text);
        assert.match(response.headers.get('content-disposition')!, /Exported Records/);
        assert(text.includes('read-record'));
        assert(!text.includes('private-record'));
        assert(!text.includes('other-record'));
        assert.match(response.headers.get('content-type')!, format === 'json' ? /application\/json/ : /text\/csv/);
      }
  });
  it('returns create update immutable schemas and conditional headers using persisted grants', async () => {
    const create = await read('/api/records/schemas/create/dataRecord');
    assert.equal(create.response.status, 200, JSON.stringify(create.body));
    assert.match(create.response.headers.get('content-type')!, /application\/schema\+json/);
    const link = create.response.headers.get('link')!;
    assert.match(link, /rel="canonical"/);
    const canonical = link.slice(1, link.indexOf('>'));
    const immutable = await fetch(f.url + canonical, { headers: f.headers });
    assert.equal(immutable.status, 200, await immutable.text());
    const again = await fetch(f.url + canonical, {
      headers: { ...f.headers, 'If-None-Match': create.response.headers.get('etag')! },
    });
    assert.equal(again.status, 304);
    assert.equal(await again.text(), '');
    const invalidConditional = await fetch(f.url + canonical, {
      headers: { ...f.headers, 'If-None-Match': 'invalid' },
    });
    assert.equal(invalidConditional.status, 400, await invalidConditional.text());
    const update = await read('/api/records/schemas/update/read-record');
    assert.equal(update.response.status, 200, JSON.stringify(update.body));
    const headers = await read('/api/records/metadata/read-record');
    assert.match(headers.response.headers.get('link')!, /rel="describedby"/);
    assert((await f.native.db().collection('recordschemaartifact').countDocuments()) > 0);
  });
  it('denies missing private foreign record and schema access without leaking data', async () => {
    for (const route of ['/api/records/metadata/missing', '/api/deletedrecords/missing', '/record/metadata/missing'])
      assert.equal((await read(route)).response.status, 404);
    assert.equal((await read('/api/records/metadata/read-record', {})).response.status, 401);
    assert.equal((await read('/record/metadata/private-record')).response.status, 403);
    assert.equal((await read('/api/records/metadata/other-record')).response.status, 404);
    assert.equal((await read('/api/records/schemas/update/private-record')).response.status, 404);
    const anon = await read('/api/records/schemas/create/dataRecord', {});
    assert.equal(anon.response.status, 401);
    assert.match(anon.response.headers.get('content-type')!, /application\/problem\+json/);
    const foreign = await fetch(f.url + '/other/rdmp/api/records/schemas/create/dataRecord', { headers: f.headers });
    assert.equal(foreign.status, 403);
    assert.match(foreign.headers.get('content-type')!, /application\/problem\+json/);
  });
  it('rejects malformed input and unknown schemas as Problem Details', async () => {
    for (const route of [
      '/api/records/list?rows=101',
      '/api/records/list?rows[]=1',
      '/record/search/dataRecord?page=-1',
      '/record/search/dataRecord?searchStr[x]=value',
      '/api/records/list?start=-1',
      '/record/read-record/relatedRecords?relationshipDepth=nope',
      '/api/records/audit/read-record?dateFrom=nope',
      '/export/record/download/json?before=nope',
    ])
      assert.equal((await read(route)).response.status, 400, route);
    const invalid = await read('/api/records/schemas/not-a-digest');
    assert.equal(invalid.response.status, 400);
    assert.match(invalid.response.headers.get('content-type')!, /application\/problem\+json/);
    assert.equal((await read('/api/records/schemas/' + 'a'.repeat(64))).response.status, 404);
  });
  it('applies browser Solr brand type and object ACL filters to hostile search text', async () => {
    await seedReadSearch(f);
    const result = await read('/record/search/dataRecord?searchStr=' + encodeURIComponent('test OR *:*'));
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.totalItems, 1);
    assert.equal(result.body.records[0].id, 'visible');
    assert.equal((await read('/record/search/dataRecord?exact_bad:field=x')).response.status, 400);
  });
  it('keeps brand predicates independent of user-supplied list filters', async () => {
    const result = await read('/api/records/list?filterFields=metaMetadata.brandId&filter=' + f.otherBrand.id);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.summary.numFound, 0, JSON.stringify(result.body));
    assert.equal((await read('/listRecords?filterFields=$where&filter=x')).response.status, 400);
  });
  it('uses only the requested brand roles for lists exports and object access', async () => {
    const records = f.native.db().collection('record');
    const created = await f.storage.create(
      Object.assign(new BrandingModel(), f.brand),
      {
        redboxOid: 'role-record',
        metadata: { title: 'Role title' },
        metaMetadata: { brandId: f.brand.id, type: 'dataRecord' },
        authorization: { view: [], edit: [], viewRoles: ['Admin'], editRoles: [] },
        workflow: { stage: 'draft' },
      },
      'dataRecord'
    );
    assert(created.success, created.message);
    try {
      const list = await read('/api/records/list');
      assert.equal(list.response.status, 200, JSON.stringify(list.body));
      assert.equal(list.body.summary.numFound, 2);
      assert.equal((await read('/api/records/metadata/role-record')).response.status, 200);
      const exportResult = await read('/api/export/record/download/json?recType=dataRecord');
      assert.equal(exportResult.body.records.length, 2);
      await f.identities.update('user', { id: f.user.id }, { roles: [f.reader.id] });
      assert.equal((await read('/api/records/list')).body.summary.numFound, 1);
      assert.equal((await read('/api/export/record/download/json?recType=dataRecord')).body.records.length, 1);
      assert.equal((await read('/api/records/metadata/role-record')).response.status, 403);
    } finally {
      await f.identities.update('user', { id: f.user.id }, { roles: [f.role.id] });
      await records.deleteOne({ redboxOid: 'role-record' });
    }
  });
  it('removes denied and foreign objects plus inbound edges from an actual relationship graph', async () => {
    const refs = getReferenceRepositories(f.owner);
    const type = await refs.recordTypes.findByName(f.brand.id, 'dataRecord');
    const records = f.native.db().collection('record');
    await refs.recordTypes.reviseDefinition(String(type!.id), {
      relatedTo: [
        {
          id: 'links',
          recordType: 'dataRecord',
          localField: 'metadata.links',
          foreignField: 'redboxOid',
          direction: 'inbound',
        },
      ],
    });
    await records.updateOne(
      { redboxOid: 'read-record' },
      { $set: { 'metadata.links': ['private-record', 'other-record'] } }
    );
    try {
      for (const mount of [
        '/record/read-record/relatedRecords?relationshipDepth=1',
        '/api/records/metadata/read-record?include=relationships&relationshipDepth=1',
      ]) {
        const result = await read(mount);
        assert.equal(result.response.status, 200, JSON.stringify(result.body));
        const graph = result.body.relationships ?? result.body;
        assert.equal(graph.edges.length, 0);
        assert.deepEqual(
          graph.relatedObjects.dataRecord.map((r: { redboxOid: string }) => r.redboxOid),
          ['read-record']
        );
        assert.equal(graph.omittedByAccess.links, 2);
      }
    } finally {
      await refs.recordTypes.reviseDefinition(String(type!.id), { relatedTo: [] });
      await records.updateOne({ redboxOid: 'read-record' }, { $unset: { 'metadata.links': '' } });
    }
  });
  it('reauthorizes persisted schema grants before considering conditional requests', async () => {
    const create = await read('/api/records/schemas/create/dataRecord');
    assert.equal(create.response.status, 200);
    const canonical = create.response.headers.get('link')!.split('>')[0].slice(1);
    await f.identities.update('user', { id: f.user.id }, { roles: [f.reader.id] });
    try {
      assert.equal((await read('/api/records/schemas/create/dataRecord')).response.status, 403);
      const denied = await fetch(f.url + canonical, {
        headers: { ...f.headers, 'If-None-Match': create.response.headers.get('etag')! },
      });
      assert.equal(denied.status, 404, await denied.text());
    } finally {
      await f.identities.update('user', { id: f.user.id }, { roles: [f.role.id] });
    }
    const update = await read('/api/records/schemas/update/read-record');
    assert.equal(update.response.status, 200);
    const updateCanonical = update.response.headers.get('link')!.split('>')[0].slice(1);
    await f.native
      .db()
      .collection('record')
      .updateOne({ redboxOid: 'read-record' }, { $set: { 'authorization.edit': [] } });
    try {
      const revoked = await fetch(f.url + updateCanonical, {
        headers: { ...f.headers, 'If-None-Match': update.response.headers.get('etag')! },
      });
      assert.equal(revoked.status, 404, await revoked.text());
      assert.equal((await read('/api/records/schemas/update/read-record')).response.status, 404);
    } finally {
      await f.native
        .db()
        .collection('record')
        .updateOne({ redboxOid: 'read-record' }, { $set: { 'authorization.edit': ['pilot-admin'] } });
    }
  });
  it('escapes caller-supplied record type strings in JSON export metadata', async () => {
    const type = 'unknown"type';
    const result = await read('/api/export/record/download/json?recType=' + encodeURIComponent(type));
    assert.equal(result.response.status, 200);
    assert.equal(result.body.recordType, type);
    assert.deepEqual(result.body.records, []);
  });
  it('preserves the legacy workspace redirect', async () => {
    const response = await fetch(f.url + '/default/rdmp/workspaces/list', { headers: f.headers, redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location')!, /dashboard\/workspace\?packageType=workspace/);
  });
  it('runs actual Bruno record-read and export requests', async () => {
    const cwd = path.resolve('test/http/fixtures/bruno-record-reads');
    const cli = path.resolve('../../test/bruno/node_modules/@usebruno/cli/bin/bru.js');
    const result = await promisify(execFile)(
      process.execPath,
      [cli, 'run', '--env-var', 'host=' + f.url, '--env-var', 'token=pilot-api-token', '--reporter-skip-all-headers'],
      { cwd, timeout: 30000, maxBuffer: 1024 * 1024 }
    );
    console.log(result.stdout);
  });
});

// Hold the real provider's page result at its I/O boundary. No alternate query or storage implementation.
function interceptRecordPages(f: Awaited<ReturnType<typeof readFixture>>) {
  const pages = Reflect.get(Object.getPrototypeOf(f.storage), 'recordCol') as {
    list(...args: unknown[]): Promise<unknown[]>;
  };
  const original = pages.list;
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let calls = 0;
  pages.list = async (...args) => {
    calls++;
    const result = await Reflect.apply(original, pages, args);
    entered.resolve();
    await release.promise;
    return result;
  };
  return {
    entered,
    release,
    calls: () => calls,
    restore: () => {
      pages.list = original;
    },
  };
}
describe('owned record export lifetime', () => {
  for (const format of ['csv', 'json'])
    it('drains an admitted ' + format + ' Mongo page after client abort before closing persistence', async () => {
      const f = await readFixture({ records: true });
      const barrier = interceptRecordPages(f);
      const controller = new AbortController();
      const pending = fetch(f.url + '/default/rdmp/api/export/record/download/' + format + '?recType=dataRecord', {
        headers: f.headers,
        signal: controller.signal,
      })
        .then(response => response.text())
        .catch(() => {});
      try {
        await barrier.entered.promise;
        controller.abort();
        await pending;
        let stopped = false;
        const stopping = f.host.stop().then(() => {
          stopped = true;
        });
        await new Promise(resolve => setTimeout(resolve, 40));
        assert.equal(stopped, false, 'persistence closed with an admitted page unresolved');
        barrier.release.resolve();
        await stopping;
        assert.equal(barrier.calls(), 1, 'cancelled export continued paging');
      } finally {
        barrier.release.resolve();
        barrier.restore();
        await f.close();
      }
    });
  it('propagates a page failure to the client and recovers without an unhandled stream error', async () => {
    const f = await readFixture({ records: true });
    const pages = Reflect.get(Object.getPrototypeOf(f.storage), 'recordCol') as {
      list(...args: unknown[]): Promise<unknown[]>;
    };
    const original = pages.list;
    try {
      pages.list = async (...args) => {
        await Reflect.apply(original, pages, args);
        throw new Error('private export backend failure');
      };
      for (const format of ['csv', 'json']) {
        let body = '';
        let failed = false;
        try {
          const response = await fetch(
            f.url + '/default/rdmp/api/export/record/download/' + format + '?recType=dataRecord',
            { headers: f.headers }
          );
          body = await response.text();
          failed = response.status === 500;
        } catch {
          failed = true;
        }
        assert(failed, 'failed export was reported as successful');
        assert(!body.includes('private export backend failure'));
      }
      pages.list = original;
      const response = await fetch(f.url + '/default/rdmp/api/export/record/download/json?recType=dataRecord', {
        headers: f.headers,
      });
      assert.equal(response.status, 200);
      assert((await response.json()).records.length > 0);
    } finally {
      pages.list = original;
      await f.close();
    }
  });
});
