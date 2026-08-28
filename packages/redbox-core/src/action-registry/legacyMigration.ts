import { compileManagedHandlebarsTemplate, compileManagedJsonataExpression } from '../expression-runtime';
import { boundedValidationPreflight } from '../boundedValidation';
import { isRuntimeArray, isRuntimeRecord, readRuntimeProperty, type RuntimeValue } from '../runtimeValues';
import {
  parseActionBinding,
  parseActionDefinition,
  validateActionBindingCollection,
  type ActionDefinition,
  type ActionBinding,
  type ActionDependency,
  type ActionJsonObject,
  type ActionJsonValue,
  type ActionParameterValue,
  type ActionParameterValues,
} from './contracts';
import {
  actionBindingScopeSchema,
  deriveStableActionBindingId,
  parseActionDefinitionId,
  safeActionIdentifierSchema,
  type ActionBindingScope,
  type ActionDefinitionId,
} from './identifiers';
import { ACTION_CONTRACT_LIMITS, ACTION_CONTRACT_SCHEMA_VERSION } from './limits';
import { BUILT_IN_ACTION_IDS, builtInActionRegistrations } from './builtInActions';
import { isManagedNotificationFlagPath, isManagedNotificationLogPath } from './managedNotificationPaths';

export type LegacyActionMigrationTargetKind =
  | 'action-binding'
  | 'automatic-transition'
  | 'flatten-only'
  | 'queue-binding';

export interface LegacyRecordActionMapping {
  readonly legacyExpression: string;
  readonly actionId: ActionDefinitionId;
  readonly contractVersion: 1;
  readonly migrationTargetKind: LegacyActionMigrationTargetKind;
  readonly shippedOccurrenceCount: number;
  readonly registered: boolean;
  readonly migrationGuidance: string;
}

const AUTOMATIC_TRANSITION_ID = parseActionDefinitionId('redbox.core.workflow.automatic-transition');
const SEQUENCE_ID = parseActionDefinitionId('redbox.core.sequence.run');

function mapping(
  legacyExpression: string,
  actionId: ActionDefinitionId,
  migrationTargetKind: LegacyActionMigrationTargetKind,
  shippedOccurrenceCount: number,
  registered: boolean,
  migrationGuidance: string
): LegacyRecordActionMapping {
  return Object.freeze({
    legacyExpression,
    actionId,
    contractVersion: 1,
    migrationTargetKind,
    shippedOccurrenceCount,
    registered,
    migrationGuidance,
  });
}

export const LEGACY_RECORD_ACTION_MAPPINGS: readonly LegacyRecordActionMapping[] = Object.freeze([
  mapping(
    'sails.services.rdmpservice.runTemplates',
    BUILT_IN_ACTION_IDS.applyTemplates,
    'action-binding',
    4,
    true,
    'Convert each supported template to an ordered managed JSONata binding; reject unsupported Lodash functions.'
  ),
  mapping(
    'sails.services.rdmpservice.assignPermissions',
    BUILT_IN_ACTION_IDS.assignPermissions,
    'action-binding',
    6,
    true,
    'Copy permission parameters and translate a present Lodash trigger condition to managed JSONata.'
  ),
  mapping(
    'sails.services.rdmpservice.checkTotalSizeOfFilesInRecord',
    BUILT_IN_ACTION_IDS.validateTotalAttachmentSize,
    'action-binding',
    1,
    true,
    'Copy message options and keep the server-owned attachment limit outside persisted parameters.'
  ),
  mapping(
    'sails.services.triggerservice.transitionWorkflow',
    AUTOMATIC_TRANSITION_ID,
    'automatic-transition',
    2,
    false,
    'Migrate to the A10 automatic-transition contract; no legacy mutating action handler is registered.'
  ),
  mapping(
    'sails.services.recordsservice.updateNotificationLog',
    BUILT_IN_ACTION_IDS.updateNotificationState,
    'action-binding',
    6,
    true,
    'Flatten callbacks into ordered bindings and preserve trigger-condition precedence over forceRun.'
  ),
  mapping(
    'sails.services.rdmpservice.stripUserBasedPermissions',
    BUILT_IN_ACTION_IDS.stripUserPermissions,
    'action-binding',
    2,
    true,
    'Preserve permission defaults and translate triggerCondition or forceRun to managed JSONata.'
  ),
  mapping(
    'sails.services.rdmpservice.restoreUserBasedPermissions',
    BUILT_IN_ACTION_IDS.restoreUserPermissions,
    'action-binding',
    2,
    true,
    'Translate triggerCondition or forceRun to managed JSONata.'
  ),
  mapping(
    'sails.services.emailservice.sendRecordNotification',
    BUILT_IN_ACTION_IDS.sendRecordEmail,
    'action-binding',
    6,
    true,
    'Convert address text to managed Handlebars and flatten success callbacks after the sent output.'
  ),
  mapping(
    'sails.services.doiservice.publishDoiTrigger',
    BUILT_IN_ACTION_IDS.publishDoi,
    'action-binding',
    1,
    true,
    'Copy DOI event/profile parameters while keeping credentials behind the server secret boundary.'
  ),
  mapping(
    'sails.services.doiservice.updateDoiTriggerSync',
    BUILT_IN_ACTION_IDS.updateDoi,
    'action-binding',
    1,
    true,
    'Copy DOI event/profile parameters while keeping credentials behind the server secret boundary.'
  ),
  mapping(
    'sails.services.rdmpservice.addWorkspaceToRecord',
    BUILT_IN_ACTION_IDS.linkWorkspace,
    'action-binding',
    1,
    true,
    'Drop legacy returnType and let the registered result contract own bounded workspace output.'
  ),
  mapping(
    'sails.services.triggerservice.runHooksSync',
    SEQUENCE_ID,
    'flatten-only',
    0,
    false,
    'Flatten valid children into adjacent success-dependent bindings; no nested runner is registered.'
  ),
  mapping(
    'sails.services.rdmpservice.queueTriggerCall',
    BUILT_IN_ACTION_IDS.dispatchQueuedAction,
    'queue-binding',
    0,
    true,
    'Replace the nested function string with a bounded registered-action identity and transformed parameters.'
  ),
]);

