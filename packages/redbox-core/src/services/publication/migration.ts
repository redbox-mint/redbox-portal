import { get } from 'lodash';
import type { Db } from 'mongodb';
import type { StorageService } from '../../StorageService';
import { hasFullPublicationStorageCapability } from '../../RecordStorageConcurrency';
import type { PublicationPublishingConfigData } from '../../configmodels/PublicationPublishing';
import type { PublicationAttribution, PublicationObject, PublicationOperation } from './contracts';
import type { PublicationProviderRegistry } from './registry';
import { isPublicationObject } from './builtins';
import { publicationDigest } from './canonical';
import { PublicationSyncStore } from './store';
import { PublicationResourceStore } from './resource-store';
import { PublicationStagingFence } from './staging-fence';
import { PublicationAdminControl } from './admin-control';
import { PublicationMigrationStore, publicationMigrationId, type PublicationMigrationItem } from './migration-store';
import {
  convertPublicationConfiguration,
  migrationConfigurationFingerprint,
  migrationJson,
  type PublicationMigrationReview,
} from './migration-configuration';
import { decodeFigshareLegacy } from '../figshare-v2/publication-state';
import { figshareDestinationConfiguration } from '../figshare-v2/publication-config';
import { oniDestinationConfiguration, oniRepositoryIdentity } from '../oni-v2/publication-config';
import { validatePublicationConfiguration } from './configuration';

export interface PublicationMigrationOptions {
  brandId: string;
  username: string;
  parameters?: PublicationObject;
  apply?: boolean;
  reason?: string;
}
export interface PublicationMigrationRuntime {
  db: Db;
  storage: StorageService;
  registry: PublicationProviderRegistry;
  recordCollection?: string;
  administrator(username: string, brandId: string, record?: Record<string, unknown>): Promise<PublicationAttribution>;
  legacyConfiguration(brandId: string): Promise<PublicationObject>;
  recordTypes(brandId: string): Promise<PublicationObject[]>;
  persistConfiguration(brandId: string, config: PublicationPublishingConfigData): Promise<void>;
  verifyConfiguration(brandId: string, config: PublicationPublishingConfigData): Promise<Record<string, string>>;
  /** Optional progress observer, invoked only after acknowledged durable writes. */
  afterWrite?(boundary: string): Promise<void>;
}
interface Candidate extends PublicationMigrationItem {
  providerId: string;
  targetFingerprint: string;
  namespace?: string;
  objectId?: string;
}
interface Inventory {
  config: PublicationPublishingConfigData;
  assignments: Record<string, string>;
  candidates: Candidate[];
  reviews: PublicationMigrationReview[];
  translations: ReturnType<typeof convertPublicationConfiguration>['translations'];
  configurationFingerprint: string;
  sourceFingerprint: string;
  fingerprint: string;
  globalFailures: string[];
  crosswalkFingerprint: string;
  admissions: Array<{ token: string; expiresAt: number }>;
}
const unique = (values: string[]) => [...new Set(values)].sort();
const itemId = (brandId: string, oid: string, destinationId: string) =>
  `item-v1:${publicationDigest({ brandId, oid, destinationId })}`;

/** Reports contain identifiers, categories and digests only. Private legacy evidence stays in the native journal. */
function report(inventory: Inventory) {
  return {
    schemaVersion: 1,
    inventoryFingerprint: inventory.fingerprint,
    configurationFingerprint: inventory.configurationFingerprint,
    sourceFingerprint: inventory.sourceFingerprint,
    crosswalkFingerprint: inventory.crosswalkFingerprint,
    assignments: inventory.assignments,
    sourceAdmissions: inventory.admissions,
    translations: inventory.translations,
    manualReviews: inventory.reviews,
    globalFailures: inventory.globalFailures,
    counts: {
      sources: inventory.candidates.length,
      quarantined: inventory.candidates.filter(item => item.quarantine.length).length,
      observationOnly: inventory.candidates.filter(item => !item.quarantine.length).length,
    },
    items: inventory.candidates.map(({ oid, destinationId, fingerprint, quarantine, conflictGroup }) => ({
      oid,
      destinationId,
      fingerprint,
      quarantine,
      ...(conflictGroup ? { conflictGroup } : {}),
    })),
  };
}

