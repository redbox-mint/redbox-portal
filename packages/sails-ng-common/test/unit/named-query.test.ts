import assert from 'node:assert/strict';
import type {
  DatabaseNamedQueryResult,
  GraphqlNamedQueryResult,
  NamedQueryExecutionResult,
  NamedQueryDefinition,
  NamedQueryLookupResult,
  NamedQuerySourceDescription,
  NamedQuerySourcePreview,
  NamedQueryCatalogueEntry,
} from '../../src';

/** These consumers compile against shared DTOs alone, without server or Angular imports. */
function total(result: NamedQueryExecutionResult): number | null {
  if (result.source === 'graphql') {
    const unknownTotal: null = result.summary.numFound;
    return unknownTotal;
  }
  const numericTotal: number = result.summary.numFound;
  return numericTotal;
}

describe('shared named query contracts', () => {
  it('keeps database payloads unchanged and carries honest first-page GraphQL continuation', () => {
    const database: DatabaseNamedQueryResult = { records: [], summary: { numFound: 9, start: 0, page: 1 } };
    const graphql: GraphqlNamedQueryResult = {
      source: 'graphql',
      records: [],
      summary: { numFound: null, start: 0, page: 1 },
      pagination: { mode: 'firstPage', hasNextPage: true },
    };
    assert.equal(total(database), 9);
    assert.equal(total(graphql), null);
    const lookup: NamedQueryLookupResult<string> = { source: 'graphql', options: ['one'], summary: graphql.summary, pagination: graphql.pagination };
    // An array adapter can keep its established return type while a new method carries metadata.
    const legacy: string[] = lookup.options;
    assert.deepEqual(legacy, ['one']);
    assert.equal(lookup.pagination?.hasNextPage, true);
    assert.equal(lookup.summary.numFound, null);
  });
});

// Negative compilation assertions protect source narrowing and numeric report contracts.
function contractsOnly(description: NamedQuerySourceDescription, preview: NamedQuerySourcePreview): void {
  if (description.source === 'graphql') description.parameters.forEach(binding => binding.variable);
  if (preview.source === 'graphql') {
    const unknownTotal: null = preview.summary.numFound;
    void unknownTotal;
  }
  const wrong: GraphqlNamedQueryResult = {
    source: 'graphql',
    records: [],
    // @ts-expect-error An exact numeric total cannot represent GraphQL's unknown total.
    summary: { numFound: 0, start: 0, page: 1 },
    pagination: { mode: 'firstPage', hasNextPage: false },
  };
  // @ts-expect-error Database execution fields are forbidden in GraphQL definitions.
  const contradictory: NamedQueryDefinition = {
    source: 'graphql',
    collectionName: 'record',
    graphql: { document: 'query { record }', variables: {}, resultPath: [] },
  };
  void wrong;
  void contradictory;
}
void contractsOnly;

function catalogueOnly(entry: NamedQueryCatalogueEntry): NamedQueryDefinition | undefined {
  if (entry.valid === false) {
    const rawSource: unknown = entry.source;
    // @ts-expect-error A damaged catalogue entry must never become an executable definition.
    const definition: NamedQueryDefinition = entry;
    void rawSource;
    void definition;
    return undefined;
  }
  return entry;
}
void catalogueOnly;
