import { firstValueFrom, isObservable, type Observable } from 'rxjs';
import { ActionConfigurationError, ActionValidationFailure } from '../action-execution/failure';
import { REGISTERED_RECORD_ACTION_JOB_NAME } from '../config/agendaQueue.config';
import { isForbiddenExpressionContextKey } from '../expression-runtime/contexts';
import {
  isRuntimeRecord,
  parseJsonText,
  readRuntimeProperty,
  runtimeFunction,
  type RuntimeValue,
} from '../runtimeValues';
import {
  actionParameterValuesSchema,
  parseActionBinding,
  parseActionDefinition,
  validateActionBindingForDefinition,
  type ActionContext,
  type ActionDefinition,
  type ActionJsonObject,
  type ActionJsonValue,
  type ActionOutput,
  type ActionParameterDefinition,
  type ActionParameterValues,
  type ActionResult,
} from './contracts';
import {
  actionDefinitionIdSchema,
  deriveStableActionBindingId,
  parseActionDefinitionId,
  type ActionBindingScope,
  type ActionDefinitionId,
} from './identifiers';
import { ACTION_CONTRACT_SCHEMA_VERSION, ACTION_RESULT_SCHEMA_VERSION } from './limits';
import {
  MANAGED_NOTIFICATION_FLAG_PATHS,
  MANAGED_NOTIFICATION_LOG_PATHS,
  isManagedNotificationFlagPath,
  isManagedNotificationLogPath,
} from './managedNotificationPaths';
import { QUEUE_DISPATCH_ACTION_ID, createRegisteredRecordActionQueuePayload } from './registeredActionQueue';
import type { ActionRegistrationDescriptor } from './registration';

const NO_RETRY_POLICY = Object.freeze({ allowed: false as const });
const PURE_RETRY_POLICY = Object.freeze({
  allowed: true as const,
  defaultMaxAttempts: 1,
  maxAttempts: 3,
  maxDelayMs: 1_000,
});
const LOCAL_TIMEOUT = Object.freeze({ defaultMs: 5_000, minMs: 100, maxMs: 30_000 });
const SERVICE_TIMEOUT = Object.freeze({ defaultMs: 30_000, minMs: 100, maxMs: 120_000 });
const EXTERNAL_TIMEOUT = Object.freeze({ defaultMs: 60_000, minMs: 1_000, maxMs: 600_000 });
const SAFE_FIELD_SEGMENT = /^[A-Za-z0-9_-]+$/;
const SAFE_TEMPLATE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export const BUILT_IN_ACTION_IDS = Object.freeze({
  applyTemplates: parseActionDefinitionId('redbox.core.record.apply-templates'),
  assignPermissions: parseActionDefinitionId('redbox.core.record.assign-permissions'),
  validateTotalAttachmentSize: parseActionDefinitionId('redbox.core.record.validate-total-attachment-size'),
  updateNotificationState: parseActionDefinitionId('redbox.core.record.update-notification-state'),
  stripUserPermissions: parseActionDefinitionId('redbox.core.record.strip-user-permissions'),
  restoreUserPermissions: parseActionDefinitionId('redbox.core.record.restore-user-permissions'),
  sendRecordEmail: parseActionDefinitionId('redbox.core.notification.send-record-email'),
  publishDoi: parseActionDefinitionId('redbox.core.doi.publish'),
  updateDoi: parseActionDefinitionId('redbox.core.doi.update'),
  linkWorkspace: parseActionDefinitionId('redbox.core.workspace.link-to-record'),
  dispatchQueuedAction: parseActionDefinitionId(QUEUE_DISPATCH_ACTION_ID),
});

type Candidate = ActionJsonObject;

function cloneJsonValue(value: ActionJsonValue): ActionJsonValue {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(cloneJsonValue);
  }
  return cloneJsonObject(value);
}

function cloneJsonObject(value: Readonly<ActionJsonObject>): ActionJsonObject {
  const cloned: ActionJsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    Object.defineProperty(cloned, key, {
      value: cloneJsonValue(child),
      configurable: true,
      enumerable: true,
      writable: true,
    });
  }
  return cloned;
}