export type LegacyRecordActionMigrationErrorCode =
  | 'invalid-legacy-action'
  | 'unknown-legacy-action'
  | 'unsupported-legacy-expression'
  | 'invalid-legacy-parameter'
  | 'unsupported-legacy-parameter'
  | 'invalid-nested-action';

export class LegacyRecordActionMigrationError extends Error {
  readonly code: LegacyRecordActionMigrationErrorCode;
  readonly path: string;
  readonly legacyExpression?: string;
  readonly migrationGuidance: string;

  constructor(
    code: LegacyRecordActionMigrationErrorCode,
    path: string,
    migrationGuidance: string,
    legacyExpression?: string
  ) {
    super('Legacy record action cannot be migrated safely.');
    this.name = 'LegacyRecordActionMigrationError';
    this.code = code;
    this.path = path;
    this.migrationGuidance = migrationGuidance;
    this.legacyExpression = legacyExpression;
  }
}

export interface LegacyRecordActionDefinition {
  readonly function: string;
  readonly options?: Readonly<ActionJsonObject>;
}

export interface LegacyRecordActionMigrationRequest {
  readonly schemaVersion: 1;
  readonly recordTypeKey: string;
  readonly scope: ActionBindingScope;
  readonly stableKey: string;
  readonly order: number;
  readonly sourcePath: string;
  readonly definition: LegacyRecordActionDefinition;
}

export interface LegacyAutomaticTransitionMigration {
  readonly schemaVersion: 1;
  readonly kind: 'automatic-transition';
  readonly actionId: ActionDefinitionId;
  readonly contractVersion: 1;
  readonly condition: string;
  readonly targetStage: string;
  readonly targetStageLabelCheck?: string;
  readonly targetFormCheck?: string;
  readonly sourcePath: string;
}

export interface LegacyActionBindingsMigration {
  readonly schemaVersion: 1;
  readonly kind: 'action-bindings';
  readonly bindings: readonly ActionBinding[];
}

export type LegacyRecordActionMigration = LegacyActionBindingsMigration | LegacyAutomaticTransitionMigration;

interface ParsedMigrationRequest {
  readonly recordTypeKey: string;
  readonly scope: ActionBindingScope;
  readonly stableKey: string;
  readonly order: number;
  readonly sourcePath: string;
  readonly definition: LegacyRecordActionDefinition;
}

interface MigrationState {
  readonly request: ParsedMigrationRequest;
  readonly bindings: ActionBinding[];
  offset: number;
}

interface BindingSegment {
  readonly first: ActionBinding;
  readonly last: ActionBinding;
}

const ORDER_STRIDE = 1_000;
const SAFE_SOURCE_PATH = /^[A-Za-z0-9_.$:/[\]-]+$/;
const SAFE_ERROR_PATH_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const BUILT_IN_DEFINITIONS: readonly ActionDefinition[] = Object.freeze(
  builtInActionRegistrations().map(descriptor =>
    parseActionDefinition({
      ...descriptor,
      provenance: { packageName: '@researchdatabox/redbox-core', moduleName: 'actions/index' },
    })
  )
);

function fail(
  code: LegacyRecordActionMigrationErrorCode,
  path: string,
  guidance: string,
  legacyExpression?: string
): never {
  throw new LegacyRecordActionMigrationError(code, path, guidance, legacyExpression);
}

function safeChildPath(path: string, key: string): string {
  return SAFE_ERROR_PATH_KEY.test(key) ? `${path}.${key}` : `${path}.[invalid-key]`;
}

function preflightMigrationRequest(value: RuntimeValue): void {
  const result = boundedValidationPreflight(value, {
    maxBytes: ACTION_CONTRACT_LIMITS.maxContractBytes,
    maxDepth: ACTION_CONTRACT_LIMITS.maxPlanDepth,
    maxStringLength: ACTION_CONTRACT_LIMITS.maxStringValueLength,
    maxPropertyNameLength: ACTION_CONTRACT_LIMITS.maxIdentifierLength,
    maxWork: ACTION_CONTRACT_LIMITS.maxValidationWork,
    arrayCardinalityLimit: () => ACTION_CONTRACT_LIMITS.maxArrayItems,
    objectCardinalityLimit: () => ACTION_CONTRACT_LIMITS.maxObjectProperties,
  });
  if (!result.ok) {
    fail('invalid-legacy-action', '$', 'Use a bounded plain-data legacy migration request.');
  }
}

function cloneJson(value: RuntimeValue, path: string, depth = 0): ActionJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (depth >= ACTION_CONTRACT_LIMITS.maxJsonDepth) {
    return fail('invalid-legacy-parameter', path, 'Reduce the nested legacy parameter depth.');
  }
  if (isRuntimeArray(value)) {
    if (value.length > ACTION_CONTRACT_LIMITS.maxArrayItems) {
      return fail('invalid-legacy-parameter', path, 'Reduce the legacy parameter array size.');
    }
    return value.map((child, index) => cloneJson(child, `${path}[${index}]`, depth + 1));
  }
  if (isRuntimeRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length > ACTION_CONTRACT_LIMITS.maxObjectProperties) {
      return fail('invalid-legacy-parameter', path, 'Reduce the legacy parameter object size.');
    }
    const cloned: ActionJsonObject = {};
    for (const [key, child] of entries) {
      if (key.length === 0 || key.length > ACTION_CONTRACT_LIMITS.maxIdentifierLength) {
        return fail('invalid-legacy-parameter', path, 'Use bounded non-empty legacy parameter names.');
      }
      Object.defineProperty(cloned, key, {
        value: cloneJson(child, safeChildPath(path, key), depth + 1),
        configurable: true,
        enumerable: true,
        writable: true,
      });
    }
    return cloned;
  }
  return fail('invalid-legacy-parameter', path, 'Use JSON-compatible legacy parameter values.');
}

function cloneObject(value: RuntimeValue, path: string): ActionJsonObject {
  const cloned = cloneJson(value, path);
  if (cloned === null || typeof cloned !== 'object' || Array.isArray(cloned)) {
    return fail('invalid-legacy-parameter', path, 'Use an object for legacy action options.');
  }
  return cloned;
}

