import { prepareExplorerNamedQuery } from './named-query/explorer-promotion';
import { printSchema } from 'graphql';
import * as Handlebars from 'handlebars';
import {
  lookupPath,
  namedQueryMappingFields,
  pathSegments,
  normaliseVisual,
  queryResultFields,
  storedRecordFields,
  storedRecordPath,
  type ContextSchemaField,
  type EditorDiagnostic,
  type FieldDescription,
  type NamedQuerySourceDescription,
  type GraphqlNamedQueryBinding,
  type NamedQueryDraftRequest,
  type NamedQueryFieldDescription,
  type NamedQueryGuidance,
  type NamedQueryPreview,
  type NamedQuerySourcePreview,
  type NamedQueryPreviewRequest,
  type NamedQueryValidation,
} from '@researchdatabox/sails-ng-common';
import { assertNamedQueryDefinition, requireDatabaseNamedQuery } from './named-query/definition';
import { inspectGraphqlNamedQuery } from './named-query/graphql-validation';
import { executeGraphqlNamedQuery, GRAPHQL_NAMED_QUERY_ROWS, type GraphqlNamedQueryRecord } from './named-query/graphql-execution';
import { QUERY_LIMITS } from '../record-graphql/schema';
import { GRID_LIMITS } from '../record-graphql/grid-types';
import type { ReadCaller } from '../record-graphql/read-record';
import { Services as CoreServices } from '../CoreService';
import type { BrandingModel } from '../model';
import type { FormRecordAccessContext } from './FormsService';
import { Services as FieldServices } from './FieldDescriptionsService';
import { NamedQueryResponseRecord } from './NamedQueryService';
import {
  checkDraftBudget,
  boundedJsonBytes,
  previewDeadlineIssue,
  NAMED_QUERY_PREVIEW_LIMITS,
  NamedQueryAssistanceError,
  NamedQueryExecutionBudget,
} from '../utilities/NamedQueryPreview';

const object = (value: unknown): value is Record<string, unknown> => _.isPlainObject(value);
const entries = (value: unknown): Array<[string, unknown]> => (object(value) ? Object.entries(value) : []);
const strings = (value: unknown): Record<string, string> =>
  Object.fromEntries(
    entries(value).map(([alias, expression]) => [
      alias,
      typeof expression === 'string' ? expression : '__dynamic_mapping__',
    ])
  );
const unavailable = (): FieldDescription => ({
  recordType: '',
  stage: '',
  precision: 'none',
  completeness: 'unavailable',
  fields: [],
});
const diagnostic = (
  code: string,
  field: string,
  reason: string,
  severity: 'error' | 'warning' = 'warning',
  suggestion?: string
): EditorDiagnostic => ({
  code,
  field: field.slice(0, 256),
  reason,
  severity,
  line: 0,
  column: 0,
  ...(suggestion ? { suggestion } : {}),
});

const blocksPreview = (item: EditorDiagnostic): boolean =>
  item.severity === 'error' || ['TEMPLATE_SYNTAX', 'TEMPLATE_COMPLEXITY'].includes(item.code);
const displayedDiagnostics = (items: EditorDiagnostic[]): EditorDiagnostic[] =>
  [
    ...items.filter(item => item.severity === 'error'),
    ...items.filter(item => item.severity !== 'error' && blocksPreview(item)),
    ...items.filter(item => !blocksPreview(item)),
  ].slice(0, 200);

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prefix = 0;
  while (prefix < a.length && a[prefix] === b[prefix]) prefix++;
  a = a.slice(prefix);
  b = b.slice(prefix);
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++)
      next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (a[i] === b[j] ? 0 : 1)));
    if (Math.min(...next) > 2) return 3;
    row = next;
  }
  return row[b.length];
}

