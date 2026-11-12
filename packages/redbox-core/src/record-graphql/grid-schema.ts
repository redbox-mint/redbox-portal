import {
  GraphQLError,
  GraphQLBoolean,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLID,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLEnumType,
  type GraphQLFieldConfigMap,
} from 'graphql';
import type { RecordContract } from '../record-contract';
import { buildCatalogue, gridError, scopedContracts } from './catalogue';
import { readCollection } from './collection';
import type { GridPorts, GridQuery } from './grid-types';
import { GRID_LIMITS } from './grid-types';
import type { QueryContext } from './schema';
import { JsonScalar } from './renderer';

const stringList = new GraphQLList(new GraphQLNonNull(GraphQLString));
const ValueInput = new GraphQLInputObjectType({
  name: 'RecordFilterValue',
  description: 'Exactly one typed value; null is not a filter value.',
  fields: {
    text: { type: GraphQLString },
    number: { type: GraphQLFloat },
    boolean: { type: GraphQLBoolean },
    dateTime: { type: GraphQLString },
  },
});
const RangeInput = new GraphQLInputObjectType({
  name: 'RecordFilterRange',
  fields: { from: { type: new GraphQLNonNull(ValueInput) }, to: { type: new GraphQLNonNull(ValueInput) } },
});
const FilterInput = new GraphQLInputObjectType({
  name: 'RecordFilterInput',
  description: 'Exactly one supported operator. Filters are combined with AND.',
  fields: {
    field: { type: new GraphQLNonNull(GraphQLID) },
    eq: { type: ValueInput },
    contains: { type: GraphQLString },
    iprefix: {
      type: GraphQLString,
      description:
        'Literal prefix ignoring ASCII A-Z case only; all other characters match exactly without Unicode normalization. Requires a verified companion binding. Nonempty, well-formed UTF-16, at most 256 UTF-8 bytes.',
    },
    in: { type: new GraphQLList(new GraphQLNonNull(ValueInput)) },
    gt: { type: ValueInput },
    lt: { type: ValueInput },
    between: { type: RangeInput },
    exists: { type: GraphQLBoolean },
  },
});
const Direction = new GraphQLEnumType({ name: 'RecordSortDirection', values: { ASC: {}, DESC: {} } });
const SortInput = new GraphQLInputObjectType({
  name: 'RecordSortInput',
  fields: { field: { type: new GraphQLNonNull(GraphQLID) }, direction: { type: new GraphQLNonNull(Direction) } },
});
const scopeArgs = { recordType: { type: new GraphQLNonNull(GraphQLString) }, workflowStages: { type: stringList } };

// Discovery data uses the same work/byte budgets as metadata, including aliases.
function bounded<T extends object>(
  fields: GraphQLFieldConfigMap<T, QueryContext>
): GraphQLFieldConfigMap<T, QueryContext> {
  return Object.fromEntries(
    Object.entries(fields).map(([name, field]) => [
      name,
      {
        ...field,
        resolve: (source: T, _args: unknown, context: QueryContext) => {
          context.consumeUnits(1);
          const value: unknown = Reflect.get(source, name);
          if (typeof value === 'string') context.consumeBytes(Buffer.byteLength(value));
          if (Array.isArray(value)) {
            if (value.length > GRID_LIMITS.catalogueFields)
              gridError('CATALOGUE_LIMIT', 'Discovery list exceeds its bound.');
            context.consumeUnits(value.length);
          }
          return value;
        },
      },
    ])
  );
}
const Selection = new GraphQLObjectType({
  name: 'RecordFieldSelection',
  fields: bounded({
    variant: { type: new GraphQLNonNull(GraphQLString) },
    workflowStage: { type: new GraphQLNonNull(GraphQLString) },
    form: { type: new GraphQLNonNull(GraphQLString) },
    selection: { type: new GraphQLNonNull(GraphQLString) },
    responsePath: { type: new GraphQLNonNull(stringList) },
  }),
});
const Choice = new GraphQLObjectType({
  name: 'RecordFieldChoice',
  fields: bounded({ label: { type: new GraphQLNonNull(GraphQLString) }, value: { type: JsonScalar } }),
});
const Field = new GraphQLObjectType({
  name: 'RecordField',
  fields: bounded({
    id: { type: new GraphQLNonNull(GraphQLID) },
    path: { type: new GraphQLNonNull(GraphQLString) },
    label: { type: new GraphQLNonNull(GraphQLString) },
    labelKey: { type: GraphQLString },
    displayLabel: { type: GraphQLString },
    displayLabelKey: { type: GraphQLString },
    group: { type: GraphQLString },
    groupKey: { type: GraphQLString },
    groupPath: { type: stringList },
    repeatingSubfield: { type: GraphQLBoolean },
    repeatingGroupId: { type: GraphQLID },
    scalarType: { type: new GraphQLNonNull(GraphQLString) },
    selectable: { type: new GraphQLNonNull(GraphQLBoolean) },
    filterable: { type: new GraphQLNonNull(GraphQLBoolean) },
    sortable: { type: new GraphQLNonNull(GraphQLBoolean) },
    availableInAllVariants: { type: new GraphQLNonNull(GraphQLBoolean) },
    nullable: { type: new GraphQLNonNull(GraphQLBoolean) },
    nested: { type: new GraphQLNonNull(GraphQLBoolean) },
    repeating: { type: new GraphQLNonNull(GraphQLBoolean) },
    operators: { type: new GraphQLNonNull(stringList) },
    choices: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Choice))) },
    selections: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Selection))) },
    unavailableReason: { type: GraphQLString },
  }),
});
const Variant = new GraphQLObjectType({
  name: 'RecordMetadataVariant',
  fields: bounded({
    typeName: { type: new GraphQLNonNull(GraphQLString) },
    workflowStage: { type: new GraphQLNonNull(GraphQLString) },
    form: { type: new GraphQLNonNull(GraphQLString) },
  }),
});
const Catalogue = new GraphQLObjectType({
  name: 'RecordFieldCatalogue',
  fields: bounded({
    recordType: { type: new GraphQLNonNull(GraphQLString) },
    recordTypeLabel: { type: GraphQLString },
    recordTypeLabelKey: { type: GraphQLString },
    revision: { type: new GraphQLNonNull(GraphQLString) },
    fields: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Field))) },
    variants: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Variant))) },
  }),
});

