import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { httpRouteFixture } from '../../helpers/httpRouteFixture';
import { mountQueryReadRoutes } from '../../../src/http/express/queryReads';
import { mountQueryWriteRoutes } from '../../../src/http/express/queryWrites';
import { namedQueryTarget } from '../../../src/persistence/reference/NamedQueryExecution';

const base = '/default/portal/api/named-query';
const definition = {
  name: 'new-query',
  collectionName: 'record',
  mongoQuery: {},
  queryParams: {},
  resultObjectMapping: {},
};
describe('Named query Express contracts', () => {
  let f: Awaited<ReturnType<typeof httpRouteFixture>>;
  let queries: Record<string, sinon.SinonStub>;
  beforeEach(async () => {
    queries = {
      list: sinon.stub().resolves([
        { ...definition, name: 'query-1' },
        { ...definition, name: 'query-2', collectionName: 'user' },
      ]),
      getNamedQueryConfig: sinon.stub().resolves(null),
      getSupportedCollections: sinon.stub().returns(['record', 'user']),
      create: sinon.stub().resolves({ id: 'new-query' }),
      update: sinon.stub().resolves([{ id: 'updated-query' }]),
      delete: sinon.stub().resolves([{ id: 'deleted-query' }]),
    };
    f = await httpRouteFixture((router, input) => {
      mountQueryReadRoutes(router, { ...input, queries } as any);
      mountQueryWriteRoutes(router, { ...input, queries, audit: sinon.stub().resolves() } as any);
    });
  });
  afterEach(async () => {
    await f?.close();
  });
  it('lists all named queries', async () => {
    const result = await f.request(base);
    assert.equal(result.status, 200);
    assert(queries.list.calledOnce);
    assert.equal(result.body.length, 2);
    assert.equal(result.body[0].name, 'query-1');
    assert.equal(queries.list.firstCall.args[0].id, f.brand.id);
  });
  it('returns supported collections', async () => {
    const result = await f.request(base + '/collections');
    assert.equal(result.status, 200);
    assert(queries.getSupportedCollections.calledOnce);
    assert.deepEqual(result.body, ['record', 'user']);
  });
  it('gets a named query by name', async () => {
    queries.getNamedQueryConfig.resolves({ ...definition, name: 'query-1' });
    const result = await f.request(base + '/query-1');
    assert.equal(result.status, 200);
    assert.equal(result.body.name, 'query-1');
    assert(queries.getNamedQueryConfig.calledOnce);
  });
  it('returns 404 for a missing query', async () => {
    const result = await f.request(base + '/missing-query');
    assert.equal(result.status, 404);
    assert.match(result.body.message, /not found/);
  });
  it('does not route an empty get name to a definition read', async () => {
    const result = await f.request(base + '/');
    assert.equal(result.status, 200);
    assert(queries.list.calledOnce);
    assert(!queries.getNamedQueryConfig.called);
  });
  it('creates a named query', async () => {
    const result = await f.request(base, { method: 'POST', body: definition });
    assert.equal(result.status, 201);
    assert(queries.create.calledOnce);
    assert.equal(result.body.name, 'new-query');
    assert.equal(queries.create.firstCall.args[0].id, f.brand.id);
    assert.equal(queries.create.firstCall.args[1], 'new-query');
  });
  it('returns 400 for a reserved create name', async () => {
    const result = await f.request(base, { method: 'POST', body: { ...definition, name: 'collections' } });
    assert.equal(result.status, 400);
    assert.match(result.body.message, /reserved/);
    assert(!queries.create.called);
  });
  it('returns 400 for a missing create name', async () => {
    const { name: _, ...body } = definition;
    const result = await f.request(base, { method: 'POST', body });
    assert.equal(result.status, 400);
    assert(!queries.create.called);
  });
  it('maps an already existing query to 409', async () => {
    queries.create.rejects(new Error("Named query 'new-query' already exists"));
    assert.equal((await f.request(base, { method: 'POST', body: definition })).status, 409);
  });
  for (const [label, target, method] of [
    ['unscoped create', 'unscopedmodel', 'POST'],
    ['unknown create', 'badmodel', 'POST'],
    ['unscoped update', 'unscopedmodel', 'PUT'],
  ])
    it(`maps ${label} collection validation to 400`, async () => {
      queries[method === 'POST' ? 'create' : 'update'].callsFake(() =>
        namedQueryTarget({ config: {}, log: { warn() {} } }, target)
      );
      const result = await f.request(base + (method === 'PUT' ? '/new-query' : ''), {
        method,
        body: { ...definition, collectionName: target },
      });
      assert.equal(result.status, 400);
      assert(!result.text.includes('p3-r-operations.md'));
    });
  it('updates a named query', async () => {
    const { name: _, ...body } = definition;
    const result = await f.request(base + '/query-1', { method: 'PUT', body });
    assert.equal(result.status, 200);
    assert(queries.update.calledOnce);
    assert.equal(result.body.name, 'query-1');
  });
  it('does not dispatch an update without a route name', async () => {
    assert.equal((await f.request(base + '/', { method: 'PUT', body: {} })).status, 404);
    assert(!queries.update.called);
  });
  it('returns 400 when update changes the name', async () => {
    const result = await f.request(base + '/query-1', { method: 'PUT', body: { ...definition, name: 'query-2' } });
    assert.equal(result.status, 400);
    assert(!queries.update.called);
  });
  it('maps missing update definitions to 404', async () => {
    queries.update.rejects(new Error("Named query 'missing-query' not found"));
    const { name: _, ...body } = definition;
    assert.equal((await f.request(base + '/missing-query', { method: 'PUT', body })).status, 404);
  });
  it('deletes a named query', async () => {
    const result = await f.request(base + '/query-1', { method: 'DELETE' });
    assert.equal(result.status, 200);
    assert(queries.delete.calledOnce);
    assert.equal(result.body.name, 'query-1');
  });
  it('does not dispatch a deletion without a route name', async () => {
    assert.equal((await f.request(base + '/', { method: 'DELETE' })).status, 404);
    assert(!queries.delete.called);
  });
  it('maps missing delete definitions to 404', async () => {
    queries.delete.rejects(new Error("Named query 'missing-query' not found"));
    assert.equal((await f.request(base + '/missing-query', { method: 'DELETE' })).status, 404);
  });
});
