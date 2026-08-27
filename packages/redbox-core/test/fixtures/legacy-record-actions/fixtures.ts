import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const nonEmptyStringSchema = z.string().min(1);
const jsonValueSchema = z.json();

const genericHookDefinitionSchema = z
  .object({
    function: nonEmptyStringSchema,
    options: z.record(z.string(), jsonValueSchema).optional(),
  })
  .strict();

const genericHookModeSchema = z
  .object({
    pre: z.array(genericHookDefinitionSchema).optional(),
    postSync: z.array(genericHookDefinitionSchema).optional(),
    post: z.array(genericHookDefinitionSchema).optional(),
  })
  .strict();

const genericHooksSchema = z
  .object({
    onCreate: genericHookModeSchema.optional(),
    onUpdate: genericHookModeSchema.optional(),
    onDelete: genericHookModeSchema.optional(),
    onTransitionWorkflow: genericHookModeSchema.optional(),
  })
  .strict();

const templateSchema = z
  .object({
    field: nonEmptyStringSchema,
    template: nonEmptyStringSchema,
  })
  .strict();

const notificationLogHookSchema = z
  .object({
    function: z.literal('sails.services.recordsservice.updateNotificationLog'),
    options: z
      .object({
        forceRun: z.literal(true),
        flagName: nonEmptyStringSchema,
        flagVal: nonEmptyStringSchema,
        saveRecord: z.boolean(),
      })
      .strict(),
  })
  .strict();

const permissionHookSchema = z.discriminatedUnion('function', [
  z
    .object({
      function: z.literal('sails.services.rdmpservice.stripUserBasedPermissions'),
      options: z.object({ triggerCondition: nonEmptyStringSchema }).strict(),
    })
    .strict(),
  z
    .object({
      function: z.literal('sails.services.rdmpservice.restoreUserBasedPermissions'),
      options: z.object({ triggerCondition: nonEmptyStringSchema }).strict(),
    })
    .strict(),
]);

