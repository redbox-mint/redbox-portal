import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const nonEmptyStringSchema = z.string().min(1);
const jsonValueSchema = z.json();

export type JsonValue = z.infer<typeof jsonValueSchema>;

export interface HookDefinitionFixture {
  function: string;
  options?: Record<string, JsonValue>;
}

export interface HookModeFixture {
  pre?: HookDefinitionFixture[];
  postSync?: HookDefinitionFixture[];
  post?: HookDefinitionFixture[];
}

export interface HooksFixture {
  onCreate?: HookModeFixture;
  onUpdate?: HookModeFixture;
  onDelete?: HookModeFixture;
  onTransitionWorkflow?: HookModeFixture;
}

export interface WorkflowStageConfigurationFixture {
  form: string;
  workflow: { stage: string; stageLabel: string };
  authorization: { viewRoles: string[]; editRoles: string[] };
}

export interface WorkflowStageFixture {
  starting: boolean;
  hidden?: boolean;
  config: WorkflowStageConfigurationFixture;
}

export interface RepresentativeConfiguration {
  schemaVersion: 1;
  recordtype: Record<string, { packageType: string; searchable: boolean; hooks: HooksFixture }>;
  workflow: Record<string, Record<string, WorkflowStageFixture>>;
}

export interface DatabaseRecordTypeFixture {
  id: string;
  key: string;
  name: string;
  branding: string;
  packageType: string;
  searchable: boolean;
  hooks: HooksFixture;
}

export interface DatabaseWorkflowStepFixture {
  id: string;
  name: string;
  recordType: string;
  starting: boolean;
  hidden: boolean;
  config: WorkflowStageConfigurationFixture;
}

export interface DatabaseRecordFixture {
  [key: string]: JsonValue;
  redboxOid: string;
  revision: number;
  metadata: { title: string };
  metaMetadata: { type: string; form: string; brandId: string };
  workflow: { stage: string; stageLabel: string };
  authorization: { edit: string[]; view: string[]; editRoles: string[]; viewRoles: string[] };
}

export interface RepresentativeDatabase {
  schemaVersion: 1;
  brands: Array<{ id: string; name: string }>;
  recordTypes: DatabaseRecordTypeFixture[];
  workflowSteps: DatabaseWorkflowStepFixture[];
  records: DatabaseRecordFixture[];
}

const hookDefinitionSchema = z
  .object({
    function: nonEmptyStringSchema,
    options: z.record(z.string(), jsonValueSchema).optional(),
  })
  .strict();
const hookModeSchema = z
  .object({
    pre: z.array(hookDefinitionSchema).optional(),
    postSync: z.array(hookDefinitionSchema).optional(),
    post: z.array(hookDefinitionSchema).optional(),
  })
  .strict();
const hooksSchema = z
  .object({
    onCreate: hookModeSchema.optional(),
    onUpdate: hookModeSchema.optional(),
    onDelete: hookModeSchema.optional(),
    onTransitionWorkflow: hookModeSchema.optional(),
  })
  .strict();
const workflowConfigurationSchema = z
  .object({
    form: nonEmptyStringSchema,
    workflow: z.object({ stage: nonEmptyStringSchema, stageLabel: nonEmptyStringSchema }).strict(),
    authorization: z
      .object({ viewRoles: z.array(nonEmptyStringSchema), editRoles: z.array(nonEmptyStringSchema) })
      .strict(),
  })
  .strict();

const representativeConfigurationSchema = z
  .object({
    schemaVersion: z.literal(1),
    recordtype: z.record(
      nonEmptyStringSchema,
      z.object({ packageType: nonEmptyStringSchema, searchable: z.boolean(), hooks: hooksSchema }).strict()
    ),
    workflow: z.record(
      nonEmptyStringSchema,
      z.record(
        nonEmptyStringSchema,
        z
          .object({
            starting: z.boolean(),
            hidden: z.boolean().optional(),
            config: workflowConfigurationSchema,
          })
          .strict()
      )
    ),
  })
  .strict();

const databaseRecordTypeSchema = z
  .object({
    id: nonEmptyStringSchema,
    key: nonEmptyStringSchema,
    name: nonEmptyStringSchema,
    branding: nonEmptyStringSchema,
    packageType: nonEmptyStringSchema,
    searchable: z.boolean(),
    hooks: hooksSchema,
  })
  .strict();
