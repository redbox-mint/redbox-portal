import type { ContractNode, RecordContract } from '../../src/record-contract';
import type { GridCatalogue, GridEnvironment, GridIndexSchema } from '../../src/record-graphql/grid-types';
import { SOLR_EXACT_ACL_FIELDS, SOLR_RECORD_GRID_FIELDS } from '../../src/config/solr.config';
import { createRecordYoga } from '../../src/record-graphql/schema';
import type { RecordModel } from '../../src/model/storage/RecordModel';
import type { ReadCaller } from '../../src/record-graphql/read-record';
import type { SolrFieldDefinition } from '../../src/config/solr.config';

const scalar = (type: 'string' | 'number' | 'boolean', label?: string): ContractNode => ({
  kind: 'scalar',
  scalarType: type,
  nullable: true,
  ...(label ? { annotations: { extensions: { 'x-redbox-label': label } } } : {}),
});
export const object = (properties: Record<string, ContractNode>): RecordContract['root'] => ({
  kind: 'object',
  nullable: false,
  unknownProperties: 'allow',
  properties,
});
export const gridCaller: ReadCaller = {
  brand: { id: 'brand-grid', name: 'default', css: '', roles: [] },
  portal: 'rdmp',
  user: { id: 'viewer', username: 'viewer' },
  roles: [],
};
export function gridContracts(): RecordContract[] {
  return ['draft', 'published'].map(stage => ({
    context: {
      brand: 'default',
      portal: 'rdmp',
      kind: 'update',
      operation: 'strict-all',
      enforcement: 'shadow',
      unknownProperties: 'allow',
      recordType: 'grid-fixture',
      workflowStep: stage,
      form: `${stage}-form`,
    },
    root: object({
      title: { ...scalar('string', 'Record title'), kind: 'scalar', scalarType: 'string', enum: ['first', 'second'] },
      amount: scalar('number', 'Budget'),
      active: scalar('boolean'),
      eventDate: scalar('string'),
      details: object({ note: scalar('string') }),
      people: { kind: 'array', nullable: true, items: object({ name: scalar('string') }) },
      'dc:title': scalar('string'),
      secret: { ...scalar('string'), annotations: { writeOnly: true } },
      ...(stage === 'published' ? { publication_note: scalar('string') } : {}),
    }),
    definitions: {},
    diagnostics: [],
    fieldOwners: {},
    validatorSummaries: [],
    completeness: 'complete',
  }));
}
export function gridSchema(): GridIndexSchema {
  const field = (name: string, type: string): SolrFieldDefinition => ({
    name,
    type,
    indexed: true,
    stored: true,
    multiValued: false,
    docValues: true,
  });
  return {
    uniqueKey: 'id',
    fields: [
      field('id', 'string'),
      ...SOLR_RECORD_GRID_FIELDS,
      ...SOLR_EXACT_ACL_FIELDS,
      field('grid_title', 'string'),
      field('grid_amount', 'pdouble'),
      field('grid_active', 'boolean'),
      field('grid_date', 'pdate'),
      field('grid_note', 'text_general'),
    ],
    dynamicFields: [{ ...field('*', 'string'), multiValued: true }],
    fieldTypes: [
      { name: 'string', class: 'solr.StrField' },
      { name: 'pdouble', class: 'solr.DoublePointField' },
      { name: 'pdate', class: 'solr.DatePointField' },
      { name: 'boolean', class: 'solr.BoolField' },
      { name: 'text_general', class: 'solr.TextField' },
    ],
  };
}
export function gridEnvironment(): GridEnvironment {
  const schema = gridSchema();
  return {
    coreId: 'default',
    schema,
    config: {
      options: { host: 'solr', port: 8983, core: 'redbox' },
      schema: { 'add-field': schema.fields, 'add-dynamic-field': schema.dynamicFields, 'add-copy-field': [] },
      recordGraphqlFields: {
        'metadata:/title': 'grid_title',
        'metadata:/amount': 'grid_amount',
        'metadata:/active': 'grid_active',
        'metadata:/eventDate': 'grid_date',
        'metadata:/details/note': 'grid_note',
        'metadata:/undeclared': 'grid_undeclared',
      },
      preIndex: {
        copy: [
          { source: 'metadata.title', dest: 'grid_title' },
          { source: 'metadata.amount', dest: 'grid_amount' },
          { source: 'metadata.active', dest: 'grid_active' },
          { source: 'metadata.eventDate', dest: 'grid_date' },
          { source: 'metadata.details.note', dest: 'grid_note' },
        ],
      },
    },
    cursorSecret: 'grid-fixture-shared-secret-at-least-32-characters',
    search: async () => ({ oids: [], nextCursor: '*', exhausted: true }),
  };
}
export function gridRecord(oid: string, stage = 'draft'): RecordModel {
  const auth = { view: ['viewer'], edit: [], viewRoles: [], editRoles: [], editPending: [], viewPending: [] };
  return {
    id: `id-${oid}`,
    redboxOid: oid,
    harvestId: '',
    dateCreated: '2026-01-01T00:00:00.000Z',
    lastSaveDate: '2026-01-02T00:00:00.000Z',
    metaMetadata: {
      brandId: gridCaller.brand.id,
      type: 'grid-fixture',
      form: `${stage}-form`,
      createdBy: 'owner',
      searchCore: 'default',
      attachmentFields: [],
    },
    workflow: { stage, stageLabel: stage },
    metadata: {
      title: oid,
      amount: 10,
      active: true,
      eventDate: '2026-01-01T00:00:00.000Z',
      details: { note: 'nested' },
      'dc:title': 'mapped',
      secret: 'hidden-secret',
      undeclared: 'undeclared-value',
    },
    authorization: { ...auth, stored: auth },
  };
}
export interface GridTestResponse {
  data?: {
    recordFields?: GridCatalogue;
    records?: { nodes: Array<Record<string, unknown>>; hasNextPage: boolean; endCursor: string | null };
    record?: Record<string, unknown>;
  };
  errors?: Array<{ message: string; extensions: { code: string }; path?: Array<string | number> }>;
}
export function gridHarness(ids = ['a', 'b', 'c'], contracts = gridContracts()) {
  const environment = gridEnvironment();
  const records = new Map(ids.map(oid => [oid, gridRecord(oid)]));
  const denied = new Set<string>();
  const calls: URLSearchParams[] = [];
  const reads: string[] = [];
  let environmentReads = 0;
  environment.search = async params => {
    calls.push(new URLSearchParams(params));
    const mark = params.get('cursorMark') ?? '*';
    const start = mark === '*' ? 0 : Number(mark.slice(2));
    const hits = ids.slice(start, start + Number(params.get('rows')));
    return { oids: hits, nextCursor: `m:${start + hits.length}`, exhausted: start + hits.length >= ids.length };
  };
  const { yoga, schema } = createRecordYoga(
    contracts,
    {
      getRecord: async oid => {
        reads.push(oid);
        const record = records.get(oid);
        if (!record) return undefined;
        return record;
      },
      hasViewAccess: (_caller, record) => !denied.has(record.redboxOid),
    },
    {
      getGridEnvironment: async () => {
        environmentReads++;
        return environment;
      },
    }
  );
  const query = async (query: string, variables: Record<string, unknown> = {}, caller = gridCaller) => {
    const response = await yoga.fetch(
      'http://redbox/graphql',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/graphql-response+json' },
        body: JSON.stringify({ query, variables }),
      },
      { caller }
    );
    const body: GridTestResponse = await response.json();
    return { status: response.status, body };
  };
  return {
    query,
    environment,
    contracts,
    schema,
    records,
    denied,
    calls,
    reads,
    environmentReads: () => environmentReads,
  };
}
