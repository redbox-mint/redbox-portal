import {
  GraphQLError,
  GraphQLID,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  GraphQLUnionType,
  Kind,
  parse,
  type DocumentNode,
  type FragmentDefinitionNode,
  type SelectionSetNode,
  type ValidationRule,
} from 'graphql';
import { createYoga, type Plugin } from 'graphql-yoga';
import { DateTime } from 'luxon';
import type { RecordContract } from '../record-contract/types';
import type { ReadCaller, ReadPorts } from './read-record';
import { gridFields } from './grid-schema';
import { COLLECTION_ROW, type GridPorts, type GridEnvironment } from './grid-types';
import { readAuthorizedRecord } from './read-record';
import type { RecordModel as ReadRecord } from '../model/storage/RecordModel';
import { fromTree, isObject, metadataTypeName, renderMetadata } from './renderer';

export const QUERY_LIMITS = Object.freeze({
  bytes: 65_536,
  tokens: 2_000,
  fields: 200,
  depth: 12,
  recordAliases: 5,
  selectionSteps: 2_000,
  workUnits: 10_000,
  responseBytes: 262_144,
  timeoutMs: 5_000,
});

export function boundedQueryRule(): ValidationRule {
  return context => ({
    Document(document: DocumentNode) {
      const fragments = new Map<string, FragmentDefinitionNode>();
      let fields = 0;
      let aliases = 0;
      let collections = 0;
      let catalogues = 0;
      let maxDepth = 0;
      let operations = 0;
      let invalidOperation = false;
      let discovery = false;
      let steps = 0;
      let cycle = false;
      for (const definition of document.definitions) {
        if (definition.kind === Kind.FRAGMENT_DEFINITION) fragments.set(definition.name.value, definition);
      }
      const visit = (selection: SelectionSetNode, depth: number, active: ReadonlySet<string>): void => {
        if (cycle || ++steps > QUERY_LIMITS.selectionSteps) return;
        maxDepth = Math.max(depth, maxDepth);
        if (fields > QUERY_LIMITS.fields || depth > QUERY_LIMITS.depth || aliases > QUERY_LIMITS.recordAliases) return;
        for (const field of selection.selections) {
          if (cycle || ++steps > QUERY_LIMITS.selectionSteps) return;
          if (fields > QUERY_LIMITS.fields || aliases > QUERY_LIMITS.recordAliases) return;
          if (field.kind === Kind.FIELD) {
            fields += 1;
            if (depth === 1 && ['record', 'records', 'recordFields'].includes(field.name.value)) aliases += 1;
            if (depth === 1 && field.name.value === 'records') collections++;
            if (depth === 1 && field.name.value === 'recordFields') catalogues++;
            if (field.name.value === '__schema' || field.name.value === '__type') discovery = true;
            if (field.selectionSet) visit(field.selectionSet, depth + 1, active);
          } else if (field.kind === Kind.INLINE_FRAGMENT) {
            visit(field.selectionSet, depth, active);
          } else if (active.has(field.name.value)) {
            cycle = true;
            return;
          } else {
            const fragment = fragments.get(field.name.value);
            if (fragment) visit(fragment.selectionSet, depth, new Set([...active, field.name.value]));
          }
        }
      };
      for (const definition of document.definitions) {
        if (definition.kind === Kind.OPERATION_DEFINITION) {
          operations += 1;
          invalidOperation ||= definition.operation !== 'query';
          visit(definition.selectionSet, 1, new Set());
        }
      }
      if (
        collections > 1 ||
        catalogues > 1 ||
        operations !== 1 ||
        invalidOperation ||
        discovery ||
        cycle ||
        steps > QUERY_LIMITS.selectionSteps ||
        fields > QUERY_LIMITS.fields ||
        maxDepth > QUERY_LIMITS.depth ||
        aliases > QUERY_LIMITS.recordAliases
      ) {
        context.reportError(
          new GraphQLError('Read query exceeds the allowed operation or selection bounds.', {
            extensions: { code: 'QUERY_LIMIT' },
          })
        );
      }
    },
  });
}