function freezeJsonValue(value: ActionJsonValue): void {
  if (value === null || typeof value !== 'object') {
    return;
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    freezeJsonValue(child);
  }
  Object.freeze(value);
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

function actionOutput(fields: ActionJsonObject): ActionOutput {
  freezeJsonValue(fields);
  return Object.freeze({ schemaVersion: ACTION_RESULT_SCHEMA_VERSION, fields });
}

function noChange(fields?: ActionJsonObject): ActionResult {
  return freezeObjectTree({
    schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
    kind: 'no-change' as const,
    ...(fields === undefined ? {} : { output: actionOutput(fields) }),
  });
}

function replacement(candidate: Candidate, fields?: ActionJsonObject): ActionResult {
  freezeJsonValue(candidate);
  return Object.freeze({
    schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
    kind: 'replace' as const,
    candidate,
    ...(fields === undefined ? {} : { output: actionOutput(fields) }),
  });
}

function literalParameter(parameters: Readonly<ActionParameterValues>, name: string): ActionJsonValue | undefined {
  const parameter = parameters[name];
  if (parameter === undefined) {
    return undefined;
  }
  if (parameter.kind !== 'literal') {
    throw new ActionValidationFailure('Built-in action parameter was not evaluated.');
  }
  return parameter.value;
}

function assertOnlyParameters(parameters: Readonly<ActionParameterValues>, allowedNames: readonly string[]): void {
  if (Object.keys(parameters).some(name => !allowedNames.includes(name))) {
    throw new ActionValidationFailure('Built-in action received an unsupported parameter.');
  }
}

function requiredString(parameters: Readonly<ActionParameterValues>, name: string): string {
  const value = literalParameter(parameters, name);
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ActionValidationFailure('Built-in action requires a non-empty string parameter.');
  }
  return value;
}

function optionalString(parameters: Readonly<ActionParameterValues>, name: string): string | undefined {
  const value = literalParameter(parameters, name);
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ActionValidationFailure('Built-in action requires a string parameter.');
  }
  return value;
}

function requiredBoolean(parameters: Readonly<ActionParameterValues>, name: string): boolean {
  const value = literalParameter(parameters, name);
  if (typeof value !== 'boolean') {
    throw new ActionValidationFailure('Built-in action requires a boolean parameter.');
  }
  return value;
}

function optionalBoolean(parameters: Readonly<ActionParameterValues>, name: string, defaultValue: boolean): boolean {
  const value = literalParameter(parameters, name);
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== 'boolean') {
    throw new ActionValidationFailure('Built-in action requires a boolean parameter.');
  }
  return value;
}

function requiredInteger(parameters: Readonly<ActionParameterValues>, name: string): number {
  const value = literalParameter(parameters, name);
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new ActionValidationFailure('Built-in action requires a positive integer parameter.');
  }
  return value;
}

function requiredObject(parameters: Readonly<ActionParameterValues>, name: string): ActionJsonObject {
  const value = literalParameter(parameters, name);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionValidationFailure('Built-in action requires an object parameter.');
  }
  return cloneJsonObject(value);
}

function requiredStringArray(parameters: Readonly<ActionParameterValues>, name: string): string[] {
  const value = literalParameter(parameters, name);
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new ActionValidationFailure('Built-in action requires a string-array parameter.');
  }
  return value.map(item => String(item));
}

function candidateFrom(context: Readonly<ActionContext>): Candidate {
  if (context.record.candidate === undefined) {
    throw new ActionValidationFailure('Built-in record action requires a candidate.');
  }
  return cloneJsonObject(context.record.candidate);
}

function recordOid(context: Readonly<ActionContext>, candidate: Candidate): string {
  if (context.record.oid !== undefined) {
    return context.record.oid;
  }
  const candidateOid = candidate.redboxOid;
  return typeof candidateOid === 'string' ? candidateOid : '';
}

function actorForService(context: Readonly<ActionContext>): ActionJsonObject {
  const actor = context.actor;
  if (actor === null) {
    return {};
  }
  return {
    id: actor.id,
    username: actor.username ?? actor.id,
    roles: actor.roles.map(name => ({ name })),
  };
}

function invokeService(serviceName: string, methodName: string, argumentsList: readonly RuntimeValue[]): RuntimeValue {
  if (typeof sails === 'undefined') {
    throw new ActionConfigurationError('Built-in action services are unavailable.');
  }
  const service = readRuntimeProperty(sails.services, serviceName);
  const method = runtimeFunction(readRuntimeProperty(service, methodName));
  if (method === undefined) {
    throw new ActionConfigurationError('A required built-in action service is unavailable.');
  }
  return method.invoke(...argumentsList);
}

async function settleInvocation(value: RuntimeValue): Promise<RuntimeValue> {
  if (isObservable(value)) {
    return firstValueFrom(value as Observable<RuntimeValue>);
  }
  return Promise.resolve(value);
}

function setCandidateField(candidate: Candidate, field: string, value: ActionJsonValue): void {
  const segments = field.split('.');
  if (
    segments.length === 0 ||
    segments.length > 16 ||
    segments.some(
      segment => segment === '' || !SAFE_FIELD_SEGMENT.test(segment) || isForbiddenExpressionContextKey(segment)
    )
  ) {
    throw new ActionValidationFailure('Template target field is not a safe managed path.');
  }
  let target = candidate;
  for (const segment of segments.slice(0, -1)) {
    const child = target[segment];
    if (child === undefined) {
      const created: ActionJsonObject = {};
      target[segment] = created;
      target = created;
    } else if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      target = child;
    } else {
      throw new ActionValidationFailure('Template target field crosses a non-object value.');
    }
  }
  const last = segments[segments.length - 1];
  if (last === undefined) {
    throw new ActionValidationFailure('Template target field is empty.');
  }
  target[last] = cloneJsonValue(value);
}

