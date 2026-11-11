import { getOperationAST, Kind, parse, type SelectionSetNode } from 'graphql';
import { z } from 'zod';
import { recordGridFilter, recordGridRequest } from '@researchdatabox/sails-ng-common';
import type {
  NamedQueryJson,
  NamedQueryPromotionDraft,
  GraphqlNamedQueryMappings,
} from '@researchdatabox/sails-ng-common';
import type { ReadCaller } from '../../record-graphql/read-record';
import { savedGridDefinition, savedGridId, savedGridRevision, SavedGridError } from '../SavedGridService';

const discovery = z.object({
  data: z.object({
    recordFields: z.object({
      fields: z.array(
        z.object({
          id: z.string(),
          scalarType: z.string(),
          selectable: z.boolean(),
          filterable: z.boolean(),
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
          fields { id scalarType selectable filterable repeating availableInAllVariants operators sortable selections { selection responsePath } }
        }
      }`,
      variables: { type: grid.recordType, stages: grid.workflowStage ? [grid.workflowStage] : undefined, ids },
    });
    if (response.status !== 200) {
      const errors = response.data.errors;
      const first = Array.isArray(errors) ? errors[0] : undefined;
      const extensions = first && typeof first === 'object' && !Array.isArray(first) ? first.extensions : undefined;
      const code =
        extensions && typeof extensions === 'object' && !Array.isArray(extensions) ? extensions.code : undefined;
      if (
        response.status === 503 &&
        (code === 'GRAPHQL_DISABLED' || code === 'UNAVAILABLE' || code === 'QUERY_TIMEOUT')
      )
        throw new SavedGridError(503, code);
      if (response.status === 504 && code === 'QUERY_TIMEOUT') throw new SavedGridError(504, code);
      if (response.status >= 500) throw new SavedGridError(503, 'UNAVAILABLE');
      if (response.status === 413 && code === 'QUERY_LIMIT') throw new SavedGridError(413, code);
      if (response.status === 401 || response.status === 403) throw new SavedGridError(response.status, 'FORBIDDEN');
      throw new SavedGridError(400, 'schema-changed');
    }
    const found = discovery.safeParse(response.data);
    if (!found.success || Object.hasOwn(response.data, 'errors')) throw new SavedGridError(400, 'schema-changed');
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
      if (!field) throw new SavedGridError(400, 'schema-changed');
      try {
        return recordGridFilter(filter, field);
      } catch (error) {
        const code =
          error instanceof Error && ['schema-changed', 'filter-type-changed'].includes(error.message)
            ? error.message
            : 'invalid-definition';
        throw new SavedGridError(400, code);
      }
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
