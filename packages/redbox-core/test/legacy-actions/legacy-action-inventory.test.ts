import { expect } from 'chai';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { globSync } from 'glob';
import {
  type HooksFixture,
  type JsonValue,
  type LegacyActionInventory,
  type LegacyActionMappings,
  type RepresentativeConfiguration,
  type RepresentativeDatabase,
  loadLegacyActionInventory,
  loadLegacyActionMappings,
  loadNegativeFixture,
  loadRepresentativeConfiguration,
  loadRepresentativeDatabase,
  parseLegacyActionInventory,
  parseLegacyActionMappings,
  parseRepresentativeConfiguration,
  parseRepresentativeDatabase,
  repositoryRoot,
} from '../fixtures/legacy-record-actions/fixtures';

const LIFECYCLE_MODES = ['onCreate', 'onUpdate', 'onDelete', 'onTransitionWorkflow'] as const;
const PHASES = ['pre', 'postSync', 'post'] as const;
const SHIPPED_CONFIG_SOURCE_GLOBS: string[] = [
  'packages/redbox-core/src/config/**/*.ts',
  'packages/redbox-hook-dev/src/config/**/*.ts',
  'packages/*hook*/src/config/**/*.{ts,js,json}',
];
const SHIPPED_CONFIG_EXCLUSION_GLOBS: string[] = [
  '**/dist/**',
  '**/node_modules/**',
  '**/coverage/**',
  'packages/**/test/**',
  'test/**',
  'support/wiki/**',
  'support/specs/**',
  'packages/redbox-core/src/config/brandingConfigurationDefaults.config.ts',
];
const MIGRATED_AUTOMATIC_TRANSITION_EXPRESSION = 'sails.services.triggerservice.transitionWorkflow';
const MIGRATED_AUTOMATIC_TRANSITION_OCCURRENCES = 2;

type LifecycleMode = (typeof LIFECYCLE_MODES)[number];
type Phase = (typeof PHASES)[number];
type Nesting = 'record-hook' | 'onNotifySuccess' | 'runHooksSync' | 'queuedTriggerConfiguration' | 'nested-executable';
type InventoryOccurrence = LegacyActionInventory['actions'][number]['occurrences'][number];
type SourceOptions = InventoryOccurrence['sourceOptions'];
type ConfiguredRecordType = RepresentativeConfiguration['recordtype'][string];
type ConfiguredWorkflowStage = RepresentativeConfiguration['workflow'][string][string];
type DatabaseRecordType = RepresentativeDatabase['recordTypes'][number];
type DatabaseWorkflowStep = RepresentativeDatabase['workflowSteps'][number];
type InventoryAction = LegacyActionInventory['actions'][number];
type ParameterShape = InventoryAction['parameterShape'];
type BehaviorClassification = InventoryAction['behavior']['classifications'][number];
type ParameterTransform = LegacyActionMappings['mappings'][number]['parameterTransform'];

const EXPECTED_SOURCE_GROUPS: LegacyActionInventory['scan']['includedSourceGroups'] = [
  {
    name: 'core-record-type-config',
    paths: ['packages/redbox-core/src/config/**/*.ts'],
    occurrenceCount: 0,
  },
  {
    name: 'redbox-hook-dev',
    paths: ['packages/redbox-hook-dev/src/config/**/*.ts'],
    occurrenceCount: 32,
  },
  {
    name: 'supported-bundled-hooks',
    paths: ['packages/*hook*/src/config/**/*.{ts,js,json}'],
    occurrenceCount: 0,
    note: 'The redbox-hook-dev occurrences are counted in their dedicated group; sails-hook-redbox-storage-mongo contains no record lifecycle hook configuration.',
  },
  {
    name: 'shipped-record-type-fixtures',
    paths: [],
    occurrenceCount: 0,
    note: 'No pre-existing runtime/bootstrap RecordType fixture with executable hooks is shipped by this worktree.',
  },
];

const EXPECTED_EXCLUSIONS: LegacyActionInventory['scan']['exclusions'] = [
  {
    paths: ['**/dist/**', '**/node_modules/**', '**/coverage/**'],
    reason:
      'Generated, installed, and coverage output duplicate or do not define repository-owned source configuration.',
  },
  {
    paths: ['packages/**/test/**', 'test/**'],
    reason:
      'Unit/integration test literals are not shipped RecordType configuration. A01 representative migration fixtures are validated separately.',
  },
  {
    paths: ['support/wiki/**', 'support/specs/**'],
    reason: 'Documentation examples and proposed configurations are not runtime definitions.',
  },
  {
    paths: ['packages/redbox-core/src/config/brandingConfigurationDefaults.config.ts'],
    reason: 'Its onCreate/onUpdate arrays are user-account authentication hooks, not RecordHookDefinition values.',
  },
];

const EXPECTED_NESTED_STRUCTURES: LegacyActionInventory['nestedExecutableStructures'] = [
  {
    name: 'onNotifySuccess',
    runtimeOwner: '@researchdatabox/redbox-core:EmailService.sendRecordNotification',
    path: 'RecordHookDefinition.options.onNotifySuccess[]',
    shippedOccurrenceCount: 6,
    execution:
      'After a successful email send, callbacks are invoked in configured array order but their Promise/Observable completions are not awaited by the parent action.',
    failure:
      'Entries with a missing, empty, or non-string function are silently skipped. Expression-evaluation errors, non-callable results, and synchronous callback throws escape sendRecordNotification and reject its Promise. After a callback result is converted, asynchronous Promise/Observable failures are logged and do not undo the completed email action.',
    migration:
      'Flatten into ordered bindings that depend on the parent email action succeeding. Preserve sibling launch order explicitly.',
  },
  {
    name: 'runHooksSync',
    runtimeOwner: '@researchdatabox/redbox-core:TriggerService.runHooksSync',
    path: 'RecordHookDefinition.options.hooks[]',
    shippedOccurrenceCount: 0,
    execution:
      'Valid callbacks are resolved first, then concatMap invokes them sequentially with the same oid, record, options, and user; only the last result is returned.',
    failure:
      'Entries with a missing, empty, or non-string function and expressions that evaluate to non-callable values are logged and skipped. Expression-evaluation errors escape runHooksSync synchronously. An invoked callback failure terminates the returned Observable sequence.',
    migration:
      'Remove the runner and flatten valid children into adjacent ordered bindings; do not model nested executable parameters in the registry.',
    representativeFixture: 'packages/redbox-core/test/fixtures/legacy-record-actions/representative-config.json',
  },
  {
    name: 'queuedTriggerConfiguration',
    runtimeOwner: '@researchdatabox/redbox-core:RDMPService.queuedTriggerSubscriptionHandler',
    path: 'RecordHookDefinition.options.triggerConfiguration.function',
    shippedOccurrenceCount: 0,
    execution:
      'queueTriggerCall evaluates its outer condition, persists the nested definition in an Agenda payload, and the later job resolves and invokes the nested function.',
    failure:
      'A missing function is ignored and a non-callable evaluated value is logged before returning the record Observable. Expression-evaluation errors and synchronous invocation errors escape the consumer. Promise/Observable failures from invoked callbacks reject the returned Promise.',
    migration: 'Replace the nested function with a registered action reference in a bounded queue-owned contract.',
    representativeFixture: 'packages/redbox-core/test/fixtures/legacy-record-actions/representative-config.json',
  },
];

interface ExpectedActionParameterContract {
  parameterShape: ParameterShape;
  classifications: BehaviorClassification[];
  variants: string[];
}