function parseManagedJsonText(value: string): ActionJsonValue {
  let parsed: ActionJsonValue;
  try {
    parsed = parseJsonText(value);
  } catch {
    throw new ActionValidationFailure('Managed template did not produce valid JSON.');
  }
  return parsed;
}

function applyTemplateHandler(
  context: Readonly<ActionContext>,
  parameters: Readonly<ActionParameterValues>
): ActionResult {
  const candidate = candidateFrom(context);
  const field = requiredString(parameters, 'field');
  const configuredValue = literalParameter(parameters, 'value');
  if (configuredValue === undefined) {
    throw new ActionValidationFailure('Managed template returned no value.');
  }
  const value =
    optionalBoolean(parameters, 'parseObject', false) && typeof configuredValue === 'string'
      ? parseManagedJsonText(configuredValue)
      : configuredValue;
  setCandidateField(candidate, field, value);
  return replacement(candidate);
}

async function assignPermissionsHandler(
  context: Readonly<ActionContext>,
  parameters: Readonly<ActionParameterValues>
): Promise<ActionResult> {
  if (!requiredBoolean(parameters, 'condition')) {
    return noChange();
  }
  const candidate = candidateFrom(context);
  const options: ActionJsonObject = {
    forceRun: true,
    emailProperty: requiredString(parameters, 'emailProperty'),
    editContributorProperties: requiredStringArray(parameters, 'editContributorProperties'),
    viewContributorProperties: requiredStringArray(parameters, 'viewContributorProperties'),
    recordCreatorPermissions: requiredString(parameters, 'recordCreatorPermissions'),
  };
  await settleInvocation(
    invokeService('rdmpservice', 'assignPermissions', [
      recordOid(context, candidate),
      candidate,
      options,
      actorForService(context),
    ])
  );
  return replacement(candidate);
}

async function validateAttachmentSizeHandler(
  context: Readonly<ActionContext>,
  parameters: Readonly<ActionParameterValues>
): Promise<ActionResult> {
  if (!requiredBoolean(parameters, 'condition')) {
    return noChange();
  }
  const candidate = candidateFrom(context);
  const options: ActionJsonObject = { forceRun: true };
  const messageCode = optionalString(parameters, 'maxUploadSizeMessageCode');
  const replaceOrAppend = optionalString(parameters, 'replaceOrAppend');
  if (messageCode !== undefined) {
    options.maxUploadSizeMessageCode = messageCode;
  }
  if (replaceOrAppend !== undefined) {
    options.replaceOrAppend = replaceOrAppend;
  }
  await settleInvocation(
    invokeService('rdmpservice', 'checkTotalSizeOfFilesInRecord', [
      recordOid(context, candidate),
      candidate,
      options,
      actorForService(context),
    ])
  );
  return noChange();
}

async function updateNotificationHandler(
  context: Readonly<ActionContext>,
  parameters: Readonly<ActionParameterValues>
): Promise<ActionResult> {
  assertOnlyParameters(parameters, ['condition', 'name', 'flagName', 'flagVal', 'logName', 'saveRecord']);
  if (!requiredBoolean(parameters, 'condition')) {
    return noChange({ updated: false });
  }
  const candidate = candidateFrom(context);
  const saveRecord = optionalBoolean(parameters, 'saveRecord', false);
  if (!saveRecord && context.scope.phase !== 'pre') {
    throw new ActionValidationFailure('In-memory notification updates are valid only in a pre phase.');
  }
  const flagName = requiredString(parameters, 'flagName');
  const logName = optionalString(parameters, 'logName');
  if (!isManagedNotificationFlagPath(flagName) || (logName !== undefined && !isManagedNotificationLogPath(logName))) {
    throw new ActionValidationFailure('Registered notification path is not approved.');
  }
  const options: ActionJsonObject = {
    forceRun: true,
    flagName,
    flagVal: literalParameter(parameters, 'flagVal') ?? null,
    saveRecord,
  };
  const name = optionalString(parameters, 'name');
  if (name !== undefined) {
    options.name = name;
  }
  if (logName !== undefined) {
    options.logName = logName;
  }
  const oid = recordOid(context, candidate);
  if (saveRecord && oid === '') {
    throw new ActionValidationFailure('Persisted notification updates require a record identifier.');
  }
  await settleInvocation(invokeService('recordsservice', 'updateNotificationLog', [oid, candidate, options]));
  return saveRecord ? noChange({ updated: true }) : replacement(candidate, { updated: true });
}

async function stripPermissionsHandler(
  context: Readonly<ActionContext>,
  parameters: Readonly<ActionParameterValues>
): Promise<ActionResult> {
  if (!requiredBoolean(parameters, 'condition')) {
    return noChange();
  }
  const candidate = candidateFrom(context);
  await settleInvocation(
    invokeService('rdmpservice', 'stripUserBasedPermissions', [
      recordOid(context, candidate),
      candidate,
      { forceRun: true, permissionTypes: requiredString(parameters, 'permissionTypes') },
      actorForService(context),
    ])
  );
  return replacement(candidate);
}

