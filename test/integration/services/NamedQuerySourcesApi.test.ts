import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import supertest from 'supertest';
import { firstValueFrom } from 'rxjs';

/** Actual HTTP/policy/Waterline coverage; no live GraphQL schema is needed for T03. */
describe('named query source CRUD API', function () {
  const prefix = `/default/rdmp/api/named-query`;
  const name = `sources_${randomUUID().replace(/-/g, '')}`;
  const token = randomUUID();
  const database = { name, collectionName: 'record', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} };
  const graphql = {
    name,
    source: 'graphql',
    graphql: {
      document: 'query { removedCollection { nodes { oid } } }',
      variables: {},
      resultPath: ['removedCollection', 'nodes'],
      mappings: { oid: ['oid'], title: ['metadata', 'dc:title'] },
    },
  };
  let adminId: string | undefined;
  let previousToken: string | null | undefined;
  let brand: ReturnType<typeof BrandingService.getBrand>;
  const request = () => supertest(sails.hooks.http.app);
  const auth = () => ({ Authorization: `Bearer ${token}`, 'X-ReDBox-Api-Version': '2.0' });
  before(async () => {
    brand = BrandingService.getBrand('default');
    const admin = await User.findOne({ username: 'admin' });
    assert.ok(admin);
    adminId = admin.id;
    previousToken = admin.token;
    await firstValueFrom(UsersService.setUserKey(adminId, token));
  });
  after(async () => {
    if (brand) await NamedQuery.destroy({ key: `${brand.id}_${name}` });
    if (adminId) await User.update({ id: adminId }, { token: previousToken });
  });
  it('round trips legacy database and GraphQL CRUD with brand ownership and source replacement', async () => {
    await request().post(prefix).set(auth()).send(database).expect(201);
    const legacy = (await request().get(`${prefix}/${name}`).set(auth()).expect(200)).body.data;
    assert.equal(legacy.source, undefined);
    assert.deepEqual(legacy.mongoQuery, {});
    await request().put(`${prefix}/${name}`).set(auth()).send(legacy).expect(200);
    await request().put(`${prefix}/${name}`).set(auth()).send(graphql).expect(200);
    const read = (await request().get(`${prefix}/${name}`).set(auth()).expect(200)).body.data;
    assert.equal(read.source, 'graphql');
    assert.deepEqual(read.graphql, graphql.graphql);
    assert.equal(Object.hasOwn(read, 'collectionName'), false);
    const row = await NamedQuery.findOne({ key: `${brand.id}_${name}` });
    assert.ok(row);
    assert.equal(String(row.branding), String(brand.id));
    await request().put(`${prefix}/${name}`).set(auth()).send(read).expect(200);
    const list = (await request().get(prefix).set(auth()).expect(200)).body.data;
    assert.ok(
      list.some((value: { name: string; source?: string }) => value.name === name && value.source === 'graphql')
    );
    await request().delete(`${prefix}/${name}`).set(auth()).expect(200);
    await request().get(`${prefix}/${name}`).set(auth()).expect(404);
  });
  it('returns 400 for unknown sources and contradictions without creating a record', async () => {
    for (const invalid of [
      { ...database, source: 'remote' },
      { ...database, graphql: graphql.graphql },
      { ...graphql, mongoQuery: {} },
    ]) {
      await request().post(prefix).set(auth()).send(invalid).expect(400);
    }
    assert.equal(await NamedQuery.findOne({ key: `${brand.id}_${name}` }), undefined);
  });
});