function freezeObjectTree<Value extends object>(value: Value): Value {
  const pending: object[] = [value];
  const seen = new WeakSet<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || seen.has(current)) {
      continue;
    }
    seen.add(current);
    for (const child of Object.values(current)) {
      if (child !== null && typeof child === 'object') {
        pending.push(child);
      }
    }
    Object.freeze(current);
  }
  return value;
}

function requiredRuntimeString(value: RuntimeValue, path: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > ACTION_CONTRACT_LIMITS.maxStringValueLength) {
    return fail('invalid-legacy-parameter', path, 'Use a bounded non-empty string.');
  }
  return value;
}

function parseRequest(value: RuntimeValue): ParsedMigrationRequest {
  preflightMigrationRequest(value);
  if (!isRuntimeRecord(value) || readRuntimeProperty(value, 'schemaVersion') !== 1) {
    return fail('invalid-legacy-action', '$', 'Use the version 1 legacy migration request contract.');
  }
  const recordTypeKey = readRuntimeProperty(value, 'recordTypeKey');
  const scope = readRuntimeProperty(value, 'scope');
  const stableKey = readRuntimeProperty(value, 'stableKey');
  const order = readRuntimeProperty(value, 'order');
  const sourcePath = readRuntimeProperty(value, 'sourcePath');
  const definitionValue = readRuntimeProperty(value, 'definition');
  if (
    Object.keys(value).some(
      key =>
        !['schemaVersion', 'recordTypeKey', 'scope', 'stableKey', 'order', 'sourcePath', 'definition'].includes(key)
    )
  ) {
    return fail('invalid-legacy-action', '$', 'Remove unsupported migration request properties.');
  }
  if (typeof recordTypeKey !== 'string' || !safeActionIdentifierSchema.safeParse(recordTypeKey).success) {
    return fail('invalid-legacy-action', '$.recordTypeKey', 'Use a safe record-type key.');
  }
  const parsedScope = actionBindingScopeSchema.safeParse(scope);
  if (!parsedScope.success) {
    return fail('invalid-legacy-action', '$.scope', 'Use a valid registered-action binding scope.');
  }
  if (typeof stableKey !== 'string' || !safeActionIdentifierSchema.safeParse(stableKey).success) {
    return fail('invalid-legacy-action', '$.stableKey', 'Use a safe stable binding key.');
  }
  if (
    typeof order !== 'number' ||
    !Number.isSafeInteger(order) ||
    order < 0 ||
    order > Math.floor(ACTION_CONTRACT_LIMITS.maxOrder / ORDER_STRIDE)
  ) {
    return fail('invalid-legacy-action', '$.order', 'Use a non-negative order within the migration range.');
  }
  if (
    typeof sourcePath !== 'string' ||
    sourcePath.length === 0 ||
    sourcePath.length > ACTION_CONTRACT_LIMITS.maxPatchPathLength ||
    !SAFE_SOURCE_PATH.test(sourcePath)
  ) {
    return fail('invalid-legacy-action', '$.sourcePath', 'Use a bounded source path.');
  }
  if (!isRuntimeRecord(definitionValue)) {
    return fail('invalid-legacy-action', `${sourcePath}.definition`, 'Use an object legacy action definition.');
  }
  if (Object.keys(definitionValue).some(key => !['function', 'options'].includes(key))) {
    return fail(
      'invalid-legacy-action',
      `${sourcePath}.definition`,
      'Remove unsupported legacy action definition properties.'
    );
  }
  const legacyExpression = requiredRuntimeString(
    readRuntimeProperty(definitionValue, 'function'),
    `${sourcePath}.function`
  );
  const optionsValue = readRuntimeProperty(definitionValue, 'options');
  const options = optionsValue === undefined ? undefined : cloneObject(optionsValue, `${sourcePath}.options`);
  return {
    recordTypeKey,
    scope: parsedScope.data,
    stableKey,
    order,
    sourcePath,
    definition: Object.freeze({ function: legacyExpression, ...(options === undefined ? {} : { options }) }),
  };
}

function optionsFor(definition: LegacyRecordActionDefinition): ActionJsonObject {
  return definition.options === undefined ? {} : cloneObject(definition.options, '$.options');
}

function assertAllowedOptions(
  options: Readonly<ActionJsonObject>,
  allowed: readonly string[],
  path: string,
  expression: string
): void {
  const unsupported = Object.keys(options).find(key => !allowed.includes(key));
  if (unsupported !== undefined) {
    fail(
      'unsupported-legacy-parameter',
      `${path}.[unsupported]`,
      'Remove the unsupported option or migrate it through an explicitly reviewed registered action.',
      expression
    );
  }
}

function requiredOptionString(options: Readonly<ActionJsonObject>, name: string, path: string): string {
  return requiredRuntimeString(options[name], `${path}.${name}`);
}

function optionalOptionString(options: Readonly<ActionJsonObject>, name: string, path: string): string | undefined {
  const value = options[name];
  return value === undefined ? undefined : requiredRuntimeString(value, `${path}.${name}`);
}

function optionalOptionBoolean(options: Readonly<ActionJsonObject>, name: string, path: string): boolean | undefined {
  const value = options[name];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    return fail('invalid-legacy-parameter', `${path}.${name}`, 'Use a boolean legacy option.');
  }
  return value;
}

function stringArrayOption(options: Readonly<ActionJsonObject>, name: string, path: string): string[] {
  const value = options[name];
  if (!Array.isArray(value) || value.some(child => typeof child !== 'string' || child.trim() === '')) {
    return fail('invalid-legacy-parameter', `${path}.${name}`, 'Use an array of non-empty strings.');
  }
  return value.map(child => String(child));
}

function literal(value: ActionJsonValue): ActionParameterValue {
  return Object.freeze({ kind: 'literal', value });
}

function jsonata(expression: string): ActionParameterValue {
  try {
    compileManagedJsonataExpression(expression);
  } catch {
    return fail(
      'unsupported-legacy-expression',
      '$.options.triggerCondition',
      'Rewrite the legacy expression as reviewed managed JSONata.'
    );
  }
  return Object.freeze({ kind: 'jsonata', expression });
}