async function inventory(
  runtime: PublicationMigrationRuntime,
  options: PublicationMigrationOptions
): Promise<Inventory> {
  const { db, registry } = runtime;
  const brandId = options.brandId;
  const parameters = options.parameters ?? {};
  const legacy = await runtime.legacyConfiguration(brandId);
  const recordTypes = await runtime.recordTypes(brandId);
  const converted = convertPublicationConfiguration(brandId, legacy, recordTypes, parameters);
  const globalFailures: string[] = [];
  if (!hasFullPublicationStorageCapability(runtime.storage)) globalFailures.push('storage_capability');
  const config = converted.config;
  if (parameters.useExistingConfiguration === true) {
    const checked = validatePublicationConfiguration(legacy.publicationPublishing, registry, {
      publicationStorage: runtime.storage,
    });
    if (!checked.valid) globalFailures.push('invalid_existing_configuration');
    else Object.assign(config, checked.value);
    if (isPublicationObject(parameters.assignments)) {
      for (const [source, id] of Object.entries(parameters.assignments)) {
        if (typeof id !== 'string' || !config.destinations[id]) globalFailures.push('invalid_assignment');
        else converted.assignments[source] = id;
      }
    }
  }
  config.processing.enabled = false;
  for (const destination of Object.values(config.destinations)) destination.enabled = false;
  const configurationFingerprint = migrationConfigurationFingerprint(config, registry);
  const journal = await new PublicationMigrationStore(db).get(brandId);
  const reviews = converted.reviews.filter(
    item =>
      item.category !== 'existing-unified-configuration' || (!journal && parameters.useExistingConfiguration !== true)
  );
  const checked = validatePublicationConfiguration(config, registry, { publicationStorage: runtime.storage });
  if (!checked.valid) globalFailures.push(...checked.issues.map(issue => `configuration:${issue.code}`));
  if (!config.processing.serviceUsername || !config.processing.stagingDisk)
    globalFailures.push('service_or_staging_missing');
  const candidates: Candidate[] = [];
  const records = await db
    .collection(runtime.recordCollection ?? 'record')
    .find({ 'metaMetadata.brandId': brandId })
    .sort({ redboxOid: 1 })
    .toArray();
  const states = await db.collection('figsharesync').find({ brandId }).sort({ oid: 1 }).toArray();
  const audits = await db
    .collection('integrationaudit')
    .find({
      $or: [
        { brandId },
        { brandId: { $exists: false }, redboxOid: { $in: records.map(record => String(record.redboxOid)) } },
      ],
    })
    .sort({ _id: 1 })
    .toArray();
  // Include orphan state rows too: deletion must not erase unknown provider outcomes.
  const oids = unique([...records.map(record => String(record.redboxOid)), ...states.map(row => String(row.oid))]);
  for (const oid of oids) {
    const record = records.find(row => row.redboxOid === oid);
    const state = states.find(row => row.oid === oid);
    for (const [source, destinationId] of Object.entries(converted.assignments).sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      const destination = config.destinations[destinationId];
      if (!destination) {
        globalFailures.push('assignment_destination_missing');
        continue;
      }
      const provider = registry.get(destination.provider);
      if (!provider || !provider.validateConfiguration(destination).valid) {
        globalFailures.push('invalid_destination_configuration');
        continue;
      }
      let targetFingerprint = '';
      try {
        targetFingerprint = provider?.targetFingerprint(destination) ?? '';
      } catch {
        globalFailures.push('target_identity');
      }
      if (!targetFingerprint) continue;
      let namespace: string | undefined;
      let objectId: string | undefined;
      const quarantine: string[] = [];
      let evidence: PublicationObject;
      if (source === 'figshare') {
        const figshare = figshareDestinationConfiguration(destination);
        const legacyId = record ? String(get(record, figshare.record.articleIdPath, '') ?? '') : '';
        const intent: unknown = record?.figshareSyncIntent;
        const snapshot: unknown = record ? get(record, figshare.record.syncStatePath) : undefined;
        if (!state && !legacyId && !intent && !snapshot) continue;
        if (state) {
          try {
            decodeFigshareLegacy(migrationJson(state));
          } catch {
            quarantine.push('invalid_legacy_state');
          }
          const binding = state.binding;
          if (binding && typeof binding === 'object') {
            const id: unknown = Reflect.get(binding, 'articleId');
            const ns: unknown = Reflect.get(binding, 'namespace');
            if (typeof id === 'string') objectId = id;
            if (typeof ns === 'string') namespace = ns;
          }
          if (legacyId && objectId && legacyId !== objectId) quarantine.push('conflicting_record_binding');
          if (state.leaseUntil && Number(state.leaseUntil) > Date.now()) globalFailures.push('active_legacy_lease');
          if (
            get(state, 'create.outcome') &&
            ['submitted', 'uncertain', 'failed'].includes(String(get(state, 'create.outcome')))
          )
            quarantine.push('uncertain_create');
          if (['submitted', 'accepted', 'uncertain'].includes(String(get(state, 'publish.outcome'))))
            quarantine.push('uncertain_publication');
          if (
            Array.isArray(state.receipts) &&
            state.receipts.some(receipt =>
              ['initialising', 'uploading', 'completing', 'deleting'].includes(String(get(receipt, 'state')))
            )
          )
            quarantine.push('unsettled_files');
          if (Number(get(state, 'work.sync.requested', 0)) > Number(get(state, 'work.sync.processed', 0)))
            quarantine.push('pending_source_requires_sealed_approval');
        }
        if (
          state?.binding &&
          (get(state, 'binding.namespace') !== new URL(figshare.connection.baseUrl).href.replace(/\/+$/, '') ||
            String(get(state, 'binding.accountId')) !== destination.connection.accountId)
        )
          quarantine.push('legacy_target_mismatch');
        objectId ??= legacyId || undefined;
        namespace ??= objectId ? new URL(figshare.connection.baseUrl).href.replace(/\/+$/, '') : undefined;
        if (get(intent, 'pending') === true) quarantine.push('pending_source_requires_sealed_approval');
        if (get(intent, 'readiness') === 'initialising') quarantine.push('unverified_save_outcome');
        evidence = migrationJson({
          kind: 'figshare',
          classification: 'observation-only',
          ...(state ? { legacy: state } : {}),
          ...(intent ? { intent } : {}),
          ...(snapshot ? { snapshot } : {}),
          ...(legacyId ? { recordArticleId: legacyId } : {}),
          links: Object.fromEntries(
            figshare.writeBack.articleUrls
              .map((path, index) => [`article${index + 1}`, record ? get(record, path) : undefined])
              .filter(([, value]) => typeof value === 'string')
          ),
        });
      } else if (source.startsWith('oni:')) {
        const oni = oniDestinationConfiguration(destination);
        const url: unknown = record ? get(record, oni.writeBack.citationUrlPath) : undefined;
        const doi: unknown = record ? get(record, oni.writeBack.citationDoiPath) : undefined;
        if (!url && !doi) continue;
        const sites = Object.entries(converted.assignments).filter(([key]) => key.startsWith('oni:'));
        if (sites.length !== 1) quarantine.push('ambiguous_historical_oni_site');
        namespace = oniRepositoryIdentity(destination);
        // The deterministic legacy object identity is provenance; existence/ingestion is deliberately unverified.
        objectId = `arcp://name,${oni.rootCollection.targetRepoNamespace}/${oid}`;
        evidence = migrationJson({
          kind: 'oni',
          classification: 'observation-only',
          objectId,
          site: source.slice(4),
          ...(typeof url === 'string' ? { url } : {}),
          ...(typeof doi === 'string' ? { doi } : {}),
          ingestion: 'unknown',
          visibility: 'unverified',
        });
      } else {
        globalFailures.push('unsupported_assignment');
        continue;
      }
      if (!record) quarantine.push('record_missing');
      const duplicateStates = states.filter(row => row.oid === oid);
      if (source === 'figshare' && duplicateStates.length > 1) {
        quarantine.push('duplicate_legacy_state');
        evidence.legacyRows = duplicateStates.map(row => migrationJson(row));
      }
      evidence.audits = audits.filter(audit => audit.redboxOid === oid).map(audit => migrationJson(audit));
      evidence.auditReferences = audits
        .filter(audit => audit.redboxOid === oid)
        .map(audit => ({
          id: String(audit._id),
          fingerprint: publicationDigest(migrationJson(audit)),
        }));
      if (record?.publicationSource) evidence.sharedSource = migrationJson(record.publicationSource);
      const fingerprint = publicationDigest(evidence);
      candidates.push({
        schemaVersion: 1,
        brandId,
        migrationId: publicationMigrationId(brandId),
        id: itemId(brandId, oid, destinationId),
        oid,
        destinationId,
        fingerprint,
        evidence,
        quarantine: unique(quarantine),
        converted: false,
        providerId: destination.provider,
        targetFingerprint,
        ...(namespace ? { namespace } : {}),
        ...(objectId ? { objectId } : {}),
      });
    }
  }
  // Every claimant in a local or cross-brand writer group is quarantined, including existing shared owners.
  for (const item of candidates) {
    if (!item.namespace || !item.objectId) continue;
    const group = publicationDigest({ provider: item.providerId, namespace: item.namespace, objectId: item.objectId });
    const peers = candidates.filter(
      peer =>
        peer.providerId === item.providerId && peer.namespace === item.namespace && peer.objectId === item.objectId
    );
    const shared = await db
      .collection('publicationsync')
      .find({ providerId: item.providerId, remoteNamespace: item.namespace, remoteObjectId: item.objectId })
      .toArray();
    const legacyPeers =
      item.providerId === 'figshare'
        ? await db
            .collection('figsharesync')
            .find({
              'binding.namespace': item.namespace,
              'binding.articleId': item.objectId,
              $or: [{ brandId: { $ne: brandId } }, { oid: { $ne: item.oid } }],
            })
            .toArray()
        : [];
    if (
      peers.length > 1 ||
      legacyPeers.length ||
      shared.some(row => row.brandId !== brandId || row.oid !== item.oid || row.destinationId !== item.destinationId)
    ) {
      item.conflictGroup = group;
      item.quarantine = unique([...item.quarantine, 'conflicting_remote_writers']);
      item.evidence.conflictingWriters = [...legacyPeers, ...shared].map(row => ({
        brandId: String(row.brandId),
        oid: String(row.oid),
        destinationId: String(row.destinationId ?? ''),
      }));
      item.fingerprint = publicationDigest(item.evidence);
    }
  }
  const crosswalks: PublicationObject[] = [];
  for (const name of [
    'figsharevocabulary',
    'figsharevocabularyterm',
    'figsharecrosswalk',
    'figsharecrosswalkrevision',
    'figsharevocabularycrosswalk',
    'figsharevocabularycrosswalkmapping',
    'figsharevocabularysyncrun',
    'figsharevocabularycategory',
    'figsharevocabularysource',
  ]) {
    const rows = await db
      .collection(name)
      .find({
        $or: [{ brandId }, { branding: brandId }, { brandId: { $exists: false }, branding: { $exists: false } }],
      })
      .sort({ _id: 1 })
      .toArray();
    crosswalks.push(migrationJson({ name, rows }));
  }
  const crosswalkFingerprint = publicationDigest(crosswalks);
  const sourceFingerprint = publicationDigest({
    records: records.map(record => migrationJson(record)),
    states: states.map(state => migrationJson(state)),
    audits: audits.map(audit => migrationJson(audit)),
    recordTypes,
    crosswalkFingerprint,
  });
  const fingerprint = publicationDigest({
    configurationFingerprint,
    sourceFingerprint,
    assignments: converted.assignments,
  });
  return {
    config,
    assignments: converted.assignments,
    candidates,
    reviews,
    translations: converted.translations,
    configurationFingerprint,
    sourceFingerprint,
    fingerprint,
    globalFailures: unique(globalFailures),
    crosswalkFingerprint,
    admissions:
      (await new PublicationAdminControl(db).collection.findOne({ brandId, destinationId: '' }))?.admissions ?? [],
  };
}