const databaseWorkflowStepSchema = z
  .object({
    id: nonEmptyStringSchema,
    name: nonEmptyStringSchema,
    recordType: nonEmptyStringSchema,
    starting: z.boolean(),
    hidden: z.boolean(),
    config: workflowConfigurationSchema,
  })
  .strict();
const representativeDatabaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    brands: z.array(z.object({ id: nonEmptyStringSchema, name: nonEmptyStringSchema }).strict()).min(1),
    recordTypes: z.array(databaseRecordTypeSchema).min(1),
    workflowSteps: z.array(databaseWorkflowStepSchema).min(1),
    records: z.array(z.record(z.string(), jsonValueSchema)).min(1),
  })
  .strict();

const negativeFixtureSchema = z
  .object({
    schemaVersion: z.literal(1),
    recordTypes: z.array(
      databaseRecordTypeSchema.omit({ searchable: true }).extend({ searchable: z.boolean().optional() })
    ),
    expectedMigrationFailure: z
      .object({
        code: z.literal('unknown-legacy-action-expression'),
        expression: nonEmptyStringSchema,
        path: nonEmptyStringSchema,
      })
      .strict(),
  })
  .strict();

const sourceGroupSchema = z
  .object({
    name: nonEmptyStringSchema,
    paths: z.array(nonEmptyStringSchema),
    occurrenceCount: z.number().int().nonnegative(),
    note: nonEmptyStringSchema.optional(),
  })
  .strict();
const occurrenceSchema = z
  .object({
    source: z.object({ file: nonEmptyStringSchema, line: z.number().int().positive() }).strict(),
    recordType: nonEmptyStringSchema,
    lifecycleMode: z.enum(['onCreate', 'onUpdate', 'onDelete', 'onTransitionWorkflow']),
    phase: z.enum(['pre', 'postSync', 'post']),
    order: z.number().int().nonnegative(),
    nesting: z.enum([
      'record-hook',
      'onNotifySuccess',
      'runHooksSync',
      'queuedTriggerConfiguration',
      'nested-executable',
    ]),
    parentOrder: z.number().int().nonnegative().optional(),
    parameterVariant: nonEmptyStringSchema,
    sourceOptions: z.object({ presence: z.enum(['present', 'absent']) }).strict(),
  })
  .strict();
const parameterShapeSchema = z
  .object({
    required: z.array(nonEmptyStringSchema),
    optional: z.array(nonEmptyStringSchema),
    nested: z.record(nonEmptyStringSchema, z.array(nonEmptyStringSchema).min(1)).optional(),
  })
  .strict();
const behaviorClassificationSchema = z.enum([
  'direct-mutation',
  'replacement-return',
  'validation-only',
  'workflow-transition',
  'nested-callback',
  'side-effect-only',
  'record-writeback',
  'side-effect',
  'direct-response-mutation',
]);
const inventorySchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedForTask: z.literal('A01'),
    scan: z
      .object({
        includedSourceGroups: z.array(sourceGroupSchema).min(1),
        expectedCounts: z
          .object({
            recordHookDefinitions: z.number().int().nonnegative(),
            nestedExecutableDefinitions: z.number().int().nonnegative(),
            totalExecutableOccurrences: z.number().int().nonnegative(),
            uniqueLegacyExpressions: z.number().int().nonnegative(),
          })
          .strict(),
        exclusions: z.array(
          z.object({ paths: z.array(nonEmptyStringSchema).min(1), reason: nonEmptyStringSchema }).strict()
        ),
      })
      .strict(),
    nestedExecutableStructures: z.array(
      z
        .object({
          name: z.enum(['onNotifySuccess', 'runHooksSync', 'queuedTriggerConfiguration']),
          runtimeOwner: nonEmptyStringSchema,
          path: nonEmptyStringSchema,
          shippedOccurrenceCount: z.number().int().nonnegative(),
          execution: nonEmptyStringSchema,
          failure: nonEmptyStringSchema,
          migration: nonEmptyStringSchema,
          representativeFixture: nonEmptyStringSchema.optional(),
        })
        .strict()
    ),
    actions: z.array(
      z
        .object({
          legacyExpression: nonEmptyStringSchema,
          proposedActionId: nonEmptyStringSchema.regex(/^redbox\.core\.[a-z0-9.-]+$/),
          owner: z.literal('@researchdatabox/redbox-core'),
          parameterShape: parameterShapeSchema,
          behavior: z
            .object({
              classifications: z.array(behaviorClassificationSchema).min(1),
              mutationBehavior: nonEmptyStringSchema,
              returnShape: nonEmptyStringSchema,
              failureSemantics: nonEmptyStringSchema,
              orderingAssumptions: nonEmptyStringSchema,
            })
            .strict(),
          occurrences: z.array(occurrenceSchema).min(1),
        })
        .strict()
    ),
  })
  .strict();