function handlebars(template: string, destination: 'plain-text' | 'email-subject'): ActionParameterValue {
  try {
    compileManagedHandlebarsTemplate(template, destination);
  } catch {
    return fail(
      'unsupported-legacy-expression',
      '$.options',
      'Rewrite the legacy interpolation as a bounded managed Handlebars template.'
    );
  }
  return Object.freeze({ kind: 'handlebars', template });
}

function stripLegacyExpression(source: string): string {
  const trimmed = source.trim();
  if (!trimmed.startsWith('<%=') || !trimmed.endsWith('%>')) {
    return fail(
      'unsupported-legacy-expression',
      '$.options.triggerCondition',
      'Rewrite the legacy Lodash condition as an approved managed JSONata expression.'
    );
  }
  return trimmed.slice(3, -2).trim().replace(/\s+/g, ' ').replaceAll('"', "'");
}

function translateLegacyCondition(source: string): string {
  const expression = stripLegacyExpression(source);
  const simpleStage = /^record\.workflow\.stage ?==? ?'([A-Za-z0-9_-]+)'$/.exec(expression);
  let translated: string | undefined;
  if (simpleStage !== null) {
    translated = `record.candidate.workflow.stage = "${simpleStage[1]}"`;
  } else if (
    expression ===
    "_.isEqual(record.workflow.stage, 'draft') || _.isEqual(record.workflow.stage, 'queued') || _.isEqual(record.workflow.stage, 'published')"
  ) {
    translated =
      'record.candidate.workflow.stage = "draft" or record.candidate.workflow.stage = "queued" or record.candidate.workflow.stage = "published"';
  } else if (expression === "_.isEqual(workflow.stage, 'published') && metadata.embargoByDate?.toString() === 'true'") {
    translated =
      'record.candidate.workflow.stage = "published" and $string(record.candidate.metadata.embargoByDate) = "true"';
  } else if (expression === "_.isEqual(workflow.stage, 'queued') && metadata.embargoByDate?.toString() === 'true'") {
    translated =
      'record.candidate.workflow.stage = "queued" and $string(record.candidate.metadata.embargoByDate) = "true"';
  } else if (
    expression ===
    "record.notification != null && record.notification.state == 'draft' && record.workflow.stage == 'queued'"
  ) {
    translated =
      '$exists(record.candidate.notification) and record.candidate.notification.state = "draft" and record.candidate.workflow.stage = "queued"';
  } else if (
    expression ===
    "record.notification != null && record.notification.state == 'emailed-reviewing' && record.workflow.stage == 'published'"
  ) {
    translated =
      '$exists(record.candidate.notification) and record.candidate.notification.state = "emailed-reviewing" and record.candidate.workflow.stage = "published"';
  } else if (
    expression ===
    "record.workflow.stage=='published' || record.workflow.stage=='queued' || record.workflow.stage=='embargoed'"
  ) {
    translated =
      'record.candidate.workflow.stage = "published" or record.candidate.workflow.stage = "queued" or record.candidate.workflow.stage = "embargoed"';
  } else if (expression === "typeof record.notification == 'undefined'") {
    translated = '$not($exists(record.candidate.notification))';
  }
  if (translated === undefined) {
    return fail(
      'unsupported-legacy-expression',
      '$.options.triggerCondition',
      'Rewrite this condition as reviewed managed JSONata; arbitrary Lodash execution is not retained.'
    );
  }
  return translated;
}

function conditionParameter(
  options: Readonly<ActionJsonObject>,
  path: string,
  absentBehavior: 'unconditional' | 'force'
): ActionParameterValue {
  const configuredSource = options.triggerCondition;
  const source =
    configuredSource === undefined || configuredSource === ''
      ? undefined
      : requiredRuntimeString(configuredSource, `${path}.triggerCondition`);
  const forceRun = optionalOptionBoolean(options, 'forceRun', path) ?? false;
  if (source !== undefined) {
    return jsonata(translateLegacyCondition(source));
  }
  return jsonata(absentBehavior === 'unconditional' || forceRun ? 'true' : 'false');
}

function translateValueTemplate(source: string): string {
  if (source.includes('_.random')) {
    return fail(
      'unsupported-legacy-expression',
      '$.options.templates[].template',
      'Replace unsupported Lodash template logic with reviewed managed JSONata; random generation is intentionally rejected.'
    );
  }
  const expression = stripLegacyExpression(source);
  const getOnly = /^_\.get\(record, '([A-Za-z0-9_.-]+)', ''\)$/.exec(expression);
  if (getOnly !== null) {
    const path = `record.candidate.${getOnly[1]}`;
    const translated = `$exists(${path}) ? ${path} : ""`;
    return translated;
  }
  if (expression === "_.get(record, 'metadata.givenName', '') + ' ' + _.get(record, 'metadata.surname', '')") {
    const translated =
      '($given := record.candidate.metadata.givenName; $surname := record.candidate.metadata.surname; ($exists($given) ? $given : "") & " " & ($exists($surname) ? $surname : ""))';
    return translated;
  }
  if (expression === "_.toLower(_.get(record, 'metadata.fullName', ''))") {
    const translated =
      '$lowercase($exists(record.candidate.metadata.fullName) ? record.candidate.metadata.fullName : "")';
    return translated;
  }
  return fail(
    'unsupported-legacy-expression',
    '$.options.templates[].template',
    'Replace unsupported Lodash template logic with reviewed managed JSONata; random generation is intentionally rejected.'
  );
}

function translateTextTemplate(source: string, destination: 'plain-text' | 'email-subject'): ActionParameterValue {
  const rewritten = source
    .replace(/\brecord\./g, 'record.candidate.')
    .replaceAll(
      '{{join (pluck record.candidate.metadata.creators "email") ","}}',
      '{{emailList record.candidate.metadata.creators}}'
    );
  return handlebars(rewritten, destination);
}