async function verifyPersistedConfiguration(
  runtime: PublicationMigrationRuntime,
  brandId: string,
  plan: Inventory
): Promise<void> {
  const saved = (await runtime.legacyConfiguration(brandId)).publicationPublishing;
  const checked = validatePublicationConfiguration(saved, runtime.registry, { publicationStorage: runtime.storage });
  if (
    !checked.valid ||
    checked.value.processing.enabled ||
    Object.values(checked.value.destinations).some(destination => destination.enabled) ||
    migrationConfigurationFingerprint(checked.value, runtime.registry) !== plan.configurationFingerprint
  )
    throw new Error('Prepared publication configuration changed or became enabled; activation blocked');
}

/** Historical operations support reconciliation but never grant a source approval or completion. */
function historicalOperations(item: PublicationMigrationItem): PublicationOperation[] {
  const legacy = item.evidence.legacy;
  if (!isPublicationObject(legacy)) return [];
  const operations: PublicationOperation[] = [];
  for (const kind of ['create', 'publish']) {
    const original = legacy[kind];
    if (!isPublicationObject(original)) continue;
    const confirmed = original.outcome === 'confirmed' || original.outcome === 'observed';
    operations.push({
      id: `legacy-${kind}:${publicationDigest({ item: item.id, original })}`,
      kind: `figshare:${kind}`,
      approvalId: '',
      approvalEpoch: 0,
      sourceGeneration:
        typeof original.generation === 'number' ? original.generation : Number(legacy.importedGeneration ?? 0),
      intendedDigest: typeof original.hash === 'string' ? original.hash : publicationDigest(original),
      submittedAt: String(original.submittedAt ?? original.startedAt ?? ''),
      outcome: confirmed ? 'confirmed' : original.outcome === 'rejected' ? 'rejected' : 'uncertain',
      evidence: { ...original, migrationId: item.migrationId, historical: true },
    });
  }
  return operations;
}
function historicalLinks(item: PublicationMigrationItem): Record<string, string> {
  const links: Record<string, string> = {};
  if (isPublicationObject(item.evidence.links))
    for (const [key, value] of Object.entries(item.evidence.links)) if (typeof value === 'string') links[key] = value;
  for (const key of ['url', 'doi']) {
    const value = item.evidence[key];
    if (typeof value === 'string') links[key] = value;
  }
  return links;
}

