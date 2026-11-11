import { getOperationAST, Kind, parse, type SelectionSetNode } from 'graphql';
import { z } from 'zod';
import { recordGridRequest } from '@researchdatabox/sails-ng-common';
import type {
  NamedQueryJson,
  NamedQueryPromotionDraft,
  GraphqlNamedQueryMappings,
} from '@researchdatabox/sails-ng-common';
import type { ReadCaller } from '../../record-graphql/read-record';
import { savedGridDefinition, savedGridId, savedGridRevision, SavedGridError } from '../SavedGridService';
import { normalizeTimestamp } from '../../utilities/SavedGridTimestamp';

const discovery = z.object({
  data: z.object({
    recordFields: z.object({
      fields: z.array(
        z.object({
          id: z.string(),
          scalarType: z.string(),
          selectable: z.boolean(),
          repeating: z.boolean(),
          availableInAllVariants: z.boolean(),
          operators: z.array(z.string()),
          sortable: z.boolean(),
          selections: z.array(z.object({ selection: z.string(), responsePath: z.array(z.string()).min(1) })),
        })
      ),
    }),
  }),
});

/** Candidate response paths only. Ambiguous aliases are left for explicit editing. */
function candidateMappings(document: string, resultPath: string[]): GraphqlNamedQueryMappings {
  try {
    const ast = parse(document, { maxTokens: 2000 });
    const operation = getOperationAST(ast);
    if (!operation) return {};
    const fragments = new Map(
      ast.definitions.flatMap(node =>
        node.kind === Kind.FRAGMENT_DEFINITION ? [[node.name.value, node.selectionSet] as const] : []
      )
    );
    let remaining = 2000;
    const fields = (
      sets: SelectionSetNode[],
      seen = new Set<string>()
    ): Array<Extract<SelectionSetNode['selections'][number], { kind: 'Field' }>> =>
      sets.flatMap(set =>
        set.selections.flatMap(node => {
          if (--remaining < 0) throw new Error('Selection limit');
          if (node.kind === Kind.FIELD) return [node];
          if (node.kind === Kind.INLINE_FRAGMENT) return fields([node.selectionSet], seen);
          const name = node.name.value;
          const fragment = fragments.get(name);
          return fragment && !seen.has(name) ? fields([fragment], new Set([...seen, name])) : [];
        })
      );
    let sets = [operation.selectionSet];
    for (const segment of resultPath) {
      sets = fields(sets)
        .filter(node => (node.alias?.value ?? node.name.value) === segment)
        .flatMap(node => (node.selectionSet ? [node.selectionSet] : []));
      if (!sets.length) return {};
    }
    const selected = fields(sets);
    const mappings: GraphqlNamedQueryMappings = {};
    for (const [target, source] of [
      ['oid', 'oid'],
      ['title', 'title'],
      ['metadata', 'metadata'],
      ['dateCreated', 'createdOn'],
      ['lastSaveDate', 'lastModified'],
    ] as const) {
      const paths = [
        ...new Set(
          selected.filter(node => node.name.value === source).map(node => node.alias?.value ?? node.name.value)
        ),
      ];
      if (paths.length === 1) mappings[target] = [paths[0]];
    }
    return mappings;
  } catch {
    return {};
  }
}