function stableKey(state: MigrationState, suffix?: string): string {
  const value = suffix === undefined ? state.request.stableKey : `${state.request.stableKey}.${suffix}`;
  if (!safeActionIdentifierSchema.safeParse(value).success) {
    return fail(
      'invalid-legacy-action',
      state.request.sourcePath,
      'Shorten the stable key so flattened child identities remain within contract limits.'
    );
  }
  return value;
}

function appendBinding(
  state: MigrationState,
  actionId: ActionDefinitionId,
  parameters: ActionParameterValues,
  suffix?: string,
  dependencies?: readonly ActionDependency[]
): ActionBinding {
  if (state.offset >= ORDER_STRIDE) {
    return fail(
      'invalid-nested-action',
      state.request.sourcePath,
      'Reduce the number of flattened legacy actions below the migration stride.'
    );
  }
  const bindingStableKey = stableKey(state, suffix);
  const binding = freezeObjectTree(
    parseActionBinding({
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      id: deriveStableActionBindingId({
        recordTypeKey: state.request.recordTypeKey,
        scope: state.request.scope,
        actionId,
        contractVersion: 1,
        stableKey: bindingStableKey,
      }),
      stableKey: bindingStableKey,
      actionId,
      contractVersion: 1,
      scope: state.request.scope,
      parameters,
      order: state.request.order * ORDER_STRIDE + state.offset,
      ...(dependencies === undefined || dependencies.length === 0 ? {} : { dependencies }),
    })
  );
  state.offset += 1;
  state.bindings.push(binding);
  return binding;
}

function validateMigratedBindings(
  state: MigrationState,
  code: 'invalid-legacy-action' | 'invalid-nested-action',
  path: string,
  guidance: string
): void {
  try {
    validateActionBindingCollection(state.request.recordTypeKey, BUILT_IN_DEFINITIONS, state.bindings);
  } catch {
    fail(code, path, guidance);
  }
}

function segmentFor(binding: ActionBinding): BindingSegment {
  return Object.freeze({ first: binding, last: binding });
}

function parametersWithCondition(
  options: Readonly<ActionJsonObject>,
  path: string,
  absentBehavior: 'unconditional' | 'force'
): ActionParameterValues {
  return { condition: conditionParameter(options, path, absentBehavior) };
}

function appendOptionalStringParameter(
  parameters: ActionParameterValues,
  options: Readonly<ActionJsonObject>,
  name: string,
  path: string
): void {
  const value = optionalOptionString(options, name, path);
  if (value !== undefined) {
    parameters[name] = literal(value);
  }
}

function dependenciesFor(priorDependency: ActionDependency | undefined): readonly ActionDependency[] | undefined {
  return priorDependency === undefined ? undefined : Object.freeze([priorDependency]);
}

function combinedSuffix(parent: string | undefined, child: string): string {
  return parent === undefined ? child : `${parent}.${child}`;
}

function migrateRunTemplates(
  definition: LegacyRecordActionDefinition,
  state: MigrationState,
  priorDependency?: ActionDependency,
  suffix?: string
): BindingSegment {
  const path = `${state.request.sourcePath}.options`;
  const options = optionsFor(definition);
  assertAllowedOptions(options, ['forceRun', 'parseObject', 'templates'], path, definition.function);
  optionalOptionBoolean(options, 'forceRun', path);
  const templates = options.templates;
  if (!Array.isArray(templates) || templates.length === 0 || templates.length > ACTION_CONTRACT_LIMITS.maxArrayItems) {
    return fail('invalid-legacy-parameter', `${path}.templates`, 'Use a non-empty bounded template array.');
  }
  const parseObject = optionalOptionBoolean(options, 'parseObject', path) ?? false;
  let first: ActionBinding | undefined;
  let last: ActionBinding | undefined;
  for (let index = 0; index < templates.length; index += 1) {
    const templateValue = templates[index];
    if (templateValue === null || typeof templateValue !== 'object' || Array.isArray(templateValue)) {
      return fail(
        'invalid-legacy-parameter',
        `${path}.templates[${index}]`,
        'Use template objects with field and template strings.'
      );
    }
    const template = cloneObject(templateValue, `${path}.templates[${index}]`);
    assertAllowedOptions(template, ['field', 'template'], `${path}.templates[${index}]`, definition.function);
    const binding = appendBinding(
      state,
      BUILT_IN_ACTION_IDS.applyTemplates,
      {
        field: literal(requiredOptionString(template, 'field', `${path}.templates[${index}]`)),
        value: jsonata(
          translateValueTemplate(requiredOptionString(template, 'template', `${path}.templates[${index}]`))
        ),
        parseObject: literal(parseObject),
      },
      combinedSuffix(suffix, `template-${index}`),
      index === 0 ? dependenciesFor(priorDependency) : undefined
    );
    first ??= binding;
    last = binding;
  }
  if (first === undefined || last === undefined) {
    return fail('invalid-legacy-parameter', `${path}.templates`, 'Use at least one supported template.');
  }
  return Object.freeze({ first, last });
}

function migrateAssignPermissions(
  definition: LegacyRecordActionDefinition,
  state: MigrationState,
  priorDependency?: ActionDependency,
  suffix?: string
): BindingSegment {
  const path = `${state.request.sourcePath}.options`;
  const options = optionsFor(definition);
  assertAllowedOptions(
    options,
    [
      'forceRun',
      'triggerCondition',
      'emailProperty',
      'editContributorProperties',
      'viewContributorProperties',
      'recordCreatorPermissions',
    ],
    path,
    definition.function
  );
  const parameters = parametersWithCondition(options, path, 'unconditional');
  parameters.emailProperty = literal(requiredOptionString(options, 'emailProperty', path));
  parameters.editContributorProperties = literal(stringArrayOption(options, 'editContributorProperties', path));
  parameters.viewContributorProperties = literal(stringArrayOption(options, 'viewContributorProperties', path));
  parameters.recordCreatorPermissions = literal(requiredOptionString(options, 'recordCreatorPermissions', path));
  return segmentFor(
    appendBinding(state, BUILT_IN_ACTION_IDS.assignPermissions, parameters, suffix, dependenciesFor(priorDependency))
  );
}

