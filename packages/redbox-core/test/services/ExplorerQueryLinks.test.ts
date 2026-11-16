import assert from 'node:assert/strict';
import sinon from 'sinon';
import { ObjectId } from 'mongodb';
import type { GraphqlNamedQueryDefinition } from '@researchdatabox/sails-ng-common';
import { Services as Editors } from '../../src/services/NamedQueryEditorService';
import {
  Services as Grids,
  type SavedGridDocument,
  type SavedGridDefinition,
} from '../../src/services/SavedGridService';
import {
  explorerRecordType,
  namedQueryExplorerSources,
  publishedExplorations,
  validateExplorerReference,
} from '../../src/services/named-query/explorer-links';

const scope = { brandId: 'brand', portal: 'rdmp' };
const caller = {
  brand: { id: scope.brandId, name: 'default', css: '', roles: [] },
  portal: scope.portal,
  user: { username: 'author', displayName: 'Query Author' },
  roles: [],
};
const raw = () => ({
  version: 1 as const,
  mode: 'graphql' as const,
  name: 'Raw [plans]',
  document: 'query Q($type:String!){ records(recordType:$type){ nodes { oid } } }',
  variables: { type: 'plan' },
  resultPath: ['records', 'nodes'],
});
const visual = () => ({
  version: 1 as const,
  name: 'Visual plans',
  recordType: 'plan',
  columns: ['record:oid'],
  filters: [],
  sort: null,
  pageSize: 25 as const,
});
const candidate = (id: string, revision = 1, portal = scope.portal): GraphqlNamedQueryDefinition => ({
  source: 'graphql',
  name: 'published',
  graphql: {
    document: raw().document,
    variables: {},
    resultPath: raw().resultPath,
    provenance: { explorerId: id, explorerRevision: revision, explorerPortal: portal },
  },
});

/** Native collection fixture evaluates the actual Mongo criteria, including paging,
 * nested fields and literal regexes; no application filter logic is replaced. */
function matches(row: object, criteria: object): boolean {
  return Object.entries(criteria).every(([key, expected]) => {
    if (key === '$or') return expected.some((branch: object) => matches(row, branch));
    const actual = key
      .split('.')
      .reduce<unknown>((value, key) => (value && typeof value === 'object' ? Reflect.get(value, key) : undefined), row);
    if (expected && typeof expected === 'object' && !(expected instanceof ObjectId)) {
      if ('$in' in expected) return expected.$in.some((value: unknown) => String(value) === String(actual));
      if ('$gt' in expected) return String(actual) > String(expected.$gt);
      if ('$ne' in expected) return actual !== expected.$ne;
      if ('$regex' in expected)
        return typeof actual === 'string' && new RegExp(expected.$regex, expected.$options).test(actual);
    }
    return String(actual) === String(expected);
  });
}