/** One-way, resumable migration. Every step is durable before the next; no provider mutation is performed. */
export async function migratePublication(
  runtime: PublicationMigrationRuntime,
  options: PublicationMigrationOptions
): Promise<unknown> {
  if (!options.brandId?.trim() || !options.username?.trim())
    throw new Error('Explicit brand and administrator are required');
  const actor = await runtime.administrator(options.username, options.brandId);
  if (options.apply && (!options.reason?.trim() || options.reason.length > 2000))
    throw new Error('Applying migration requires a reason of 1–2000 characters');
  const store = new PublicationMigrationStore(runtime.db);
  const previous = await store.get(options.brandId);
  if (previous?.authority === 'shared')
    return {
      applied: false,
      alreadyCommitted: true,
      migrationId: previous.migrationId,
      authority: 'shared',
      counts: previous.counts,
    };
  const plan = await inventory(runtime, options);
  if (!options.apply) return { dryRun: true, ...report(plan) };
  const parameters = options.parameters ?? {};
  if (
    parameters.consumersStopped !== true ||
    typeof parameters.evidenceReference !== 'string' ||
    !parameters.evidenceReference.trim()
  )
    throw new Error(
      'Pause every deployed legacy consumer and settle in-flight calls; consumersStopped and evidenceReference are required'
    );
  const control = new PublicationAdminControl(runtime.db);
  if (Array.isArray(parameters.settledAdmissions) && parameters.settledAdmissions.length) {
    const tokens = parameters.settledAdmissions;
    if (!tokens.every(token => typeof token === 'string' && token.trim()))
      throw new Error('Exact source admission tokens required');
    // This is an explicit settlement of stopped writers, never an inference from lease age.
    await runtime.db.collection('publicationadmissionsettlement').insertOne(
      {
        brandId: options.brandId,
        tokens,
        actor,
        reason: options.reason,
        evidenceReference: parameters.evidenceReference,
        at: new Date().toISOString(),
      },
      { writeConcern: { w: 'majority', j: true } }
    );
    await control.collection.updateOne(
      { brandId: options.brandId, destinationId: '' },
      { $pull: { admissions: { token: { $in: tokens } } } }
    );
  }
  const token = await control.acquire(options.brandId);
  const after = async (boundary: string) => {
    await runtime.afterWrite?.(boundary);
    await control.assertOwner(options.brandId, token);
  };
  try {
    await store.ensureIndexes();
    let journal = await store.begin(
      {
        schemaVersion: 1,
        brandId: options.brandId,
        migrationId: publicationMigrationId(options.brandId),
        revision: 0,
        authority: 'preparing',
        phase: 'paused',
        inventoryFingerprint: plan.fingerprint,
        configurationFingerprint: plan.configurationFingerprint,
        sourceFingerprint: plan.sourceFingerprint,
        assignments: plan.assignments,
        usedDestinations: Object.fromEntries(
          plan.candidates
            .filter(item => item.targetFingerprint)
            .map(item => [
              item.destinationId,
              { providerId: item.providerId, targetFingerprint: item.targetFingerprint },
            ])
        ),
        verifiedTargets: {},
        counts: {
          sources: plan.candidates.length,
          converted: 0,
          quarantined: plan.candidates.filter(item => item.quarantine.length).length,
        },
        globalFailures: plan.globalFailures,
        actor,
        reason: options.reason!,
        settlementReference: parameters.evidenceReference,
        startedAt: new Date().toISOString(),
      },
      () => after('inventory_written')
    );
    await after('authority_fenced');
    const sync = new PublicationSyncStore(runtime.db);
    const failures = [...plan.globalFailures];
    if (await sync.collection.findOne({ brandId: options.brandId, 'lease.expiresAt': { $gt: Date.now() } }))
      failures.push('active_shared_lease');
    const resources = await runtime.db
      .collection('publicationresourcelease')
      .find({ 'lease.expiresAt': { $gt: Date.now() } })
      .toArray();
    if (
      resources.some(
        row =>
          get(row, 'lease.brandId') === options.brandId ||
          Object.values(plan.config.destinations).some(destination =>
            runtime.registry
              .get(destination.provider)
              ?.administrativeResources?.(destination)
              .some(key => key.namespace === row.namespace)
          )
      )
    )
      failures.push('active_resource_lease');
    const accepted = isPublicationObject(parameters.reviews) ? parameters.reviews : {};
    if (plan.reviews.some(item => typeof accepted[item.id] !== 'string' || !String(accepted[item.id]).trim()))
      failures.push('manual_reviews_required');
    try {
      await sync.ensureIndexes();
      await new PublicationResourceStore(runtime.db).ensureIndexes();
    } catch {
      failures.push('unsafe_publication_indexes');
    }
    if (failures.length) {
      journal = await store.progress(journal, journal.phase, { globalFailures: unique(failures) });
      await after('global_failure_recorded');
      return {
        applied: false,
        blocked: true,
        authority: journal.authority,
        ...report({ ...plan, globalFailures: journal.globalFailures }),
      };
    }
    for (const item of plan.candidates) {
      const record = await runtime.storage.getMeta(item.oid);
      if (record) await runtime.administrator(options.username, options.brandId, { ...record });
    }
    let verifiedTargets: Record<string, string>;
    try {
      verifiedTargets = await runtime.verifyConfiguration(options.brandId, plan.config);
    } catch {
      journal = await store.progress(journal, journal.phase, {
        globalFailures: ['target_service_or_staging_verification'],
      });
      await after('verification_failure_recorded');
      return {
        applied: false,
        blocked: true,
        authority: journal.authority,
        ...report({ ...plan, globalFailures: journal.globalFailures }),
      };
    }
    await runtime.db.collection('publicationmigrationreview').updateOne(
      { brandId: options.brandId, migrationId: journal.migrationId },
      {
        $setOnInsert: {
          brandId: options.brandId,
          migrationId: journal.migrationId,
          reviews: accepted,
          actor,
          reason: options.reason,
        },
      },
      { upsert: true, writeConcern: { w: 'majority', j: true } }
    );
    await after('reviews_written');
    for (const [id, destination] of Object.entries(plan.config.destinations))
      if (verifiedTargets[id] !== runtime.registry.get(destination.provider)!.targetFingerprint(destination))
        throw new Error('Migration target verification is incomplete');
    if (journal.phase === 'paused') {
      await runtime.persistConfiguration(options.brandId, plan.config);
      await after('configuration_written');
      await verifyPersistedConfiguration(runtime, options.brandId, plan);
      journal = await store.progress(journal, 'prepared', { verifiedTargets, globalFailures: [] });
      await after('prepared');
    }
    for (const candidate of plan.candidates) {
      const { providerId, targetFingerprint, namespace, objectId, ...item } = candidate;
      await store.retain(item);
      await after('evidence_written');
      if (item.conflictGroup) {
        const writers = item.evidence.conflictingWriters;
        if (Array.isArray(writers))
          for (const writer of writers) {
            if (!isPublicationObject(writer) || typeof writer.brandId !== 'string' || typeof writer.oid !== 'string')
              continue;
            const peerDestination =
              typeof writer.destinationId === 'string' && writer.destinationId
                ? writer.destinationId
                : item.destinationId;
            await store.retain({
              ...item,
              brandId: writer.brandId,
              oid: writer.oid,
              destinationId: peerDestination,
              id: `conflict:${item.conflictGroup}:${publicationDigest(writer)}`,
              evidence: { conflictGroup: item.conflictGroup, origin: options.brandId },
              fingerprint: publicationDigest({ conflictGroup: item.conflictGroup, origin: options.brandId }),
              converted: true,
            });
            await after('conflict_writer_written');
          }
        await after('conflict_group_written');
      }
      const row = await sync.initialise(
        item,
        providerId,
        targetFingerprint,
        runtime.registry.get(providerId)!.stateVersion
      );
      await after('destination_initialised');
      // Never replace a newer worker/repair row on replay. The immutable evidence remains in the journal.
      if (row.revision === 0) {
        const legacy = item.evidence.legacy;
        const providerState: PublicationObject =
          providerId === 'figshare' && isPublicationObject(legacy) ? { legacy } : {};
        const changed = await new PublicationStagingFence(runtime.db).admit(item.evidence, () =>
          sync.collection.updateOne(
            { brandId: row.brandId, oid: row.oid, destinationId: row.destinationId, revision: 0, sourceGeneration: 0 },
            {
              $set: {
                providerState,
                operations: historicalOperations(item),
                links: historicalLinks(item),
                status: item.quarantine.length ? 'repair_required' : 'paused',
                waitingReason: item.quarantine.length ? 'migration_quarantine' : 'historical_observation_only',
                ...(namespace &&
                objectId &&
                !item.conflictGroup &&
                !item.quarantine.includes('legacy_target_mismatch') &&
                !item.quarantine.includes('duplicate_legacy_state')
                  ? {
                      binding: {
                        namespace,
                        objectId,
                        targetFingerprint,
                        evidence: { migrationId: item.migrationId, historical: true },
                      },
                      remoteNamespace: namespace,
                      remoteObjectId: objectId,
                    }
                  : {}),
              },
              $inc: { revision: 1 },
            },
            { writeConcern: { w: 'majority', j: true } }
          )
        );
        if (!changed.matchedCount) throw new Error('Migration row changed during conversion; evidence retained');
      }
      await after('destination_written');
      await store.converted(item);
      await after('item_converted');
    }
    journal = await store.progress(journal, 'converted', {
      counts: { ...journal.counts, converted: plan.candidates.length },
    });
    await after('converted');
    await verifyPersistedConfiguration(runtime, options.brandId, plan);
    const verification = await inventory(runtime, options);
    if (verification.fingerprint !== plan.fingerprint)
      throw new Error('Migration sources/configuration changed before verification; activation blocked');
    for (const item of plan.candidates) {
      const retained = await store.items.findOne({ brandId: item.brandId, id: item.id });
      const row = await sync.get(item);
      if (
        !retained?.converted ||
        retained.fingerprint !== item.fingerprint ||
        !row ||
        row.targetFingerprint !== item.targetFingerprint
      )
        throw new Error('Migration evidence verification failed');
    }
    journal = await store.progress(journal, 'verified', { globalFailures: [] });
    await after('verified');
    await runtime.administrator(options.username, options.brandId);
    journal = await store.progress(journal, 'committed');
    await after('committed');
    return { applied: true, authority: 'shared', phase: journal.phase, ...report(plan) };
  } catch (error) {
    const current = await store.get(options.brandId);
    if (current?.authority === 'preparing')
      await store.progress(current, current.phase, {
        globalFailures: unique([...current.globalFailures, 'interrupted_or_verification_failed']),
      });
    throw error;
  } finally {
    await control.release(options.brandId, token);
  }
}