async function restorePermissionsHandler(
  context: Readonly<ActionContext>,
  parameters: Readonly<ActionParameterValues>
): Promise<ActionResult> {
  if (!requiredBoolean(parameters, 'condition')) {
    return noChange();
  }
  const candidate = candidateFrom(context);
  await settleInvocation(
    invokeService('rdmpservice', 'restoreUserBasedPermissions', [
      recordOid(context, candidate),
      candidate,
      { forceRun: true },
      actorForService(context),
    ])
  );
  return replacement(candidate);
}

function configValue(...path: readonly string[]): RuntimeValue {
  let value: RuntimeValue = typeof sails === 'undefined' ? undefined : sails.config;
  for (const segment of path) {
    value = readRuntimeProperty(value, segment);
  }
  return value;
}

function configString(defaultValue: string, ...path: readonly string[]): string {
  const value = configValue(...path);
  return typeof value === 'string' ? value : defaultValue;
}

function emailBodyResult(value: RuntimeValue): string {
  if (!isRuntimeRecord(value) || readRuntimeProperty(value, 'status') !== 200) {
    throw new ActionValidationFailure('Registered email body rendering failed.');
  }
  const body = readRuntimeProperty(value, 'body');
  if (typeof body !== 'string') {
    throw new ActionValidationFailure('Registered email body is invalid.');
  }
  return body;
}

function emailSendSucceeded(value: RuntimeValue): boolean {
  if (!isRuntimeRecord(value)) {
    throw new ActionValidationFailure('Registered email service returned an invalid result.');
  }
  const success = readRuntimeProperty(value, 'success');
  if (typeof success !== 'boolean') {
    throw new ActionValidationFailure('Registered email service returned an invalid result.');
  }
  return success;
}

async function sendRecordEmailHandler(
  context: Readonly<ActionContext>,
  parameters: Readonly<ActionParameterValues>
): Promise<ActionResult> {
  assertOnlyParameters(parameters, [
    'condition',
    'to',
    'subject',
    'from',
    'cc',
    'bcc',
    'template',
    'format',
    'replyTo',
    'priority',
  ]);
  if (!requiredBoolean(parameters, 'condition')) {
    return noChange({ sent: false });
  }
  const candidate = candidateFrom(context);
  const to = requiredString(parameters, 'to');
  const template = requiredString(parameters, 'template');
  if (!SAFE_TEMPLATE_NAME.test(template)) {
    throw new ActionValidationFailure('Registered email template name is invalid.');
  }
  const otherSendOptions: ActionJsonObject = {};
  const replyTo = optionalString(parameters, 'replyTo');
  const priority = optionalString(parameters, 'priority');
  if (replyTo !== undefined) {
    otherSendOptions.replyTo = replyTo;
  }
  if (priority !== undefined) {
    if (!['high', 'normal', 'low'].includes(priority)) {
      throw new ActionValidationFailure('Registered email priority is invalid.');
    }
    otherSendOptions.priority = priority;
  }
  if (
    configValue('services', 'email', 'disabled') === true ||
    configValue('services', 'email', 'disabled') === 'true'
  ) {
    return noChange({ sent: false });
  }
  const oid = recordOid(context, candidate);
  const body = emailBodyResult(
    await settleInvocation(invokeService('emailservice', 'buildFromTemplate', [template, { record: candidate, oid }]))
  );
  const sent = emailSendSucceeded(
    await settleInvocation(
      invokeService('emailservice', 'sendMessage', [
        to,
        body,
        requiredString(parameters, 'subject'),
        optionalString(parameters, 'from') ?? configString('', 'emailnotification', 'defaults', 'from'),
        optionalString(parameters, 'format') ?? configString('html', 'emailnotification', 'defaults', 'format'),
        optionalString(parameters, 'cc') ?? configString('', 'emailnotification', 'defaults', 'cc'),
        optionalString(parameters, 'bcc') ?? configString('', 'emailnotification', 'defaults', 'bcc'),
        otherSendOptions,
      ])
    )
  );
  return noChange({ sent });
}

async function doiHandler(
  serviceMethod: 'publishDoiTrigger' | 'updateDoiTriggerSync',
  context: Readonly<ActionContext>,
  parameters: Readonly<ActionParameterValues>
): Promise<ActionResult> {
  if (!requiredBoolean(parameters, 'condition')) {
    return noChange();
  }
  const candidate = candidateFrom(context);
  const options: ActionJsonObject = {
    forceRun: true,
    event: requiredString(parameters, 'event'),
  };
  const profile = optionalString(parameters, 'profile');
  if (profile !== undefined) {
    options.profile = profile;
  }
  await settleInvocation(
    invokeService('doiservice', serviceMethod, [recordOid(context, candidate), candidate, options])
  );
  return noChange();
}