describe('Saved explorer publication contracts', () => {
  let rows: SavedGridDocument[];
  let previous: Record<string, unknown>;
  let findNamed: sinon.SinonStub;
  let editor: Editors.NamedQueryEditor;
  let grids: Grids.SavedGrids;
  const add = (definition: SavedGridDefinition = raw(), extra: Partial<SavedGridDocument> = {}) => {
    const row: SavedGridDocument = { ...scope, _id: new ObjectId(), revision: 1, definition, ...extra };
    rows.push(row);
    return row;
  };
  beforeEach(() => {
    previous = Object.fromEntries(
      ['sails', 'SavedGrid', 'SavedGridService', 'NamedQuery', 'RecordGraphqlService'].map(key => [
        key,
        Reflect.get(globalThis, key),
      ])
    );
    rows = [];
    Reflect.set(globalThis, 'sails', { config: { recordtype: { plan: { labels: { name: 'Research plan' } } } } });
    const collection = {
      findOne: async (criteria: object) => rows.find(row => matches(row, criteria)),
      find: (criteria: object) => {
        let limit = Infinity;
        const cursor = {
          sort: () => cursor,
          limit: (value: number) => {
            limit = value;
            return cursor;
          },
          toArray: async () =>
            rows
              .filter(row => matches(row, criteria))
              .sort((a, b) => String(a._id).localeCompare(String(b._id)))
              .slice(0, limit),
        };
        return cursor;
      },
    };
    Reflect.set(globalThis, 'SavedGrid', {
      tableName: 'savedgrid',
      getDatastore: () => ({ manager: { collection: () => collection }, driver: { mongodb: { ObjectId } } }),
    });
    findNamed = sinon.stub().resolves([]);
    Reflect.set(globalThis, 'NamedQuery', { find: findNamed });
    Reflect.set(globalThis, 'RecordGraphqlService', {
      execute: sinon.stub().rejects(new Error('Raw draft must not execute')),
    });
    grids = new Grids.SavedGrids();
    Reflect.set(globalThis, 'SavedGridService', grids);
    editor = new Editors.NamedQueryEditor();
    sinon.stub(editor, 'canCreate').returns(true);
  });
  afterEach(() => {
    sinon.restore();
    for (const [key, value] of Object.entries(previous)) Reflect.set(globalThis, key, value);
  });
  it('filters modes including legacy visual, escapes literal search and paginates within scope', async () => {
    const first = add();
    for (let i = 0; i < 101; i++) add(raw(), { definition: { ...visual(), name: `Plan ${i}` } });
    add(raw(), { portal: 'other' });
    add(raw(), { brandId: 'other' });
    assert.equal((await grids.list(scope, undefined, { q: '[plans]' })).grids.length, 1);
    assert.equal((await grids.list(scope, undefined, { mode: 'graphql' })).grids[0].id, String(first._id));
    const page = await editor.savedExplorations(caller, undefined, { mode: 'visual', q: 'PLAN' });
    assert.equal(page.grids.length, 100);
    assert.equal(page.next, page.grids.at(-1)!.id);
    assert.equal(page.grids[0].mode, 'visual');
    assert.equal(page.grids[0].recordType, 'plan');
    assert.equal(page.grids[0].recordTypeLabel, 'Research plan');
    assert.deepEqual(page.grids[0].publishedAs, []);
    assert.equal(Object.hasOwn(page.grids[0], 'document'), false);
    assert.equal((await editor.savedExplorations(caller, page.next!, { mode: 'visual', q: 'PLAN' })).grids.length, 1);
    await assert.rejects(grids.list(scope, undefined, { mode: 'bad' } as never), { status: 400 });
    await assert.rejects(grids.list(scope, 'bad'), { status: 400 });
  });
  it('prepares an exact saved revision without writes/execution and requires destination permission first', async () => {
    const row = add(raw(), {
      updatedBy: { username: 'author', displayName: 'Query Author' },
      updatedAt: '2026-11-12T00:00:00Z',
    });
    const input = { id: String(row._id), revision: 1 };
    const prepared = await editor.prepareSavedExploration(input, caller);
    assert.deepEqual(prepared.definition.graphql.provenance, candidate(input.id).graphql.provenance);
    assert.deepEqual(prepared.variableValues, raw().variables);
    assert.deepEqual(prepared.definition.graphql.variables, {});
    await assert.rejects(editor.prepareSavedExploration({ ...input, revision: 2 }, caller), {
      status: 409,
      code: 'revision-conflict',
    });
    await assert.rejects(editor.prepareSavedExploration(input, { ...caller, portal: 'other' }), { status: 404 });
    await assert.rejects(editor.prepareSavedExploration({ ...input, extra: true }, caller), { status: 400 });
    sinon.stub(grids, 'read').rejects(new Error('Do not read before permission'));
    (editor.canCreate as sinon.SinonStub).returns(false);
    await assert.rejects(editor.prepareSavedExploration(input, caller), {
      status: 403,
      code: 'NAMED_QUERY_CREATE_FORBIDDEN',
    });
  });
  it('reports multiple publications, revision drift, author and missing sources without following other portals', async () => {
    const row = add(raw(), { revision: 2, updatedBy: { username: 'author', displayName: 'Query Author' } });
    const linked = candidate(String(row._id));
    findNamed.resolves(
      ['z', 'a']
        .map(name => ({ name, graphql: JSON.stringify(linked.graphql) }))
        .concat([
          { name: 'other', graphql: JSON.stringify(candidate(String(row._id), 1, 'other').graphql) },
          {
            name: 'legacy',
            graphql: JSON.stringify({
              ...linked.graphql,
              provenance: { explorerId: String(row._id), explorerRevision: 1 },
            }),
          },
        ])
    );
    const published = await publishedExplorations(scope, [{ id: String(row._id), revision: row.revision }]);
    assert.deepEqual(
      published[0].publishedAs,
      ['a', 'z'].map(name => ({ name, publishedRevision: 1, changedSincePublished: true }))
    );
    assert.deepEqual(findNamed.firstCall.args[0], { branding: scope.brandId, source: 'graphql' });
    const [resolved] = await namedQueryExplorerSources(scope, [linked]);
    assert.equal(resolved.sourceSavedQuery!.changedSincePublished, true);
    assert.equal(resolved.sourceSavedQuery!.name, row.definition.name);
    assert.deepEqual(resolved.sourceSavedQuery!.updatedBy, row.updatedBy);
    assert.equal(resolved.sourceSavedQuery!.recordType, 'plan');
    assert.equal((await namedQueryExplorerSources({ ...scope, portal: 'other' }, [linked]))[0].sourceSavedQuery, null);
    rows = [];
    const missing = (await namedQueryExplorerSources(scope, [linked]))[0].sourceSavedQuery!;
    assert.equal(missing.missing, true);
    assert.equal(missing.changedSincePublished, null);
    const hand = structuredClone(linked);
    delete hand.graphql.provenance;
    assert.equal((await namedQueryExplorerSources(scope, [hand]))[0].sourceSavedQuery, null);
    hand.graphql.provenance = { explorerId: String(row._id), explorerRevision: 1 };
    assert.equal((await namedQueryExplorerSources(scope, [hand]))[0].sourceSavedQuery, null);
  });
  it('checks new links, preserves unchanged links after deletion and supports repairing invalid stored documents', async () => {
    const row = add();
    const linked = candidate(String(row._id));
    await validateExplorerReference(linked, caller);
    await assert.rejects(validateExplorerReference(linked), { status: 403 });
    await assert.rejects(validateExplorerReference(candidate(String(row._id), 2), caller), { status: 409 });
    await assert.rejects(validateExplorerReference(linked, { ...caller, portal: 'other' }), { status: 403 });
    await assert.rejects(validateExplorerReference(linked, { ...caller, brand: { ...caller.brand, id: 'other' } }), {
      status: 404,
    });
    rows = [];
    await assert.rejects(validateExplorerReference(linked, caller), { status: 404 });
    await validateExplorerReference(
      linked,
      { ...caller, portal: 'other' },
      { source: 'graphql', graphql: JSON.stringify(linked.graphql) }
    );
    // Existing authorized bearer/server updates need no source session when retaining the exact link.
    await validateExplorerReference(linked, undefined, { source: 'graphql', graphql: JSON.stringify(linked.graphql) });
    const hand = structuredClone(linked);
    delete hand.graphql.provenance;
    await validateExplorerReference(hand, caller, { source: 'graphql', graphql: '{invalid' });
  });
  it('infers an unambiguous raw record type from literals, variables or defaults without execution', () => {
    assert.equal(explorerRecordType(raw()), 'plan');
    assert.equal(
      explorerRecordType({
        ...raw(),
        document: 'query Q($type:String="plan"){ records(recordType:$type){nodes{oid}} }',
        variables: {},
      }),
      'plan'
    );
    assert.equal(
      explorerRecordType({
        ...raw(),
        document: '{ a:records(recordType:"one"){nodes{oid}} b:records(recordType:"two"){nodes{oid}} }',
      }),
      null
    );
    assert.equal(explorerRecordType({ ...raw(), document: '{ __typename }' }), null);
  });
});