function migrateAttachmentValidation(
  definition: LegacyRecordActionDefinition,
  state: MigrationState,
  priorDependency?: ActionDependency,
  suffix?: string
): BindingSegment {
  const path = `${state.request.sourcePath}.options`;
  const options = optionsFor(definition);
  assertAllowedOptions(
    options,
    ['forceRun', 'triggerCondition', 'maxUploadSizeMessageCode', 'replaceOrAppend'],
    path,
    definition.function
  );
  const parameters = parametersWithCondition(options, path, 'unconditional');
  appendOptionalStringParameter(parameters, options, 'maxUploadSizeMessageCode', path);
  appendOptionalStringParameter(parameters, options, 'replaceOrAppend', path);
  return segmentFor(
    appendBinding(
      state,
      BUILT_IN_ACTION_IDS.validateTotalAttachmentSize,
      parameters,
      suffix,
      dependenciesFor(priorDependency)
    )
  );
}

function migrateNotification(
  definition: LegacyRecordActionDefinition,
  state: MigrationState,
  priorDependency?: ActionDependency,
  suffix?: string
): BindingSegment {
  const path = `${state.request.sourcePath}.options`;
  const options = optionsFor(definition);
  assertAllowedOptions(
    options,
    ['forceRun', 'triggerCondition', 'name', 'flagName', 'flagVal', 'logName', 'saveRecord'],
    path,
    definition.function
  );
  const parameters = parametersWithCondition(options, path, 'force');
  appendOptionalStringParameter(parameters, options, 'name', path);
  const flagName = requiredOptionString(options, 'flagName', path);
  if (!isManagedNotificationFlagPath(flagName)) {
    return fail('invalid-legacy-parameter', `${path}.flagName`, 'Use an approved managed notification flag path.');
  }
  parameters.flagName = literal(flagName);
  parameters.flagVal = literal(requiredOptionString(options, 'flagVal', path));
  const logName = optionalOptionString(options, 'logName', path);
  if (logName !== undefined) {
    if (!isManagedNotificationLogPath(logName)) {
      return fail('invalid-legacy-parameter', `${path}.logName`, 'Use an approved managed notification log path.');
    }
    parameters.logName = literal(logName);
  }
  parameters.saveRecord = literal(optionalOptionBoolean(options, 'saveRecord', path) ?? false);
  return segmentFor(
    appendBinding(
      state,
      BUILT_IN_ACTION_IDS.updateNotificationState,
      parameters,
      suffix,
      dependenciesFor(priorDependency)
    )
  );
}

function migrateStripPermissions(
  definition: LegacyRecordActionDefinition,
  state: MigrationState,
  priorDependency?: ActionDependency,
  suffix?: string
): BindingSegment {
  const path = `${state.request.sourcePath}.options`;
  const options = optionsFor(definition);
  assertAllowedOptions(options, ['forceRun', 'triggerCondition', 'permissionTypes'], path, definition.function);
  const parameters = parametersWithCondition(options, path, 'force');
  parameters.permissionTypes = literal(optionalOptionString(options, 'permissionTypes', path) ?? 'edit');
  return segmentFor(
    appendBinding(state, BUILT_IN_ACTION_IDS.stripUserPermissions, parameters, suffix, dependenciesFor(priorDependency))
  );
}

function migrateRestorePermissions(
  definition: LegacyRecordActionDefinition,
  state: MigrationState,
  priorDependency?: ActionDependency,
  suffix?: string
): BindingSegment {
  const path = `${state.request.sourcePath}.options`;
  const options = optionsFor(definition);
  assertAllowedOptions(options, ['forceRun', 'triggerCondition'], path, definition.function);
  return segmentFor(
    appendBinding(
      state,
      BUILT_IN_ACTION_IDS.restoreUserPermissions,
      parametersWithCondition(options, path, 'force'),
      suffix,
      dependenciesFor(priorDependency)
    )
  );
}

function migrateDoi(
  definition: LegacyRecordActionDefinition,
  state: MigrationState,
  actionId: ActionDefinitionId,
  priorDependency?: ActionDependency,
  suffix?: string
): BindingSegment {
  const path = `${state.request.sourcePath}.options`;
  const options = optionsFor(definition);
  assertAllowedOptions(options, ['forceRun', 'triggerCondition', 'event', 'profile'], path, definition.function);
  const parameters = parametersWithCondition(options, path, 'force');
  parameters.event = literal(requiredOptionString(options, 'event', path));
  appendOptionalStringParameter(parameters, options, 'profile', path);
  return segmentFor(appendBinding(state, actionId, parameters, suffix, dependenciesFor(priorDependency)));
}

function migrateWorkspace(
  definition: LegacyRecordActionDefinition,
  state: MigrationState,
  priorDependency?: ActionDependency,
  suffix?: string
): BindingSegment {
  const path = `${state.request.sourcePath}.options`;
  const options = optionsFor(definition);
  assertAllowedOptions(options, ['forceRun', 'returnType', 'rdmpOidField'], path, definition.function);
  optionalOptionBoolean(options, 'forceRun', path);
  return segmentFor(
    appendBinding(
      state,
      BUILT_IN_ACTION_IDS.linkWorkspace,
      { rdmpOidField: literal(optionalOptionString(options, 'rdmpOidField', path) ?? 'rdmpOid') },
      suffix,
      dependenciesFor(priorDependency)
    )
  );
}

