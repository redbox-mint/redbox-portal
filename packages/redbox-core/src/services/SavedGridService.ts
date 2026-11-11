import type { Db, ObjectId as MongoObjectId } from 'mongodb';
import type { ExplorerQueryAuthor } from '@researchdatabox/sails-ng-common';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';
import { Kind, parse, visit } from 'graphql';
import { normalizeTimestamp } from '../utilities/SavedGridTimestamp';
import { Services as services } from '../CoreService';

const fieldId = z.string().min(1).max(512);
const operand = z.string().refine(value => Buffer.byteLength(value, 'utf8') <= 256);
const filter = z
  .strictObject({
    fieldId,
    expectedScalarType: z.enum(['STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'DATETIME']).optional(),
    operator: z.enum(['eq', 'contains', 'gt', 'lt', 'between', 'in', 'exists']),
    values: z.array(operand).min(1).max(20),
  })
  .refine(value => value.operator === 'in' || value.values.length === (value.operator === 'between' ? 2 : 1))
  .refine(value => value.operator !== 'exists' || ['true', 'false'].includes(value.values[0]))
  .refine(value => value.operator !== 'contains' || value.values[0].length > 0);
const visualDefinition = z.strictObject({
  mode: z.literal('visual').optional(),
  version: z.literal(1),
  name: z.string().trim().min(1).max(120),
  recordType: z.string().min(1).max(120),
  workflowStage: z.string().min(1).max(120).optional(),
  columns: z
    .array(fieldId)
    .min(1)
    .max(30)
    .refine(ids => new Set(ids).size === ids.length),
  filters: z.array(filter).max(10),
  sort: z
    .strictObject({
      fieldId,
      direction: z.enum(['asc', 'desc']),
      expectedScalarType: z.enum(['STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'DATETIME']).optional(),
    })
    .nullable(),
  pageSize: z.union([z.literal(25), z.literal(50)]),
});
type QueryJson = null | string | number | boolean | QueryJson[] | { [key: string]: QueryJson };
/** Match the transport parser: each variable value starts at depth zero. Iterative
 * validation rejects excessive nesting before any recursive schema parsing/write. */
function boundedVariables(value: unknown): value is Record<string, QueryJson> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const pending = Object.values(value).map(value => ({ value, depth: 0 }));
  while (pending.length) {
    const { value: entry, depth } = pending.pop()!;
    if (depth > 30) return false;
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') continue;
    if (typeof entry === 'number') {
      if (!Number.isFinite(entry)) return false;
      continue;
    }
    if (typeof entry !== 'object') return false;
    for (const nested of Object.values(entry)) pending.push({ value: nested, depth: depth + 1 });
  }
  return true;
}
const rawDefinition = z.strictObject({
  version: z.literal(1),
  mode: z.literal('graphql'),
  name: z.string().trim().min(1).max(120),
  document: z.string().min(1).max(65536),
  variables: z.custom<Record<string, QueryJson>>(boundedVariables),
  resultPath: z
    .array(
      z
        .string()
        .regex(/^[_A-Za-z][_0-9A-Za-z]*$/)
        .max(128)
    )
    .max(12),
});
export const savedGridDefinition = z.union([visualDefinition, rawDefinition]);
export type SavedGridDefinition = z.infer<typeof savedGridDefinition>;
export const savedGridId = z.string().regex(/^[a-f0-9]{24}$/);
export const savedGridRevision = z
  .number()
  .int()
  .min(1)
  .max(Number.MAX_SAFE_INTEGER - 1);
export class SavedGridError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
  }
}
export interface SavedGridScope {
  brandId: string;
  portal: string;
}
export interface SavedGridRow extends Sails.WaterlineAttributes {
  brandId: string;
  portal: string;
  definition: SavedGridDefinition;
  revision: number;
}
export interface SavedGridDocument {
  _id: MongoObjectId;
  brandId: string;
  portal: string;
  definition: SavedGridDefinition;
  revision: number;
  updatedAt?: string;
  updatedBy?: ExplorerQueryAuthor;
}
export const savedGridListOptions = z.strictObject({
  q: z.string().trim().max(120).optional(),
  mode: z.enum(['visual', 'graphql']).optional(),
});
export type SavedGridListOptions = z.infer<typeof savedGridListOptions>;
export function savedGridStore() {
  const datastore = SavedGrid.getDatastore() as
    | { manager?: Db; driver?: { mongodb?: { ObjectId?: typeof MongoObjectId } } }
    | undefined;
  const db = datastore?.manager,
    ObjectId = datastore?.driver?.mongodb?.ObjectId;
  if (!db || !ObjectId) throw new SavedGridError(503, 'persistence-failed');
  return { collection: db.collection<SavedGridDocument>(SavedGrid.tableName), ObjectId };
}
function author(caller: SavedGridCaller): ExplorerQueryAuthor | undefined {
  const user = caller?.user;
  return typeof user?.username === 'string'
    ? { username: user.username, displayName: String(user.displayName || user.name || user.username) }
    : undefined;
}
export type SavedGridCaller = Parameters<typeof RecordGraphqlService.execute>[0];
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
        })
      ),
    }),
  }),
});
const discoveryQuery = `query SavedGridFields($type: String!, $stages: [String!]) {
  recordFields(recordType: $type, workflowStages: $stages) {
    fields { id scalarType selectable repeating availableInAllVariants operators sortable }
  }
}`;