const queryBounds: Plugin = {
  onParams({ params }) {
    if (Buffer.byteLength(JSON.stringify(params)) > QUERY_LIMITS.bytes) {
      throw new GraphQLError('Request is too large.', { extensions: { code: 'QUERY_LIMIT', http: { status: 413 } } });
    }
  },
  onParse({ setParseFn }) {
    setParseFn(source => parse(source, { maxTokens: QUERY_LIMITS.tokens }));
  },
  onValidate({ addValidationRule }) {
    addValidationRule(boundedQueryRule());
  },
};

export function variantKey(
  brand: string,
  portal: string,
  recordType: string,
  workflowStep: string,
  form: string
): string {
  return JSON.stringify([brand, portal, recordType, workflowStep, form]);
}

interface MetadataValue {
  readonly typeName: string;
  readonly value: Readonly<Record<string, unknown>>;
}

export interface QueryContext {
  readonly caller: ReadCaller;
  readonly deadline: number;
  readonly readRecord: (oid: string) => Promise<ReadRecord>;
  readonly gridEnvironments: Map<string, Promise<GridEnvironment>>;
  readonly declaredOnlySources: WeakSet<object>;
  readonly records: Map<string, Promise<ReadRecord>>;
  readonly consumeUnits: (count: number) => void;
  readonly consumeBytes: (count: number) => void;
}