function migrateEmail(
  definition: LegacyRecordActionDefinition,
  state: MigrationState,
  priorDependency?: ActionDependency,
  suffix?: string,
  depth = 0
): BindingSegment {
  const path = `${state.request.sourcePath}.options`;
  const options = optionsFor(definition);
  assertAllowedOptions(
    options,
    [
      'forceRun',
      'triggerCondition',
      'to',
      'subject',
      'from',
      'cc',
      'bcc',
      'template',
      'format',
      'otherSendOptions',
      'onNotifySuccess',
    ],
    path,
    definition.function
  );
  const parameters = parametersWithCondition(options, path, 'force');
  parameters.to = translateTextTemplate(requiredOptionString(options, 'to', path), 'plain-text');
  parameters.subject = translateTextTemplate(requiredOptionString(options, 'subject', path), 'email-subject');
  for (const name of ['from', 'cc', 'bcc'] as const) {
    const value = optionalOptionString(options, name, path);
    if (value !== undefined) {
      parameters[name] = translateTextTemplate(value, 'plain-text');
    }
  }
  parameters.template = literal(requiredOptionString(options, 'template', path));
  appendOptionalStringParameter(parameters, options, 'format', path);
  if (options.otherSendOptions !== undefined) {
    const sendOptionsPath = `${path}.otherSendOptions`;
    const sendOptions = cloneObject(options.otherSendOptions, sendOptionsPath);
    assertAllowedOptions(sendOptions, ['replyTo', 'priority'], sendOptionsPath, definition.function);
    appendOptionalStringParameter(parameters, sendOptions, 'replyTo', sendOptionsPath);
    const priority = optionalOptionString(sendOptions, 'priority', sendOptionsPath);
    if (priority !== undefined) {
      if (!['high', 'normal', 'low'].includes(priority)) {
        return fail(
          'invalid-legacy-parameter',
          `${sendOptionsPath}.priority`,
          'Use a supported inert message priority.'
        );
      }
      parameters.priority = literal(priority);
    }
  }
  const parent = appendBinding(
    state,
    BUILT_IN_ACTION_IDS.sendRecordEmail,
    parameters,
    suffix,
    dependenciesFor(priorDependency)
  );
  const callbacks = options.onNotifySuccess;
  if (callbacks !== undefined) {
    if (!Array.isArray(callbacks) || callbacks.length > ACTION_CONTRACT_LIMITS.maxArrayItems) {
      return fail('invalid-nested-action', `${path}.onNotifySuccess`, 'Use a bounded callback array.');
    }
    if (depth >= ACTION_CONTRACT_LIMITS.maxPlanDepth) {
      return fail('invalid-nested-action', `${path}.onNotifySuccess`, 'Reduce nested callback depth.');
    }
    const parentDependency: ActionDependency = Object.freeze({
      bindingId: parent.id,
      condition: 'output-equals',
      field: 'sent',
      value: true,
    });
    for (let index = 0; index < callbacks.length; index += 1) {
      const child = parseNestedDefinition(callbacks[index], `${path}.onNotifySuccess[${index}]`);
      migrateDefinition(child, state, parentDependency, combinedSuffix(suffix, `notify-${index}`), depth + 1);
    }
  }
  return Object.freeze({ first: parent, last: parent });
}

function parseNestedDefinition(value: RuntimeValue, path: string): LegacyRecordActionDefinition {
  if (!isRuntimeRecord(value)) {
    return fail('invalid-nested-action', path, 'Use an object nested action definition.');
  }
  if (Object.keys(value).some(key => !['function', 'options'].includes(key))) {
    return fail('invalid-nested-action', path, 'Remove unsupported nested action definition properties.');
  }
  const expression = requiredRuntimeString(readRuntimeProperty(value, 'function'), `${path}.function`);
  const optionsValue = readRuntimeProperty(value, 'options');
  const options = optionsValue === undefined ? undefined : cloneObject(optionsValue, `${path}.options`);
  return Object.freeze({ function: expression, ...(options === undefined ? {} : { options }) });
}

function migrateSequence(
  definition: LegacyRecordActionDefinition,
  state: MigrationState,
  priorDependency?: ActionDependency,
  suffix?: string,
  depth = 0
): BindingSegment {
  const path = `${state.request.sourcePath}.options`;
  const options = optionsFor(definition);
  assertAllowedOptions(options, ['forceRun', 'hooks'], path, definition.function);
  optionalOptionBoolean(options, 'forceRun', path);
  const hooks = options.hooks;
  if (!Array.isArray(hooks) || hooks.length === 0 || hooks.length > ACTION_CONTRACT_LIMITS.maxArrayItems) {
    return fail('invalid-nested-action', `${path}.hooks`, 'Use a non-empty bounded hook array.');
  }
  if (depth >= ACTION_CONTRACT_LIMITS.maxPlanDepth) {
    return fail('invalid-nested-action', `${path}.hooks`, 'Reduce nested callback depth.');
  }
  let first: ActionBinding | undefined;
  let last: ActionBinding | undefined;
  let dependency = priorDependency;
  for (let index = 0; index < hooks.length; index += 1) {
    const child = parseNestedDefinition(hooks[index], `${path}.hooks[${index}]`);
    const childSegment = migrateDefinition(
      child,
      state,
      dependency,
      combinedSuffix(suffix, `sequence-${index}`),
      depth + 1
    );
    first ??= childSegment.first;
    last = childSegment.last;
    dependency = Object.freeze({ bindingId: childSegment.last.id, condition: 'success' });
  }
  if (first === undefined || last === undefined) {
    return fail('invalid-nested-action', `${path}.hooks`, 'Use at least one supported child action.');
  }
  return Object.freeze({ first, last });
}

