import { ActionRegistry, type RegistryActionDefinition } from '../dist';

export const descriptorValidator: ActionRegistry.RuntimeValidator<RegistryActionDefinition> =
  ActionRegistry.actionDefinitionSchema;
export const bindingValidator: ActionRegistry.RuntimeValidator<ActionRegistry.ActionBinding> =
  ActionRegistry.actionBindingSchema;
export const contextValidator: ActionRegistry.RuntimeValidator<ActionRegistry.ActionContext> =
  ActionRegistry.actionContextSchema;
export const resultValidator: ActionRegistry.RuntimeValidator<ActionRegistry.ActionResult> =
  ActionRegistry.actionResultSchema;

export function resultPayload(result: ActionRegistry.ActionResult): string {
  switch (result.kind) {
    case 'no-change':
      return result.kind;
    case 'patch':
      return String(result.patch.length);
    case 'replace':
      return JSON.stringify(result.candidate);
    case 'reject':
      return result.code;
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
}

export function patchPayload(operation: ActionRegistry.ActionPatchOperation): string {
  switch (operation.op) {
    case 'add':
    case 'replace':
      return JSON.stringify(operation.value);
    case 'remove':
      return operation.path;
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}

// @ts-expect-error A plain string cannot bypass validated descriptor identity.
export const invalidId: ActionRegistry.ActionDefinitionId = 'org.redbox.test';
// @ts-expect-error Patch results require a patch payload.
export const missingPatch: ActionRegistry.ActionResult = { schemaVersion: 1, kind: 'patch' };
// @ts-expect-error Move is outside the closed patch vocabulary.
export const unsupportedPatch: ActionRegistry.ActionPatchOperation = { op: 'move', path: '/metadata' };
export const secretValue: ActionRegistry.ActionParameterValue = {
  kind: 'secret',
  configured: true,
  // @ts-expect-error Persisted secrets contain configuration metadata only.
  value: 'forbidden',
};
export const forbiddenUi: ActionRegistry.ActionParameterUiHints = {
  rows: 4,
  // @ts-expect-error Arbitrary Formly expressions are outside the controlled UI vocabulary.
  expressionProperties: {},
};
