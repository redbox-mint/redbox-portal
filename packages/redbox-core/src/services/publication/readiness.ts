import type { Db, IndexDescriptionInfo } from 'mongodb';
import type { StorageService } from '../../StorageService';
import { hasFullPublicationStorageCapability } from '../../RecordStorageConcurrency';
import type { PublicationProviderRegistry } from './registry';
import { PublicationMigrationStore } from './migration-store';
import { PublicationSyncStore } from './store';
import { PublicationResourceStore } from './resource-store';
import { publicationState } from './save';
import { canonicalPublicationJson } from './canonical';
import { isPublicationObject } from './builtins';
import { validatePublicationConfiguration, type PublicationConfigurationContext } from './configuration';

/** Read-only deployment checks. A pass is local readiness, never institutional release acceptance. @internal */
export async function publicationReadiness(input: {
  db: Db;
  brandId: string;
  recordCollection: string;
  storage: StorageService;
  registry: PublicationProviderRegistry;
  configuration: unknown;
  context: PublicationConfigurationContext;
  serviceAccess: (username: string) => Promise<boolean>;
  stagingAvailable: (disk: string) => boolean;
}) {
  const { db, brandId, registry } = input;
  const blockers: string[] = [];
  if (!hasFullPublicationStorageCapability(input.storage)) blockers.push('storage_capability');
  const indexes: Array<{ collection: string; key: Record<string, number>; partial?: Record<string, unknown> }> = [
    { collection: 'publicationsync', key: { brandId: 1, oid: 1, destinationId: 1 } },
    {
      collection: 'publicationsync',
      key: { providerId: 1, remoteNamespace: 1, remoteObjectId: 1 },
      partial: { remoteNamespace: { $type: 'string' }, remoteObjectId: { $type: 'string' } },
    },
    { collection: 'publicationdestination', key: { brandId: 1, destinationId: 1 } },
    { collection: 'publicationworkflowdecision', key: { brandId: 1, oid: 1, 'decision.id': 1 } },
    { collection: 'publicationresourcelease', key: { providerId: 1, namespace: 1, resourceKey: 1 } },
    { collection: 'publicationmigration', key: { brandId: 1 } },
    { collection: 'publicationmigrationitem', key: { brandId: 1, id: 1 } },
    { collection: 'publicationmigrationinventory', key: { brandId: 1, fingerprint: 1 } },
    { collection: 'publicationadmincontrol', key: { brandId: 1, destinationId: 1 } },
  ];
  const indexChecks: Array<{ collection: string; key: Record<string, number>; valid: boolean }> = [];
  for (const expected of indexes) {
    let found: IndexDescriptionInfo[] = [];
    try {
      found = await db.collection(expected.collection).listIndexes().toArray();
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 26) throw error;
    }
    const valid = found.some(
      index =>
        // Index order matters, including for uniqueness and prefix scans.
        JSON.stringify(index.key) === JSON.stringify(expected.key) &&
        index.unique === true &&
        !index.sparse &&
        !index.hidden &&
        !index.collation &&
        canonicalPublicationJson(index.partialFilterExpression ?? {}) ===
          canonicalPublicationJson(expected.partial ?? {})
    );
    indexChecks.push({ collection: expected.collection, key: expected.key, valid });
  }
  if (indexChecks.some(check => !check.valid)) blockers.push('unsafe_or_missing_indexes');
  let authority = 'invalid';
  try {
    const journal = await new PublicationMigrationStore(db).get(brandId);
    authority = journal?.authority ?? 'legacy';
    if (authority !== 'shared') blockers.push('authority_not_committed');
    if (journal?.globalFailures.length) blockers.push('migration_global_failures');
  } catch {
    blockers.push('invalid_authority');
  }
  const checked = validatePublicationConfiguration(input.configuration, registry, {
    ...input.context,
    publicationStorage: input.storage,
  });
  if (!checked.valid) blockers.push('invalid_configuration');
  let processingEnabled = false;
  if (checked.valid) {
    const config = checked.value;
    processingEnabled = config.processing.enabled;
    if (!config.processing.stagingDisk || !input.stagingAvailable(config.processing.stagingDisk))
      blockers.push('staging_unavailable');
    if (!(await input.serviceAccess(config.processing.serviceUsername))) blockers.push('service_access');
    for (const [id, destination] of Object.entries(config.destinations)) {
      const provider = registry.get(destination.provider);
      if (!provider?.executionAvailable || !provider.configurationSchema || !provider.decodeState)
        blockers.push('provider_registry');
      if (input.context.verifiedTargets?.[id] !== provider?.targetFingerprint(destination))
        blockers.push('target_not_verified');
    }
  }
  const store = new PublicationSyncStore(db);
  const migration = new PublicationMigrationStore(db);
  let activeOwners = 0;
  let destinations = 0;
  for await (const row of store.collection.find({ brandId })) {
    destinations++;
    if (row.lease && row.lease.expiresAt > Date.now()) activeOwners++;
    try {
      await store.get(row);
    } catch {
      blockers.push('invalid_destination_state');
      continue;
    }
    const provider = registry.get(row.providerId);
    // Missing adapters and future versions indicate an incompatible deployment, even on isolated work.
    if (
      !provider?.decodeState ||
      !Number.isSafeInteger(row.providerStateVersion) ||
      row.providerStateVersion < 1 ||
      row.providerStateVersion > provider.stateVersion
    ) {
      blockers.push('invalid_destination_state');
      continue;
    }
    try {
      provider.decodeState(row.providerState, row.providerStateVersion);
    } catch {
      // Known isolated legacy ambiguity is retained for repair; it cannot veto unrelated fresh work.
      const quarantine = await migration.items.findOne({
        brandId,
        oid: row.oid,
        destinationId: row.destinationId,
        'quarantine.0': { $exists: true },
        resolution: { $exists: false },
      });
      if (!quarantine) blockers.push('invalid_destination_state');
    }
  }
  for await (const row of new PublicationResourceStore(db).collection.find({})) {
    if (row.schemaVersion !== 1) blockers.push('invalid_resource_state');
    if (row.lease?.brandId === brandId && row.lease.expiresAt > Date.now()) activeOwners++;
  }
  for await (const record of db.collection(input.recordCollection).find({ 'metaMetadata.brandId': brandId })) {
    try {
      publicationState(record);
    } catch {
      blockers.push('invalid_source_state');
    }
  }
  const gates = await db.collection('publicationadmincontrol').find({ brandId }).toArray();
  const destinationPauses = gates.find(gate => !gate.destinationId)?.destinationPauses ?? {};
  const paused =
    gates.some(gate => gate.paused && (!gate.destinationId || !Object.hasOwn(destinationPauses, gate.destinationId))) ||
    Object.values(destinationPauses).some(decision => isPublicationObject(decision) && decision.paused === true);
  const admissions = gates.reduce((total, gate) => total + (gate.admissions?.length ?? 0), 0);
  if (admissions) blockers.push('unsettled_source_admissions');
  if (gates.some(gate => gate.lock?.expiresAt > Date.now())) blockers.push('administration_active');
  const quarantined = await db.collection('publicationmigrationitem').countDocuments({
    brandId,
    'quarantine.0': { $exists: true },
    resolution: { $exists: false },
  });
  return {
    ready: blockers.length === 0,
    scope: 'local-readiness',
    brandId,
    authority,
    processingEnabled,
    paused,
    activeOwners,
    admissions,
    destinations,
    quarantined,
    blockers: [...new Set(blockers)].sort(),
    indexes: indexChecks,
    providers: registry.list().map(provider => ({
      id: provider.id,
      contractVersion: provider.contractVersion,
      stateVersion: provider.stateVersion,
      executionAvailable: provider.executionAvailable,
    })),
  };
}
