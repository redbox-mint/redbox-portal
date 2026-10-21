import { hasFullPublicationStorageCapability } from '../../RecordStorageConcurrency';
import { assertRecordFieldPaths } from '../../RecordWriteOptions';
import Ajv, { type ValidateFunction } from 'ajv';
import { cloneDeep } from 'lodash';
import {
  DEFAULT_PUBLICATION_PROCESSING,
  PUBLICATION_PUBLISHING_SCHEMA,
  type PublicationPublishingConfigData,
} from '../../configmodels/PublicationPublishing';
import type { PublicationValidationIssue, PublicationValidationResult } from './contracts';
import { PublicationProviderRegistry } from './registry';

export interface PublicationDestinationIdentity {
  providerId: string;
  targetFingerprint: string;
}
/** Supplied by the durable authority/storage boundary, never by posted AppConfig JSON. */
export interface PublicationConfigurationContext {
  publicationStorage?: unknown;
  usedDestinations?: Readonly<Record<string, PublicationDestinationIdentity>>;
  /** Adapter verification includes account identity and actual storage namespace. */
  verifiedTargets?: Readonly<Record<string, string>>;
  authority?: 'legacy' | 'preparing' | 'shared';
  /** Deterministic migration-journal assignments for legacy provider entry points. Never AppConfig/job input. */
  legacyDestinations?: Readonly<Record<string, readonly string[]>>;
  /** Save preparation only: the adapter validates each selected destination before granting authority. */
  deferInvalidProviderConfiguration?: boolean;
}
let configValidator: ValidateFunction<PublicationPublishingConfigData> | undefined;

/** Parse metadata paths with array notation; reserve an entire array root for its writer. */
export function publicationOutputPath(path: string): string[] {
  if (
    typeof path !== 'string' ||
    path.length > 512 ||
    !/^metadata\.[A-Za-z0-9_:-]+(?:\[(?:\d+|\*)\])?(?:\.[A-Za-z0-9_:-]+(?:\[(?:\d+|\*)\])?)*$/.test(path)
  )
    throw new Error('Publication output must be a safe metadata child path');
  const parts = path.replace(/\[(\d+|\*)\]/g, '.$1').split('.');
  if (parts.some(part => ['__proto__', 'prototype', 'constructor'].includes(part)))
    throw new Error('Unsafe publication output path');
  const array = parts.findIndex(part => /^\d+$/.test(part) || part === '*');
  return array < 0 ? parts : parts.slice(0, array);
}
function overlaps(a: string[], b: string[]): boolean {
  return a.slice(0, Math.min(a.length, b.length)).every((part, index) => part === b[index]);
}