const representativeHookDefinitionSchema = z.discriminatedUnion('function', [
  z
    .object({
      function: z.literal('sails.services.rdmpservice.runTemplates'),
      options: z
        .object({
          parseObject: z.boolean(),
          templates: z.array(templateSchema).min(1),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      function: z.literal('sails.services.emailservice.sendRecordNotification'),
      options: z
        .object({
          forceRun: z.literal(true),
          to: nonEmptyStringSchema,
          subject: nonEmptyStringSchema,
          template: nonEmptyStringSchema,
          onNotifySuccess: z.array(notificationLogHookSchema).min(1),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      function: z.literal('sails.services.triggerservice.runHooksSync'),
      options: z
        .object({
          hooks: z.array(permissionHookSchema).min(1),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      function: z.literal('sails.services.rdmpservice.checkTotalSizeOfFilesInRecord'),
      options: z.object({ forceRun: z.literal(true) }).strict(),
    })
    .strict(),
  z
    .object({
      function: z.literal('sails.services.rdmpservice.queueTriggerCall'),
      options: z
        .object({
          jobName: nonEmptyStringSchema,
          forceRun: z.literal(true),
          triggerConfiguration: z
            .object({
              function: z.literal('sails.services.doiservice.updateDoiTriggerSync'),
              options: z
                .object({
                  forceRun: z.literal(true),
                  event: nonEmptyStringSchema,
                })
                .strict(),
            })
            .strict(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      function: z.literal('sails.services.triggerservice.transitionWorkflow'),
      options: z
        .object({
          triggerCondition: nonEmptyStringSchema,
          targetWorkflowStageName: nonEmptyStringSchema,
          targetWorkflowStageLabel: nonEmptyStringSchema,
          targetForm: nonEmptyStringSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      function: z.literal('sails.services.rdmpservice.addWorkspaceToRecord'),
      options: z.object({ rdmpOidField: nonEmptyStringSchema }).strict(),
    })
    .strict(),
  z
    .object({
      function: z.literal('sails.services.doiservice.publishDoiTrigger'),
      options: z
        .object({
          forceRun: z.literal(true),
          event: nonEmptyStringSchema,
        })
        .strict(),
    })
    .strict(),
]);

const representativeHookModeSchema = z
  .object({
    pre: z.array(representativeHookDefinitionSchema).min(1).optional(),
    postSync: z.array(representativeHookDefinitionSchema).min(1).optional(),
    post: z.array(representativeHookDefinitionSchema).min(1).optional(),
  })
  .strict();

const representativeHooksSchema = z
  .object({
    onCreate: representativeHookModeSchema.optional(),
    onUpdate: representativeHookModeSchema.optional(),
    onDelete: representativeHookModeSchema.optional(),
    onTransitionWorkflow: representativeHookModeSchema.optional(),
  })
  .strict();

const completeRepresentativeHooksSchema = z
  .object({
    onCreate: representativeHookModeSchema,
    onUpdate: representativeHookModeSchema,
    onDelete: representativeHookModeSchema,
    onTransitionWorkflow: representativeHookModeSchema,
  })
  .strict();

const secondaryRepresentativeHooksSchema = z
  .object({
    onDelete: representativeHookModeSchema,
  })
  .strict();

const recordTypeConfigurationSchema = z
  .object({
    packageType: nonEmptyStringSchema,
    searchable: z.boolean(),
    hooks: completeRepresentativeHooksSchema,
  })
  .strict();

const workflowStageConfigurationSchema = z
  .object({
    form: nonEmptyStringSchema,
    workflow: z
      .object({
        stage: nonEmptyStringSchema,
        stageLabel: nonEmptyStringSchema,
      })
      .strict(),
    authorization: z
      .object({
        viewRoles: z.array(nonEmptyStringSchema),
        editRoles: z.array(nonEmptyStringSchema),
      })
      .strict(),
  })
  .strict();

const workflowStageSchema = z
  .object({
    starting: z.boolean(),
    hidden: z.boolean().optional(),
    config: workflowStageConfigurationSchema,
  })
  .strict();

const representativeConfigurationSchema = z
  .object({
    schemaVersion: z.literal(1),
    recordtype: z.object({ 'legacy-action-fixture': recordTypeConfigurationSchema }).strict(),
    workflow: z
      .object({
        'legacy-action-fixture': z
          .object({
            draft: workflowStageSchema,
            published: workflowStageSchema,
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

const databaseRecordTypeFields = {
  id: nonEmptyStringSchema,
  key: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  branding: nonEmptyStringSchema,
  packageType: nonEmptyStringSchema,
  searchable: z.boolean(),
};

const defaultDatabaseRecordTypeSchema = z
  .object({
    ...databaseRecordTypeFields,
    id: z.literal('record-type-default'),
    branding: z.literal('brand-default'),
    hooks: completeRepresentativeHooksSchema,
  })
  .strict();

const secondaryDatabaseRecordTypeSchema = z
  .object({
    ...databaseRecordTypeFields,
    id: z.literal('record-type-secondary'),
    branding: z.literal('brand-secondary'),
    hooks: secondaryRepresentativeHooksSchema,
  })
  .strict();

const databaseRecordTypeSchema = z.union([defaultDatabaseRecordTypeSchema, secondaryDatabaseRecordTypeSchema]);

const databaseWorkflowStepSchema = z
  .object({
    id: nonEmptyStringSchema,
    name: nonEmptyStringSchema,
    recordType: nonEmptyStringSchema,
    starting: z.boolean(),
    hidden: z.boolean(),
    config: workflowStageConfigurationSchema,
  })
  .strict();

const databaseRecordSchema = z
  .object({
    redboxOid: nonEmptyStringSchema,
    revision: z.number().int().positive(),
    metadata: z.object({ title: nonEmptyStringSchema }).strict(),
    metaMetadata: z
      .object({
        type: nonEmptyStringSchema,
        form: nonEmptyStringSchema,
        brandId: nonEmptyStringSchema,
      })
      .strict(),
    workflow: z
      .object({
        stage: nonEmptyStringSchema,
        stageLabel: nonEmptyStringSchema,
      })
      .strict(),
    authorization: z
      .object({
        edit: z.array(nonEmptyStringSchema),
        view: z.array(nonEmptyStringSchema),
        editRoles: z.array(nonEmptyStringSchema),
        viewRoles: z.array(nonEmptyStringSchema),
      })
      .strict(),
  })
  .strict();

const representativeDatabaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    brands: z.tuple([
      z
        .object({
          id: z.literal('brand-default'),
          name: z.literal('default'),
        })
        .strict(),
      z
        .object({
          id: z.literal('brand-secondary'),
          name: z.literal('secondary'),
        })
        .strict(),
    ]),
    recordTypes: z.tuple([defaultDatabaseRecordTypeSchema, secondaryDatabaseRecordTypeSchema]),
    workflowSteps: z.tuple([databaseWorkflowStepSchema, databaseWorkflowStepSchema, databaseWorkflowStepSchema]),
    records: z.tuple([databaseRecordSchema]),
  })
  .strict();

const negativeFixtureSchema = z
  .object({
    schemaVersion: z.literal(1),
    recordTypes: z.array(
      z
        .object({
          id: nonEmptyStringSchema,
          key: nonEmptyStringSchema,
          name: nonEmptyStringSchema,
          branding: nonEmptyStringSchema,
          packageType: nonEmptyStringSchema,
          searchable: z.boolean().optional(),
          hooks: genericHooksSchema,
        })
        .strict()
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

const lifecycleModeSchema = z.enum(['onCreate', 'onUpdate', 'onDelete', 'onTransitionWorkflow']);
const phaseSchema = z.enum(['pre', 'postSync', 'post']);
const nestingSchema = z.enum([
  'record-hook',
  'onNotifySuccess',
  'runHooksSync',
  'queuedTriggerConfiguration',
  'nested-executable',
]);

const sourceOptionsSchema = z.discriminatedUnion('presence', [
  z.object({ presence: z.literal('absent') }).strict(),
  z
    .object({
      presence: z.literal('present'),
      value: z.record(z.string(), jsonValueSchema),
    })
    .strict(),
]);

const occurrenceSchema = z
  .object({
    source: z
      .object({
        file: nonEmptyStringSchema,
        line: z.number().int().positive(),
      })
      .strict(),
    recordType: nonEmptyStringSchema,
    lifecycleMode: lifecycleModeSchema,
    phase: phaseSchema,
    order: z.number().int().nonnegative(),
    nesting: nestingSchema,
    parentOrder: z.number().int().nonnegative().optional(),
    parameterVariant: nonEmptyStringSchema,
    sourceOptions: sourceOptionsSchema,
  })
  .strict();

const sourceGroupSchema = z
  .object({
    name: z.enum([
      'core-record-type-config',
      'redbox-hook-dev',
      'supported-bundled-hooks',
      'shipped-record-type-fixtures',
    ]),
    paths: z.array(nonEmptyStringSchema),
    occurrenceCount: z.number().int().nonnegative(),
    note: nonEmptyStringSchema.optional(),
  })
  .strict();

const exclusionSchema = z
  .object({
    paths: z.array(nonEmptyStringSchema).min(1),
    reason: nonEmptyStringSchema,
  })
  .strict();

const nestedExecutableStructureSchema = z
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

const behaviorSchema = z
  .object({
    classifications: z.array(behaviorClassificationSchema).min(1),
    mutationBehavior: nonEmptyStringSchema,
    returnShape: nonEmptyStringSchema,
    failureSemantics: nonEmptyStringSchema,
    orderingAssumptions: nonEmptyStringSchema,
  })
  .strict();

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
        exclusions: z.array(exclusionSchema).min(1),
      })
      .strict(),
    nestedExecutableStructures: z.array(nestedExecutableStructureSchema).min(1),
    actions: z
      .array(
        z
          .object({
            legacyExpression: nonEmptyStringSchema,
            proposedActionId: nonEmptyStringSchema.regex(/^redbox\.core\.[a-z0-9.-]+$/),
            owner: z.literal('@researchdatabox/redbox-core'),
            parameterShape: parameterShapeSchema,
            behavior: behaviorSchema,
            occurrences: z.array(occurrenceSchema).min(1),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

const parameterTransformationSchema = z
  .object({
    from: nonEmptyStringSchema,
    to: nonEmptyStringSchema,
    rule: nonEmptyStringSchema,
  })
  .strict();

const parameterTransformSchema = z
  .object({
    copy: z.array(nonEmptyStringSchema).optional(),
    defaults: z.record(nonEmptyStringSchema, jsonValueSchema).optional(),
    drop: z.array(nonEmptyStringSchema).optional(),
    transform: z.array(parameterTransformationSchema).min(1).optional(),
    note: nonEmptyStringSchema.optional(),
  })
  .strict()
  .refine(
    transform =>
      transform.copy !== undefined ||
      transform.defaults !== undefined ||
      transform.drop !== undefined ||
      transform.transform !== undefined ||
      transform.note !== undefined,
    { message: 'A parameter transform must declare at least one operation or note.' }
  );

const forceRunDispositionSchema = z
  .object({
    operation: z.enum(['copy', 'drop', 'transform']),
    rationale: nonEmptyStringSchema,
  })
  .strict();

const mappingsSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedForTask: z.literal('A01'),
    status: z.literal('proposed-contract-input'),
    note: nonEmptyStringSchema,
    mappings: z
      .array(
        z
          .object({
            legacyExpression: nonEmptyStringSchema,
            actionId: nonEmptyStringSchema.regex(/^redbox\.core\.[a-z0-9.-]+$/),
            contractVersion: z.number().int().positive(),
            owner: z.literal('@researchdatabox/redbox-core'),
            migrationTargetKind: z.enum(['action-binding', 'automatic-transition', 'flatten-only', 'queue-binding']),
            shippedOccurrenceCount: z.number().int().nonnegative().optional(),
            forceRunDisposition: forceRunDispositionSchema,
            parameterTransform: parameterTransformSchema,
          })
          .strict()
      )
      .min(1),
  })
  .strict();

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
  recordtype: Record<
    string,
    {
      packageType: string;
      searchable: boolean;
      hooks: HooksFixture;
    }
  >;
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
  return representativeConfigurationSchema.parse(value);
}

export function parseRepresentativeDatabase(value: JsonValue): RepresentativeDatabase {
  return representativeDatabaseSchema.parse(value);
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