async function linkWorkspaceHandler(
  context: Readonly<ActionContext>,
  parameters: Readonly<ActionParameterValues>
): Promise<ActionResult> {
  const candidate = candidateFrom(context);
  const field = requiredString(parameters, 'rdmpOidField');
  const segments = field.split('.');
  if (
    segments.length === 0 ||
    segments.length > 16 ||
    segments.some(segment => !SAFE_FIELD_SEGMENT.test(segment) || isForbiddenExpressionContextKey(segment))
  ) {
    throw new ActionValidationFailure('Workspace RDMP field is invalid.');
  }
  let rdmpOid: ActionJsonValue | undefined = candidate.metadata;
  for (const segment of segments) {
    rdmpOid = rdmpOid !== null && typeof rdmpOid === 'object' && !Array.isArray(rdmpOid) ? rdmpOid[segment] : undefined;
  }
  if (typeof rdmpOid !== 'string' || rdmpOid.trim() === '') {
    return noChange({ linked: false });
  }
  const workspaceOid = recordOid(context, candidate);
  if (workspaceOid === '') {
    throw new ActionValidationFailure('Workspace linking requires a record identifier.');
  }
  await settleInvocation(invokeService('workspaceservice', 'addWorkspaceToRecord', [rdmpOid, workspaceOid]));
  return noChange({ linked: true, workspaceOid, workspaceData: candidate });
}

function queueResult(value: RuntimeValue): Promise<RuntimeValue> {
  return settleInvocation(value);
}

function queuedActionScope(context: Readonly<ActionContext>): ActionBindingScope {
  return Object.freeze({
    context: 'queued-record-action',
    mode: context.scope.mode,
    phase: context.scope.phase,
    ...('scopeId' in context.scope && context.scope.scopeId !== undefined ? { scopeId: context.scope.scopeId } : {}),
  });
}

interface ValidatedQueuedAction {
  readonly actionId: ActionDefinitionId;
  readonly parameters: ActionParameterValues;
}

function validateQueuedAction(
  context: Readonly<ActionContext>,
  queuedActionIdValue: string,
  queuedContractVersion: number,
  queuedParametersValue: ActionJsonObject
): ValidatedQueuedAction {
  try {
    const actionIdResult = actionDefinitionIdSchema.safeParse(queuedActionIdValue);
    const parametersResult = actionParameterValuesSchema.safeParse(queuedParametersValue);
    if (!actionIdResult.success || !parametersResult.success) {
      throw new ActionValidationFailure('Queued action contract is invalid.');
    }
    const actionId = actionIdResult.data;
    const definition = BUILT_IN_DEFINITION_BY_ID.get(actionId);
    if (definition === undefined || actionId === BUILT_IN_ACTION_IDS.dispatchQueuedAction) {
      throw new ActionValidationFailure('Queued action is not an available non-queue action.');
    }
    const scope = queuedActionScope(context);
    const stableKey = 'queued-child';
    const binding = parseActionBinding({
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      id: deriveStableActionBindingId({
        recordTypeKey: context.recordTypeKey,
        scope,
        actionId,
        contractVersion: queuedContractVersion,
        stableKey,
      }),
      stableKey,
      actionId,
      contractVersion: queuedContractVersion,
      scope,
      parameters: parametersResult.data,
      order: 0,
    });
    validateActionBindingForDefinition(binding, definition);
    return Object.freeze({ actionId, parameters: parametersResult.data });
  } catch (error) {
    if (error instanceof ActionValidationFailure) {
      throw error;
    }
    throw new ActionValidationFailure('Queued action contract is invalid.');
  }
}

async function dispatchQueuedActionHandler(
  context: Readonly<ActionContext>,
  parameters: Readonly<ActionParameterValues>
): Promise<ActionResult> {
  assertOnlyParameters(parameters, ['condition', 'queuedActionId', 'queuedContractVersion', 'queuedParameters']);
  if (!requiredBoolean(parameters, 'condition')) {
    return noChange({ queued: false, queuedActionId: requiredString(parameters, 'queuedActionId') });
  }
  const queuedActionId = requiredString(parameters, 'queuedActionId');
  const queuedContractVersion = requiredInteger(parameters, 'queuedContractVersion');
  const queuedAction = validateQueuedAction(
    context,
    queuedActionId,
    queuedContractVersion,
    requiredObject(parameters, 'queuedParameters')
  );
  const payload = createRegisteredRecordActionQueuePayload({
    actionId: queuedAction.actionId,
    contractVersion: queuedContractVersion,
    parameters: queuedAction.parameters,
    context,
  });
  const queueServiceName = configString('', 'queue', 'serviceName');
  if (queueServiceName === '') {
    throw new ActionConfigurationError('Registered record action queue is unavailable.');
  }
  await queueResult(invokeService(queueServiceName, 'now', [REGISTERED_RECORD_ACTION_JOB_NAME, payload]));
  return noChange({ queued: true, queuedActionId });
}