/** Local validation only; this function never contacts a provider or starts work. @public */
export function validatePublicationConfiguration(
  value: unknown,
  registry: PublicationProviderRegistry,
  context: PublicationConfigurationContext = {}
): PublicationValidationResult<PublicationPublishingConfigData> {
  const validateSchema = (configValidator ??= new Ajv({
    strict: false,
    allErrors: true,
    useDefaults: true,
  }).compile<PublicationPublishingConfigData>(PUBLICATION_PUBLISHING_SCHEMA));
  const candidate: unknown = cloneDeep(value);
  if (!validateSchema(candidate))
    return {
      valid: false,
      issues: (validateSchema.errors ?? []).map(error => ({
        path: error.instancePath,
        code: 'schema',
        message: error.message ?? 'Invalid publication configuration',
      })),
    };
  // Schema validation narrows the runtime JSON; only defaults are added to the copy.
  const config = candidate;
  config.processing = { ...DEFAULT_PUBLICATION_PROCESSING, ...config.processing };
  const issues: PublicationValidationIssue[] = [];
  const error = (path: string, code: string, message: string) => issues.push({ path, code, message });
  if (config.processing.leaseMs < 3 * config.processing.heartbeatMs)
    error('/processing/leaseMs', 'lease-duration', 'leaseMs must be at least three times heartbeatMs');
  const outputs: Array<{ destination: string; path: string[] }> = [];
  for (const [id, destination] of Object.entries(config.destinations)) {
    const base = `/destinations/${id}`;
    if (['constructor', 'prototype', '__proto__'].includes(id))
      error(base, 'unsafe-id', 'Unsafe publication destination ID');
    if (!destination.displayName.trim()) error(base, 'display-name', 'A destination display name is required');
    const provider = registry.get(destination.provider);
    if (!provider) {
      error(`${base}/provider`, 'unknown-provider', 'Unknown publication provider');
      continue;
    }
    if (destination.archived && destination.enabled)
      error(base, 'archived-enabled', 'An archived destination cannot be enabled');
    const providerResult = provider.validateConfiguration(destination);
    if (!providerResult.valid && !context.deferInvalidProviderConfiguration)
      for (const issue of providerResult.issues) error(base + issue.path, issue.code, issue.message);
    const used = context.usedDestinations?.[id];
    let target: string | undefined;
    if (providerResult.valid || !context.deferInvalidProviderConfiguration) {
      try {
        target = provider.targetFingerprint(destination);
      } catch {
        if (destination.enabled || used)
          error(`${base}/connection`, 'target-identity', 'A valid fixed remote target is required');
      }
    }
    if (
      used &&
      (providerResult.valid || !context.deferInvalidProviderConfiguration) &&
      (used.providerId !== destination.provider || used.targetFingerprint !== target)
    )
      error(
        base,
        'used-target-change',
        'A referenced destination cannot change provider or remote target; create a new destination ID'
      );
    if (config.processing.enabled && destination.enabled && !destination.archived) {
      if (!provider.executionAvailable || !provider.capabilities.synchronise || !provider.capabilities.reconcile)
        error(base, 'adapter-unavailable', 'The provider execution/reconciliation adapter is unavailable');
      if (
        (providerResult.valid || !context.deferInvalidProviderConfiguration) &&
        (!target || context.verifiedTargets?.[id] !== target)
      )
        error(base, 'target-unverified', 'Current credentials and remote target must be verified before enablement');
    }
    let registeredPaths: readonly string[] = [];
    try {
      registeredPaths = provider.sourceMaintenancePaths?.(destination) ?? [];
    } catch {
      if (destination.enabled && !context.deferInvalidProviderConfiguration)
        error(`${base}/writeBack`, 'invalid-outputs', 'Provider output paths could not be resolved');
    }
    for (const value of [...Object.values(destination.writeBack), ...registeredPaths]) {
      for (const output of typeof value === 'string' ? [value] : value) {
        try {
          const path = publicationOutputPath(output);
          for (const previous of outputs)
            if (previous.destination !== id && overlaps(path, previous.path))
              error(
                `${base}/writeBack`,
                'output-collision',
                'Publication destinations cannot write overlapping paths or array roots'
              );
          outputs.push({ destination: id, path });
          // Collision parsing accepts array notation; actual writes must also satisfy the storage contract.
          assertRecordFieldPaths({ [output]: null }, [output]);
        } catch {
          error(`${base}/writeBack`, 'unsafe-output', 'Publication output must be a safe metadata child path');
        }
      }
    }
  }
  for (const id of Object.keys(context.usedDestinations ?? {}))
    if (!Object.hasOwn(config.destinations, id))
      error(
        '/destinations',
        'used-destination-removed',
        'Referenced destinations must be retained; archive or disable them'
      );
  for (const [name, entries] of [
    ['sourcePolicies', config.sourcePolicies],
    ['workflow/rules', config.workflow.rules],
  ] as const) {
    const seen = new Set<string>();
    for (const entry of entries) {
      if (seen.has(entry.id))
        error(`/${name}`, 'duplicate-id', 'Policy and rule IDs must be unique in their collection');
      seen.add(entry.id);
      for (const id of entry.destinations)
        if (!Object.hasOwn(config.destinations, id))
          error(`/${name}`, 'missing-destination', 'A policy or workflow rule references a missing destination');
    }
  }
  for (const policy of config.sourcePolicies) {
    if (policy.continuationCondition && /\buser\b/.test(policy.continuationCondition))
      error(
        '/sourcePolicies',
        'requester-continuation',
        'Continuation conditions must be independent of the historical requester'
      );
  }
  if (config.processing.enabled) {
    if (!config.processing.serviceUsername.trim() || config.processing.serviceUserType !== 'local')
      error('/processing', 'service-identity', 'Processing requires an explicit local service identity');
    if (!hasFullPublicationStorageCapability(context.publicationStorage))
      error('/processing', 'storage-capability', 'Storage must certify publication capability version 1');
    if (context.authority !== 'shared')
      error('/processing', 'brand-authority', 'Processing requires committed shared brand authority');
  }
  return issues.length ? { valid: false, issues } : { valid: true, value: config };
}

/** A committed unified authority never falls back to legacy provider configuration. */
export function resolvePublicationConfiguration(
  brandingConfiguration: unknown,
  registry: PublicationProviderRegistry,
  context: PublicationConfigurationContext
): PublicationPublishingConfigData | undefined {
  if (context.authority === 'legacy' || context.authority === undefined) return undefined;
  if (context.authority === 'preparing') throw new Error('Publication brand cutover is in progress');
  if (
    typeof brandingConfiguration !== 'object' ||
    brandingConfiguration === null ||
    !Object.hasOwn(brandingConfiguration, 'publicationPublishing')
  )
    throw new Error('Authoritative publicationPublishing configuration is missing');
  const result = validatePublicationConfiguration(
    Reflect.get(brandingConfiguration, 'publicationPublishing'),
    registry,
    context
  );
  if (!result.valid)
    throw new Error(
      `Invalid authoritative publicationPublishing configuration: ${result.issues.map(issue => issue.code).join(', ')}`
    );
  return result.value;
}