/** No storage or explorer execution. Only visual discovery reads the current catalogue. */
export async function prepareExplorerNamedQuery(input: unknown, caller: ReadCaller): Promise<NamedQueryPromotionDraft> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Buffer.byteLength(JSON.stringify(input)) > 65536)
    throw new SavedGridError(400, 'invalid-definition');
  const { id, revision, ...values } = input as Record<string, unknown>;
  if (
    (id !== undefined && !savedGridId.safeParse(id).success) ||
    (revision !== undefined && !savedGridRevision.safeParse(revision).success)
  )
    throw new SavedGridError(400, 'invalid-definition');
  // Explorer names are informational; an unsaved exploration need not have one.
  const parsed = savedGridDefinition.safeParse({ ...values, name: 'promotion' });
  if (!parsed.success) throw new SavedGridError(400, 'invalid-definition');
  const grid = parsed.data;
  let document: string;
  let variables: Record<string, NamedQueryJson>;
  let resultPath: string[];
  if (grid.mode === 'graphql') {
    document = grid.document;
    variables = grid.variables;
    resultPath = grid.resultPath;
  } else {
    const ids = [
      ...new Set([
        ...grid.columns,
        ...grid.filters.map(filter => filter.fieldId),
        ...(grid.sort ? [grid.sort.fieldId] : []),
      ]),
    ];
    const response = await RecordGraphqlService.execute(caller, {
      query: `query PromotionFields($type: String!, $stages: [String!], $ids: [ID!]) {
        recordFields(recordType: $type, workflowStages: $stages, ids: $ids) {
          fields { id scalarType selectable repeating availableInAllVariants operators sortable selections { selection responsePath } }
        }
      }`,
      variables: { type: grid.recordType, stages: grid.workflowStage ? [grid.workflowStage] : undefined, ids },
    });
    const found = discovery.safeParse(response.data);
    if (response.status !== 200 || !found.success || Object.hasOwn(response.data, 'errors'))
      throw new SavedGridError(400, 'schema-changed');
    const fields = found.data.data.recordFields.fields;
    const selected = grid.columns.map(id => fields.find(field => field.id === id));
    if (selected.some(field => !field?.selectable || !field.selections.length))
      throw new SavedGridError(400, 'schema-changed');
    const sort = grid.sort;
    if (sort) {
      const field = fields.find(field => field.id === sort.fieldId);
      if (!field?.sortable || field.repeating || !field.availableInAllVariants)
        throw new SavedGridError(400, 'schema-changed');
      if (!sort.expectedScalarType || sort.expectedScalarType !== field.scalarType)
        throw new SavedGridError(400, 'sort-type-changed');
    }
    const filters = grid.filters.map(filter => {
      const field = fields.find(field => field.id === filter.fieldId);
      if (
        !field ||
        field.repeating ||
        !field.availableInAllVariants ||
        !field.operators.includes(filter.operator.toUpperCase())
      )
        throw new SavedGridError(400, 'schema-changed');
      if (!filter.expectedScalarType || filter.expectedScalarType !== field.scalarType)
        throw new SavedGridError(400, 'filter-type-changed');
      const typed = (value: string): string | number | boolean => {
        if (['NUMBER', 'INTEGER'].includes(field.scalarType)) {
          if (
            !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) ||
            !Number.isFinite(Number(value)) ||
            (field.scalarType === 'INTEGER' && !Number.isSafeInteger(Number(value)))
          )
            throw new SavedGridError(400, 'invalid-definition');
          return Number(value);
        }
        if (field.scalarType === 'BOOLEAN') {
          if (!['true', 'false'].includes(value)) throw new SavedGridError(400, 'invalid-definition');
          return value === 'true';
        }
        if (field.scalarType === 'DATETIME') {
          try {
            return normalizeTimestamp(value);
          } catch {
            throw new SavedGridError(400, 'invalid-definition');
          }
        }
        return value;
      };
      const values = filter.operator === 'exists' ? [] : filter.values.map(typed);
      if (filter.operator === 'between') {
        const [from, to] = values;
        if (
          (typeof from !== 'number' && typeof from !== 'string') ||
          (typeof to !== 'number' && typeof to !== 'string') ||
          from > to
        )
          throw new SavedGridError(400, 'invalid-definition');
      }
      const operand = (value: NamedQueryJson): NamedQueryJson => ({
        [field.scalarType === 'DATETIME'
          ? 'dateTime'
          : ['NUMBER', 'INTEGER'].includes(field.scalarType)
            ? 'number'
            : field.scalarType === 'BOOLEAN'
              ? 'boolean'
              : 'text']: value,
      });
      return {
        field: field.id,
        [filter.operator]:
          filter.operator === 'exists'
            ? filter.values[0] === 'true'
            : filter.operator === 'contains'
              ? values[0]
              : filter.operator === 'in'
                ? values.map(operand)
                : filter.operator === 'between'
                  ? { from: operand(values[0]), to: operand(values[1]) }
                  : operand(values[0]),
      };
    });
    const generated = recordGridRequest({
      recordType: grid.recordType,
      workflowStage: grid.workflowStage,
      selections: selected.flatMap(field => field!.selections),
      filters,
      sort: sort ? [{ field: sort.fieldId, direction: sort.direction.toUpperCase() }] : [],
      first: grid.pageSize,
      after: null,
    });
    document = generated.query;
    variables = generated.variables;
    resultPath = ['records', 'nodes'];
  }
  return structuredClone({
    definition: {
      source: 'graphql',
      name: '',
      graphql: {
        document,
        variables: {},
        resultPath,
        mappings: candidateMappings(document, resultPath),
        ...(id !== undefined
          ? {
              provenance: {
                explorerId: String(id),
                ...(typeof revision === 'number' ? { explorerRevision: revision } : {}),
              },
            }
          : {}),
      },
    },
    variableValues: variables,
  });
}
