import {
  conditionLabels,
  selectedResultFields,
  savedValueLabel,
  previewRows,
  previewValue,
  parameterRows,
  recordType,
} from './graphql-presentation';
import type { GraphqlNamedQueryDefinition } from '@researchdatabox/sails-ng-common';
describe('GraphQL editor presentation', () => {
  const draft: GraphqlNamedQueryDefinition = {
    source: 'graphql',
    graphql: {
      document:
        'query Q($condition_1:String){records(recordType:"rdmp",filters:[{field:"metadata:/title",contains:$condition_1}]){nodes{oid metadata{... on Example {label:title}}}}}',
      variables: {},
      resultPath: ['records', 'nodes'],
    },
  };
  it('labels the published condition from its document, independently of a changed saved source', () => {
    expect(
      conditionLabels(draft, { 'metadata:/title': 'Project title' }, key => (key === 'op-contains' ? 'Contains' : key))
    ).toEqual({ condition_1: 'Project title contains' });
  });
  it('uses resolved catalogue labels for selected response paths', () => {
    expect(selectedResultFields(draft, [{ path: ['oid'], label: 'OID', type: 'text' }])
      .find(field => field.path.join('.') === 'oid')?.label).toBe('OID');
  });
  it('offers literal response aliases and excludes internal type names and __typename', () => {
    const fields = selectedResultFields(draft);
    expect(fields.some(field => JSON.stringify(field.path) === JSON.stringify(['metadata', 'label']))).toBeTrue();
    expect(JSON.stringify(fields)).not.toContain('Example');
  });
  it('leaves invalid handwritten documents editable with no invented conditions', () => {
    expect(conditionLabels({ ...draft, graphql: { ...draft.graphql, document: 'query {' } }, {}, key => key)).toEqual(
      {}
    );
  });
  it('describes compound saved conditions without raw input-object keys', () => {
    expect(savedValueLabel({ from: { number: 5 }, to: { number: 12 } })).toBe('5 – 12');
    expect(savedValueLabel([{ text: 'Open' }, { text: 'Active' }])).toBe('Open, Active');
  });
  it('shows friendly preview fields and removes schema discriminators, including aliased selections', () => {
    const rows = [
      {
        oid: 'one',
        metadata: { __typename: 'M_dataPublication_draft_123456', label: 'Title' },
        kind: 'M_dataPublication_draft_123456',
      },
    ];
    expect(previewRows(rows, selectedResultFields(draft))).toEqual([{ Oid: 'one', Title: 'Title' }]);
    expect(previewValue({ metadata: rows[0].metadata })).toEqual({ metadata: { label: 'Title' } });
  });

  function query(document: string): GraphqlNamedQueryDefinition {
    return { source: 'graphql', graphql: { document, variables: {}, resultPath: ['records', 'nodes'] } };
  }

  it('uses fixed, candidate, operation and consumer defaults in their display precedence, including falsy values', () => {
    const q = query('query Q($fixed:Int,$candidate:Boolean,$operation:Int=0,$consumer:String,$empty:String,$first:Int){records(first:$first){nodes{oid}}}');
    q.graphql.variables = {
      fixed: { ownership: 'fixed', value: 0 },
      candidate: { ownership: 'consumer', parameter: 'flag', inputType: 'Boolean', required: false, defaultValue: true },
      operation: { ownership: 'consumer', parameter: 'count', inputType: 'Int', required: false, defaultValue: 10 },
      consumer: { ownership: 'consumer', parameter: 'term', inputType: 'String', required: false, defaultValue: '' },
    };
    const rows = parameterRows(q, key => key, { fixed: 'Saved count' }, { fixed: 99, candidate: false });
    expect(rows.map(row => row.value) as unknown[]).toEqual([0, false, 0, '', undefined, undefined]);
    expect(rows[0].label).toBe('Saved count');
    expect(rows.find(row => row.variable === 'first')!.paging).toBeTrue();
    expect(rows.find(row => row.variable === 'consumer')!.consumerAllowed).toBeTrue();
  });

  it('recognises lookup adapter paging even when there is no records selection', () => {
    const q = query('query Q($limit:Int,$filter:PlanFilter){health}');
    q.graphql.lookup = { mode: 'firstPage', collectionPath: [], hasNextPagePath: [], firstVariable: 'limit', afterVariable: '', searchParameter: '' };
    expect(parameterRows(q, key => key).map(row => [row.variable, row.paging, row.consumerAllowed]))
      .toEqual([['limit', true, true], ['filter', false, false]]);
  });

  it('resolves fragment spreads once, keeps aliases and ignores missing, cyclic and internal selections', () => {
    const q = query(`query Q { records { nodes { __typename ...Plan ...Plan ...Missing } } }
      fragment Plan on Record { id: oid details: metadata { title } ...Plan }`);
    const known = [{ label: 'Identifier', path: ['id'], type: 'number' }];
    expect(selectedResultFields(q, known)).toEqual([
      { label: 'Identifier', path: ['id'], type: 'number' },
      { label: 'Metadata', path: ['details'], type: 'object' },
      { label: 'Title', path: ['details', 'title'], type: 'text' },
    ]);
  });

  it('returns empty assistance for invalid documents and ambiguous operations', () => {
    for (const document of ['query {', 'query A { one } query B { two }']) {
      const q = query(document);
      expect(parameterRows(q, key => key)).toEqual([]);
      expect(selectedResultFields(q)).toEqual([]);
      expect(conditionLabels(q, {}, key => key)).toEqual({});
      expect(recordType(q)).toBeNull();
    }
  });

  it('only describes string record types from literals or fixed bindings', () => {
    expect(recordType(query('{ records(recordType:"rdmp") { nodes { oid } } }'))).toBe('rdmp');
    const q = query('query Q($type:String){ records(recordType:$type) { nodes { oid } } }');
    expect(recordType(q)).toBeNull();
    q.graphql.variables['type'] = { ownership: 'fixed', value: 'publication' };
    expect(recordType(q)).toBe('publication');
    q.graphql.variables['type'] = { ownership: 'fixed', value: 0 };
    expect(recordType(q)).toBeNull();
    expect(recordType(query('{ records { nodes { oid } } }'))).toBeNull();
    expect(recordType(query('{ health }'))).toBeNull();
  });

  it('ignores incomplete filters and labels nested variables using a readable field fallback', () => {
    const q = query(`query Q($term:String){records(filters:[null,{contains:$term},{field:1,contains:$term},
      {field:"metadata:/projectTitle",contains:{text:$term}}]){nodes{oid}}}`);
    expect(conditionLabels(q, {}, key => key === 'op-contains' ? 'Contains' : key))
      .toEqual({ term: 'Project Title contains' });
    expect(conditionLabels(query('{ records(filters:null){nodes{oid}} }'), {}, key => key)).toEqual({});
  });

  it('formats labelled objects and bounds deeply nested saved values', () => {
    expect(savedValueLabel({ projectTitle: 'A plan', enabled: { boolean: false }, count: { number: 0 } }))
      .toBe('Project Title: A plan, Enabled: false, Count: 0');
    let value: import('@researchdatabox/sails-ng-common').NamedQueryJson = 'deep';
    for (let depth = 0; depth < 14; depth++) value = [value];
    expect(savedValueLabel(value)).toBe('…');
  });

  it('disambiguates duplicate preview labels and leaves absent paths empty while stripping nested type names', () => {
    const fields = [
      { label: 'Title', path: ['primary'], type: 'text' },
      { label: 'Title', path: ['missing', 'title'], type: 'text' },
      { label: 'People', path: ['people'], type: 'object' },
    ];
    expect(previewRows([{ primary: 'Plan', people: [{ __typename: 'Person', name: 'Alice' }, null] }], fields))
      .toEqual([{ Title: 'Plan', 'Title (2)': undefined, People: [{ name: 'Alice' }, null] }]);
  });
});
