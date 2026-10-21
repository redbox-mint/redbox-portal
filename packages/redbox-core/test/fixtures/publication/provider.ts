import { Services } from '../../../src/services/PublicationService';
import type {
  PublicationObject,
  PublicationProvider,
  PublicationProviderExecution,
  PublicationProviderOutcome,
} from '../../../src/services/publication/contracts';
import { isPublicationObject, publicationTargetFingerprint } from '../../../src/services/publication/builtins';
import { PublicationProviderRegistry } from '../../../src/services/publication/registry';

function objectResult(value: unknown) {
  return isPublicationObject(value)
    ? { valid: true as const, value }
    : { valid: false as const, issues: [{ path: '', code: 'object', message: 'Object required' }] };
}
async function waitForReview(
  context: PublicationProviderExecution<PublicationObject, PublicationObject, PublicationObject>
): Promise<PublicationProviderOutcome<PublicationObject>> {
  await context.assertAuthority();
  return { kind: 'waiting', state: context.state, reason: 'external_review', nextCheckAt: 1000 };
}
export const reviewProvider: PublicationProvider<PublicationObject, PublicationObject, PublicationObject> = {
  id: 'review-ledger',
  contractVersion: 2,
  stateVersion: 2,
  configurationSchema: {
    type: 'object',
    properties: {
      connection: {
        type: 'object',
        properties: {
          endpoint: { type: 'string' },
          account: { type: 'string' },
          apiKey: { type: 'string' },
        },
      },
    },
  },
  secretPaths: ['connection.apiKey'],
  mutationRecovery: { mode: 'idempotency-key' },
  capabilities: { synchronise: true, observe: true, reconcile: true, resourceLeases: false },
  validateConfiguration(value) {
    if (!isPublicationObject(value) || !isPublicationObject(value.connection))
      return { valid: false, issues: [{ path: '/connection', code: 'connection', message: 'Connection required' }] };
    return { valid: true, value };
  },
  targetFingerprint(config) {
    if (
      !isPublicationObject(config.connection) ||
      typeof config.connection.endpoint !== 'string' ||
      typeof config.connection.account !== 'string'
    )
      throw new Error('Target identity required');
    return publicationTargetFingerprint('review-ledger', [
      new URL(config.connection.endpoint).href,
      config.connection.account,
    ]);
  },
  decodeState(value, version) {
    if (version !== 2)
      return { valid: false, issues: [{ path: '', code: 'state-version', message: 'Unsupported state version' }] };
    return objectResult(value);
  },
  upgradeState(value, version) {
    if (version !== 1 || !isPublicationObject(value))
      return { valid: false, issues: [{ path: '', code: 'state-version', message: 'Unsupported state version' }] };
    return { valid: true, value: { ...value, upgraded: true } };
  },
  decodePreparedSource: objectResult,
  async prepareSource(input) {
    return { valid: true, value: { record: input.record, generated: input.generatedValues } };
  },
  synchronise: waitForReview,
  reconcile: waitForReview,
  observe: waitForReview,
  repairs: [],
};
/** This is the supported hook override seam, not a mutation of a private registry. */
export class HookPublication extends Services.Publication {
  protected override configureProviders(): void {
    super.configureProviders();
    this.registerProvider(reviewProvider);
  }
  public registerLate(): void {
    this.registerProvider({ ...reviewProvider, id: 'late-provider' });
  }
}
export function testRegistry(): PublicationProviderRegistry {
  const registry = new PublicationProviderRegistry();
  registry.register(reviewProvider);
  return registry;
}
export function configuredDestination() {
  return {
    provider: 'review-ledger',
    displayName: 'Editorial archive',
    enabled: false,
    archived: false,
    connection: { endpoint: 'https://ledger.example.test', account: 'institution-1', apiKey: 'private-key' },
    mapping: {},
    attachments: {},
    writeBack: { url: 'metadata.publications.ledger.url' },
    providerOptions: {},
  };
}