/** Only an exact, unparameterized top-level type constraint proves a guidance target. */
function inferredGuidance(definition: Record<string, unknown>): NamedQueryDraftRequest['guidance'] {
  if (entries(definition.queryParams).some(([, value]) => object(value) && value.path === 'metaMetadata.type')) return;
  if (!object(definition.mongoQuery)) return;
  const query = definition.mongoQuery;
  const dotted = query['metaMetadata.type'];
  const nested = object(query.metaMetadata) ? query.metaMetadata.type : undefined;
  if (dotted !== undefined && nested !== undefined && dotted !== nested) return;
  const type = dotted ?? nested;
  if (typeof type === 'string' && /^[\w-]{1,100}$/.test(type)) return { recordType: type };
}

/** Lint paths, never validate a Mongo expression as a stored metadata value. */
function pathAdvice(
  path: string,
  fields: ContextSchemaField[],
  location: string,
  diagnostics: EditorDiagnostic[],
  template = false
): ContextSchemaField | undefined {
  const exact = fields.find(field =>
    template
      ? !field.path.includes('[]') &&
        (lookupPath(field.path) === path ||
          field.path === path ||
          JSON.stringify(pathSegments(field.path).map(part => part.name)) ===
            JSON.stringify(pathSegments(path).map(part => part.name)))
      : storedRecordPath(field.path) === path
  );
  if (exact) return exact;
  // Dynamic children and hook fields may be absent even from a complete contract.
  if (!fields.length || path.length > 250 || diagnostics.length >= 200) return;
  const metadataRoot = template ? 'record.metadata' : 'metadata';
  if (path.startsWith(metadataRoot + '.') && !fields.some(field => field.path.startsWith(metadataRoot + '.'))) return;
  const candidates = fields
    .map(field => (template ? (lookupPath(field.path) ?? field.path) : storedRecordPath(field.path)))
    .filter((value): value is string => !!value && value.length <= 250);
  const best = candidates
    .filter(candidate => Math.abs(candidate.length - path.length) <= 2)
    .slice(0, 96)
    .map(candidate => ({ candidate, score: distance(path, candidate) }))
    .sort((a, b) => a.score - b.score)[0];
  const suggestion = best && best.score <= 2 ? best.candidate : undefined;
  diagnostics.push(
    diagnostic(
      'UNKNOWN_FIELD',
      location,
      'The selected guidance does not describe this path. Custom fields remain supported.',
      'warning',
      suggestion
    )
  );
}

