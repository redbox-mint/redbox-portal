import { ActionRegistry, defineRedboxHook, registerRedboxActions } from '../../dist';
import type { RegisteredRecordActionQueuePayload } from '../../dist/action-registry/registeredActionQueue';

export const coreRegistration: ActionRegistry.RegisterRedboxActions = registerRedboxActions;
export const hook = defineRedboxHook({ registerRedboxActions: coreRegistration });
// @ts-expect-error Registration must finish synchronously before startup.
defineRedboxHook({ registerRedboxActions: async () => [] });
// @ts-expect-error Persisted names cannot supply registration functions.
defineRedboxHook({ registerRedboxActions: 'HooksService.register' });

export function inspectMetadata(metadata: ActionRegistry.ActionDescriptorMetadata): string {
  // @ts-expect-error Public metadata excludes executable handlers.
  metadata.handler;
  // @ts-expect-error Descriptor properties are immutable.
  metadata.title = 'replacement';
  // @ts-expect-error Nested metadata arrays are immutable too.
  metadata.parameterSchema.parameters.push({});
  // @ts-expect-error Provenance is immutable.
  metadata.provenance.moduleName = 'replacement';
  return metadata.provenance.packageName;
}

export function inspectQueue(payload: RegisteredRecordActionQueuePayload): string {
  const actionId: ActionRegistry.ActionDefinitionId = payload.actionId;
  const version: 1 = payload.schemaVersion;
  const context: Readonly<ActionRegistry.ActionContext> = payload.context;
  const parameters: Readonly<ActionRegistry.ActionParameterValues> = payload.parameters;
  // @ts-expect-error The public queue envelope is immutable.
  payload.contractVersion = 2;
  return `${actionId}:${version}:${context.brandId}:${Object.keys(parameters).length}`;
}
