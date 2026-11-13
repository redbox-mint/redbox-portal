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
import type { RecordContract } from '../../../../packages/redbox-core/src/record-contract/types';
import { readAuthorizedRecord, ReadError, type ReadCaller, type ReadPorts, type ReadRecord } from './access';
import { fromTree, isObject, metadataTypeName, renderMetadata } from './renderer';

export const QUERY_LIMITS = Object.freeze({
  bytes: 65_536,
  tokens: 2_000,
  fields: 200,
  depth: 12,
  recordAliases: 5,
  workUnits: 10_000,
  responseBytes: 262_144,
});

function boundedQueryRule(): ValidationRule {
  return context => ({
    Document(document: DocumentNode) {
      const fragments = new Map<string, FragmentDefinitionNode>();
      let fields = 0;
      let aliases = 0;
      let maxDepth = 0;
      let operations = 0;
      let invalidOperation = false;
      let discovery = false;
      for (const definition of document.definitions) {
        if (definition.kind === Kind.FRAGMENT_DEFINITION) fragments.set(definition.name.value, definition);
      }
      const visit = (selection: SelectionSetNode, depth: number, active: ReadonlySet<string>): void => {
        maxDepth = Math.max(depth, maxDepth);
        if (fields > QUERY_LIMITS.fields || depth > QUERY_LIMITS.depth || aliases > QUERY_LIMITS.recordAliases) return;
        for (const field of selection.selections) {
          if (fields > QUERY_LIMITS.fields || aliases > QUERY_LIMITS.recordAliases) return;
          if (field.kind === Kind.FIELD) {
            fields += 1;
            if (depth === 1 && field.name.value === 'record') aliases += 1;
            if (field.name.value === '__schema' || field.name.value === '__type') discovery = true;
            if (field.selectionSet) visit(field.selectionSet, depth + 1, active);
          } else if (field.kind === Kind.INLINE_FRAGMENT) {
            visit(field.selectionSet, depth, active);
          } else if (!active.has(field.name.value)) {
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
        operations !== 1 ||
        invalidOperation ||
        discovery ||
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
  readonly records: Map<string, Promise<ReadRecord>>;
  readonly consumeUnits: (count: number) => void;
}

export function createRecordYoga(contracts: readonly RecordContract[], ports: ReadPorts) {
  if (contracts.length === 0) throw new Error('At least one metadata variant is required.');
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
    types: rendered.map(item => item.type),
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
      oid: { type: new GraphQLNonNull(GraphQLID), resolve: (record: ReadRecord) => record.redboxOid },
      recordType: {
        type: new GraphQLNonNull(GraphQLString),
        resolve: (record: ReadRecord) => record.metaMetadata.type,
      },
      workflowStep: { type: new GraphQLNonNull(GraphQLString), resolve: (record: ReadRecord) => record.workflow.stage },
      form: { type: new GraphQLNonNull(GraphQLString), resolve: (record: ReadRecord) => record.metaMetadata.form },
      metadata: {
        type: metadataUnion,
        resolve: (record: ReadRecord, _args, context: QueryContext): MetadataValue => {
          const typeName = byVariant.get(
            variantKey(
              String(context.caller.brand.name),
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
          return { typeName, value: record.metadata };
        },
      },
    },
  });
  const schema = new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: {
        record: {
          type: recordType,
          args: { oid: { type: new GraphQLNonNull(GraphQLID) } },
          resolve: async (_source, args: { oid: string }, context: QueryContext) => {
            if (!context.caller)
              throw new GraphQLError('Authentication is required.', { extensions: { code: 'UNAUTHENTICATED' } });
            if (!args.oid || args.oid.length > 256)
              throw new GraphQLError('Invalid OID.', { extensions: { code: 'INVALID_OID' } });
            let record = context.records.get(args.oid);
            if (!record) {
              record = readAuthorizedRecord(ports, context.caller, args.oid);
              context.records.set(args.oid, record);
            }
            try {
              return await record;
            } catch (error) {
              if (error instanceof ReadError)
                throw new GraphQLError(error.message, { extensions: { code: error.code } });
              throw error;
            }
          },
        },
      },
    }),
  });
  const yoga = createYoga<{ caller: ReadCaller }, QueryContext>({
    schema,
    graphqlEndpoint: '/graphql',
    graphiql: false,
    landingPage: false,
    cors: false,
    batching: false,
    logging: false,
    maskedErrors: true,
    plugins: [queryBounds],
    context: ({ caller }) => {
      let remaining = QUERY_LIMITS.workUnits;
      return {
        caller,
        records: new Map(),
        consumeUnits: (count: number) => {
          remaining -= count;
          if (remaining < 0)
            throw new GraphQLError('Query exceeds the stored-value work budget.', {
              extensions: { code: 'QUERY_LIMIT' },
            });
        },
      };
    },
  });
  return { yoga, schema, rendered };
}
