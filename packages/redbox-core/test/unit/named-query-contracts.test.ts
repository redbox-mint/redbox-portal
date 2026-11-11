import assert from 'node:assert/strict';
import { namedQueryDefinitionSchema, namedQueryExecutionResultSchema } from '../../src/api-routes/schemas/named-query';
import { buildOpenApiDocument } from '../../src/api-routes/openapi';
import { createNamedQueryRoute, updateNamedQueryRoute } from '../../src/api-routes/groups/named-query';
import { executeNamedQueryRoute } from '../../src/api-routes/groups/reports';

describe('source-aware named query route contracts', () => {
  const database = { collectionName: 'record', mongoQuery: {}, queryParams: [], resultObjectMapping: {} };
  const graphql = {
    source: 'graphql',
    graphql: { document: 'query { stale }', variables: {}, resultPath: ['matches', 'nodes'] },
  };
  it('accepts legacy arrays and both definition sources without dropping executable fields', () => {
    for (const definition of [database, { ...database, source: 'database' }, graphql])
      assert.deepEqual(namedQueryDefinitionSchema.parse(definition), definition);
  });
  it('rejects unknown sources and contradictory execution fields on either source', () => {
    for (const value of [
      { ...database, source: 'remote' },
      { ...database, graphql: graphql.graphql },
      { ...graphql, collectionName: 'record' },
    ])
      assert.equal(namedQueryDefinitionSchema.safeParse(value).success, false);
  });
  it('discriminates exact numeric database totals from unknown GraphQL totals and continuation', () => {
    const db = { records: [], summary: { numFound: 0, start: 0, page: 1 } };
    const gql = {
      source: 'graphql',
      records: [],
      summary: { numFound: null, start: 0, page: 1 },
      pagination: { mode: 'firstPage', hasNextPage: true },
    };
    for (const result of [db, { ...db, source: 'database' }, gql])
      assert.deepEqual(namedQueryExecutionResultSchema.parse(result), result);
    for (const invalid of [
      { ...gql, summary: db.summary },
      { ...db, source: 'graphql' },
      { ...gql, source: 'database' },
      { ...gql, pagination: undefined },
    ])
      assert.equal(namedQueryExecutionResultSchema.safeParse(invalid).success, false);
  });
  it('generates CRUD and execution contracts including the source union', () => {
    const doc = buildOpenApiDocument([createNamedQueryRoute, updateNamedQueryRoute, executeNamedQueryRoute], {
      title: 'Named queries',
      version: '1',
    });
    const json = JSON.stringify(doc);
    for (const fragment of ['graphql', 'ownership', 'resultPath', 'hasNextPage', 'firstPage'])
      assert.ok(json.includes(fragment), fragment);
  });
});