const EXPECTED_ACTION_PARAMETER_CONTRACTS: Record<string, ExpectedActionParameterContract> = {
  'sails.services.rdmpservice.runTemplates': {
    parameterShape: {
      required: ['templates'],
      optional: ['parseObject'],
      nested: { 'templates[]': ['field', 'template'] },
    },
    classifications: ['direct-mutation', 'replacement-return'],
    variants: [
      'one scalar template; parseObject=false',
      'one scalar template; parseObject=false',
      'two scalar templates; parseObject=false',
      'two scalar templates; parseObject=false',
    ],
  },
  'sails.services.rdmpservice.assignPermissions': {
    parameterShape: {
      required: ['emailProperty', 'editContributorProperties', 'viewContributorProperties', 'recordCreatorPermissions'],
      optional: ['triggerCondition'],
    },
    classifications: ['direct-mutation', 'replacement-return'],
    variants: [
      'RDMP contributor fields',
      'RDMP contributor fields',
      'data-record contributor fields',
      'data-record contributor fields',
      'creator fields',
      'creator fields',
    ],
  },
  'sails.services.rdmpservice.checkTotalSizeOfFilesInRecord': {
    parameterShape: {
      required: [],
      optional: ['triggerCondition', 'maxUploadSizeMessageCode', 'replaceOrAppend'],
    },
    classifications: ['validation-only', 'replacement-return'],
    variants: ['draft/queued/published condition with appended translated message'],
  },
  'sails.services.triggerservice.transitionWorkflow': {
    parameterShape: {
      required: ['triggerCondition', 'targetWorkflowStageName', 'targetWorkflowStageLabel', 'targetForm'],
      optional: [],
    },
    classifications: ['direct-mutation', 'replacement-return', 'workflow-transition'],
    variants: ['queued+embargo flag to embargoed', 'published+embargo flag to embargoed'],
  },
  'sails.services.recordsservice.updateNotificationLog': {
    parameterShape: {
      required: ['flagName', 'flagVal'],
      optional: ['name', 'triggerCondition', 'forceRun', 'logName', 'saveRecord'],
    },
    classifications: ['direct-mutation', 'replacement-return', 'nested-callback'],
    variants: [
      'initialize notification.state=draft; saveRecord=false',
      'initialize notification.state=draft; saveRecord=false',
      'state=emailed-reviewing plus reviewing log; saveRecord=true',
      'state=emailed-published plus published log; saveRecord=true',
      'state=emailed-reviewing plus reviewing log; saveRecord=true',
      'state=emailed-published plus published log; saveRecord=true',
    ],
  },
  'sails.services.rdmpservice.stripUserBasedPermissions': {
    parameterShape: { required: ['triggerCondition'], optional: ['permissionTypes'] },
    classifications: ['direct-mutation', 'replacement-return'],
    variants: ['default edit permission type', 'default edit permission type'],
  },
  'sails.services.rdmpservice.restoreUserBasedPermissions': {
    parameterShape: { required: ['triggerCondition'], optional: [] },
    classifications: ['direct-mutation', 'replacement-return'],
    variants: ['draft-stage condition', 'draft-stage condition'],
  },
  'sails.services.emailservice.sendRecordNotification': {
    parameterShape: {
      required: ['to', 'subject', 'template'],
      optional: ['triggerCondition', 'forceRun', 'from', 'cc', 'bcc', 'format', 'otherSendOptions', 'onNotifySuccess'],
      nested: { 'onNotifySuccess[]': ['function', 'options'] },
    },
    classifications: ['side-effect-only', 'nested-callback'],
    variants: [
      'publication staged email with two success callbacks',
      'publication published email with one success callback',
      'publication staged email with two success callbacks',
      'publication published email with one success callback',
      'forced reviewer email',
      'forced reviewer email',
    ],
  },
  'sails.services.doiservice.publishDoiTrigger': {
    parameterShape: { required: ['event'], optional: ['triggerCondition', 'forceRun', 'profile'] },
    classifications: ['side-effect-only', 'record-writeback'],
    variants: ['forced draft DOI event gated to draft stage'],
  },
  'sails.services.doiservice.updateDoiTriggerSync': {
    parameterShape: { required: ['event'], optional: ['triggerCondition', 'forceRun', 'profile'] },
    classifications: ['side-effect-only', 'replacement-return'],
    variants: ['forced draft DOI event gated to draft stage'],
  },
  'sails.services.rdmpservice.addWorkspaceToRecord': {
    parameterShape: { required: [], optional: ['rdmpOidField', 'returnType'] },
    classifications: ['side-effect', 'direct-response-mutation', 'replacement-return'],
    variants: ['default rdmpOid field and default record return type'],
  },
};

interface ExpectedTransformOperations {
  declaredOperations: string[];
  copy: string[];
  defaults: Record<string, JsonValue>;
  drop: string[];
  transform: Array<{ from: string; to: string }>;
  note: boolean;
}

const EXPECTED_TRANSFORM_OPERATIONS: Record<string, ExpectedTransformOperations> = {
  'sails.services.rdmpservice.runTemplates': {
    declaredOperations: ['copy', 'drop', 'transform'],
    copy: ['parseObject', 'templates[].field'],
    defaults: {},
    drop: ['forceRun'],
    transform: [{ from: 'templates[].template', to: 'templates[].template' }],
    note: false,
  },
  'sails.services.rdmpservice.assignPermissions': {
    declaredOperations: ['copy', 'drop', 'transform'],
    copy: ['emailProperty', 'editContributorProperties', 'viewContributorProperties', 'recordCreatorPermissions'],
    defaults: {},
    drop: ['forceRun'],
    transform: [{ from: 'triggerCondition', to: 'condition' }],
    note: false,
  },
  'sails.services.rdmpservice.checkTotalSizeOfFilesInRecord': {
    declaredOperations: ['copy', 'drop', 'transform'],
    copy: ['maxUploadSizeMessageCode', 'replaceOrAppend'],
    defaults: {},
    drop: ['forceRun'],
    transform: [{ from: 'triggerCondition', to: 'condition' }],
    note: false,
  },
  'sails.services.triggerservice.transitionWorkflow': {
    declaredOperations: ['copy', 'drop', 'note', 'transform'],
    copy: [],
    defaults: {},
    drop: ['forceRun'],
    transform: [
      { from: 'triggerCondition', to: 'condition' },
      { from: 'targetWorkflowStageName', to: 'targetStage' },
      { from: 'targetWorkflowStageLabel', to: 'targetStageLabelCheck' },
      { from: 'targetForm', to: 'targetFormCheck' },
    ],
    note: true,
  },
  'sails.services.recordsservice.updateNotificationLog': {
    declaredOperations: ['copy', 'note', 'transform'],
    copy: ['name', 'flagName', 'flagVal', 'logName', 'saveRecord'],
    defaults: {},
    drop: [],
    transform: [
      { from: 'triggerCondition', to: 'condition' },
      { from: 'forceRun', to: 'condition' },
    ],
    note: true,
  },
  'sails.services.rdmpservice.stripUserBasedPermissions': {
    declaredOperations: ['copy', 'defaults', 'transform'],
    copy: ['permissionTypes'],
    defaults: { permissionTypes: 'edit' },
    drop: [],
    transform: [
      { from: 'triggerCondition', to: 'condition' },
      { from: 'forceRun', to: 'condition' },
    ],
    note: false,
  },
  'sails.services.rdmpservice.restoreUserBasedPermissions': {
    declaredOperations: ['copy', 'transform'],
    copy: [],
    defaults: {},
    drop: [],
    transform: [
      { from: 'triggerCondition', to: 'condition' },
      { from: 'forceRun', to: 'condition' },
    ],
    note: false,
  },
  'sails.services.emailservice.sendRecordNotification': {
    declaredOperations: ['copy', 'transform'],
    copy: ['template', 'format', 'otherSendOptions'],
    defaults: {},
    drop: [],
    transform: [
      { from: 'triggerCondition', to: 'condition' },
      { from: 'forceRun', to: 'condition' },
      { from: 'to|subject|from|cc|bcc', to: 'same field' },
      { from: 'onNotifySuccess[]', to: 'following bindings' },
    ],
    note: false,
  },
  'sails.services.doiservice.publishDoiTrigger': {
    declaredOperations: ['copy', 'transform'],
    copy: ['event', 'profile'],
    defaults: {},
    drop: [],
    transform: [
      { from: 'triggerCondition', to: 'condition' },
      { from: 'forceRun', to: 'condition' },
    ],
    note: false,
  },
  'sails.services.doiservice.updateDoiTriggerSync': {
    declaredOperations: ['copy', 'transform'],
    copy: ['event', 'profile'],
    defaults: {},
    drop: [],
    transform: [
      { from: 'triggerCondition', to: 'condition' },
      { from: 'forceRun', to: 'condition' },
    ],
    note: false,
  },
  'sails.services.rdmpservice.addWorkspaceToRecord': {
    declaredOperations: ['copy', 'defaults', 'drop', 'note'],
    copy: ['rdmpOidField'],
    defaults: { rdmpOidField: 'rdmpOid' },
    drop: ['forceRun', 'returnType'],
    transform: [],
    note: true,
  },
  'sails.services.triggerservice.runHooksSync': {
    declaredOperations: ['drop', 'note', 'transform'],
    copy: [],
    defaults: {},
    drop: ['forceRun'],
    transform: [{ from: 'hooks[]', to: 'adjacent bindings' }],
    note: true,
  },
  'sails.services.rdmpservice.queueTriggerCall': {
    declaredOperations: ['copy', 'drop', 'transform'],
    copy: ['jobName'],
    defaults: {},
    drop: ['forceRun'],
    transform: [
      { from: 'triggerCondition', to: 'condition' },
      { from: 'triggerConfiguration.function', to: 'queuedActionId+queuedContractVersion' },
      { from: 'triggerConfiguration.options', to: 'queuedParameters' },
    ],
    note: false,
  },
};