export function createRecordYoga(
  contracts: readonly RecordContract[],
  ports: ReadPorts,
  gridPorts: GridPorts = {
    getGridEnvironment: async () => {
      throw new GraphQLError('Collection search is unavailable.', { extensions: { code: 'COLLECTION_UNAVAILABLE' } });
    },
  }
) {
  const recordDate = (value: unknown): string | null => {
    const date =
      value instanceof Date
        ? DateTime.fromJSDate(value)
        : typeof value === 'string'
          ? DateTime.fromISO(value, { zone: 'utc', setZone: true })
          : undefined;
    return date?.isValid ? date.toUTC().toISO() : null;
  };
  const envelopeValue = (value: unknown, context: QueryContext): unknown => {
    context.consumeUnits(1);
    if (typeof value === 'string') context.consumeBytes(Buffer.byteLength(value));
    return value;
  };
  const opaqueRoots = new Set(
    contracts.filter(contract => fromTree(contract.root).kind === 'json').map(metadataTypeName)
  );
  const byVariant = new Map<string, string>();
  const rendered = contracts.map(contract => {
    const c = contract.context;
    const key = variantKey(c.brand, c.portal, c.recordType, c.workflowStep, c.form);
    const name = metadataTypeName(contract);
    if (byVariant.has(key) || [...byVariant.values()].includes(name)) throw new Error('Duplicate metadata variant.');
    byVariant.set(key, name);
    return renderMetadata(fromTree(contract.root), name);
  });
  const metadataUnion = new GraphQLUnionType({
    name: 'RecordMetadata',
    types: rendered.length
      ? rendered.map(item => item.type)
      : [new GraphQLObjectType({ name: 'UnavailableMetadata', fields: { reason: { type: GraphQLString } } })],
    resolveType: (source: unknown) =>
      isObject(source) && typeof source.typeName === 'string' ? source.typeName : undefined,
  });
  // Unwrap without putting a synthetic __typename into persisted metadata.
  for (const item of rendered) {
    for (const field of Object.values(item.type.getFields())) {
      const resolve = field.resolve;
      field.resolve = (source: MetadataValue, args, context, info) => resolve?.(source.value, args, context, info);
    }
  }
  const recordType = new GraphQLObjectType({
    name: 'Record',
    fields: {
      oid: {
        type: new GraphQLNonNull(GraphQLID),
        resolve: (record: ReadRecord, _args, context: QueryContext) => envelopeValue(record.redboxOid, context),
      },
      recordType: {
        type: GraphQLString,
        resolve: (record: ReadRecord, _args, context: QueryContext) => envelopeValue(record.metaMetadata.type, context),
      },
      workflowStep: {
        type: GraphQLString,
        resolve: (record: ReadRecord, _args, context: QueryContext) => envelopeValue(record.workflow.stage, context),
      },
      form: {
        type: GraphQLString,
        resolve: (record: ReadRecord, _args, context: QueryContext) => envelopeValue(record.metaMetadata.form, context),
      },
      createdOn: {
        type: GraphQLString,
        resolve: (record: ReadRecord) => recordDate(record.metaMetadata.createdOn ?? record.dateCreated),
      },
      lastModified: { type: GraphQLString, resolve: (record: ReadRecord) => recordDate(record.lastSaveDate) },
      metadata: {
        type: metadataUnion,
        resolve: (record: ReadRecord, _args, context: QueryContext): MetadataValue => {
          const typeName = byVariant.get(
            variantKey(
              context.caller.brand.name,
              context.caller.portal,
              record.metaMetadata.type,
              record.workflow.stage,
              record.metaMetadata.form
            )
          );
          if (!typeName)
            throw new GraphQLError('Current record form has no registered read contract.', {
              extensions: { code: 'UNRESOLVED_READ_CONTRACT' },
            });
          if (Reflect.get(record, COLLECTION_ROW) === true && opaqueRoots.has(typeName))
            throw new GraphQLError('Collection metadata requires declared fields.', {
              extensions: { code: 'UNDECLARED_METADATA' },
            });
          const value = Reflect.get(record, COLLECTION_ROW) === true ? { ...record.metadata } : record.metadata;
          if (Reflect.get(record, COLLECTION_ROW) === true) context.declaredOnlySources.add(value);
          return { typeName, value };
        },
      },
    },
  });
  const schema = new GraphQLSchema({
    // Internal static-validation metadata. Never derive generated type names from
    // user field paths, and never infer a record permission from this catalogue.
    extensions: {
      recordReadVariants: contracts.map(contract => ({
        recordType: contract.context.recordType,
        workflowStep: contract.context.workflowStep,
        typeName: metadataTypeName(contract),
      })),
    },
    query: new GraphQLObjectType({
      name: 'Query',
      fields: {
        ...gridFields(recordType, contracts, gridPorts),
        record: {
          type: recordType,
          args: { oid: { type: new GraphQLNonNull(GraphQLID) } },
          resolve: async (_source, args: { oid: string }, context: QueryContext) => {
            context.consumeUnits(1);
            if (!context.caller)
              throw new GraphQLError('Authentication is required.', { extensions: { code: 'UNAUTHENTICATED' } });
            if (!args.oid || args.oid.length > 256)
              throw new GraphQLError('Invalid OID.', { extensions: { code: 'INVALID_OID' } });
            try {
              return await context.readRecord(args.oid);
            } catch (error) {
              if (error instanceof GraphQLError && error.extensions.code === 'STORAGE_UNAVAILABLE')
                throw new GraphQLError('Record was not found.', { extensions: { code: 'NOT_FOUND' } });
              throw error;
            }
          },
        },
      },
    }),
  });
  const yoga = createYoga<{ caller: ReadCaller; deadline?: number }, QueryContext>({
    schema,
    parserAndValidationCache: false,
    graphqlEndpoint: '/graphql',
    graphiql: false,
    landingPage: false,
    cors: false,
    batching: false,
    logging: false,
    maskedErrors: true,
    plugins: [queryBounds],
    context: ({ caller, deadline: requestDeadline }) => {
      let remaining = QUERY_LIMITS.workUnits;
      let bytes = QUERY_LIMITS.responseBytes;
      const deadline = requestDeadline ?? Date.now() + QUERY_LIMITS.timeoutMs;
      const records = new Map<string, Promise<ReadRecord>>();
      const readRecord = async (oid: string) => {
        if (Date.now() >= deadline)
          throw new GraphQLError('Read query timed out.', { extensions: { code: 'QUERY_TIMEOUT' } });
        let result = records.get(oid);
        if (!result) {
          result = readAuthorizedRecord(ports, caller, oid, true);
          records.set(oid, result);
        }
        const record = await result;
        if (Date.now() >= deadline)
          throw new GraphQLError('Read query timed out.', { extensions: { code: 'QUERY_TIMEOUT' } });
        return record;
      };
      return {
        caller,
        deadline,
        readRecord,
        records,
        gridEnvironments: new Map(),
        declaredOnlySources: new WeakSet(),
        consumeUnits: (count: number) => {
          remaining -= count;
          if (remaining < 0 || Date.now() > deadline)
            throw new GraphQLError('Query exceeds the stored-value work budget.', {
              extensions: { code: 'QUERY_LIMIT' },
            });
        },
        consumeBytes: (count: number) => {
          bytes -= count;
          if (bytes < 0)
            throw new GraphQLError('Query exceeds the response bound.', { extensions: { code: 'QUERY_LIMIT' } });
        },
      };
    },
  });
  return { yoga, schema, rendered };
}