const parameterTransformSchema = z
  .object({
    copy: z.array(nonEmptyStringSchema).optional(),
    defaults: z.record(nonEmptyStringSchema, jsonValueSchema).optional(),
    drop: z.array(nonEmptyStringSchema).optional(),
    transform: z
      .array(z.object({ from: nonEmptyStringSchema, to: nonEmptyStringSchema, rule: nonEmptyStringSchema }).strict())
      .optional(),
    note: nonEmptyStringSchema.optional(),
  })
  .strict()
  .refine(transform => Object.values(transform).some(value => value !== undefined));
const mappingsSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedForTask: z.literal('A01'),
    status: z.literal('proposed-contract-input'),
    note: nonEmptyStringSchema,
    mappings: z.array(
      z
        .object({
          legacyExpression: nonEmptyStringSchema,
          actionId: nonEmptyStringSchema.regex(/^redbox\.core\.[a-z0-9.-]+$/),
          contractVersion: z.number().int().positive(),
          owner: z.literal('@researchdatabox/redbox-core'),
          migrationTargetKind: z.enum(['action-binding', 'automatic-transition', 'flatten-only', 'queue-binding']),
          shippedOccurrenceCount: z.number().int().nonnegative().optional(),
          forceRunDisposition: z
            .object({ operation: z.enum(['copy', 'drop', 'transform']), rationale: nonEmptyStringSchema })
            .strict(),
          parameterTransform: parameterTransformSchema,
        })
        .strict()
    ),
  })
  .strict();

export type NegativeFixture = z.infer<typeof negativeFixtureSchema>;
export type LegacyActionInventory = z.infer<typeof inventorySchema>;
export type LegacyActionMappings = z.infer<typeof mappingsSchema>;

export const repositoryRoot = path.resolve(__dirname, '../../../../..');
const fixtureDirectory = path.join(repositoryRoot, 'packages/redbox-core/test/fixtures/legacy-record-actions');
const specificationDirectory = path.join(repositoryRoot, 'support/specs/record-type-workflow-administration');

function parseJson(filePath: string): JsonValue {
  return jsonValueSchema.parse(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

export function parseRepresentativeConfiguration(value: JsonValue): RepresentativeConfiguration {
  return representativeConfigurationSchema.parse(value) as RepresentativeConfiguration;
}

export function parseRepresentativeDatabase(value: JsonValue): RepresentativeDatabase {
  return representativeDatabaseSchema.parse(value) as RepresentativeDatabase;
}

export function parseLegacyActionInventory(value: JsonValue): LegacyActionInventory {
  return inventorySchema.parse(value);
}

export function parseLegacyActionMappings(value: JsonValue): LegacyActionMappings {
  return mappingsSchema.parse(value);
}

export function loadRepresentativeConfiguration(): RepresentativeConfiguration {
  return parseRepresentativeConfiguration(parseJson(path.join(fixtureDirectory, 'representative-config.json')));
}

export function loadRepresentativeDatabase(): RepresentativeDatabase {
  return parseRepresentativeDatabase(parseJson(path.join(fixtureDirectory, 'representative-database.json')));
}

export function loadNegativeFixture(): NegativeFixture {
  return negativeFixtureSchema.parse(parseJson(path.join(fixtureDirectory, 'unknown-expression.json')));
}

export function loadLegacyActionInventory(): LegacyActionInventory {
  return parseLegacyActionInventory(parseJson(path.join(specificationDirectory, 'legacy-action-inventory.json')));
}

export function loadLegacyActionMappings(): LegacyActionMappings {
  return parseLegacyActionMappings(parseJson(path.join(specificationDirectory, 'legacy-action-mappings.json')));
}