const EXPECTED_FIXTURE_FUNCTIONS: ConfiguredFunctionOccurrence[] = [
  {
    expression: 'sails.services.rdmpservice.runTemplates',
    nesting: 'record-hook',
    path: 'hooks.onCreate.pre[0].function',
  },
  {
    expression: 'sails.services.emailservice.sendRecordNotification',
    nesting: 'record-hook',
    path: 'hooks.onCreate.post[0].function',
  },
  {
    expression: 'sails.services.recordsservice.updateNotificationLog',
    nesting: 'onNotifySuccess',
    path: 'hooks.onCreate.post[0].options.onNotifySuccess[0].function',
  },
  {
    expression: 'sails.services.triggerservice.runHooksSync',
    nesting: 'record-hook',
    path: 'hooks.onUpdate.pre[0].function',
  },
  {
    expression: 'sails.services.rdmpservice.stripUserBasedPermissions',
    nesting: 'runHooksSync',
    path: 'hooks.onUpdate.pre[0].options.hooks[0].function',
  },
  {
    expression: 'sails.services.rdmpservice.restoreUserBasedPermissions',
    nesting: 'runHooksSync',
    path: 'hooks.onUpdate.pre[0].options.hooks[1].function',
  },
  {
    expression: 'sails.services.rdmpservice.checkTotalSizeOfFilesInRecord',
    nesting: 'record-hook',
    path: 'hooks.onDelete.pre[0].function',
  },
  {
    expression: 'sails.services.rdmpservice.queueTriggerCall',
    nesting: 'record-hook',
    path: 'hooks.onDelete.post[0].function',
  },
  {
    expression: 'sails.services.doiservice.updateDoiTriggerSync',
    nesting: 'queuedTriggerConfiguration',
    path: 'hooks.onDelete.post[0].options.triggerConfiguration.function',
  },
  {
    expression: 'sails.services.triggerservice.transitionWorkflow',
    nesting: 'record-hook',
    path: 'hooks.onTransitionWorkflow.pre[0].function',
  },
  {
    expression: 'sails.services.rdmpservice.addWorkspaceToRecord',
    nesting: 'record-hook',
    path: 'hooks.onTransitionWorkflow.postSync[0].function',
  },
  {
    expression: 'sails.services.doiservice.publishDoiTrigger',
    nesting: 'record-hook',
    path: 'hooks.onTransitionWorkflow.post[0].function',
  },
];

const EXPECTED_REPRESENTATIVE_CONFIGURATION: RepresentativeConfiguration = {
  schemaVersion: 1,
  recordtype: {
    'legacy-action-fixture': {
      packageType: 'legacy-action-fixture',
      searchable: false,
      hooks: {
        onCreate: {
          pre: [
            {
              function: 'sails.services.rdmpservice.runTemplates',
              options: {
                parseObject: false,
                templates: [
                  {
                    field: 'metadata.generatedTitle',
                    template: "<%= _.get(record, 'metadata.title', '') %>",
                  },
                ],
              },
            },
          ],
          post: [
            {
              function: 'sails.services.emailservice.sendRecordNotification',
              options: {
                forceRun: true,
                to: '{{record.metadata.ownerEmail}}',
                subject: 'Created {{record.metadata.title}}',
                template: 'publicationReview',
                onNotifySuccess: [
                  {
                    function: 'sails.services.recordsservice.updateNotificationLog',
                    options: {
                      forceRun: true,
                      flagName: 'notification.state',
                      flagVal: 'created-email-sent',
                      saveRecord: true,
                    },
                  },
                ],
              },
            },
          ],
        },
        onUpdate: {
          pre: [
            {
              function: 'sails.services.triggerservice.runHooksSync',
              options: {
                hooks: [
                  {
                    function: 'sails.services.rdmpservice.stripUserBasedPermissions',
                    options: { triggerCondition: "<%= record.workflow.stage == 'published' %>" },
                  },
                  {
                    function: 'sails.services.rdmpservice.restoreUserBasedPermissions',
                    options: { triggerCondition: "<%= record.workflow.stage == 'draft' %>" },
                  },
                ],
              },
            },
          ],
        },
        onDelete: {
          pre: [
            {
              function: 'sails.services.rdmpservice.checkTotalSizeOfFilesInRecord',
              options: { forceRun: true },
            },
          ],
          post: [
            {
              function: 'sails.services.rdmpservice.queueTriggerCall',
              options: {
                jobName: 'DoiService-UpdateDoi',
                forceRun: true,
                triggerConfiguration: {
                  function: 'sails.services.doiservice.updateDoiTriggerSync',
                  options: { forceRun: true, event: 'delete' },
                },
              },
            },
          ],
        },
        onTransitionWorkflow: {
          pre: [
            {
              function: 'sails.services.triggerservice.transitionWorkflow',
              options: {
                triggerCondition: "<%= record.workflow.stage == 'queued' %>",
                targetWorkflowStageName: 'published',
                targetWorkflowStageLabel: 'Published',
                targetForm: 'legacy-action-fixture-1.0-published',
              },
            },
          ],
          postSync: [
            {
              function: 'sails.services.rdmpservice.addWorkspaceToRecord',
              options: { rdmpOidField: 'rdmpOid' },
            },
          ],
          post: [
            {
              function: 'sails.services.doiservice.publishDoiTrigger',
              options: { forceRun: true, event: 'publish' },
            },
          ],
        },
      },
    },
  },
  workflow: {
    'legacy-action-fixture': {
      draft: {
        starting: true,
        config: {
          form: 'legacy-action-fixture-1.0-draft',
          workflow: { stage: 'draft', stageLabel: 'Draft' },
          authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
        },
      },
      published: {
        starting: false,
        config: {
          form: 'legacy-action-fixture-1.0-published',
          workflow: { stage: 'published', stageLabel: 'Published' },
          authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
        },
      },
    },
  },
};

const EXPECTED_SECONDARY_DATABASE_RECORD_TYPE: DatabaseRecordType = {
  id: 'record-type-secondary',
  key: 'brand-secondary_legacy-action-fixture',
  name: 'legacy-action-fixture',
  branding: 'brand-secondary',
  packageType: 'legacy-action-fixture',
  searchable: false,
  hooks: {
    onDelete: {
      pre: [
        {
          function: 'sails.services.rdmpservice.checkTotalSizeOfFilesInRecord',
          options: { forceRun: true },
        },
      ],
    },
  },
};

const EXPECTED_WORKFLOW_STEP_IDS = ['workflow-default-draft', 'workflow-default-published', 'workflow-secondary-draft'];

const EXPECTED_NEGATIVE_FIXTURE: ReturnType<typeof loadNegativeFixture> = {
  schemaVersion: 1,
  recordTypes: [
    {
      id: 'record-type-unknown',
      key: 'brand-default_unknown-action-fixture',
      name: 'unknown-action-fixture',
      branding: 'brand-default',
      packageType: 'unknown-action-fixture',
      hooks: {
        onCreate: {
          pre: [
            {
              function: 'sails.services.unshippedservice.executeArbitraryAction',
              options: { payload: 'must-fail-closed' },
            },
          ],
        },
      },
    },
  ],
  expectedMigrationFailure: {
    code: 'unknown-legacy-action-expression',
    expression: 'sails.services.unshippedservice.executeArbitraryAction',
    path: 'recordTypes[0].hooks.onCreate.pre[0].function',
  },
};

function transformOperationProjection(transform: ParameterTransform): ExpectedTransformOperations {
  return {
    declaredOperations: Object.keys(transform).sort(),
    copy: transform.copy ?? [],
    defaults: transform.defaults ?? {},
    drop: transform.drop ?? [],
    transform: transform.transform?.map(operation => ({ from: operation.from, to: operation.to })) ?? [],
    note: transform.note !== undefined,
  };
}

