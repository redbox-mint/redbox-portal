import {
  actionRegistrationSource,
  buildActionRegistry,
  deriveStableActionBindingId,
  parseActionBinding,
  parseActionDefinitionId,
  type ActionRegistrationDescriptor,
  type ActionHandler,
} from '../../src/action-registry';
export function secretFixture(
  recordTypeKey = 'secret-test',
  handler: ActionHandler = () => ({ schemaVersion: 1, kind: 'no-change' })
) {
  const actionId = parseActionDefinitionId('org.redbox.b08-secret');
  const descriptor: ActionRegistrationDescriptor = {
    schemaVersion: 1,
    id: actionId,
    contractVersion: 1,
    title: 'Secret test',
    description: 'Secret test',
    category: 'test',
    handler,
    contexts: ['record-lifecycle'],
    modes: ['onCreate'],
    phases: ['pre'],
    allowRepeatedBindings: true,
    parameterSchema: {
      schemaVersion: 1,
      parameters: [{ name: 'credential', title: 'Credential', kind: 'secret', writeOnly: true, required: true }],
    },
    outputSchema: { schemaVersion: 1, fields: [], safeFields: [] },
    resultContract: { allowedKinds: ['no-change'] },
    executionPolicy: { timeout: { defaultMs: 1000, minMs: 100, maxMs: 2000 }, retry: { allowed: false } },
  };
  const registry = buildActionRegistry([
    actionRegistrationSource('@researchdatabox/b08-test', 'actions/index', () => [descriptor]),
  ]);
  const scope = { context: 'record-lifecycle' as const, mode: 'onCreate' as const, phase: 'pre' as const };
  const binding = parseActionBinding({
    schemaVersion: 1,
    id: deriveStableActionBindingId({ recordTypeKey, scope, actionId, contractVersion: 1, stableKey: 'credential' }),
    actionId,
    contractVersion: 1,
    stableKey: 'credential',
    scope,
    order: 0,
    parameters: { credential: { kind: 'secret', configured: true } },
  });
  return { registry, binding };
}