export function gridFields(
  recordType: GraphQLObjectType,
  contracts: readonly RecordContract[],
  ports: GridPorts
): GraphQLFieldConfigMap<unknown, QueryContext> {
  const Page = new GraphQLObjectType({
    name: 'RecordPage',
    fields: bounded({
      nodes: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(recordType))) },
      hasNextPage: { type: new GraphQLNonNull(GraphQLBoolean) },
      endCursor: { type: GraphQLString },
    }),
  });
  return {
    recordFields: {
      type: Catalogue,
      args: { ...scopeArgs, ids: { type: new GraphQLList(new GraphQLNonNull(GraphQLID)) } },
      resolve: async (_source, args: { recordType: string; workflowStages?: string[]; ids?: string[] }, context) => {
        scopedContracts(contracts, args.recordType, args.workflowStages ?? []);
        context.consumeUnits(1);
        let pending = context.gridEnvironments.get(args.recordType);
        if (!pending) {
          pending = ports.getGridEnvironment(context.caller, args.recordType, context.deadline).catch(error => {
            if (error instanceof GraphQLError) throw error;
            return gridError('SEARCH_UNAVAILABLE', 'Search schema is unavailable; retry the request.');
          });
          context.gridEnvironments.set(args.recordType, pending);
        }
        const environment = await pending;
        const snapshot = buildCatalogue(contracts, args.recordType, args.workflowStages ?? [], environment);
        if (args.ids !== undefined && args.ids !== null) {
          if (args.ids.length > GRID_LIMITS.fieldIds || new Set(args.ids).size !== args.ids.length)
            gridError('CATALOGUE_LIMIT', 'Request at most 50 distinct field identifiers.');
          const fields = new Map(snapshot.catalogue.fields.map(field => [field.id, field]));
          snapshot.catalogue.fields = args.ids.map(
            id => fields.get(id) ?? gridError('UNKNOWN_FIELD', `Unknown or stale field identifier: ${id}`)
          );
        }
        if (ports.getChoiceLabels) {
          const references = [
            ...new Set(snapshot.catalogue.fields.flatMap(field => (field.vocabulary ? [field.vocabulary] : []))),
          ];
          if (references.length > GRID_LIMITS.fieldIds) gridError('CATALOGUE_LIMIT', 'Too many field vocabularies.');
          context.consumeUnits(references.length);
          const choices = new Map(
            await Promise.all(
              references.map(
                async reference =>
                  [reference, await ports.getChoiceLabels!(context.caller, reference, context.deadline)] as const
              )
            )
          );
          for (const field of snapshot.catalogue.fields)
            if (field.vocabulary && choices.get(field.vocabulary)?.length)
              field.choices = choices.get(field.vocabulary)!;
        }
        context.consumeUnits(snapshot.catalogue.fields.length);
        return snapshot.catalogue;
      },
    },
    records: {
      type: Page,
      args: {
        ...scopeArgs,
        filters: { type: new GraphQLList(new GraphQLNonNull(FilterInput)) },
        sort: { type: new GraphQLList(new GraphQLNonNull(SortInput)) },
        first: { type: GraphQLInt, defaultValue: GRID_LIMITS.defaultPageSize },
        after: { type: GraphQLString },
      },
      resolve: async (_source, args: GridQuery, context) => {
        scopedContracts(contracts, args.recordType, args.workflowStages ?? []);
        let pending = context.gridEnvironments.get(args.recordType);
        if (!pending) {
          pending = ports.getGridEnvironment(context.caller, args.recordType, context.deadline).catch(error => {
            if (error instanceof GraphQLError) throw error;
            return gridError('SEARCH_UNAVAILABLE', 'Search schema is unavailable; retry the request.');
          });
          context.gridEnvironments.set(args.recordType, pending);
        }
        const environment = await pending;
        return readCollection(contracts, args, environment, context);
      },
    },
  };
}