function omitJsonPath(value: JsonValue, pathParts: readonly (string | number)[]): JsonValue {
  if (pathParts.length === 0) {
    throw new Error('An omission path must identify a field or row.');
  }
  const [head, ...tail] = pathParts;
  if (Array.isArray(value)) {
    if (typeof head !== 'number') {
      throw new Error(`Expected an array index, got '${head}'.`);
    }
    if (tail.length === 0) {
      return value.filter((_item, index) => index !== head);
    }
    return value.map((item, index) => (index === head ? omitJsonPath(item, tail) : item));
  }
  if (value === null || typeof value !== 'object' || typeof head !== 'string') {
    throw new Error(`Cannot omit '${head}' from a non-object JSON value.`);
  }
  if (tail.length === 0) {
    const { [head]: _omitted, ...remaining } = value;
    return remaining;
  }
  return { ...value, [head]: omitJsonPath(value[head], tail) };
}

function jsonClone(value: object): JsonValue {
  return JSON.parse(JSON.stringify(value));
}

interface ScannedOccurrence {
  expression: string;
  file: string;
  line: number;
  recordType: string;
  lifecycleMode: LifecycleMode;
  phase: Phase;
  order: number;
  nesting: Nesting;
  parentOrder?: number;
  sourceParameterShape: SourceParameterShape;
  sourceOptions: SourceOptions;
}

interface SourceParameterShape {
  keys: string[];
  nested: Record<string, string[]>;
}

interface ComparableOccurrence {
  expression: string;
  file: string;
  line: number;
  recordType: string;
  lifecycleMode: LifecycleMode;
  phase: Phase;
  order: number;
  nesting: Nesting;
  parentOrder?: number;
  sourceOptions: SourceOptions;
}

interface ConfiguredFunctionOccurrence {
  expression: string;
  nesting: Nesting;
  path: string;
}

interface ConfiguredTransitionTarget {
  recordType: string;
  path: string;
  stage: string;
  stageLabel: string;
  form: string;
}

function isLifecycleMode(value: string): value is LifecycleMode {
  return LIFECYCLE_MODES.some(mode => mode === value);
}

function isPhase(value: string): value is Phase {
  return PHASES.some(phase => phase === value);
}

function propertyName(node: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function objectProperty(object: ts.ObjectLiteralExpression, name: string): ts.PropertyAssignment | undefined {
  return object.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && propertyName(property.name) === name
  );
}

function stringInitializer(property: ts.PropertyAssignment | undefined): ts.StringLiteralLike | undefined {
  if (
    property &&
    (ts.isStringLiteral(property.initializer) || ts.isNoSubstitutionTemplateLiteral(property.initializer))
  ) {
    return property.initializer;
  }
  return undefined;
}

function nestingName(relativePath: readonly (string | number)[]): Nesting {
  if (relativePath.includes('onNotifySuccess')) {
    return 'onNotifySuccess';
  }
  if (relativePath.includes('hooks')) {
    return 'runHooksSync';
  }
  if (relativePath.includes('triggerConfiguration')) {
    return 'queuedTriggerConfiguration';
  }
  return 'nested-executable';
}

function configuredNestingName(functionPath: string): Nesting {
  if (functionPath.includes('.onNotifySuccess[')) {
    return 'onNotifySuccess';
  }
  if (functionPath.includes('.options.hooks[')) {
    return 'runHooksSync';
  }
  if (functionPath.includes('.triggerConfiguration.function')) {
    return 'queuedTriggerConfiguration';
  }
  return 'nested-executable';
}

function sourceParameterShape(initializer: ts.Expression | undefined): SourceParameterShape {
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
    return { keys: [], nested: {} };
  }
  const keys: string[] = [];
  const nested: Record<string, string[]> = {};
  for (const property of initializer.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const name = propertyName(property.name);
    if (name === undefined) {
      continue;
    }
    keys.push(name);
    if (ts.isArrayLiteralExpression(property.initializer)) {
      const nestedKeys = new Set<string>();
      for (const element of property.initializer.elements) {
        if (!ts.isObjectLiteralExpression(element)) {
          continue;
        }
        for (const nestedProperty of element.properties) {
          if (ts.isPropertyAssignment(nestedProperty)) {
            const nestedName = propertyName(nestedProperty.name);
            if (nestedName !== undefined) {
              nestedKeys.add(nestedName);
            }
          }
        }
      }
      if (nestedKeys.size > 0) {
        nested[`${name}[]`] = [...nestedKeys].sort();
      }
    }
  }
  return { keys: keys.sort(), nested };
}

function sourceJsonObject(source: ts.SourceFile, node: ts.ObjectLiteralExpression): Record<string, JsonValue> {
  const value: Record<string, JsonValue> = {};
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) {
      throw new Error(
        `Unsupported non-property option at ${source.fileName}:${
          source.getLineAndCharacterOfPosition(property.getStart(source)).line + 1
        }.`
      );
    }
    const name = propertyName(property.name);
    if (name === undefined) {
      throw new Error(
        `Unsupported computed option at ${source.fileName}:${
          source.getLineAndCharacterOfPosition(property.getStart(source)).line + 1
        }.`
      );
    }
    value[name] = sourceJsonValue(source, property.initializer);
  }
  return value;
}

function sourceJsonValue(source: ts.SourceFile, node: ts.Expression): JsonValue {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    if (!ts.isNumericLiteral(node.operand)) {
      throw new Error(`Unsupported negative option value '${node.getText(source)}' in ${source.fileName}.`);
    }
    return -Number(node.operand.text);
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map(element => sourceJsonValue(source, element));
  }
  if (ts.isObjectLiteralExpression(node)) {
    return sourceJsonObject(source, node);
  }
  throw new Error(`Unsupported option value '${node.getText(source)}' in ${source.fileName}.`);
}

function sourceOptions(source: ts.SourceFile, property: ts.PropertyAssignment | undefined): SourceOptions {
  if (!property) {
    return { presence: 'absent' };
  }
  if (!ts.isObjectLiteralExpression(property.initializer)) {
    throw new Error(
      `The options value '${property.initializer.getText(source)}' in ${source.fileName} is not an object.`
    );
  }
  return { presence: 'present', value: sourceJsonObject(source, property.initializer) };
}

function scanNestedFunctions(
  source: ts.SourceFile,
  node: ts.Node,
  relativePath: readonly (string | number)[],
  base: Pick<ScannedOccurrence, 'file' | 'recordType' | 'lifecycleMode' | 'phase'>,
  parentOrder: number,
  results: ScannedOccurrence[]
): void {
  if (ts.isObjectLiteralExpression(node)) {
    if (relativePath.length > 0) {
      const functionProperty = objectProperty(node, 'function');
      const expression = stringInitializer(functionProperty);
      if (functionProperty && expression) {
        const arrayIndex = [...relativePath].reverse().find((part): part is number => typeof part === 'number');
        const options = objectProperty(node, 'options');
        results.push({
          ...base,
          expression: expression.text,
          line: source.getLineAndCharacterOfPosition(functionProperty.getStart(source)).line + 1,
          order: arrayIndex ?? 0,
          nesting: nestingName(relativePath),
          parentOrder,
          sourceParameterShape: sourceParameterShape(options?.initializer),
          sourceOptions: sourceOptions(source, options),
        });
      }
    }

    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) {
        continue;
      }
      const name = propertyName(property.name);
      if (name === undefined || (relativePath.length === 0 && name === 'function')) {
        continue;
      }
      scanNestedFunctions(source, property.initializer, [...relativePath, name], base, parentOrder, results);
    }
    return;
  }

  if (ts.isArrayLiteralExpression(node)) {
    node.elements.forEach((element, index) => {
      scanNestedFunctions(source, element, [...relativePath, index], base, parentOrder, results);
    });
  }
}

function scanMode(
  source: ts.SourceFile,
  modeObject: ts.ObjectLiteralExpression,
  lifecycleMode: LifecycleMode,
  objectPath: readonly string[],
  relativeFile: string,
  results: ScannedOccurrence[]
): void {
  const hooksIndex = objectPath.lastIndexOf('hooks');
  const recordType = hooksIndex > 0 ? objectPath[hooksIndex - 1] : '<unresolved-record-type>';

  for (const phaseProperty of modeObject.properties) {
    if (!ts.isPropertyAssignment(phaseProperty)) {
      continue;
    }
    const phaseName = propertyName(phaseProperty.name);
    if (!phaseName || !isPhase(phaseName) || !ts.isArrayLiteralExpression(phaseProperty.initializer)) {
      continue;
    }

    phaseProperty.initializer.elements.forEach((element, order) => {
      if (!ts.isObjectLiteralExpression(element)) {
        return;
      }
      const functionProperty = objectProperty(element, 'function');
      const expression = stringInitializer(functionProperty);
      if (!functionProperty || !expression) {
        return;
      }
      const base = { file: relativeFile, recordType, lifecycleMode, phase: phaseName };
      const options = objectProperty(element, 'options');
      results.push({
        ...base,
        expression: expression.text,
        line: source.getLineAndCharacterOfPosition(functionProperty.getStart(source)).line + 1,
        order,
        nesting: 'record-hook',
        sourceParameterShape: sourceParameterShape(options?.initializer),
        sourceOptions: sourceOptions(source, options),
      });

      if (options) {
        scanNestedFunctions(source, options.initializer, [], base, order, results);
      }
    });
  }
}

