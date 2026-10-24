import type { RecordHookDefinition, RecordHooksConfig, RecordTypeConfig } from '../config/recordtype.config';
import { validateActionExecutionPolicy, validateActionId } from '../action-execution/policy';

/** Deliberate migration of known built-in expressions, never service-path dispatch. */
const builtins: Readonly<Record<string, string>> = Object.freeze({
  'sails.services.rdmpservice.runTemplates': 'record.runTemplates',
  'sails.services.rdmpservice.processRecordCounters': 'record.processRecordCounters',
  'sails.services.rdmpservice.queueTriggerCall': 'record.queueTriggerCall',
  'sails.services.rdmpservice.assignPermissions': 'record.assignPermissions',
  'sails.services.rdmpservice.complexAssignPermissions': 'record.complexAssignPermissions',
  'sails.services.rdmpservice.checkTotalSizeOfFilesInRecord': 'record.checkTotalSizeOfFilesInRecord',
  'sails.services.rdmpservice.stripUserBasedPermissions': 'record.stripUserBasedPermissions',
  'sails.services.rdmpservice.restoreUserBasedPermissions': 'record.restoreUserBasedPermissions',
  'sails.services.rdmpservice.addWorkspaceToRecord': 'record.addWorkspaceToRecord',
  'sails.services.rdmpservice.removeWorkspaceFromRecord': 'record.removeWorkspaceFromRecord',
  'sails.services.triggerservice.transitionWorkflow': 'workflow.transition',
  'sails.services.triggerservice.runHooksSync': 'workflow.runHooksSync',
  'sails.services.triggerservice.applyFieldLevelPermissions': 'workflow.applyFieldLevelPermissions',
  'sails.services.triggerservice.validateFieldUsingRegex': 'workflow.validateFieldUsingRegex',
  'sails.services.triggerservice.validateFieldsUsingTemplate': 'workflow.validateFieldsUsingTemplate',
  'sails.services.triggerservice.validateFieldMapUsingRegex': 'workflow.validateFieldMapUsingRegex',
  'sails.services.triggerservice.runTemplatesOnRelatedRecord': 'workflow.runTemplatesOnRelatedRecord',
  'sails.services.recordsservice.updateNotificationLog': 'record.updateNotificationLog',
  'sails.services.emailservice.sendRecordNotification': 'email.sendRecordNotification',
  'sails.services.doiservice.publishDoiTrigger': 'doi.publish',
  'sails.services.doiservice.publishDoiTriggerSync': 'doi.publishSync',
  'sails.services.doiservice.updateDoiTriggerSync': 'doi.updateSync',
  'sails.services.raidservice.mintTrigger': 'raid.mint',
  'sails.services.raidservice.mintPostCreateRetryHandler': 'raid.mintPostCreateRetryHandler',
  'sails.services.oniservice.exportDataset': 'oni.exportDataset',
  'sails.services.figshareservice.validateFigshareRecord': 'figshare.validateFigshareRecord',
  'sails.services.figshareservice.wakeFigshareRecord': 'figshare.wakeFigshareRecord',
  'sails.services.figshareservice.requestFigshareCleanup': 'figshare.requestFigshareCleanup',
  'sails.services.figshareservice.createUpdateFigshareArticle': 'figshare.validateFigshareRecord',
  'sails.services.figshareservice.uploadFilesToFigshareArticle': 'figshare.wakeFigshareRecord',
  'sails.services.figshareservice.deleteFilesFromRedboxTrigger': 'figshare.requestFigshareCleanup',
});

function dictionary(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireHook(value: unknown): asserts value is RecordHookDefinition {
  if (!dictionary(value) || typeof value.function !== 'string')
    throw new Error('Record hooks require named declarations.');
  if (value.options !== undefined && !dictionary(value.options))
    throw new Error('Record hook options must be an object.');
  if (value.id !== undefined) validateActionId(value.id);
  validateActionExecutionPolicy(value.execution);
}

function convertHook(hook: unknown): RecordHookDefinition {
  requireHook(hook);
  const name = Object.hasOwn(builtins, hook.function) ? builtins[hook.function] : hook.function;
  if (name.startsWith('sails.') || !/^[A-Za-z][A-Za-z0-9_.:-]{0,199}$/.test(name))
    throw new Error('Convert unsupported record hook expression to a registered v6 operation.');
  const nested = hook.options?.hooks;
  if (nested !== undefined && !Array.isArray(nested))
    throw new Error('Record hook options.hooks must be an array of named declarations.');
  return {
    ...hook,
    function: name,
    ...(nested === undefined
      ? {}
      : {
          options: {
            ...hook.options,
            hooks: nested.map(convertHook),
          },
        }),
  };
}

/** Rewrite only hook declarations and their explicit nested hook list; templates stay opaque. */
export function convertBuiltinRecordHooks(hooks: unknown): RecordHooksConfig {
  if (!dictionary(hooks)) throw new Error('Record hooks must be an object of named modes.');
  if (Object.keys(hooks).some(key => !['onCreate', 'onUpdate', 'onDelete', 'onTransitionWorkflow'].includes(key)))
    throw new Error('Unsupported record hook mode; convert it to a supported v6 operation.');
  const result: RecordHooksConfig = {};
  for (const mode of ['onCreate', 'onUpdate', 'onDelete', 'onTransitionWorkflow'] as const) {
    const declaration = hooks[mode];
    if (declaration === undefined) continue;
    if (!dictionary(declaration)) throw new Error('Record hook mode must be an object of named phases.');
    if (Object.keys(declaration).some(key => !['pre', 'post', 'postSync'].includes(key)))
      throw new Error('Unsupported record hook phase; convert it to a supported v6 operation.');
    const converted: NonNullable<RecordHooksConfig[typeof mode]> = {};
    for (const phase of ['pre', 'post', 'postSync'] as const) {
      const hooks = declaration[phase];
      if (hooks === undefined) continue;
      if (!Array.isArray(hooks)) throw new Error('Record hook phase must be an array of named declarations.');
      converted[phase] = hooks.map(convertHook);
    }
    result[mode] = converted;
  }
  return result;
}

/** v5 comparison declarations remain untouched; v6 producers return converted copies. */
export function convertBuiltinRecordTypeHooks(definitions: RecordTypeConfig): RecordTypeConfig {
  return Object.fromEntries(
    Object.entries(definitions).map(([name, definition]) => [
      name,
      {
        ...definition,
        ...(definition.hooks ? { hooks: convertBuiltinRecordHooks(definition.hooks) } : {}),
      },
    ])
  );
}