function operatorAdvice(
  field: ContextSchemaField | undefined,
  value: unknown,
  location: string,
  diagnostics: EditorDiagnostic[]
): void {
  if (!field || field.type === 'unknown') return;
  const scalarAdvice = (scalar: unknown) => {
    if (scalar == null || typeof scalar === 'object' || field.isArray || field.type === 'object') return;
    if (!field.type.split(' | ').includes(typeof scalar) && !(typeof scalar === 'number' && field.type === 'integer'))
      diagnostics.push(
        diagnostic('INCOMPATIBLE_VALUE_TYPE', location, 'This comparison value differs from the known field type.')
      );
  };
  for (const [op, operand] of entries(value)) {
    if (['$size', '$elemMatch', '$all'].includes(op) && !field.isArray)
      diagnostics.push(
        diagnostic('ARRAY_OPERATOR_ON_SCALAR', location, 'This array operator targets a known scalar field.')
      );
    if (
      ['contains', 'startsWith', 'endsWith', 'like', '$regex'].includes(op) &&
      !field.type.includes('string') &&
      !field.isArray
    )
      diagnostics.push(
        diagnostic('INCOMPATIBLE_OPERATOR', location, 'This text operator targets a known non-string field.')
      );
    if (['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '>', '<', '>=', '<=', '!='].includes(op)) scalarAdvice(operand);
  }
  if (field.isArray && (value === null || typeof value !== 'object'))
    diagnostics.push(
      diagnostic(
        'SCALAR_ARRAY_COMPARISON',
        location,
        'Mongo scalar equality can match an array element; use an array operator when matching the array itself.'
      )
    );
  if (!object(value)) scalarAdvice(value);
}

function queryAdvice(
  query: unknown,
  fields: ContextSchemaField[],
  location: string,
  diagnostics: EditorDiagnostic[],
  prefix = ''
): void {
  for (const [key, value] of entries(query)) {
    if (['$and', '$or', '$nor', 'and', 'or'].includes(key) && Array.isArray(value)) {
      value.forEach((child, i) => queryAdvice(child, fields, `${location}.${key}.${i}`, diagnostics, prefix));
    } else if (!key.startsWith('$')) {
      const path = prefix ? `${prefix}.${key}` : key;
      const field = pathAdvice(path, fields, `${location}.${key}`, diagnostics);
      operatorAdvice(field, value, `${location}.${key}`, diagnostics);
      if (
        object(value) &&
        !Object.keys(value).some(
          op =>
            op.startsWith('$') ||
            ['contains', 'in', 'nin', '>', '<', '>=', '<=', '!=', 'like', 'startsWith', 'endsWith'].includes(op)
        )
      )
        queryAdvice(value, fields, `${location}.${key}`, diagnostics, path);
    }
  }
}

function templateAdvice(
  expression: string,
  fields: ContextSchemaField[],
  location: string,
  diagnostics: EditorDiagnostic[]
): void {
  if (!expression.includes('{{')) {
    pathAdvice(expression, fields, location, diagnostics, true);
    return;
  }
  if ((expression.match(/\{\{/g) ?? []).length > 256) {
    diagnostics.push(
      diagnostic('TEMPLATE_COMPLEXITY', location, 'This template exceeds the assistance expression limit.')
    );
    return;
  }
  try {
    const ast: unknown = Handlebars.parse(normaliseVisual(expression));
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const item = node as Record<string, unknown>;
      // Scope-relative block paths and helper names cannot be resolved statically here.
      if (
        item.type === 'PathExpression' &&
        typeof item.original === 'string' &&
        item.depth === 0 &&
        !item.data &&
        item.original.includes('.') &&
        !item.original.startsWith('this.')
      ) {
        pathAdvice(item.original, fields, location, diagnostics, true);
      }
      Object.values(item).forEach(child => (Array.isArray(child) ? child.forEach(walk) : walk(child)));
    };
    walk(ast);
  } catch {
    // The legacy save contract does not parse templates. Preview must refuse these separately.
    diagnostics.push(diagnostic('TEMPLATE_SYNTAX', location, 'This mapping has invalid Handlebars syntax.'));
  }
}

export namespace Services {
  export class NamedQueryEditor extends CoreServices.Core.Service {
    protected override _exportedMethods = [
      'canCreate',
      'preparePromotion',
      'schemaTargets',
      'graphqlSchema',
      'describeFields',
      'validateDraft',
      'describeDraft',
      'describeSaved',
      'previewDraft',
    ];

    public canCreate(brand: BrandingModel, portal: string, user: Record<string, unknown> | undefined): boolean {
      if (!brand?.id || !portal || !user?.username || !Array.isArray(user.roles)) return false;
      const roles = user.roles.filter((role): role is { id: string } => !!role && typeof role === 'object' && typeof role.id === 'string');
      const path = `${BrandingService.getRootContext()}/${brand.name}/${portal}/api/named-query`;
      const rules = PathRulesService.getRulesFromPath(path, brand);
      return !!rules?.length && PathRulesService.canWrite(rules, roles, brand.name);
    }

    public preparePromotion(input: unknown, caller: ReadCaller) {
      if (!this.canCreate(caller?.brand, caller?.portal, caller?.user))
        throw new NamedQueryAssistanceError('NAMED_QUERY_CREATE_FORBIDDEN', 403);
      return prepareExplorerNamedQuery(input, caller);
    }

    private fieldService(): FieldServices.FieldDescriptions {
      return (
        (sails.services?.fielddescriptionsservice as unknown as FieldServices.FieldDescriptions | undefined) ??
        new FieldServices.FieldDescriptions()
      );
    }

    private caller(brand: BrandingModel, caller: FormRecordAccessContext): void {
      if (!caller?.user?.username || String(caller.brand?.id) !== String(brand.id))
        throw new NamedQueryAssistanceError('FORBIDDEN', 403);
    }

    private graphqlCaller(brand: BrandingModel, portal: string, caller: FormRecordAccessContext): ReadCaller | undefined {
      if (!Array.isArray(caller.user?.roles)) return;
      return { brand, portal, user: caller.user, roles: caller.user.roles };
    }

    public async graphqlSchema(brand: BrandingModel, portal: string, caller: FormRecordAccessContext) {
      this.caller(brand, caller);
      const context = this.graphqlCaller(brand, portal, caller);
      if (!context?.user?.username || !context.portal) throw new NamedQueryAssistanceError('FORBIDDEN', 403);
      const schema = await RecordGraphqlService.getReadSchema(context);
      const sdl = printSchema(schema);
      if (Buffer.byteLength(sdl) > QUERY_LIMITS.responseBytes) throw new NamedQueryAssistanceError('RESPONSE_LIMIT', 413);
      return { sdl };
    }

    public async schemaTargets(brand: BrandingModel, caller: FormRecordAccessContext) {
      this.caller(brand, caller);
      return this.fieldService().schemaTargets(brand, caller);
    }

    public async describeFields(
      brand: BrandingModel,
      portal: string,
      caller: FormRecordAccessContext,
      target: NamedQueryGuidance
    ): Promise<NamedQueryFieldDescription> {
      this.caller(brand, caller);
      try {
        NamedQueryService.resolveBrandScope(target.collectionName);
      } catch {
        throw new NamedQueryAssistanceError('INVALID_COLLECTION', 400);
      }
      // Never consult record schemas for a non-record collection, even if stale guidance is supplied.
      const description =
        target.collectionName === 'record' && target.recordType
          ? await this.fieldService().describeFields(brand, portal, caller, target.recordType, target.stage)
          : unavailable();
      const stored = target.collectionName === 'record' ? storedRecordFields(description.fields) : [];
      return {
        ...description,
        collectionName: target.collectionName,
        fields: stored.filter(field => field.path === 'metadata' || field.path.startsWith('metadata.')),
        envelopeFields: stored.filter(field => field.path !== 'metadata' && !field.path.startsWith('metadata.')),
        mappingFields: namedQueryMappingFields(stored),
      };
    }

    private async guidance(
      brand: BrandingModel,
      portal: string,
      caller: FormRecordAccessContext,
      collectionName: string,
      selection: NamedQueryDraftRequest['guidance'],
      budget?: NamedQueryExecutionBudget
    ): Promise<FieldDescription> {
      // Schema discovery can invoke Waterline and hook reads without server deadlines.
      // Preview performs structural checks only; validate/describe supply advisory field lint.
      if (budget) return unavailable();
      if (collectionName !== 'record' || !selection?.recordType) return unavailable();
      try {
        return await this.fieldService().describeFields(brand, portal, caller, selection.recordType, selection.stage);
      } catch (error) {
        if (error instanceof NamedQueryAssistanceError) throw error;
        return unavailable();
      } // Guidance failures never prevent manual authoring or disclose a denied tree.
    }

    public async validateDraft(
      brand: BrandingModel,
      portal: string,
      caller: FormRecordAccessContext,
      request: NamedQueryDraftRequest
    ): Promise<NamedQueryValidation> {
      const { previewBlocked: _blocked, ...validation } = await this.inspectDraft(brand, portal, caller, request);
      return validation;
    }

    private async inspectDraft(
      brand: BrandingModel,
      portal: string,
      caller: FormRecordAccessContext,
      request: NamedQueryDraftRequest,
      budget?: NamedQueryExecutionBudget
    ): Promise<NamedQueryValidation & { previewBlocked: boolean }> {
      this.caller(brand, caller);
      checkDraftBudget(request);
      const diagnostics: EditorDiagnostic[] = [];
      const definition = request?.definition;
      if (!object(definition))
        return {
          valid: false,
          previewBlocked: true,
          diagnostics: [
            diagnostic('INVALID_DEFINITION', 'definition', 'A query definition object is required.', 'error'),
          ],
        };
      if (definition.source === 'graphql') {
        const { validation } = await inspectGraphqlNamedQuery(
          definition, this.graphqlCaller(brand, portal, caller), String(brand.id)
        );
        return { ...validation, previewBlocked: !validation.valid };
      }
      requireDatabaseNamedQuery(definition);
      const collection = definition.collectionName;
      try {
        if (typeof collection !== 'string') throw new Error('collection');
        NamedQueryService.resolveBrandScope(collection);
      } catch {
        diagnostics.push(
          diagnostic(
            'INVALID_COLLECTION',
            'collectionName',
            'An existing brand-scoped collection is required.',
            'error'
          )
        );
      }
      for (const key of ['mongoQuery', 'queryParams', 'resultObjectMapping']) {
        if (definition[key] != null && !object(definition[key]))
          diagnostics.push(
            diagnostic('LEGACY_SHAPE', key, 'An object is expected here. Legacy saves remain supported.')
          );
      }
      if (definition.sort != null && !Array.isArray(definition.sort))
        diagnostics.push(diagnostic('LEGACY_SHAPE', 'sort', 'Sort is normally an array of field/direction objects.'));
      if (definition.relatedRecordFilters != null && !Array.isArray(definition.relatedRecordFilters))
        diagnostics.push(diagnostic('LEGACY_SHAPE', 'relatedRecordFilters', 'Related filters are normally an array.'));
      const source = await this.guidance(
        brand,
        portal,
        caller,
        String(collection),
        request.guidance ?? inferredGuidance(definition),
        budget
      );
      const fields = collection === 'record' ? storedRecordFields(source.fields) : [];
      queryAdvice(definition.mongoQuery, fields, 'mongoQuery', diagnostics);
      for (const [key, param] of entries(definition.queryParams)) {
        const location = `queryParams.${key}`;
        if (!object(param) || typeof param.path !== 'string' || !param.path) {
          diagnostics.push(
            diagnostic('LEGACY_PARAMETER', location, 'A parameter normally has a non-empty stored-record path.')
          );
          continue;
        }
        const field = pathAdvice(param.path, fields, `${location}.path`, diagnostics);
        if (
          field &&
          !['unknown', 'object'].includes(field.type) &&
          typeof param.type === 'string' &&
          !(param.type === 'date' && field.type.includes('string')) &&
          !field.type.split(' | ').includes(param.type) &&
          !(param.type === 'number' && field.type === 'integer') &&
          !(field.isArray && param.type === field.itemType)
        )
          diagnostics.push(
            diagnostic(
              'INCOMPATIBLE_PARAMETER_TYPE',
              `${location}.type`,
              'The parameter type differs from the known source field type.'
            )
          );
        if (typeof param.queryType === 'string')
          operatorAdvice(field, { [param.queryType]: null }, `${location}.queryType`, diagnostics);
        if (typeof param.template === 'string' && param.template.includes('{{'))
          templateAdvice(param.template, [], `${location}.template`, diagnostics);
      }
      const mappings = namedQueryMappingFields(fields);
      for (const [alias, expression] of entries(definition.resultObjectMapping)) {
        if (typeof expression === 'string')
          templateAdvice(expression, mappings, `resultObjectMapping.${alias}`, diagnostics);
        else
          diagnostics.push(
            diagnostic(
              'LEGACY_MAPPING',
              `resultObjectMapping.${alias}`,
              'Mappings normally contain a direct lookup or a Handlebars string.'
            )
          );
      }
      if (Array.isArray(definition.sort))
        definition.sort.forEach((sort, index) =>
          entries(sort).forEach(([path]) => pathAdvice(path, fields, `sort.${index}.${path}`, diagnostics))
        );
      if (Array.isArray(definition.relatedRecordFilters)) {
        for (const [index, filter] of definition.relatedRecordFilters.entries()) {
          budget?.remaining();
          if (!object(filter)) continue;
          const base = `relatedRecordFilters.${index}`;
          if (typeof filter.localField === 'string')
            pathAdvice(filter.localField, fields, `${base}.localField`, diagnostics);
          const foreign = await this.guidance(
            brand,
            portal,
            caller,
            String(filter.collectionName),
            request.relatedGuidance?.[String(index)] ??
              inferredGuidance({ ...filter, queryParams: definition.queryParams }),
            budget
          );
          const foreignFields = filter.collectionName === 'record' ? storedRecordFields(foreign.fields) : [];
          if (typeof filter.foreignField === 'string')
            pathAdvice(filter.foreignField, foreignFields, `${base}.foreignField`, diagnostics);
          queryAdvice(filter.mongoQuery, foreignFields, `${base}.mongoQuery`, diagnostics);
        }
      }
      return {
        valid: !diagnostics.some(item => item.severity === 'error'),
        previewBlocked: diagnostics.some(blocksPreview),
        diagnostics: displayedDiagnostics(diagnostics),
      };
    }

    public async describeDraft(
      brand: BrandingModel,
      portal: string,
      caller: FormRecordAccessContext,
      request: NamedQueryDraftRequest
    ): Promise<NamedQuerySourceDescription> {
      this.caller(brand, caller);
      checkDraftBudget(request);
      const definition = object(request.definition) ? request.definition : {};
      if (definition.source === 'graphql') {
        let parameters: Array<GraphqlNamedQueryBinding & { variable: string }> = [];
        let operationName: string | undefined;
        const inspected = await inspectGraphqlNamedQuery(definition, this.graphqlCaller(brand, portal, caller), String(brand.id));
        try {
          assertNamedQueryDefinition(definition);
          if (definition.source === 'graphql') {
            parameters = Object.entries(definition.graphql.variables).flatMap(([variable, binding]) =>
              binding.ownership === 'consumer' ? [{ ...binding, variable,
                ...inspected.operationVariables?.find(item => item.variable === variable) }] : []
            );
            operationName = definition.graphql.operationName;
          }
        } catch {
          // Malformed/stale stored records remain describable and editable.
        }
        return {
          ...inspected.validation,
          source: 'graphql',
          ...(typeof definition.name === 'string' ? { name: definition.name } : {}),
          operationName, parameters, operationVariables: inspected.operationVariables ?? [], result: unavailable(),
        };
      }
      const validation = await this.validateDraft(brand, portal, caller, request);
      const collectionName = typeof definition.collectionName === 'string' ? definition.collectionName : '';
      const source = await this.guidance(
        brand,
        portal,
        caller,
        collectionName,
        request.guidance ?? inferredGuidance(definition)
      );
      const stored = collectionName === 'record' ? storedRecordFields(source.fields) : [];
      return {
        ...validation,
        source: definition.source === 'database' ? 'database' : undefined,
        ...(typeof definition.name === 'string' ? { name: definition.name } : {}),
        collectionName,
        parameters: entries(definition.queryParams).map(([key, value]) => {
          const param = object(value) ? value : {};
          const path = typeof param.path === 'string' ? param.path : '';
          return {
            key,
            path,
            type: typeof param.type === 'string' ? param.type : 'unknown',
            required: param.required === true,
            ...(typeof param.queryType === 'string' ? { queryType: param.queryType } : {}),
            ...(typeof param.whenUndefined === 'string' ? { whenUndefined: param.whenUndefined } : {}),
            ...(typeof param.format === 'string' ? { format: param.format } : {}),
            ...(Object.hasOwn(param, 'defaultValue') ? { defaultValue: param.defaultValue } : {}),
            sourceField: stored.find(field => storedRecordPath(field.path) === path),
          };
        }),
        result: this.resultDescription(collectionName, source, definition.resultObjectMapping),
      };
    }

    private resultDescription(collection: string, source: FieldDescription, mapping: unknown): FieldDescription {
      const aliases = strings(mapping);
      // A short mapping can duplicate a whole tree thousands of times. Bound derived expansion
      // before invoking the shared adapter; unavailable descendants stay explicitly partial.
      const partial = source.fields.length * Object.keys(aliases).length > 5000;
      return {
        ...source,
        completeness: partial ? 'partial' : source.completeness,
        fields: queryResultFields(collection, partial ? [] : source.fields, aliases),
      };
    }

    /** Report services call this directly under their own existing feature authorization. */
    public async describeSaved(
      brand: BrandingModel,
      portal: string,
      caller: FormRecordAccessContext,
      name: string,
      guidance?: NamedQueryDraftRequest['guidance']
    ): Promise<NamedQuerySourceDescription> {
      this.caller(brand, caller);
      const definition = await NamedQueryService.getNamedQueryConfig(brand, name);
      if (!definition) throw new NamedQueryAssistanceError('QUERY_NOT_FOUND', 404);
      return this.describeDraft(brand, portal, caller, { definition: { ...definition }, guidance });
    }

    public async previewDraft(
      brand: BrandingModel,
      portal: string,
      caller: FormRecordAccessContext,
      request: NamedQueryPreviewRequest,
      budget = new NamedQueryExecutionBudget()
    ): Promise<NamedQuerySourcePreview<NamedQueryResponseRecord | GraphqlNamedQueryRecord>> {
      if (object(request.definition) && request.definition.source === 'graphql') {
        this.caller(brand, caller);
        checkDraftBudget(request);
        const result = await executeGraphqlNamedQuery(
          request.definition, request.parameters ?? {}, brand, 0, GRAPHQL_NAMED_QUERY_ROWS,
          this.graphqlCaller(brand, portal, caller), budget, false
        );
        return {
          ...result, valid: true, diagnostics: [],
          truncated: result.pagination.hasNextPage,
          truncationReasons: result.pagination.hasNextPage ? ['rows'] : [],
          limits: { ...NAMED_QUERY_PREVIEW_LIMITS, inputBytes: QUERY_LIMITS.bytes,
            depth: QUERY_LIMITS.depth, rows: GRAPHQL_NAMED_QUERY_ROWS,
            responseBytes: QUERY_LIMITS.responseBytes, scanRows: GRID_LIMITS.candidates },
        };
      }
      const validation = await budget.wait(this.inspectDraft(brand, portal, caller, request, budget));
      const diagnostics = [...validation.diagnostics];
      let previewBlocked = validation.previewBlocked;
      const definition = object(request.definition) ? request.definition : {};
      const reject = (field: string, reason: string, code = 'PREVIEW_UNSAFE_DEFINITION') => {
        previewBlocked = true;
        diagnostics.push(diagnostic(code, field, reason, 'error'));
      };
      const deadlineIssue = previewDeadlineIssue(definition);
      if (deadlineIssue) reject('definition', deadlineIssue, 'PREVIEW_DEADLINE_UNSUPPORTED');
      for (const key of ['mongoQuery', 'queryParams', 'resultObjectMapping'])
        if (definition[key] != null && !object(definition[key])) reject(key, 'Preview requires an object.');
      if (request.parameters != null && !object(request.parameters))
        reject('parameters', 'Preview parameters must be an object.');
      for (const [key, param] of entries(definition.queryParams)) {
        if (
          !object(param) ||
          typeof param.path !== 'string' ||
          !param.path ||
          !['string', 'number', 'boolean', 'date', 'array', 'object'].includes(String(param.type))
        ) {
          reject(`queryParams.${key}`, 'Preview requires a supported parameter type and path.');
          continue;
        }
        const supplied = object(request.parameters) ? request.parameters[key] : undefined;
        if (param.required === true && supplied === undefined)
          reject(`parameters.${key}`, 'This query requires a preview parameter.');
        const value = supplied === undefined && param.whenUndefined === 'defaultValue' ? param.defaultValue : supplied;
        if (param.type === 'object' && value !== undefined && !param.template) {
          let parsed: unknown = value;
          try {
            if (typeof parsed === 'string') parsed = JSON.parse(parsed) as unknown;
          } catch {
            parsed = null;
          }
          if (!object(parsed)) reject(`parameters.${key}`, 'This preview parameter must be a JSON object.');
        }
      }
      for (const [key, expression] of entries(definition.resultObjectMapping)) {
        if (typeof expression !== 'string') reject(`resultObjectMapping.${key}`, 'Preview mappings must be strings.');
      }
      if (diagnostics.some(item => ['TEMPLATE_SYNTAX', 'TEMPLATE_COMPLEXITY'].includes(item.code)))
        reject('resultObjectMapping', 'Correct template syntax before executing a preview.');
      if (
        definition.sort != null &&
        (!Array.isArray(definition.sort) ||
          definition.sort.some(
            item => !object(item) || Object.values(item).some(direction => !['ASC', 'DESC'].includes(String(direction)))
          ))
      )
        reject('sort', 'Preview requires an array of ASC/DESC sort objects.');
      if (definition.relatedRecordFilters != null) {
        if (!Array.isArray(definition.relatedRecordFilters))
          reject('relatedRecordFilters', 'Preview requires a related-filter array.');
        else
          for (const filter of definition.relatedRecordFilters) {
            if (
              !object(filter) ||
              typeof filter.collectionName !== 'string' ||
              !object(filter.mongoQuery) ||
              typeof filter.localField !== 'string' ||
              !filter.localField ||
              typeof filter.foreignField !== 'string' ||
              !filter.foreignField
            ) {
              reject('relatedRecordFilters', 'Preview requires collection, query and join fields.');
            } else {
              try {
                NamedQueryService.resolveBrandScope(filter.collectionName);
              } catch {
                reject('relatedRecordFilters', 'Related collections must expose a brand scope.');
              }
            }
          }
      }
      const scan = (value: unknown): void => {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
          if (['$where', '$function', '$accumulator', '__proto__', 'prototype', 'constructor'].includes(key))
            reject('definition', 'Preview does not execute server JavaScript or prototype paths.');
          scan(child);
        }
      };
      scan(definition);
      scan(request.parameters);
      const response: NamedQueryPreview<NamedQueryResponseRecord> = {
        valid: !previewBlocked,
        diagnostics: displayedDiagnostics(diagnostics),
        records: [],
        summary: { numFound: 0, start: 0, page: 1 },
        truncated: false,
        truncationReasons: [],
        limits: { ...NAMED_QUERY_PREVIEW_LIMITS },
      };
      if (!response.valid) return response;
      // Only this service creates the budget. No draft property can opt out or raise a limit.
      const result = await budget.wait(
        NamedQueryService.performNamedQueryFromConfig(
          definition,
          request.parameters ?? {},
          brand,
          0,
          NAMED_QUERY_PREVIEW_LIMITS.rows,
          caller.user,
          budget
        )
      );
      if (result.source === 'graphql') throw new NamedQueryAssistanceError('UNSUPPORTED_QUERY_SOURCE', 422);
      response.summary = { numFound: result.summary.numFound, start: 0, page: 1 };
      if (result.summary.numFound > NAMED_QUERY_PREVIEW_LIMITS.rows) response.truncationReasons.push('rows');
      if (budget.outputTruncated) response.truncationReasons.push('bytes');
      // Count incrementally without expanding repeated aliases into a JSON string.
      // Reserve DTO overhead, truncation flags and the CoreController data wrapper.
      let bytes = budget.run(() => boundedJsonBytes({ data: response }, NAMED_QUERY_PREVIEW_LIMITS.responseBytes)) + 64;
      for (const record of result.records.slice(0, NAMED_QUERY_PREVIEW_LIMITS.rows)) {
        const rowBytes =
          budget.run(() => boundedJsonBytes(record, NAMED_QUERY_PREVIEW_LIMITS.responseBytes - bytes)) + 1;
        if (bytes + rowBytes > NAMED_QUERY_PREVIEW_LIMITS.responseBytes) {
          if (!response.truncationReasons.includes('bytes')) response.truncationReasons.push('bytes');
          break;
        }
        response.records.push(record);
        bytes += rowBytes;
      }
      response.truncated = response.truncationReasons.length > 0;
      return response;
    }
  }
}

declare global {
  let NamedQueryEditorService: Services.NamedQueryEditor;
}