function scanSource(filePath: string): ScannedOccurrence[] {
  const relativeFile = path.relative(repositoryRoot, filePath).split(path.sep).join('/');
  const source = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    path.extname(filePath) === '.json' ? ts.ScriptKind.JSON : ts.ScriptKind.TS
  );
  const results: ScannedOccurrence[] = [];

  function visit(node: ts.Node, objectPath: readonly string[]): void {
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) {
          continue;
        }
        const name = propertyName(property.name);
        if (name === undefined) {
          continue;
        }
        if (isLifecycleMode(name) && ts.isObjectLiteralExpression(property.initializer)) {
          scanMode(source, property.initializer, name, objectPath, relativeFile, results);
        } else {
          visit(property.initializer, [...objectPath, name]);
        }
      }
      return;
    }
    ts.forEachChild(node, child => visit(child, objectPath));
  }

  visit(source, []);
  return results;
}

function discoverShippedConfigSources(): string[] {
  return [
    ...new Set(
      globSync(SHIPPED_CONFIG_SOURCE_GLOBS, {
        absolute: true,
        cwd: repositoryRoot,
        nodir: true,
        ignore: SHIPPED_CONFIG_EXCLUSION_GLOBS,
      })
    ),
  ].sort();
}

function normalizedOccurrence(occurrence: ScannedOccurrence): ComparableOccurrence {
  return {
    expression: occurrence.expression,
    file: occurrence.file,
    line: occurrence.line,
    recordType: occurrence.recordType,
    lifecycleMode: occurrence.lifecycleMode,
    phase: occurrence.phase,
    order: occurrence.order,
    nesting: occurrence.nesting,
    sourceOptions: occurrence.sourceOptions,
    ...(occurrence.parentOrder === undefined ? {} : { parentOrder: occurrence.parentOrder }),
  };
}

function inventoryOccurrences(inventory: LegacyActionInventory): ScannedOccurrence[] {
  return inventory.actions.flatMap(action =>
    action.occurrences.map((occurrence: InventoryOccurrence) => ({
      expression: action.legacyExpression,
      file: occurrence.source.file,
      line: occurrence.source.line,
      recordType: occurrence.recordType,
      lifecycleMode: occurrence.lifecycleMode,
      phase: occurrence.phase,
      order: occurrence.order,
      nesting: occurrence.nesting,
      sourceParameterShape: { keys: [], nested: {} },
      sourceOptions: occurrence.sourceOptions,
      ...(occurrence.parentOrder === undefined ? {} : { parentOrder: occurrence.parentOrder }),
    }))
  );
}

function sortedOccurrences(occurrences: ScannedOccurrence[]): ComparableOccurrence[] {
  return occurrences
    .map(normalizedOccurrence)
    .sort((left, right) =>
      `${left.file}:${String(left.line).padStart(5, '0')}`.localeCompare(
        `${right.file}:${String(right.line).padStart(5, '0')}`
      )
    );
}

function migratedOccurrenceProjection(
  occurrence: ScannedOccurrence,
  historical: boolean
): Omit<ComparableOccurrence, 'line'> {
  const normalized = normalizedOccurrence(occurrence);
  const { line: _line, ...projected } = normalized;
  if (
    !historical ||
    projected.file !== 'packages/redbox-hook-dev/src/config/recordtype.ts' ||
    projected.recordType !== 'dataPublication' ||
    projected.phase !== 'pre' ||
    (projected.lifecycleMode !== 'onCreate' && projected.lifecycleMode !== 'onUpdate')
  ) {
    return projected;
  }
  return {
    ...projected,
    ...(projected.nesting === 'record-hook' ? { order: projected.order - 1 } : {}),
    ...(projected.parentOrder === undefined ? {} : { parentOrder: projected.parentOrder - 1 }),
  };
}

function sortedMigratedOccurrences(
  occurrences: ScannedOccurrence[],
  historical: boolean
): Omit<ComparableOccurrence, 'line'>[] {
  return occurrences
    .map(occurrence => migratedOccurrenceProjection(occurrence, historical))
    .sort((left, right) => {
      const leftKey = JSON.stringify(left);
      const rightKey = JSON.stringify(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
}

function assertInventoryMatchesSource(candidateInventory: LegacyActionInventory, scanned: ScannedOccurrence[]): void {
  expect(sortedOccurrences(inventoryOccurrences(candidateInventory))).to.deep.equal(sortedOccurrences(scanned));
}

function collectNestedFunctions(
  value: JsonValue,
  pathPrefix: string,
  occurrences: ConfiguredFunctionOccurrence[]
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectNestedFunctions(item, `${pathPrefix}[${index}]`, occurrences);
    });
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }

  for (const key of Object.keys(value)) {
    const child = value[key];
    const childPath = `${pathPrefix}.${key}`;
    if (key === 'function' && typeof child === 'string') {
      occurrences.push({ expression: child, nesting: configuredNestingName(childPath), path: childPath });
    } else {
      collectNestedFunctions(child, childPath, occurrences);
    }
  }
}

function configuredFunctionOccurrences(hooks: HooksFixture): ConfiguredFunctionOccurrence[] {
  const occurrences: ConfiguredFunctionOccurrence[] = [];
  for (const lifecycleMode of LIFECYCLE_MODES) {
    const mode = hooks[lifecycleMode];
    if (!mode) {
      continue;
    }
    for (const phase of PHASES) {
      mode[phase]?.forEach((definition, order) => {
        const definitionPath = `hooks.${lifecycleMode}.${phase}[${order}]`;
        occurrences.push({
          expression: definition.function,
          nesting: 'record-hook',
          path: `${definitionPath}.function`,
        });
        if (definition.options) {
          collectNestedFunctions(definition.options, `${definitionPath}.options`, occurrences);
        }
      });
    }
  }
  return occurrences;
}