function migrateQueue(
  definition: LegacyRecordActionDefinition,
  state: MigrationState,
  priorDependency?: ActionDependency,
  suffix?: string,
  depth = 0
): BindingSegment {
  const path = `${state.request.sourcePath}.options`;
  const options = optionsFor(definition);
  assertAllowedOptions(
    options,
    ['forceRun', 'triggerCondition', 'jobName', 'triggerConfiguration'],
    path,
    definition.function
  );
  if (depth >= ACTION_CONTRACT_LIMITS.maxPlanDepth) {
    return fail('invalid-nested-action', `${path}.triggerConfiguration`, 'Reduce nested queue action depth.');
  }
  const childDefinition = parseNestedDefinition(options.triggerConfiguration, `${path}.triggerConfiguration`);
  const childScope: ActionBindingScope = Object.freeze({
    context: 'queued-record-action',
    mode: state.request.scope.mode,
    phase: state.request.scope.phase,
    ...('scopeId' in state.request.scope && state.request.scope.scopeId !== undefined
      ? { scopeId: state.request.scope.scopeId }
      : {}),
  });
  const isolatedRequest: ParsedMigrationRequest = Object.freeze({
    ...state.request,
    scope: childScope,
    stableKey: `${state.request.stableKey}.queued`,
    order: 0,
    sourcePath: `${path}.triggerConfiguration`,
    definition: childDefinition,
  });
  const isolatedState: MigrationState = { request: isolatedRequest, bindings: [], offset: 0 };
  migrateDefinition(childDefinition, isolatedState, undefined, undefined, depth + 1);
  if (isolatedState.bindings.length !== 1) {
    return fail(
      'invalid-nested-action',
      `${path}.triggerConfiguration`,
      'Queue exactly one executable registered action; sequences and callback trees must be flattened outside the queue.'
    );
  }
  const childBinding = isolatedState.bindings[0];
  if (childBinding === undefined || childBinding.actionId === BUILT_IN_ACTION_IDS.dispatchQueuedAction) {
    return fail(
      'invalid-nested-action',
      `${path}.triggerConfiguration`,
      'Queue one non-queue registered action to avoid recursive dispatch.'
    );
  }
  validateMigratedBindings(
    isolatedState,
    'invalid-nested-action',
    `${path}.triggerConfiguration`,
    'Queue a registered action that supports the queued mode and phase with valid transformed parameters.'
  );
  const parameters = parametersWithCondition(options, path, 'unconditional');
  parameters.queuedActionId = literal(childBinding.actionId);
  parameters.queuedContractVersion = literal(childBinding.contractVersion);
  parameters.queuedParameters = literal(cloneObject(childBinding.parameters, `${path}.triggerConfiguration.options`));
  return segmentFor(
    appendBinding(state, BUILT_IN_ACTION_IDS.dispatchQueuedAction, parameters, suffix, dependenciesFor(priorDependency))
  );
}

function migrateDefinition(
  definition: LegacyRecordActionDefinition,
  state: MigrationState,
  priorDependency?: ActionDependency,
  suffix?: string,
  depth = 0
): BindingSegment {
  switch (definition.function) {
    case 'sails.services.rdmpservice.runTemplates':
      return migrateRunTemplates(definition, state, priorDependency, suffix);
    case 'sails.services.rdmpservice.assignPermissions':
      return migrateAssignPermissions(definition, state, priorDependency, suffix);
    case 'sails.services.rdmpservice.checkTotalSizeOfFilesInRecord':
      return migrateAttachmentValidation(definition, state, priorDependency, suffix);
    case 'sails.services.recordsservice.updateNotificationLog':
      return migrateNotification(definition, state, priorDependency, suffix);
    case 'sails.services.rdmpservice.stripUserBasedPermissions':
      return migrateStripPermissions(definition, state, priorDependency, suffix);
    case 'sails.services.rdmpservice.restoreUserBasedPermissions':
      return migrateRestorePermissions(definition, state, priorDependency, suffix);
    case 'sails.services.emailservice.sendRecordNotification':
      return migrateEmail(definition, state, priorDependency, suffix, depth);
    case 'sails.services.doiservice.publishDoiTrigger':
      return migrateDoi(definition, state, BUILT_IN_ACTION_IDS.publishDoi, priorDependency, suffix);
    case 'sails.services.doiservice.updateDoiTriggerSync':
      return migrateDoi(definition, state, BUILT_IN_ACTION_IDS.updateDoi, priorDependency, suffix);
    case 'sails.services.rdmpservice.addWorkspaceToRecord':
      return migrateWorkspace(definition, state, priorDependency, suffix);
    case 'sails.services.triggerservice.runHooksSync':
      return migrateSequence(definition, state, priorDependency, suffix, depth);
    case 'sails.services.rdmpservice.queueTriggerCall':
      return migrateQueue(definition, state, priorDependency, suffix, depth);
    case 'sails.services.triggerservice.transitionWorkflow':
      return fail(
        'invalid-nested-action',
        state.request.sourcePath,
        'Automatic transitions are first-class A10 rules and cannot be nested as record actions.',
        definition.function
      );
    default:
      return fail(
        'unknown-legacy-action',
        state.request.sourcePath,
        'Replace the unknown expression with an explicitly registered and reviewed action.'
      );
  }
}

function migrateAutomaticTransition(
  definition: LegacyRecordActionDefinition,
  request: ParsedMigrationRequest
): LegacyAutomaticTransitionMigration {
  const path = `${request.sourcePath}.options`;
  const options = optionsFor(definition);
  assertAllowedOptions(
    options,
    ['forceRun', 'triggerCondition', 'targetWorkflowStageName', 'targetWorkflowStageLabel', 'targetForm'],
    path,
    definition.function
  );
  optionalOptionBoolean(options, 'forceRun', path);
  const triggerCondition = requiredOptionString(options, 'triggerCondition', path);
  const targetStageLabelCheck = optionalOptionString(options, 'targetWorkflowStageLabel', path);
  const targetFormCheck = optionalOptionString(options, 'targetForm', path);
  return Object.freeze({
    schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
    kind: 'automatic-transition',
    actionId: AUTOMATIC_TRANSITION_ID,
    contractVersion: 1,
    condition: translateLegacyCondition(triggerCondition),
    targetStage: requiredOptionString(options, 'targetWorkflowStageName', path),
    ...(targetStageLabelCheck === undefined ? {} : { targetStageLabelCheck }),
    ...(targetFormCheck === undefined ? {} : { targetFormCheck }),
    sourcePath: request.sourcePath,
  });
}

/**
 * Converts one bounded legacy definition without evaluating a legacy function
 * or mutating the caller's configuration object.
 */
export function migrateLegacyRecordAction(value: RuntimeValue): LegacyRecordActionMigration {
  const request = parseRequest(value);
  if (request.definition.function === 'sails.services.triggerservice.transitionWorkflow') {
    return migrateAutomaticTransition(request.definition, request);
  }
  const state: MigrationState = { request, bindings: [], offset: 0 };
  migrateDefinition(request.definition, state);
  validateMigratedBindings(
    state,
    'invalid-legacy-action',
    request.sourcePath,
    'Use legacy parameters and a lifecycle attachment supported by the governed registered action.'
  );
  return Object.freeze({
    schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
    kind: 'action-bindings',
    bindings: Object.freeze([...state.bindings]),
  });
}
