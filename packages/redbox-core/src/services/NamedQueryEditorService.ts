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
  type NamedQueryDescription,
  type NamedQueryDraftRequest,
  type NamedQueryFieldDescription,
  type NamedQueryGuidance,
  type NamedQueryPreview,
  type NamedQueryPreviewRequest,
  type NamedQueryValidation,
} from '@researchdatabox/sails-ng-common';
import { Services as CoreServices } from '../CoreService';
import type { BrandingModel } from '../model';
import type { FormRecordAccessContext } from './FormsService';
import { Services as FieldServices } from './FieldDescriptionsService';
import type { NamedQueryDefinition } from '../config/namedQuery.config';
import { NamedQueryResponseRecord } from './NamedQueryService';
import {
  checkDraftBudget,
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
      'schemaTargets',
      'describeFields',
      'validateDraft',
      'describeDraft',
      'describeSaved',
      'previewDraft',
    ];

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
      if (collectionName !== 'record' || !selection?.recordType) return unavailable();
      try {
        const operation = this.fieldService().describeFields(
          brand,
          portal,
          caller,
          selection.recordType,
          selection.stage
        );
        return budget ? await budget.wait(operation) : await operation;
      } catch (error) {
        if (error instanceof NamedQueryAssistanceError) throw error;
        return unavailable();
      } // Guidance failures never prevent manual authoring or disclose a denied tree.
    }

    public async validateDraft(
      brand: BrandingModel,
      portal: string,
      caller: FormRecordAccessContext,
      request: NamedQueryDraftRequest,
      budget?: NamedQueryExecutionBudget
    ): Promise<NamedQueryValidation> {
      this.caller(brand, caller);
      checkDraftBudget(request);
      const diagnostics: EditorDiagnostic[] = [];
      const definition = request?.definition;
      if (!object(definition))
        return {
          valid: false,
          diagnostics: [
            diagnostic('INVALID_DEFINITION', 'definition', 'A query definition object is required.', 'error'),
          ],
        };
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
      return { valid: !diagnostics.some(item => item.severity === 'error'), diagnostics: diagnostics.slice(0, 200) };
    }

    public async describeDraft(
      brand: BrandingModel,
      portal: string,
      caller: FormRecordAccessContext,
      request: NamedQueryDraftRequest
    ): Promise<NamedQueryDescription> {
      const validation = await this.validateDraft(brand, portal, caller, request);
      const definition = object(request.definition) ? request.definition : {};
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
    ): Promise<NamedQueryDescription> {
      this.caller(brand, caller);
      const definition = await NamedQueryService.getNamedQueryConfig(brand, name);
      if (!definition) throw new NamedQueryAssistanceError('QUERY_NOT_FOUND', 404);
      return this.describeDraft(brand, portal, caller, { definition: { ...definition }, guidance });
    }

    public async previewDraft(
      brand: BrandingModel,
      portal: string,
      caller: FormRecordAccessContext,
      request: NamedQueryPreviewRequest
    ): Promise<NamedQueryPreview<NamedQueryResponseRecord>> {
      const budget = new NamedQueryExecutionBudget();
      const validation = await budget.wait(this.validateDraft(brand, portal, caller, request, budget));
      const diagnostics = [...validation.diagnostics];
      const definition = object(request.definition) ? request.definition : {};
      const reject = (field: string, reason: string) =>
        diagnostics.push(diagnostic('PREVIEW_UNSAFE_DEFINITION', field, reason, 'error'));
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
        valid: !diagnostics.some(item => item.severity === 'error'),
        diagnostics,
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
          definition as unknown as NamedQueryDefinition,
          request.parameters ?? {},
          brand,
          0,
          NAMED_QUERY_PREVIEW_LIMITS.rows,
          caller.user,
          budget
        )
      );
      response.summary = { numFound: result.summary.numFound, start: 0, page: 1 };
      if (result.summary.numFound > Math.min(result.records.length, NAMED_QUERY_PREVIEW_LIMITS.rows))
        response.truncationReasons.push('rows');
      // Serialize each row once. Reserve DTO overhead and the CoreController data wrapper.
      let bytes = budget.run(() => Buffer.byteLength(JSON.stringify({ data: response }), 'utf8')) + 64;
      for (const record of result.records.slice(0, NAMED_QUERY_PREVIEW_LIMITS.rows)) {
        const rowBytes = budget.run(() => Buffer.byteLength(JSON.stringify(record), 'utf8')) + 1;
        if (bytes + rowBytes > NAMED_QUERY_PREVIEW_LIMITS.responseBytes) {
          response.truncationReasons.push('bytes');
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