function requiredStringOption(
  options: Record<string, JsonValue> | undefined,
  optionName: string,
  definitionPath: string
): string {
  const value = options?.[optionName];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${definitionPath}.options.${optionName} must be a non-empty string.`);
  }
  return value;
}

function configuredTransitionTargets(configuration: RepresentativeConfiguration): ConfiguredTransitionTarget[] {
  const targets: ConfiguredTransitionTarget[] = [];
  for (const [recordTypeName, recordType] of Object.entries(configuration.recordtype)) {
    for (const lifecycleMode of LIFECYCLE_MODES) {
      const mode = recordType.hooks[lifecycleMode];
      if (!mode) {
        continue;
      }
      for (const phase of PHASES) {
        mode[phase]?.forEach((definition, order) => {
          if (definition.function !== 'sails.services.triggerservice.transitionWorkflow') {
            return;
          }
          const path = `recordtype.${recordTypeName}.hooks.${lifecycleMode}.${phase}[${order}]`;
          targets.push({
            recordType: recordTypeName,
            path,
            stage: requiredStringOption(definition.options, 'targetWorkflowStageName', path),
            stageLabel: requiredStringOption(definition.options, 'targetWorkflowStageLabel', path),
            form: requiredStringOption(definition.options, 'targetForm', path),
          });
        });
      }
    }
  }
  return targets;
}

function persistedRecordTypeProjection(
  recordTypeName: string,
  config: ConfiguredRecordType,
  branding: string
): Omit<DatabaseRecordType, 'id'> {
  return {
    key: `${branding}_${recordTypeName}`,
    name: recordTypeName,
    branding,
    packageType: config.packageType,
    searchable: config.searchable,
    hooks: config.hooks,
  };
}

function withoutRecordTypeId(recordType: DatabaseRecordType): Omit<DatabaseRecordType, 'id'> {
  const { id: _id, ...persistedFields } = recordType;
  return persistedFields;
}

function withoutWorkflowStepId(workflowStep: DatabaseWorkflowStep): Omit<DatabaseWorkflowStep, 'id'> {
  const { id: _id, ...persistedFields } = workflowStep;
  return persistedFields;
}

function persistedWorkflowStepProjection(
  stageName: string,
  stage: ConfiguredWorkflowStage,
  recordTypeId: string
): Omit<DatabaseWorkflowStep, 'id'> {
  return {
    name: stageName,
    recordType: recordTypeId,
    starting: stage.starting,
    hidden: stage.hidden ?? false,
    config: stage.config,
  };
}

describe('A01 legacy record action inventory', function () {
  const inventory = loadLegacyActionInventory();
  const mappings = loadLegacyActionMappings();
  const representativeConfig = loadRepresentativeConfiguration();
  const representativeDatabase = loadRepresentativeDatabase();

  it('matches shipped occurrences while retaining the migrated automatic-transition inventory', function () {
    const scanned = discoverShippedConfigSources().flatMap(scanSource);

    expect(inventory.scan.includedSourceGroups).to.deep.equal(EXPECTED_SOURCE_GROUPS);
    expect(inventory.scan.exclusions).to.deep.equal(EXPECTED_EXCLUSIONS);
    expect(inventory.nestedExecutableStructures).to.deep.equal(EXPECTED_NESTED_STRUCTURES);
    expect(inventory.scan.includedSourceGroups.flatMap(group => group.paths).sort()).to.deep.equal(
      [...SHIPPED_CONFIG_SOURCE_GLOBS].sort()
    );
    expect(inventory.scan.exclusions.flatMap(exclusion => exclusion.paths).sort()).to.deep.equal(
      [...SHIPPED_CONFIG_EXCLUSION_GLOBS].sort()
    );

    expect(scanned).to.have.length(
      inventory.scan.expectedCounts.totalExecutableOccurrences - MIGRATED_AUTOMATIC_TRANSITION_OCCURRENCES
    );
    expect(scanned.filter(occurrence => occurrence.nesting === 'record-hook')).to.have.length(
      inventory.scan.expectedCounts.recordHookDefinitions - MIGRATED_AUTOMATIC_TRANSITION_OCCURRENCES
    );
    expect(scanned.filter(occurrence => occurrence.nesting !== 'record-hook')).to.have.length(
      inventory.scan.expectedCounts.nestedExecutableDefinitions
    );
    expect(new Set(scanned.map(occurrence => occurrence.expression)).size).to.equal(
      inventory.scan.expectedCounts.uniqueLegacyExpressions - 1
    );
    const activeInventory = inventoryOccurrences(inventory).filter(
      occurrence => occurrence.expression !== MIGRATED_AUTOMATIC_TRANSITION_EXPRESSION
    );
    expect(sortedMigratedOccurrences(activeInventory, true)).to.deep.equal(sortedMigratedOccurrences(scanned, false));
    expect(
      inventoryOccurrences(inventory).filter(
        occurrence => occurrence.expression === MIGRATED_AUTOMATIC_TRANSITION_EXPRESSION
      )
    ).to.have.length(MIGRATED_AUTOMATIC_TRANSITION_OCCURRENCES);

    const documentedGroupCounts = new Map(
      inventory.scan.includedSourceGroups.map(group => [group.name, group.occurrenceCount])
    );
    const coreCount = scanned.filter(occurrence => occurrence.file.startsWith('packages/redbox-core/')).length;
    const developmentHookCount = scanned.filter(occurrence =>
      occurrence.file.startsWith('packages/redbox-hook-dev/')
    ).length;
    const otherBundledHookCount = scanned.length - coreCount - developmentHookCount;
    expect(coreCount).to.equal(documentedGroupCounts.get('core-record-type-config'));
    expect(developmentHookCount).to.equal(
      (documentedGroupCounts.get('redbox-hook-dev') ?? 0) - MIGRATED_AUTOMATIC_TRANSITION_OCCURRENCES
    );
    expect(otherBundledHookCount).to.equal(documentedGroupCounts.get('supported-bundled-hooks'));
    expect(documentedGroupCounts.get('shipped-record-type-fixtures')).to.equal(0);
  });

  it('assigns every shipped or representative expression one complete migration mapping', function () {
    const scanned = discoverShippedConfigSources().flatMap(scanSource);
    const fixtureExpressions = configuredFunctionOccurrences(
      representativeConfig.recordtype['legacy-action-fixture'].hooks
    ).map(occurrence => occurrence.expression);
    const expectedMappingExpressions = [
      ...new Set([...scanned.map(item => item.expression), ...fixtureExpressions]),
    ].sort();
    const mappingByExpression = new Map(mappings.mappings.map(mapping => [mapping.legacyExpression, mapping]));
    const actionByExpression = new Map(inventory.actions.map(action => [action.legacyExpression, action]));

    expect([...mappingByExpression.keys()].sort()).to.deep.equal(expectedMappingExpressions);
    expect(mappingByExpression.size).to.equal(mappings.mappings.length);
    expect(actionByExpression.size).to.equal(inventory.actions.length);

    for (const expression of expectedMappingExpressions) {
      const mapping = mappingByExpression.get(expression);
      const action = actionByExpression.get(expression);
      expect(mapping, expression).not.to.equal(undefined);
      if (!mapping) {
        throw new Error(`Missing migration mapping for '${expression}'.`);
      }
      expect(mapping?.actionId).to.match(/^redbox\.core\.[a-z0-9.-]+$/);
      expect(mapping?.contractVersion).to.equal(1);
      expect(mapping?.owner).to.equal('@researchdatabox/redbox-core');
      expect(Object.keys(mapping?.parameterTransform ?? {}), expression).not.to.be.empty;

      const scannedCount = scanned.filter(occurrence => occurrence.expression === expression).length;
      if (action) {
        const expectedContract = EXPECTED_ACTION_PARAMETER_CONTRACTS[expression];
        expect(expectedContract, expression).not.to.equal(undefined);
        if (!expectedContract) {
          throw new Error(`Missing expected parameter contract for '${expression}'.`);
        }
        expect(action.parameterShape, expression).to.deep.equal(expectedContract.parameterShape);
        expect(action.behavior.classifications, expression).to.deep.equal(expectedContract.classifications);
        expect(
          action.occurrences.map(occurrence => occurrence.parameterVariant),
          expression
        ).to.deep.equal(expectedContract.variants);
        expect(mapping?.actionId).to.equal(action.proposedActionId);
        expect(action.occurrences).to.have.length(
          scannedCount +
            (expression === MIGRATED_AUTOMATIC_TRANSITION_EXPRESSION ? MIGRATED_AUTOMATIC_TRANSITION_OCCURRENCES : 0)
        );
        expect(mapping?.shippedOccurrenceCount ?? scannedCount).to.equal(scannedCount);
        expect(new Set(action.parameterShape.required).size).to.equal(action.parameterShape.required.length);
        expect(new Set(action.parameterShape.optional).size).to.equal(action.parameterShape.optional.length);
        expect(action.parameterShape.required.some(name => action.parameterShape.optional.includes(name))).to.equal(
          false
        );
        expect(action.occurrences.every(occurrence => occurrence.parameterVariant.length > 0)).to.equal(true);
      } else {
        expect(scannedCount, expression).to.equal(0);
        expect(mapping?.shippedOccurrenceCount, expression).to.equal(0);
      }

      const expectedTransform = EXPECTED_TRANSFORM_OPERATIONS[expression];
      expect(expectedTransform, expression).not.to.equal(undefined);
      if (!expectedTransform) {
        throw new Error(`Missing expected parameter transform for '${expression}'.`);
      }
      expect(transformOperationProjection(mapping.parameterTransform), expression).to.deep.equal(expectedTransform);
      const disposition = mapping.forceRunDisposition.operation;
      if (disposition === 'copy') {
        expect(mapping.parameterTransform.copy, expression).to.include('forceRun');
      } else if (disposition === 'drop') {
        expect(mapping.parameterTransform.drop, expression).to.include('forceRun');
      } else {
        expect(
          mapping.parameterTransform.transform?.some(operation => operation.from === 'forceRun'),
          expression
        ).to.equal(true);
      }
    }

    expect(mappingByExpression.get('sails.services.triggerservice.transitionWorkflow')?.migrationTargetKind).to.equal(
      'automatic-transition'
    );
    expect(mappingByExpression.get('sails.services.triggerservice.runHooksSync')?.migrationTargetKind).to.equal(
      'flatten-only'
    );
    expect(mappingByExpression.get('sails.services.rdmpservice.queueTriggerCall')?.migrationTargetKind).to.equal(
      'queue-binding'
    );
  });

  it('classifies required mutation behaviors and proves nested occurrence counts against source and fixtures', function () {
    const classifications = new Set(inventory.actions.flatMap(action => action.behavior.classifications));
    expect(classifications).to.include('direct-mutation');
    expect(classifications).to.include('replacement-return');
    expect(classifications).to.include('side-effect-only');
    expect(classifications).to.include('nested-callback');

    const scanned = discoverShippedConfigSources().flatMap(scanSource);
    const fixtureRecordType = representativeConfig.recordtype['legacy-action-fixture'];
    const fixtureOccurrences = configuredFunctionOccurrences(fixtureRecordType.hooks);
    for (const nestedStructure of inventory.nestedExecutableStructures) {
      expect(scanned.filter(occurrence => occurrence.nesting === nestedStructure.name)).to.have.length(
        nestedStructure.shippedOccurrenceCount
      );
      if (nestedStructure.representativeFixture) {
        expect(nestedStructure.representativeFixture).to.equal(
          'packages/redbox-core/test/fixtures/legacy-record-actions/representative-config.json'
        );
        expect(fixtureOccurrences.some(occurrence => occurrence.nesting === nestedStructure.name)).to.equal(true);
      }
    }
  });

  it('derives every shipped source option shape and reconciles it with the complete parameter contracts', function () {
    const actionByExpression = new Map(inventory.actions.map(action => [action.legacyExpression, action]));
    const scanned = discoverShippedConfigSources().flatMap(scanSource);

    for (const occurrence of scanned) {
      const action = actionByExpression.get(occurrence.expression);
      const sourceShape = occurrence.sourceParameterShape;
      expect(action, `${occurrence.file}:${occurrence.line}`).not.to.equal(undefined);
      expect(sourceShape, `${occurrence.file}:${occurrence.line}`).not.to.equal(undefined);
      if (!action || !sourceShape) {
        throw new Error(`Missing parameter contract for ${occurrence.file}:${occurrence.line}.`);
      }
      const declaredKeys = [...action.parameterShape.required, ...action.parameterShape.optional];
      expect(
        sourceShape.keys.filter(key => !declaredKeys.includes(key)),
        `${occurrence.file}:${occurrence.line}`
      ).to.deep.equal([]);
      expect(
        action.parameterShape.required.filter(key => !sourceShape.keys.includes(key)),
        `${occurrence.file}:${occurrence.line}`
      ).to.deep.equal([]);
      expect(sourceShape.nested, `${occurrence.file}:${occurrence.line}`).to.deep.equal(
        Object.fromEntries(
          Object.entries(action.parameterShape.nested ?? {}).filter(([name]) => Object.hasOwn(sourceShape.nested, name))
        )
      );
    }
  });

  it('derives every default row and proves brand divergence, stage identity, forms, and transition targets', function () {
    expect(representativeConfig).to.deep.equal(EXPECTED_REPRESENTATIVE_CONFIGURATION);
    const defaultBrand = representativeDatabase.brands.find(brand => brand.name === 'default');
    const secondaryBrand = representativeDatabase.brands.find(brand => brand.name === 'secondary');
    expect(defaultBrand).not.to.equal(undefined);
    expect(secondaryBrand).not.to.equal(undefined);
    if (!defaultBrand || !secondaryBrand) {
      throw new Error('The representative database must include default and secondary brands.');
    }

    expect(new Set(representativeDatabase.brands.map(brand => brand.id)).size).to.equal(
      representativeDatabase.brands.length
    );
    expect(new Set(representativeDatabase.brands.map(brand => brand.name)).size).to.equal(
      representativeDatabase.brands.length
    );
    expect(representativeDatabase.brands).to.deep.equal([
      { id: 'brand-default', name: 'default' },
      { id: 'brand-secondary', name: 'secondary' },
    ]);
    expect(representativeDatabase.records).to.deep.equal([
      {
        redboxOid: 'record-123',
        revision: 1,
        metadata: { title: 'Persisted lifecycle fixture' },
        metaMetadata: {
          type: 'legacy-action-fixture',
          form: 'legacy-action-fixture-1.0-draft',
          brandId: 'brand-default',
        },
        workflow: { stage: 'draft', stageLabel: 'Draft' },
        authorization: {
          edit: ['user-1'],
          view: [],
          editRoles: ['Admin'],
          viewRoles: ['Admin'],
        },
      },
    ]);

    const defaultRecordTypes = representativeDatabase.recordTypes.filter(
      recordType => recordType.branding === defaultBrand.id
    );
    const expectedDefaultRecordTypes = Object.entries(representativeConfig.recordtype).map(([recordTypeName, config]) =>
      persistedRecordTypeProjection(recordTypeName, config, defaultBrand.id)
    );

    expect(defaultRecordTypes.map(withoutRecordTypeId)).to.have.deep.members(expectedDefaultRecordTypes);
    expect(defaultRecordTypes).to.have.length(expectedDefaultRecordTypes.length);
    expect(new Set(representativeDatabase.recordTypes.map(recordType => recordType.id)).size).to.equal(
      representativeDatabase.recordTypes.length
    );

    const configuredBrandIds = representativeDatabase.brands.map(brand => brand.id).sort();
    const representedBrandIds = [
      ...new Set(representativeDatabase.recordTypes.map(recordType => recordType.branding)),
    ].sort();
    for (const recordType of representativeDatabase.recordTypes) {
      expect(configuredBrandIds.includes(recordType.branding), recordType.id).to.equal(true);
      expect(recordType.key).to.equal(`${recordType.branding}_${recordType.name}`);
    }
    expect(representedBrandIds).to.deep.equal(configuredBrandIds);

    const recordTypeById = new Map(representativeDatabase.recordTypes.map(recordType => [recordType.id, recordType]));
    const defaultRecordTypeByName = new Map(defaultRecordTypes.map(recordType => [recordType.name, recordType]));
    expect(Object.keys(representativeConfig.workflow).sort()).to.deep.equal(
      Object.keys(representativeConfig.recordtype).sort()
    );

    const expectedDefaultWorkflowSteps: Array<Omit<DatabaseWorkflowStep, 'id'>> = [];
    for (const [recordTypeName, configuredStages] of Object.entries(representativeConfig.workflow)) {
      const defaultRecordType = defaultRecordTypeByName.get(recordTypeName);
      expect(defaultRecordType, recordTypeName).not.to.equal(undefined);
      if (!defaultRecordType) {
        throw new Error(`Configured workflow '${recordTypeName}' has no default-brand record type row.`);
      }
      for (const [stageName, configuredStage] of Object.entries(configuredStages)) {
        expect(configuredStage.config.workflow.stage, `${recordTypeName}.${stageName}`).to.equal(stageName);
        expectedDefaultWorkflowSteps.push(
          persistedWorkflowStepProjection(stageName, configuredStage, defaultRecordType.id)
        );
      }
    }

    const defaultRecordTypeIds = new Set(defaultRecordTypes.map(recordType => recordType.id));
    const defaultWorkflowSteps = representativeDatabase.workflowSteps.filter(workflowStep =>
      defaultRecordTypeIds.has(workflowStep.recordType)
    );
    expect(defaultWorkflowSteps.map(withoutWorkflowStepId)).to.have.deep.members(expectedDefaultWorkflowSteps);
    expect(defaultWorkflowSteps).to.have.length(expectedDefaultWorkflowSteps.length);

    for (const workflowStep of representativeDatabase.workflowSteps) {
      const recordType = recordTypeById.get(workflowStep.recordType);
      expect(recordType, workflowStep.id).not.to.equal(undefined);
      if (!recordType) {
        throw new Error(`Workflow step '${workflowStep.id}' has no record type fixture.`);
      }
      const configuredStage = representativeConfig.workflow[recordType.name]?.[workflowStep.name];
      expect(configuredStage, workflowStep.id).not.to.equal(undefined);
      if (!configuredStage) {
        throw new Error(`Workflow step '${workflowStep.id}' has no configuration fixture.`);
      }
      expect(workflowStep.name, workflowStep.id).to.equal(workflowStep.config.workflow.stage);
      expect(withoutWorkflowStepId(workflowStep)).to.deep.equal(
        persistedWorkflowStepProjection(workflowStep.name, configuredStage, recordType.id)
      );
    }
    expect(new Set(representativeDatabase.workflowSteps.map(step => step.id)).size).to.equal(
      representativeDatabase.workflowSteps.length
    );
    expect(representativeDatabase.workflowSteps.map(step => step.id)).to.deep.equal(EXPECTED_WORKFLOW_STEP_IDS);

    const transitionTargets = configuredTransitionTargets(representativeConfig);
    expect(transitionTargets).not.to.be.empty;
    for (const target of transitionTargets) {
      const configuredStage = representativeConfig.workflow[target.recordType]?.[target.stage];
      expect(configuredStage, target.path).not.to.equal(undefined);
      if (!configuredStage) {
        throw new Error(`${target.path} targets an unconfigured stage '${target.stage}'.`);
      }
      expect(configuredStage.config.workflow.stage, target.path).to.equal(target.stage);
      expect(configuredStage.config.workflow.stageLabel, target.path).to.equal(target.stageLabel);
      expect(configuredStage.config.form, target.path).to.equal(target.form);

      const defaultRecordType = defaultRecordTypeByName.get(target.recordType);
      if (!defaultRecordType) {
        throw new Error(`${target.path} has no default-brand record type row.`);
      }
      const persistedTarget = defaultWorkflowSteps.find(
        workflowStep => workflowStep.recordType === defaultRecordType.id && workflowStep.name === target.stage
      );
      expect(persistedTarget, target.path).not.to.equal(undefined);
      expect(persistedTarget?.name, target.path).to.equal(target.stage);
      expect(persistedTarget?.config.workflow.stage, target.path).to.equal(target.stage);
      expect(persistedTarget?.config.workflow.stageLabel, target.path).to.equal(target.stageLabel);
      expect(persistedTarget?.config.form, target.path).to.equal(target.form);
    }

    const defaultFixtureRecordType = defaultRecordTypeByName.get('legacy-action-fixture');
    const secondaryFixtureRecordType = representativeDatabase.recordTypes.find(
      recordType => recordType.branding === secondaryBrand.id && recordType.name === 'legacy-action-fixture'
    );
    expect(defaultFixtureRecordType).not.to.equal(undefined);
    expect(secondaryFixtureRecordType).not.to.equal(undefined);
    if (!defaultFixtureRecordType || !secondaryFixtureRecordType) {
      throw new Error('Both brands must persist the representative record type.');
    }
    expect(secondaryFixtureRecordType).to.deep.equal(EXPECTED_SECONDARY_DATABASE_RECORD_TYPE);
    expect(secondaryFixtureRecordType.hooks).not.to.deep.equal(defaultFixtureRecordType.hooks);
    expect(configuredFunctionOccurrences(secondaryFixtureRecordType.hooks)).not.to.deep.equal(
      configuredFunctionOccurrences(defaultFixtureRecordType.hooks)
    );

    const defaultStageNames = representativeDatabase.workflowSteps
      .filter(workflowStep => workflowStep.recordType === defaultFixtureRecordType.id)
      .map(workflowStep => workflowStep.name)
      .sort();
    const secondaryStageNames = representativeDatabase.workflowSteps
      .filter(workflowStep => workflowStep.recordType === secondaryFixtureRecordType.id)
      .map(workflowStep => workflowStep.name)
      .sort();
    expect(defaultStageNames).to.deep.equal(['draft', 'published']);
    expect(secondaryStageNames).to.deep.equal(['draft']);
  });

  it('maps every executable fixture path and leaves the negative expression fail-closed', function () {
    const mappingExpressions = new Set(mappings.mappings.map(mapping => mapping.legacyExpression));
    const configuredRecordType = representativeConfig.recordtype['legacy-action-fixture'];
    const configuredOccurrences = configuredFunctionOccurrences(configuredRecordType.hooks);
    const databaseOccurrences = representativeDatabase.recordTypes.flatMap(recordType =>
      configuredFunctionOccurrences(recordType.hooks)
    );

    expect(configuredOccurrences).to.deep.equal(EXPECTED_FIXTURE_FUNCTIONS);
    for (const occurrence of [...configuredOccurrences, ...databaseOccurrences]) {
      expect(mappingExpressions.has(occurrence.expression), occurrence.path).to.equal(true);
    }

    const negative = loadNegativeFixture();
    expect(negative).to.deep.equal(EXPECTED_NEGATIVE_FIXTURE);
    const unknownDefinition = negative.recordTypes[0].hooks.onCreate?.pre?.[0];
    expect(unknownDefinition?.function).to.equal(negative.expectedMigrationFailure.expression);
    expect(negative.expectedMigrationFailure.path).to.equal('recordTypes[0].hooks.onCreate.pre[0].function');
    expect(mappingExpressions.has(negative.expectedMigrationFailure.expression)).to.equal(false);
  });

  it('rejects representative, inventory, and mapping omissions at their schema or complete-contract boundary', function () {
    expect(() =>
      parseRepresentativeConfiguration(
        omitJsonPath(jsonClone(representativeConfig), [
          'recordtype',
          'legacy-action-fixture',
          'hooks',
          'onCreate',
          'pre',
          0,
          'options',
          'templates',
          0,
          'template',
        ])
      )
    ).to.throw();
    expect(() =>
      parseRepresentativeConfiguration(
        omitJsonPath(jsonClone(representativeConfig), ['workflow', 'legacy-action-fixture', 'published'])
      )
    ).to.throw();
    expect(() =>
      parseRepresentativeDatabase(omitJsonPath(jsonClone(representativeDatabase), ['recordTypes', 1]))
    ).to.throw();
    expect(() =>
      parseRepresentativeDatabase(omitJsonPath(jsonClone(representativeDatabase), ['records', 0, 'revision']))
    ).to.throw();
    const missingOptionalHookPhase = parseRepresentativeConfiguration(
      omitJsonPath(jsonClone(representativeConfig), [
        'recordtype',
        'legacy-action-fixture',
        'hooks',
        'onCreate',
        'post',
      ])
    );
    expect(() => expect(missingOptionalHookPhase).to.deep.equal(EXPECTED_REPRESENTATIVE_CONFIGURATION)).to.throw();
    const missingSecondaryHookVariant = parseRepresentativeDatabase(
      omitJsonPath(jsonClone(representativeDatabase), ['recordTypes', 1, 'hooks', 'onDelete', 'pre'])
    );
    expect(() =>
      expect(missingSecondaryHookVariant.recordTypes[1]).to.deep.equal(EXPECTED_SECONDARY_DATABASE_RECORD_TYPE)
    ).to.throw();
    expect(() =>
      parseLegacyActionInventory(omitJsonPath(inventory, ['nestedExecutableStructures', 0, 'failure']))
    ).to.throw();
    expect(() =>
      parseLegacyActionInventory(omitJsonPath(inventory, ['actions', 0, 'parameterShape', 'required']))
    ).to.throw();
    expect(() =>
      parseLegacyActionInventory(omitJsonPath(inventory, ['actions', 0, 'occurrences', 0, 'parameterVariant']))
    ).to.throw();
    expect(() =>
      parseLegacyActionInventory(omitJsonPath(inventory, ['actions', 0, 'occurrences', 0, 'sourceOptions']))
    ).to.throw();
    expect(() => parseLegacyActionMappings(omitJsonPath(mappings, ['mappings', 0, 'forceRunDisposition']))).to.throw();
    expect(() =>
      parseLegacyActionMappings(omitJsonPath(mappings, ['mappings', 0, 'parameterTransform', 'transform', 0, 'rule']))
    ).to.throw();

    const missingExclusion = parseLegacyActionInventory(omitJsonPath(inventory, ['scan', 'exclusions', 0]));
    expect(missingExclusion.scan.exclusions).not.to.deep.equal(EXPECTED_EXCLUSIONS);
    const missingClassification = parseLegacyActionInventory(
      omitJsonPath(inventory, ['actions', 0, 'behavior', 'classifications', 0])
    );
    expect(missingClassification.actions[0].behavior.classifications).not.to.deep.equal(
      EXPECTED_ACTION_PARAMETER_CONTRACTS[missingClassification.actions[0].legacyExpression].classifications
    );
    const missingTransformRow = parseLegacyActionMappings(
      omitJsonPath(mappings, ['mappings', 3, 'parameterTransform', 'transform', 0])
    );
    expect(transformOperationProjection(missingTransformRow.mappings[3].parameterTransform)).not.to.deep.equal(
      EXPECTED_TRANSFORM_OPERATIONS[missingTransformRow.mappings[3].legacyExpression]
    );

    const scanned = discoverShippedConfigSources().flatMap(scanSource);
    const missingPartyUpdateVariant = parseLegacyActionInventory(
      omitJsonPath(inventory, ['actions', 0, 'occurrences', 3])
    );
    expect(() => assertInventoryMatchesSource(missingPartyUpdateVariant, scanned)).to.throw();
    const missingPartyLowercaseField = parseLegacyActionInventory(
      omitJsonPath(inventory, ['actions', 0, 'occurrences', 3, 'sourceOptions', 'value', 'templates', 1, 'field'])
    );
    expect(() => assertInventoryMatchesSource(missingPartyLowercaseField, scanned)).to.throw();
  });
});
