import assert from 'node:assert/strict';
import { firstValueFrom } from 'rxjs';
import { pilotFixture } from './pilotFixture';

describe('authenticated standalone record-type HTTP on real MongoDB', function () {
  this.timeout(30_000);
  let f: Awaited<ReturnType<typeof pilotFixture>>;
  afterEach(async () => f?.close());

  it('serves both exact public URLs with persisted data, full fields, versions and cache headers', async () => {
    f = await pilotFixture();
    const row = await f.recordTypes.findByName(f.brand.id, 'dataRecord');
    assert(row);
    const list = await fetch(f.url + '/default/rdmp/api/recordtypes', { headers: f.headers });
    assert.equal(list.status, 200);
    assert.equal(list.headers.get('Cache-Control'), 'no-cache, private');
    assert.equal(list.headers.get('Pragma'), 'no-cache');
    assert.equal(list.headers.get('Expires'), '0');
    assert.match(list.headers.get('Content-Type')!, /application\/json/);
    assert.deepEqual(await list.json(), { summary: { numFound: 1, page: 1, start: 0 }, records: [row] });
    for (const query of ['name=dataRecord', 'name=dataRecord&fields=name']) {
      const get = await fetch(f.url + '/default/rdmp/api/recordtypes/get?' + query, { headers: f.headers });
      assert.equal(get.status, 200);
      assert.deepEqual(await get.json(), row);
    }
    const v2 = await fetch(f.url + '/default/rdmp/api/recordtypes/get?name=dataRecord&apiVersion=2.0', {
      headers: f.headers,
    });
    assert.deepEqual(await v2.json(), { data: row, meta: {} });
    const selected = await firstValueFrom(f.domain.get(f.brand, 'dataRecord', ['packageType']));
    assert.equal(selected.packageType, 'dataRecord');
    assert.equal(Reflect.get(selected, 'name'), undefined, 'Domain projection remains supported independently of HTTP');
  });

  it('returns empty brand lists and the legacy missing-definition failure envelope', async () => {
    f = await pilotFixture();
    await f.recordTypes.removeForBrand(f.brand.id);
    const list = await fetch(f.url + '/default/rdmp/api/recordtypes', { headers: f.headers });
    assert.deepEqual(await list.json(), { summary: { numFound: 0, page: 1, start: 0 }, records: [] });
    for (const version of ['1.0', '2.0']) {
      const get = await fetch(f.url + '/default/rdmp/api/recordtypes/get?name=missing&apiVersion=' + version, {
        headers: f.headers,
      });
      assert.equal(get.status, 500);
      assert.deepEqual(await get.json(), { errors: [{ detail: 'Check server logs.' }], meta: {} });
    }
  });

  it('uses matched brand/portal/root scope for schema discovery and leaves absent groups at 404', async () => {
    f = await pilotFixture({ recordSchema: { enabled: true }, rootContext: '/research' });
    const result = await (
      await fetch(f.url + '/default/rdmp/api/recordtypes/get?name=dataRecord&branding=other&portal=evil', {
        headers: f.headers,
      })
    ).json();
    assert.equal(
      Reflect.get(result as object, 'recordSchemaCreateResolver'),
      '/research/default/rdmp/api/records/schemas/create/dataRecord'
    );
    for (const path of ['/default/rdmp/api/records', '/default/rdmp/record/type', '/user/login_local'])
      assert.equal((await fetch(f.url + path, { headers: f.headers })).status, 404);
    assert.equal(Reflect.get(globalThis, 'sails'), undefined);
    assert.equal(
      Object.keys(require.cache).some(path => /\/src\/(?:compat|controllers)\//.test(path)),
      false
    );
  });
});
