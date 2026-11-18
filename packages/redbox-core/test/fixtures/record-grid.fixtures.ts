import type { ContractNode, RecordContract } from '../../src/record-contract';
import type { GridCatalogue, GridEnvironment, GridStorageRequest } from '../../src/record-graphql/grid-types';
import { createRecordYoga } from '../../src/record-graphql/schema';
import type { RecordModel } from '../../src/model/storage/RecordModel';
import type { ReadCaller } from '../../src/record-graphql/read-record';

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
      eventDate: { ...scalar('string'), annotations: { extensions: { 'x-redbox-format': 'date-time' } } },
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
export function gridEnvironment(): GridEnvironment {
  return {
    cursorSecret: 'grid-fixture-shared-secret-at-least-32-characters',
    execute: async () => ({ candidates: [], exhausted: true }),
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
  const calls: GridStorageRequest[] = [];
  const reads: string[] = [];
  let environmentReads = 0;
  environment.execute = async request => {
    calls.push(request);
    const start = request.after ? ids.indexOf(String(request.after.keys[0])) + 1 : 0;
    const hits = ids.slice(start, start + 50);
    return { candidates: hits.map(oid => ({ oid, keys: [oid] })), exhausted: start + hits.length >= ids.length };
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
