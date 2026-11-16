import {
  cursorBinding,
  editorErrors,
  editorSchema,
  rawDefinition,
  rawRows,
  recordIdentityKey,
  resultArrays,
  schemaFields,
} from './graphql-query';
import { parseSavedQuery } from './record-grid.protocol';

import { testSdl } from './data-grid.testing';
describe('GraphQL editor contract', () => {
  const schema = editorSchema(testSdl);
  it('validates real schema selections, variables, syntax and read-only operations', () => {
    const raw = rawDefinition();
    raw.variables['type'] = 'plan';
    expect(editorErrors(schema, raw.document, JSON.stringify(raw.variables))).toEqual([]);
    expect(
      editorErrors(schema, raw.document.replace('oid', 'invented'), JSON.stringify(raw.variables)).join()
    ).toContain('invented');
    expect(editorErrors(schema, raw.document, '[]').length).toBeGreaterThan(0);
    expect(editorErrors(schema, raw.document, '{}').join()).toContain('type');
    expect(editorErrors(schema, 'mutation { remove }', '{}').join()).toContain('read-only');
    expect(editorErrors(schema, '{', '{}').length).toBeGreaterThan(0);
    expect(editorErrors(null, raw.document, JSON.stringify(raw.variables)).length).toBeGreaterThan(0);
    expect(schemaFields(schema, 'Record', 'tit').map(field => field.name)).toEqual(['title']);
  });
  it('recognizes only explicit collection cursor bindings and never invents pagination', () => {
    const raw = rawDefinition();
    expect(cursorBinding(raw.document, raw.variables, raw.resultPath)?.after).toBe('after');
    expect(cursorBinding(raw.document.replace('after: $after', ''), raw.variables, raw.resultPath)).toBeNull();
    expect(cursorBinding(raw.document, raw.variables, ['elsewhere'])).toBeNull();
    expect(
      cursorBinding(
        raw.document.replace('$after: String', '$after: String = \"cursor\"'),
        raw.variables,
        raw.resultPath
      )
    ).toBeNull();
    expect(
      cursorBinding(raw.document.replace('recordType: $type', 'recordType: $after'), raw.variables, raw.resultPath)
    ).toBeNull();
    expect(cursorBinding('{ records(recordType:"plan") { nodes { oid } } }', {}, ['records', 'nodes'])).toBeNull();
  });
  it('requires an explicit array mapping and flattens scalar leaves safely without rendering HTML', () => {
    const data = { a: [{ oid: '1', metadata: { title: '<img>' }, tags: ['a'] }], b: [{ oid: '2' }] };
    expect(resultArrays(data)).toEqual([['a'], ['b']]);
    const mapped = rawRows(data, ['a']);
    expect(mapped.columns).toEqual(['oid', 'metadata.title', 'tags']);
    expect<unknown>(mapped.rows[0].values['metadata.title']).toBe('<img>');
    expect(() => rawRows(data, [])).toThrow();
    expect(() => rawRows(data, ['missing'])).toThrow();
    expect(() => rawRows({ a: Array(101).fill({}) }, ['a'])).toThrow();
  });
  it('rejects colliding JSON property paths within a row instead of losing either value', () => {
    for (const key of ['a.b', 'a/b', 'a:b', '', 'a b', 'a[0]']) {
      expect(() => rawRows({ nodes: [{ payload: { [key]: 1, a: { b: 2 } } }] }, ['nodes'])).toThrow();
    }
  });
  it('rejects unsafe path segments across heterogeneous rows in either order', () => {
    const rows = [{ payload: { 'a.b': 1 } }, { payload: { a: { b: 2 } } }];
    expect(() => rawRows({ nodes: rows }, ['nodes'])).toThrow();
    expect(() => rawRows({ nodes: [...rows].reverse() }, ['nodes'])).toThrow();
  });
  it('preserves arbitrary names inside nested repeated cells that are never flattened', () => {
    const groups = [{ 'a.b': 1, a: { b: 2 }, children: [[{ 'name.email': 'one', name: { email: 'two' } }]] }];
    const mapped = rawRows({ nodes: [{ payload: { groups }, ordinary: { name: 'Visible' } }] }, ['nodes']);
    expect(mapped.columns).toEqual(['payload.groups', 'ordinary.name']);
    expect(JSON.stringify(mapped.rows[0].values['payload.groups'])).toBe(JSON.stringify(groups));
    expect<unknown>(mapped.rows[0].values['ordinary.name']).toBe('Visible');
    expect(() => rawRows({ nodes: [{ payload: { 'a.b': groups } }] }, ['nodes'])).toThrow();
  });
  it('retains empty objects separately from missing and null values, including nested empty objects', () => {
    const data = {
      nodes: [
        { oid: 'one', payload: {} },
        { oid: 'two' },
        { oid: 'three', payload: null },
        { oid: 'four', payload: { child: {} } },
      ],
    };
    const mapped = rawRows(data, ['nodes']);
    expect(mapped.columns).toEqual(['oid', 'payload', 'payload.child']);
    expect(JSON.stringify(mapped.rows[0].values['payload'])).toBe('{}');
    expect(Object.hasOwn(mapped.rows[1].values, 'payload')).toBeFalse();
    expect<unknown>(mapped.rows[2].values['payload']).toBeNull();
    expect(JSON.stringify(mapped.rows[3].values['payload.child'])).toBe('{}');
    const repeated = rawRows({ nodes: [{ groups: [{ nested: {} }, {}, []] }] }, ['nodes']);
    expect(JSON.stringify(repeated.rows[0].values['groups'])).toBe(JSON.stringify([{ nested: {} }, {}, []]));
  });
  it('rejects synthetic root-value column aliases across heterogeneous rows', () => {
    for (const rows of [
      [0, { value: 1 }],
      [{}, { value: 1 }],
      [[], { value: 1 }],
    ]) {
      expect(() => rawRows({ nodes: rows }, ['nodes'])).toThrow();
      expect(() => rawRows({ nodes: [...rows].reverse() }, ['nodes'])).toThrow();
    }
    expect(JSON.stringify(rawRows({ nodes: [{}] }, ['nodes']).rows[0].values['value'])).toBe('{}');
    expect<unknown>(rawRows({ nodes: [0, false, null, ''] }, ['nodes']).rows[0].values['value']).toBe(0);
  });
  it('applies the same variable depth bound to editing and saved transport, including arrays', () => {
    const raw = rawDefinition('Bounded');
    raw.variables['type'] = 'plan';
    for (const array of [false, true]) {
      const nested = (depth: number) => {
        let value: import('./data-grid.model').JsonValue = 'leaf';
        for (let i = 0; i < depth; i++) value = array ? [value] : { nested: value };
        return value;
      };
      raw.variables['extra'] = nested(30);
      expect(editorErrors(schema, raw.document, JSON.stringify(raw.variables))).toEqual([]);
      expect(parseSavedQuery({ ...raw, id: '123456789012345678901234', revision: 1 }).mode).toBe('graphql');
      raw.variables['extra'] = nested(31);
      expect(editorErrors(schema, raw.document, JSON.stringify(raw.variables)).join()).toContain('30');
      expect(() => parseSavedQuery({ ...raw, id: '123456789012345678901234', revision: 1 })).toThrow();
    }
  });
  it('requires AST-proven direct unconditional OIDs instead of trusting aliased response names', () => {
    const raw = rawDefinition();
    const replace = (selection: string) => raw.document.replace('oid recordType workflowStep', selection);
    expect(recordIdentityKey(raw.document, raw.resultPath)).toBe('oid');
    for (const selection of [
      'oid: recordType title: oid',
      'actual: oid title: recordType',
      'oid @skip(if: true)',
      'oid @include(if: true)',
      '... on Record { oid }',
      '...Identity',
    ]) {
      const document =
        replace(selection) + (selection === '...Identity' ? '\nfragment Identity on Record { oid }' : '');
      expect(recordIdentityKey(document, raw.resultPath)).toBeNull();
      expect(
        rawRows({ records: { nodes: [{ oid: 'plan', title: 'actual' }] } }, raw.resultPath).rows[0].recordOid
      ).toBeUndefined();
    }
    expect(
      rawRows(
        { records: { nodes: [{ oid: 'actual' }] } },
        raw.resultPath,
        recordIdentityKey(raw.document, raw.resultPath)
      ).rows[0].recordOid
    ).toBe('actual');
  });
  it('parses mode-discriminated saved queries and rejects malformed mappings/variables', () => {
    const saved = { ...rawDefinition('Plans'), id: '123456789012345678901234', revision: 1 };
    expect(parseSavedQuery(saved)).toEqual(saved);
    for (const patch of [
      { resultPath: ['bad.path'] },
      { variables: [] },
      { document: 4 },
      { mode: 'other' },
      { query: '{}' },
    ]) {
      expect(() => parseSavedQuery({ ...saved, ...patch })).toThrow();
    }
  });
});