export namespace Services {
  export class SavedGrids extends services.Core.Service {
    protected override _exportedMethods = ['list', 'read', 'create', 'update', 'remove', 'stages', 'schema'];
    private present(row: Pick<SavedGridDocument, '_id' | 'definition' | 'revision' | 'updatedAt' | 'updatedBy'>) {
      const parsed = savedGridDefinition.safeParse(row.definition);
      if (!parsed.success || !savedGridRevision.safeParse(row.revision).success)
        throw new SavedGridError(503, 'persistence-failed');
      return {
        ...parsed.data,
        id: String(row._id),
        revision: row.revision,
        updatedAt: row.updatedAt ?? null,
        updatedBy: row.updatedBy ?? null,
      };
    }
    public async list(scope: SavedGridScope, after?: string, options: SavedGridListOptions = {}) {
      const parsed = savedGridListOptions.safeParse(options);
      if (!parsed.success || (after !== undefined && !savedGridId.safeParse(after).success))
        throw new SavedGridError(400, 'invalid-definition');
      const { q, mode } = parsed.data;
      const escaped = q?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const { collection, ObjectId } = this.native();
      const rows = await collection
        .find({
          ...scope,
          ...(after ? { _id: { $gt: new ObjectId(after) } } : {}),
          ...(mode
            ? mode === 'visual'
              ? { 'definition.mode': { $ne: 'graphql' } }
              : { 'definition.mode': 'graphql' }
            : {}),
          ...(escaped
            ? {
                $or: [
                  { 'definition.name': { $regex: escaped, $options: 'i' } },
                  { 'definition.recordType': { $regex: escaped, $options: 'i' } },
                ],
              }
            : {}),
        })
        .sort({ _id: 1 })
        .limit(101)
        .toArray();
      const page = rows.slice(0, 100);
      return {
        grids: page.map(row => this.present(row)),
        next: rows.length > 100 ? String(page[page.length - 1]._id) : null,
      };
    }
    /** Discover variants without compiling/enumerating their fields. The parent's recordFields
     * resolver builds the entire field catalogue even for a variants-only selection. */
    public async stages(caller: SavedGridCaller, recordType: string): Promise<{ stages: string[] }> {
      const type = await firstValueFrom(RecordTypesService.get(caller.brand, recordType));
      if (!type) throw new SavedGridError(404, 'schema-changed');
      const [steps, forms] = await Promise.all([
        firstValueFrom(WorkflowStepsService.getAllForRecordTypeIncludingHidden(type)),
        firstValueFrom(FormsService.listForms(caller.brand.id)),
      ]);
      if (steps.length > 100 || forms.length > 1000) throw new SavedGridError(413, 'catalogue-limit');
      const formNames = new Set(
        forms
          .filter(form => {
            const brand =
              typeof form.branding === 'object' && form.branding !== null ? form.branding.id : form.branding;
            return String(brand) === String(caller.brand.id) && !!form.configuration;
          })
          .map(form => form.name)
      );
      const stages = new Set<string>();
      for (const step of steps) {
        const config: unknown = step.config;
        if (!config || typeof config !== 'object' || !formNames.has(Reflect.get(config, 'form'))) continue;
        const workflow: unknown = Reflect.get(config, 'workflow');
        const stage: unknown = workflow && typeof workflow === 'object' ? Reflect.get(workflow, 'stage') : undefined;
        stages.add(typeof stage === 'string' && stage ? stage : step.name);
      }
      return { stages: [...stages] };
    }
    /** Admin-only bridge to the parent's real public SDL tooling; introspection stays forbidden. */
    public async schema(caller: SavedGridCaller) {
      if (typeof RecordGraphqlService === 'undefined') throw new SavedGridError(503, 'query-unavailable');
      try {
        const sdl = await RecordGraphqlService.describeReadSchema(caller);
        if (Buffer.byteLength(sdl) > 262144) throw new Error('Schema too large');
        return { sdl };
      } catch {
        throw new SavedGridError(503, 'schema-unavailable');
      }
    }
    public async read(scope: SavedGridScope, id: string) {
      const { collection, ObjectId } = this.native();
      const row = await collection.findOne({ ...scope, _id: new ObjectId(id) });
      if (!row) throw new SavedGridError(404, 'grid-missing');
      return this.present(row);
    }
    private async validate(input: unknown, caller: SavedGridCaller): Promise<SavedGridDefinition> {
      if (Buffer.byteLength(JSON.stringify(input) ?? '', 'utf8') > 65536)
        throw new SavedGridError(413, 'invalid-definition');
      const parsed = savedGridDefinition.safeParse(input);
      if (!parsed.success) throw new SavedGridError(400, 'invalid-definition');
      const grid = parsed.data;
      if (typeof RecordGraphqlService === 'undefined') throw new SavedGridError(503, 'query-unavailable');
      if (grid.mode === 'graphql') {
        // The parent is the authority for read-only operations, validation, permissions,
        // work/selection budgets and response bounds. A save validates by executing a read.
        try {
          const ast = parse(grid.document, { maxTokens: 2000 });
          const cursorVariables = new Set<string>();
          visit(ast, {
            Argument(node) {
              if (node.name.value !== 'after') return;
              if (node.value.kind === Kind.NULL) return;
              if (node.value.kind === Kind.VARIABLE && grid.variables[node.value.name.value] == null) {
                cursorVariables.add(node.value.name.value);
                return;
              }
              throw new Error('Do not persist result cursors');
            },
          });
          visit(ast, {
            VariableDefinition(node) {
              if (
                cursorVariables.has(node.variable.name.value) &&
                node.defaultValue &&
                node.defaultValue.kind !== Kind.NULL
              )
                throw new Error('Do not persist cursor defaults');
            },
          });
        } catch {
          throw new SavedGridError(400, 'invalid-document');
        }
        const response = await RecordGraphqlService.execute(caller, {
          query: grid.document,
          variables: grid.variables,
        });
        if ([401, 403].includes(response.status)) throw new SavedGridError(403, 'auth-required');
        if (response.status >= 500) throw new SavedGridError(503, 'query-unavailable');
        if (response.status !== 200 || response.data.errors) throw new SavedGridError(400, 'invalid-document');
        if (Buffer.byteLength(JSON.stringify(response.data)) > 262144) throw new SavedGridError(413, 'query-limit');
        return grid;
      }
      const response = await RecordGraphqlService.execute(caller, {
        query: discoveryQuery,
        variables: { type: grid.recordType, stages: grid.workflowStage ? [grid.workflowStage] : undefined },
      });
      if ([401, 403].includes(response.status)) throw new SavedGridError(403, 'auth-required');
      if (response.status >= 500) throw new SavedGridError(503, 'query-unavailable');
      const found = discovery.safeParse(response.data);
      if (
        response.status !== 200 ||
        !found.success ||
        (typeof response.data === 'object' && response.data !== null && Reflect.get(response.data, 'errors'))
      )
        throw new SavedGridError(400, 'schema-changed');
      const fields = found.data.data.recordFields.fields;
      const selectable = (id: string) =>
        fields.find(
          field =>
            field.id === id &&
            field.selectable &&
            (field.repeating ||
              ['STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'DATETIME', 'OBJECT'].includes(field.scalarType))
        );
      if (grid.columns.some(id => !selectable(id))) throw new SavedGridError(400, 'schema-changed');
      const sort = grid.sort;
      if (
        sort &&
        !fields.some(
          field => field.id === sort.fieldId && field.sortable && !field.repeating && field.availableInAllVariants
        )
      )
        throw new SavedGridError(400, 'schema-changed');
      if (
        sort &&
        (!sort.expectedScalarType ||
          sort.expectedScalarType !== fields.find(field => field.id === sort.fieldId)?.scalarType)
      )
        throw new SavedGridError(400, 'sort-type-changed');
      for (const filter of grid.filters) {
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
        if (filter.operator === 'exists') continue;
        const typed = filter.values.map(value => {
          if (['NUMBER', 'INTEGER', 'FLOAT'].includes(field.scalarType)) {
            if (
              !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) ||
              !Number.isFinite(Number(value)) ||
              (field.scalarType === 'INTEGER' && !Number.isSafeInteger(Number(value)))
            )
              throw new SavedGridError(400, 'invalid-definition');
            return Number(value);
          }
          if (field.scalarType === 'BOOLEAN' && !['true', 'false'].includes(value))
            throw new SavedGridError(400, 'invalid-definition');
          if (field.scalarType === 'DATETIME') {
            try {
              return Date.parse(normalizeTimestamp(value));
            } catch {
              throw new SavedGridError(400, 'invalid-definition');
            }
          }
          return value;
        });
        if (filter.operator === 'between' && typed[0] > typed[1]) throw new SavedGridError(400, 'invalid-definition');
      }
      return grid;
    }
    public async create(scope: SavedGridScope, input: unknown, caller: SavedGridCaller) {
      const definition = await this.validate(input, caller);
      const { collection, ObjectId } = this.native();
      const row = {
        ...scope,
        definition,
        revision: 1,
        _id: new ObjectId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(author(caller) ? { updatedBy: author(caller) } : {}),
      };
      await collection.insertOne(row);
      return this.present(row);
    }
    private native() {
      return savedGridStore();
    }
    public async update(scope: SavedGridScope, id: string, revision: number, input: unknown, caller: SavedGridCaller) {
      const definition = await this.validate(input, caller);
      const { collection, ObjectId } = this.native();
      const row = await collection.findOneAndUpdate(
        { ...scope, _id: new ObjectId(id), revision },
        {
          $set: {
            definition,
            revision: revision + 1,
            updatedAt: new Date().toISOString(),
            ...(author(caller) ? { updatedBy: author(caller) } : {}),
          },
        },
        { returnDocument: 'after', includeResultMetadata: false }
      );
      if (!row) {
        await this.read(scope, id);
        throw new SavedGridError(409, 'revision-conflict');
      }
      return this.present(row);
    }
    public async remove(scope: SavedGridScope, id: string, revision: number) {
      const { collection, ObjectId } = this.native();
      const result = await collection.deleteOne({ ...scope, _id: new ObjectId(id), revision });
      if (!result.deletedCount) {
        await this.read(scope, id);
        throw new SavedGridError(409, 'revision-conflict');
      }
      return { deleted: true };
    }
  }
}

declare global {
  const SavedGridService: Services.SavedGrids;
  var RecordGraphqlService: import('./RecordGraphqlService').Services.RecordGraphql;
}