function conditionParameter(defaultExpression: 'true' | 'false'): ActionParameterDefinition {
  return {
    name: 'condition',
    title: 'Condition',
    description: 'Managed JSONata condition evaluated against the curated action context.',
    kind: 'jsonata',
    required: true,
    defaultExpression,
  };
}

function stringParameter(
  name: string,
  title: string,
  required: boolean,
  defaultValue?: string
): ActionParameterDefinition {
  return {
    name,
    title,
    kind: 'string',
    required,
    maxLength: 2_048,
    ...(defaultValue === undefined ? {} : { defaultValue }),
  };
}

function stringArrayParameter(name: string, title: string): ActionParameterDefinition {
  return {
    name,
    title,
    kind: 'array',
    required: true,
    items: { kind: 'string', minLength: 1, maxLength: 512 },
    maxItems: 100,
  };
}

function descriptor(
  definition: Omit<ActionRegistrationDescriptor, 'schemaVersion' | 'contractVersion' | 'availability'>
): ActionRegistrationDescriptor {
  return freezeObjectTree({
    schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
    contractVersion: 1,
    ...definition,
  });
}

const BUILT_IN_ACTIONS: readonly ActionRegistrationDescriptor[] = Object.freeze([
  descriptor({
    id: BUILT_IN_ACTION_IDS.applyTemplates,
    title: 'Apply managed record value',
    description: 'Sets one record field from a managed JSONata value without mutating the supplied candidate.',
    category: 'record',
    handler: applyTemplateHandler,
    contexts: ['record-lifecycle'],
    modes: ['onCreate', 'onUpdate'],
    phases: ['pre'],
    allowRepeatedBindings: true,
    parameterSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      parameters: [
        stringParameter('field', 'Record field', true),
        {
          name: 'value',
          title: 'Managed value',
          description: 'JSONata value evaluated against the current candidate.',
          kind: 'jsonata',
          required: true,
        },
        { name: 'parseObject', title: 'Parse JSON text', kind: 'boolean', required: true, defaultValue: false },
      ],
    },
    outputSchema: { schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION, fields: [], safeFields: [] },
    resultContract: { allowedKinds: ['replace'] },
    executionPolicy: { timeout: LOCAL_TIMEOUT, retry: PURE_RETRY_POLICY },
  }),
  descriptor({
    id: BUILT_IN_ACTION_IDS.assignPermissions,
    title: 'Assign contributor permissions',
    description: 'Calculates record permissions from configured contributor fields on an isolated candidate.',
    category: 'record-permissions',
    handler: assignPermissionsHandler,
    contexts: ['record-lifecycle'],
    modes: ['onCreate', 'onUpdate'],
    phases: ['pre'],
    allowRepeatedBindings: false,
    parameterSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      parameters: [
        conditionParameter('true'),
        stringParameter('emailProperty', 'Contributor email property', true),
        stringArrayParameter('editContributorProperties', 'Edit contributor fields'),
        stringArrayParameter('viewContributorProperties', 'View contributor fields'),
        {
          name: 'recordCreatorPermissions',
          title: 'Record creator permissions',
          kind: 'enum',
          required: true,
          options: [
            { value: 'view', label: 'View' },
            { value: 'edit', label: 'Edit' },
            { value: 'view&edit', label: 'View and edit' },
          ],
        },
      ],
    },
    outputSchema: { schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION, fields: [], safeFields: [] },
    resultContract: { allowedKinds: ['no-change', 'replace'] },
    executionPolicy: { timeout: SERVICE_TIMEOUT, retry: PURE_RETRY_POLICY },
  }),
  descriptor({
    id: BUILT_IN_ACTION_IDS.validateTotalAttachmentSize,
    title: 'Validate total attachment size',
    description: 'Rejects a candidate whose attachment total exceeds the server-owned maximum.',
    category: 'validation',
    handler: validateAttachmentSizeHandler,
    contexts: ['record-lifecycle'],
    modes: ['onUpdate', 'onDelete'],
    phases: ['pre'],
    allowRepeatedBindings: false,
    parameterSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      parameters: [
        conditionParameter('true'),
        stringParameter('maxUploadSizeMessageCode', 'Alternative message code', false),
        {
          name: 'replaceOrAppend',
          title: 'Alternative message behavior',
          kind: 'enum',
          required: false,
          options: [
            { value: 'replace', label: 'Replace' },
            { value: 'append', label: 'Append' },
          ],
        },
      ],
    },
    outputSchema: { schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION, fields: [], safeFields: [] },
    resultContract: { allowedKinds: ['no-change'] },
    executionPolicy: { timeout: LOCAL_TIMEOUT, retry: NO_RETRY_POLICY },
  }),
  descriptor({
    id: BUILT_IN_ACTION_IDS.updateNotificationState,
    title: 'Update notification state',
    description: 'Updates notification flags on the candidate or through the validated record-write boundary.',
    category: 'notification',
    handler: updateNotificationHandler,
    contexts: ['record-lifecycle'],
    modes: ['onCreate', 'onUpdate'],
    phases: ['pre', 'post'],
    allowRepeatedBindings: true,
    parameterSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      parameters: [
        conditionParameter('false'),
        stringParameter('name', 'Display name', false),
        {
          name: 'flagName',
          title: 'Notification flag field',
          kind: 'enum',
          required: true,
          options: MANAGED_NOTIFICATION_FLAG_PATHS.map(value => ({ value, label: value })),
        },
        stringParameter('flagVal', 'Notification flag value', true),
        {
          name: 'logName',
          title: 'Notification log field',
          kind: 'enum',
          required: false,
          options: MANAGED_NOTIFICATION_LOG_PATHS.map(value => ({ value, label: value })),
        },
        { name: 'saveRecord', title: 'Persist separately', kind: 'boolean', required: true, defaultValue: false },
      ],
    },
    outputSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      fields: [{ name: 'updated', title: 'Updated', kind: 'boolean', required: true }],
      safeFields: ['updated'],
    },
    resultContract: { allowedKinds: ['no-change', 'replace'] },
    executionPolicy: { timeout: SERVICE_TIMEOUT, retry: NO_RETRY_POLICY },
  }),
  descriptor({
    id: BUILT_IN_ACTION_IDS.stripUserPermissions,
    title: 'Strip user permissions',
    description: 'Stores and removes selected user permissions from an isolated candidate.',
    category: 'record-permissions',
    handler: stripPermissionsHandler,
    contexts: ['record-lifecycle'],
    modes: ['onCreate', 'onUpdate'],
    phases: ['pre'],
    allowRepeatedBindings: false,
    parameterSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      parameters: [
        conditionParameter('false'),
        {
          name: 'permissionTypes',
          title: 'Permission types',
          kind: 'enum',
          required: true,
          defaultValue: 'edit',
          options: [
            { value: 'edit', label: 'Edit' },
            { value: 'view', label: 'View' },
            { value: 'view&edit', label: 'View and edit' },
          ],
        },
      ],
    },
    outputSchema: { schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION, fields: [], safeFields: [] },
    resultContract: { allowedKinds: ['no-change', 'replace'] },
    executionPolicy: { timeout: LOCAL_TIMEOUT, retry: PURE_RETRY_POLICY },
  }),
  descriptor({
    id: BUILT_IN_ACTION_IDS.restoreUserPermissions,
    title: 'Restore user permissions',
    description: 'Restores previously stored user permissions on an isolated candidate.',
    category: 'record-permissions',
    handler: restorePermissionsHandler,
    contexts: ['record-lifecycle'],
    modes: ['onCreate', 'onUpdate'],
    phases: ['pre'],
    allowRepeatedBindings: false,
    parameterSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      parameters: [conditionParameter('false')],
    },
    outputSchema: { schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION, fields: [], safeFields: [] },
    resultContract: { allowedKinds: ['no-change', 'replace'] },
    executionPolicy: { timeout: LOCAL_TIMEOUT, retry: PURE_RETRY_POLICY },
  }),
  descriptor({
    id: BUILT_IN_ACTION_IDS.sendRecordEmail,
    title: 'Send record email',
    description: 'Renders managed address text and sends a server-owned record email template.',
    category: 'notification',
    handler: sendRecordEmailHandler,
    contexts: ['record-lifecycle'],
    modes: ['onCreate', 'onUpdate'],
    phases: ['post'],
    allowRepeatedBindings: true,
    parameterSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      parameters: [
        conditionParameter('false'),
        { name: 'to', title: 'To', kind: 'handlebars', required: true, destination: 'plain-text' },
        { name: 'subject', title: 'Subject', kind: 'handlebars', required: true, destination: 'email-subject' },
        { name: 'from', title: 'From', kind: 'handlebars', required: false, destination: 'plain-text' },
        { name: 'cc', title: 'CC', kind: 'handlebars', required: false, destination: 'plain-text' },
        { name: 'bcc', title: 'BCC', kind: 'handlebars', required: false, destination: 'plain-text' },
        stringParameter('template', 'Email template', true),
        {
          name: 'format',
          title: 'Message format',
          kind: 'enum',
          required: false,
          options: [
            { value: 'html', label: 'HTML' },
            { value: 'text', label: 'Plain text' },
          ],
        },
        stringParameter('replyTo', 'Reply-to address', false),
        {
          name: 'priority',
          title: 'Message priority',
          kind: 'enum',
          required: false,
          options: [
            { value: 'high', label: 'High' },
            { value: 'normal', label: 'Normal' },
            { value: 'low', label: 'Low' },
          ],
        },
      ],
    },
    outputSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      fields: [{ name: 'sent', title: 'Sent', kind: 'boolean', required: true }],
      safeFields: ['sent'],
    },
    resultContract: { allowedKinds: ['no-change'] },
    executionPolicy: { timeout: EXTERNAL_TIMEOUT, retry: NO_RETRY_POLICY },
  }),
  descriptor({
    id: BUILT_IN_ACTION_IDS.publishDoi,
    title: 'Publish DOI',
    description:
      'Publishes a DOI using server-owned profile credentials and performs the existing validated writeback.',
    category: 'doi',
    handler: (context, parameters) => doiHandler('publishDoiTrigger', context, parameters),
    contexts: ['record-lifecycle', 'workflow-transition'],
    modes: ['onCreate', 'onTransitionWorkflow'],
    phases: ['post'],
    allowRepeatedBindings: false,
    parameterSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      parameters: [
        conditionParameter('false'),
        stringParameter('event', 'DOI event', true),
        stringParameter('profile', 'DOI profile', false),
      ],
    },
    outputSchema: { schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION, fields: [], safeFields: [] },
    resultContract: { allowedKinds: ['no-change'] },
    executionPolicy: { timeout: EXTERNAL_TIMEOUT, retry: NO_RETRY_POLICY },
  }),
  descriptor({
    id: BUILT_IN_ACTION_IDS.updateDoi,
    title: 'Update DOI',
    description: 'Updates a DOI using server-owned profile credentials without mutating the supplied record.',
    category: 'doi',
    handler: (context, parameters) => doiHandler('updateDoiTriggerSync', context, parameters),
    contexts: ['record-lifecycle', 'queued-record-action'],
    modes: ['onUpdate', 'onDelete'],
    phases: ['post'],
    allowRepeatedBindings: false,
    parameterSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      parameters: [
        conditionParameter('false'),
        stringParameter('event', 'DOI event', true),
        stringParameter('profile', 'DOI profile', false),
      ],
    },
    outputSchema: { schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION, fields: [], safeFields: [] },
    resultContract: { allowedKinds: ['no-change'] },
    executionPolicy: { timeout: EXTERNAL_TIMEOUT, retry: NO_RETRY_POLICY },
  }),
  descriptor({
    id: BUILT_IN_ACTION_IDS.linkWorkspace,
    title: 'Link workspace to record',
    description: 'Links the current workspace to its configured RDMP and returns bounded response output.',
    category: 'workspace',
    handler: linkWorkspaceHandler,
    contexts: ['record-lifecycle', 'workflow-transition'],
    modes: ['onCreate', 'onTransitionWorkflow'],
    phases: ['postSync'],
    allowRepeatedBindings: false,
    parameterSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      parameters: [stringParameter('rdmpOidField', 'RDMP OID field', true, 'rdmpOid')],
    },
    outputSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      fields: [
        { name: 'linked', title: 'Linked', kind: 'boolean', required: true },
        { name: 'workspaceOid', title: 'Workspace OID', kind: 'string', required: false },
        { name: 'workspaceData', title: 'Workspace data', kind: 'json', required: false },
      ],
      safeFields: ['linked', 'workspaceOid', 'workspaceData'],
    },
    resultContract: { allowedKinds: ['no-change'] },
    executionPolicy: { timeout: EXTERNAL_TIMEOUT, retry: NO_RETRY_POLICY },
  }),
  descriptor({
    id: BUILT_IN_ACTION_IDS.dispatchQueuedAction,
    title: 'Dispatch registered record action',
    description: 'Queues one bounded registered-action reference without persisting an executable function string.',
    category: 'queue',
    handler: dispatchQueuedActionHandler,
    contexts: ['record-lifecycle', 'workflow-transition'],
    modes: ['onCreate', 'onUpdate', 'onDelete', 'onTransitionWorkflow'],
    phases: ['post'],
    allowRepeatedBindings: true,
    parameterSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      parameters: [
        conditionParameter('true'),
        stringParameter('queuedActionId', 'Queued action ID', true),
        {
          name: 'queuedContractVersion',
          title: 'Queued contract version',
          kind: 'number',
          required: true,
          integer: true,
          minimum: 1,
          maximum: 2_147_483_647,
        },
        { name: 'queuedParameters', title: 'Queued parameters', kind: 'object', required: true },
      ],
    },
    outputSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      fields: [
        { name: 'queued', title: 'Queued', kind: 'boolean', required: true },
        { name: 'queuedActionId', title: 'Queued action ID', kind: 'string', required: true },
      ],
      safeFields: ['queued', 'queuedActionId'],
    },
    resultContract: { allowedKinds: ['no-change'] },
    executionPolicy: { timeout: SERVICE_TIMEOUT, retry: NO_RETRY_POLICY },
  }),
]);

const BUILT_IN_DEFINITION_BY_ID: ReadonlyMap<ActionDefinitionId, ActionDefinition> = new Map(
  BUILT_IN_ACTIONS.map(descriptor => {
    const definition = parseActionDefinition({
      ...descriptor,
      provenance: { packageName: '@researchdatabox/redbox-core', moduleName: 'actions/index' },
    });
    return [definition.id, definition] as const;
  })
);

export function builtInActionRegistrations(): readonly ActionRegistrationDescriptor[] {
  return BUILT_IN_ACTIONS;
}
