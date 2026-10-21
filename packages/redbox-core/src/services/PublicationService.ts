import { migratePublication, type PublicationMigrationOptions } from './publication/migration';
import { publicationReadiness } from './publication/readiness';
import { PublicationMigrationStore } from './publication/migration-store';
import { migrationJson } from './publication/migration-configuration';
import { figshareDestinationConfiguration } from './figshare-v2/publication-config';
import { makeLiveClient } from './figshare-v2/http';
import { verifyOniRepositoryBackend } from './oni-v2/publication-config';
import { administerPublication, type PublicationAdminOptions } from './publication/admin';
import { PublicationAdminControl } from './publication/admin-control';
import { Services as services } from '../CoreService';
import { ConfigModels } from '../configmodels/ConfigModels';
import {
  PUBLICATION_PUBLISHING_SCHEMA,
  PUBLICATION_DESTINATION_SCHEMA,
  PublicationPublishing,
} from '../configmodels/PublicationPublishing';
import { isPublicationObject, BUILTIN_PUBLICATION_DEFINITIONS } from './publication/builtins';
import { PublicationProviderRegistry } from './publication/registry';
import type { PublicationObject, PublicationProvider } from './publication/contracts';
import type { PublicationAttribution } from './publication/contracts';
import type { StorageService } from '../StorageService';
import { firstValueFrom } from 'rxjs';
import { randomUUID } from 'node:crypto';
import { get, cloneDeep } from 'lodash';
import { assertFullPublicationStorageCapability } from '../RecordStorageConcurrency';
import { publicationContentRecord, publicationDigest, publicationRecordDigest } from './publication/canonical';
import {
  allocatePublicationGeneratedValues,
  sealPublicationSource,
  reopenPublicationSource,
  publicationMaterialConfiguration,
  type PublicationPreparationInput,
} from './publication/source';
import { PublicationStaging } from './publication/staging';
import { PublicationStagingFence } from './publication/staging-fence';
import { cleanupPublicationStaging } from './publication/staging-cleanup';
import { cleanupPublicationAttachments } from './publication/attachment-cleanup';
import type { DatastreamService } from '../DatastreamService';
import Datastream from '../Datastream';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { registeredPublicationOutputs, publicationOutputSnapshot } from './publication/writeback';
import { createFigsharePublicationProvider } from './figshare-v2/publication-adapter';
import { createOniPublicationProvider } from './oni-v2/publication-adapter';
import type { Db } from 'mongodb';
import { PublicationSyncStore } from './publication/store';
import { publicationLiveSummaries, publicationOperationalSignals, publicationStatusLabels } from './publication/status';
import { PublicationResourceStore } from './publication/resource-store';
import {
  dispatchPublications,
  importPublicationIntents,
  type PublicationDispatcherRuntime,
} from './publication/dispatcher';
import { runPublicationWorker, verifyPublicationInputs, type PublicationJob } from './publication/worker';
import {
  preparePublicationSave,
  createPublicationSaveSession,
  publicationHookContext,
  publicationState,
  assertPublicationSaveSession,
  publicationPreparationDigest,
  assertPublicationSavePolicies,
  type PublicationSaveSession,
  type PublicationSourceRuntime,
} from './publication/save';
import {
  validatePublicationConfiguration,
  resolvePublicationConfiguration,
  type PublicationConfigurationContext,
} from './publication/configuration';

/** Native deleted-source model supplied by the storage hook. */
declare const DeletedRecord: { tableName: string };

export namespace Services {
  /**
   * Shared publication configuration and provider ownership boundary.
   * @extensionPoint Override through registerRedboxServices, extend this class and register providers in configureProviders().
   * @remarks Register adapters before bootstrap freezes provider IDs. Host-owned save, worker, authority and administrative methods are internal.
   * @see https://github.com/redbox-mint/redbox-portal/wiki/Publication-Provider-Development
   */
  export class Publication extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'bootstrap',
      'validateConfiguration',
      'getConfiguration',
      'getProviders',
      'validateConfigurationForSave',
      'prepareSourceRequest',
      'acceptRequest',
      'acceptProviderRequest',
      'wakeRecord',
      'dispatch',
      'executeRecord',
      'cleanupStaging',
      'forwardLegacyProviderJob',
      'hasSharedAuthority',
      'assertLegacyPublicationAllowed',
      'getRecordStatus',
      'administer',
      'migrate',
      'readiness',
    ];
    protected readonly providerRegistry = new PublicationProviderRegistry();
    private configured = false;

    /** Shared workers use the durable authority seam. No provider work starts at bootstrap. @internal */
    protected publicationRuntime(prepareLedger = true): PublicationDispatcherRuntime {
      this.ensureConfigured();
      const storage = RecordsService.getPublicationStorage();
      const db: Db = PublicationSync.getDatastore().manager;
      const configuration: PublicationDispatcherRuntime['configuration'] = async brandId => {
        const brand = BrandingService.getBrandById(brandId);
        if (!brand) return undefined;
        const context = await this.sourceConfigurationContext(brandId, storage, prepareLedger);
        const config = this.getConfiguration(brand.name, { ...context, publicationStorage: storage });
        return config ? new PublicationAdminControl(db).overlay(brandId, config) : undefined;
      };
      const runtime: PublicationDispatcherRuntime = {
        storage,
        store: new PublicationSyncStore(db),
        resources: new PublicationResourceStore(db),
        registry: this.providerRegistry,
        recordAudit: async row => {
          await IntegrationAuditService.recordPublicationAudit(row);
          await runtime.store.acknowledgeAudit(row);
        },
        configuration,
        brands: async () =>
          BrandingService.getAvailable()
            .map(name => BrandingService.getBrand(name)?.id)
            .filter((id): id is string => !!id),
        enqueue: (name, key) => AgendaQueueService.now(name, key),
        report: (category, key) => sails.log.warn('Publication work retained', category, key),
        staging: disk =>
          new PublicationStaging(disk, StorageManagerService.disk(disk), new PublicationStagingFence(db)),
        assertAccess: async (brandId, record, config) => {
          const brand = BrandingService.getBrandById(brandId);
          const user = await firstValueFrom(UsersService.getUserWithUsername(config.processing.serviceUsername));
          if (
            !brand ||
            !user ||
            user.type !== config.processing.serviceUserType ||
            user.type !== 'local' ||
            user.disabled === true ||
            user.loginDisabled === true ||
            user.effectiveLoginDisabled === true ||
            !RecordsService.hasEditAccess(
              brand,
              { ...user },
              (user.roles ?? []).map(role => ({ ...role })),
              record
            )
          )
            throw new Error('Publication service identity does not have current record edit access');
        },
        verifyInputs: async (key, record, source, approval, config) => {
          await new PublicationMigrationStore(db).assertNotQuarantined(key.brandId, key.oid, key.destinationId);
          await verifyPublicationInputs(runtime, key, record, source, approval, config);
        },
        prepareWorkflowTransition: async (record, rule) => {
          const transition = await WorkflowStepsService.preparePublicationTransition(record, rule.targetStage);
          return {
            before: transition.before,
            after: transition.after,
            run: async current => {
              const config = await configuration(String(get(current, 'metaMetadata.brandId')));
              if (!config) throw new Error('Publication brand authority changed');
              await runtime.assertAccess(String(get(current, 'metaMetadata.brandId')), current, config);
              const user = await firstValueFrom(UsersService.getUserWithUsername(config.processing.serviceUsername));
              if (!user) throw new Error('Publication service identity unavailable');
              const response = await RecordsService.updateMetaInternal({
                actor: { kind: 'service', id: 'PublicationService' },
                authorization: { kind: 'record-edit' },
                mutationClass: 'transition',
                operation: 'transition',
                oid: String(current.redboxOid),
                record: current,
                user: { ...user },
                targetStep: transition.step,
                maintenance: true,
              });
              return response.isComplete();
            },
          };
        },
      };
      return runtime;
    }

    private async administrator(
      username: string,
      brandId: string,
      record?: Record<string, unknown>
    ): Promise<PublicationAttribution> {
      const brand = BrandingService.getBrandById(brandId);
      const actor = await firstValueFrom(UsersService.getUserWithUsername(username));
      const roles = actor?.roles ?? [];
      const scoped = roles.filter(role => {
        const branding: unknown = role.branding;
        return (
          (typeof branding === 'string'
            ? branding
            : branding && typeof branding === 'object'
              ? Reflect.get(branding, 'id')
              : undefined) === brandId
        );
      });
      if (
        !brand ||
        !actor ||
        actor.disabled === true ||
        actor.loginDisabled === true ||
        actor.effectiveLoginDisabled === true ||
        !RolesService.getAdminFromRoles(scoped) ||
        (record &&
          !(await RecordsService.hasEditAccess(
            brand,
            { ...actor },
            roles.map(role => ({ ...role })),
            record
          )))
      )
        throw new Error('A current administrator for this brand with record edit access is required');
      return this.attributionSnapshot({ ...actor });
    }

    /** Inventory and one-way cutover share the recovery CLI's current access boundary. @internal */
    public async migrate(options: PublicationMigrationOptions): Promise<unknown> {
      this.ensureConfigured();
      const db: Db = PublicationSync.getDatastore().manager;
      if (Record.getDatastore().manager !== db || !Record.tableName)
        throw new Error('Publication migration and source admission fences require the same datastore');
      return migratePublication(
        {
          db,
          recordCollection: Record.tableName,
          storage: RecordsService.getPublicationStorage(),
          registry: this.providerRegistry,
          administrator: (username, brandId, record) => this.administrator(username, brandId, record),
          legacyConfiguration: async brandId => {
            const brand = BrandingService.getBrandById(brandId);
            if (!brand) throw new Error('Publication migration brand unavailable');
            return migrationJson(AppConfigService.getAppConfigurationForBrand(brand.name));
          },
          recordTypes: async brandId => {
            const brand = BrandingService.getBrandById(brandId);
            if (!brand) throw new Error('Publication migration brand unavailable');
            return (await firstValueFrom(RecordTypesService.getAll(brand))).map(type => migrationJson(type));
          },
          persistConfiguration: async (brandId, config) => {
            const brand = BrandingService.getBrandById(brandId);
            if (!brand) throw new Error('Publication migration brand unavailable');
            await AppConfigService.createOrUpdateConfig(brand, 'publicationPublishing', { ...config });
          },
          verifyConfiguration: async (brandId, config) => {
            const user = await firstValueFrom(UsersService.getUserWithUsername(config.processing.serviceUsername));
            if (!user || user.type !== 'local' || user.disabled || user.loginDisabled || user.effectiveLoginDisabled)
              throw new Error('Migration requires a current local service identity');
            if (!config.processing.stagingDisk) throw new Error('Migration requires durable staging');
            const staging = new PublicationStaging(
              config.processing.stagingDisk,
              StorageManagerService.disk(config.processing.stagingDisk),
              new PublicationStagingFence(db)
            );
            for (const record of await db
              .collection(Record.tableName)
              .find({ 'metaMetadata.brandId': brandId })
              .toArray()) {
              const brand = BrandingService.getBrandById(brandId);
              if (
                !brand ||
                !(await RecordsService.hasEditAccess(
                  brand,
                  { ...user },
                  (user.roles ?? []).map(role => ({ ...role })),
                  record
                ))
              )
                throw new Error('Publication service identity lacks current record edit access');
            }
            // Immutable read-back proves the configured storage path is usable in this process.
            await staging.putJson(brandId, JSON.stringify({ kind: 'publication-migration-v1' }));
            const result: Record<string, string> = {};
            for (const [id, destination] of Object.entries(config.destinations)) {
              if (destination.provider === 'figshare') {
                const resolved = figshareDestinationConfiguration(destination);
                const client = makeLiveClient(resolved, {
                  recordOid: '',
                  brandId,
                  brandName: '',
                  correlationId: randomUUID(),
                  triggerSource: 'migration',
                });
                if (!client.getAccount) throw new Error('Figshare account verification unavailable');
                const account = await client.getAccount();
                if (String(account.id) !== destination.connection.accountId)
                  throw new Error('Figshare migration account identity mismatch');
              } else if (destination.provider === 'oni') await verifyOniRepositoryBackend(destination);
              else throw new Error('Migration target verification requires a supported provider');
              result[id] = this.providerRegistry.get(destination.provider)!.targetFingerprint(destination);
            }
            return result;
          },
        },
        options
      );
    }

    /** Inspect local deployment gates without enabling work or repairing indexes. @internal */
    public async readiness(options: { brandId: string; username: string }): Promise<unknown> {
      await this.administrator(options.username, options.brandId);
      this.ensureConfigured();
      const db: Db = PublicationSync.getDatastore().manager;
      const storage = RecordsService.getPublicationStorage();
      if (!storage || Record.getDatastore().manager !== db || !Record.tableName)
        throw new Error('Publication readiness requires matching source and processing datastores');
      const brand = BrandingService.getBrandById(options.brandId);
      if (!brand) throw new Error('Publication brand unavailable');
      // A corrupt identity/reference is a blocker, never permission to fall back to legacy.
      let context: PublicationConfigurationContext;
      try {
        context = await this.sourceConfigurationContext(options.brandId, storage, false);
      } catch {
        return { ready: false, scope: 'local-readiness', blockers: ['invalid_authority_or_source_evidence'] };
      }
      return publicationReadiness({
        db,
        brandId: options.brandId,
        recordCollection: Record.tableName,
        storage,
        registry: this.providerRegistry,
        configuration: AppConfigService.getAppConfigurationForBrand(brand.name)?.publicationPublishing,
        context,
        serviceAccess: async username => {
          const user = await firstValueFrom(UsersService.getUserWithUsername(username));
          if (!user || user.type !== 'local' || user.disabled || user.loginDisabled || user.effectiveLoginDisabled)
            return false;
          for await (const record of db.collection(Record.tableName).find({ 'metaMetadata.brandId': brand.id }))
            if (
              !(await RecordsService.hasEditAccess(
                brand,
                { ...user },
                (user.roles ?? []).map(role => ({ ...role })),
                record
              ))
            )
              return false;
          return true;
        },
        stagingAvailable: disk => {
          try {
            return Boolean(StorageManagerService.disk(disk));
          } catch {
            return false;
          }
        },
      });
    }

    /** Supported recovery boundary. Every call reloads current brand admin/edit permissions. @internal */
    public async administer(options: PublicationAdminOptions): Promise<unknown> {
      const runtime = this.publicationRuntime(options.apply === true);
      const db: Db = PublicationSync.getDatastore().manager;
      return administerPublication(
        {
          ...runtime,
          db,
          administrator: (username, brandId, record) => this.administrator(username, brandId, record),
          revoke: async (record, approvalId) => {
            const state = publicationState(record);
            const approval = state?.approvals.find(approval => approval.id === approvalId);
            const brand = BrandingService.getBrandById(options.brandId);
            if (!state || !approval || !brand) throw new Error('Publication approval is unavailable');
            const result = await runtime.storage.updateMeta(brand, options.oid, {}, undefined, {
              precondition: { expectedRevision: Number(record.revision ?? 0), requireRevision: true },
              publicationIntent: {
                kind: 'revoke',
                expectedSourceRevision: state.revision,
                saveToken: randomUUID(),
                approvals: [],
                expectedPriorRecordDigest: publicationRecordDigest(record),
                revocations: [{ approvalId, epoch: approval.epoch }],
              },
            });
            if (result.applicationState !== 'applied') throw new Error('Publication source changed during revocation');
          },
        },
        options
      );
    }

    /** Read only after the controller's brand and record-view checks. Never starts provider work. @internal */
    public async getRecordStatus(
      brandId: string,
      oid: string,
      options: { integrationName?: string; destinationId?: string; includeSignals?: boolean } = {}
    ) {
      this.ensureConfigured();
      const storage = RecordsService.getPublicationStorage();
      const record = await storage.getMeta(oid);
      if (!record || record.metaMetadata?.brandId !== brandId) throw new Error('Publication status brand mismatch');
      const state = publicationState({ ...record });
      // Polling reads only the durable ledger. Acceptance/configuration paths own
      // pre-ledger backfill; a record view must never reopen other records' sources.
      const context = await this.sourceConfigurationContext(brandId, storage, 'skip');
      const migrationQuarantineCount = await new PublicationMigrationStore(
        PublicationSync.getDatastore().manager
      ).quarantineCount(brandId, oid, options.destinationId);
      if ((context.authority === 'legacy' || context.authority === undefined) && !state && !migrationQuarantineCount)
        return { shared: false, integrations: [] };
      const brand = BrandingService.getBrandById(brandId);
      let config: import('../configmodels/PublicationPublishing').PublicationPublishingConfigData | undefined;
      try {
        config = brand ? this.getConfiguration(brand.name, { ...context, publicationStorage: storage }) : undefined;
      } catch {
        /* Configuration failure is a status, never permission to use legacy authority. */
      }
      const db: Db = PublicationSync.getDatastore().manager;
      const rows = await new PublicationSyncStore(db).forRecord(brandId, oid);
      const observations: Record<string, import('./publication/contracts').PublicationObservation> = {};
      const configurationErrors: Record<string, string> = {};
      for (const row of rows) {
        if (options.destinationId && options.destinationId !== row.destinationId) continue;
        const provider = this.providerRegistry.get(row.providerId);
        const destination = config?.destinations[row.destinationId];
        try {
          if (provider?.summariseStatus)
            observations[row.destinationId] = provider.summariseStatus(row.providerState, row.providerStateVersion);
          if (
            !provider ||
            !destination ||
            destination.provider !== row.providerId ||
            provider.targetFingerprint(destination) !== row.targetFingerprint
          )
            configurationErrors[row.destinationId] = 'target_identity_changed';
          else if (row.source) {
            const sealed = await reopenPublicationSource(
              brandId,
              row.source,
              new PublicationStaging(
                row.source.disk,
                StorageManagerService.disk(row.source.disk),
                new PublicationStagingFence(db)
              )
            );
            const contract = sealed.adapterContracts[row.destinationId];
            if (
              !contract ||
              contract.contractVersion !== provider.contractVersion ||
              publicationDigest(sealed.materialConfiguration[row.destinationId]) !==
                publicationDigest(
                  publicationMaterialConfiguration({
                    id: row.destinationId,
                    provider,
                    configuration: destination,
                    targetFingerprint: row.targetFingerprint,
                    mappingContextVersion: contract.mappingContextVersion,
                    managedFields: sealed.managedFields[row.destinationId],
                  })
                )
            )
              configurationErrors[row.destinationId] = 'material_configuration_changed';
          }
        } catch {
          configurationErrors[row.destinationId] = 'status_evidence_unavailable';
        }
      }
      const labels =
        config ??
        publicationStatusLabels(
          brand ? AppConfigService.getAppConfigurationForBrand(brand.name)?.publicationPublishing : undefined
        );
      if (!config)
        for (const id of new Set([
          ...Object.keys(state?.intents ?? {}),
          ...(state?.preparationFailures ?? []).map(item => item.destinationId),
        ]))
          configurationErrors[id] = 'configuration_unavailable';
      const effectiveLabels = config ? await new PublicationAdminControl(db).overlay(brandId, config) : labels;
      const integrations = publicationLiveSummaries(state, rows, effectiveLabels, {
        ...options,
        observations,
        configurationErrors,
      });
      return {
        shared: true,
        integrations,
        ...(options.includeSignals
          ? {
              signals: {
                ...publicationOperationalSignals(state, rows, integrations),
                migrationQuarantineCount,
              },
            }
          : {}),
      };
    }

    /** Import scan-visible source obligations and redeliver due destination work. @internal */
    public async dispatch(): Promise<void> {
      await dispatchPublications(this.publicationRuntime());
    }

    /** Execute identifier-only jobs under current stored approval and destination ownership. @internal */
    public async executeRecord(job: PublicationJob): Promise<void> {
      await runPublicationWorker(this.publicationRuntime(), job);
    }

    /** Reclaim only unreferenced managed staging objects while processing is enabled. @internal */
    public async cleanupStaging(): Promise<void> {
      const runtime = this.publicationRuntime();
      const db: Db = PublicationSync.getDatastore().manager;
      if (Record.getDatastore().manager !== db)
        throw new Error('Publication source and staging reference fences must share a datastore; inputs retained');
      const cleanupRuntime = {
        ...runtime,
        db,
        sourceCollections: { active: Record.tableName, deleted: DeletedRecord.tableName },
      };
      await cleanupPublicationAttachments({
        ...cleanupRuntime,
        removeOriginal: async (brandId, original) => {
          const serviceName = sails.config.record.datastreamService;
          const candidate: unknown = serviceName ? sails.services[serviceName] : undefined;
          if (
            !candidate ||
            typeof candidate !== 'object' ||
            !['listDatastreams', 'getDatastream', 'removeDatastream'].every(
              method => typeof Reflect.get(candidate, method) === 'function'
            )
          )
            throw new Error('Publication attachment cleanup requires the configured datastream service');
          const datastream = candidate as Pick<
            DatastreamService,
            'listDatastreams' | 'getDatastream' | 'removeDatastream'
          >;
          const files = await datastream.listDatastreams(original.oid, original.fileId);
          if (!files.length) return; // A prior fenced deletion may have finished before its acknowledgement.
          const content = await datastream.getDatastream(original.oid, original.fileId);
          if (!(content.readstream instanceof Readable)) throw new Error('Original attachment stream is unavailable');
          const hash = createHash('sha256');
          for await (const chunk of content.readstream) hash.update(chunk);
          if (hash.digest('hex') !== original.digest) throw new Error('Original attachment changed; bytes retained');
          await datastream.removeDatastream(original.oid, new Datastream({ fileId: original.fileId }), brandId);
          if ((await datastream.listDatastreams(original.oid, original.fileId)).length)
            throw new Error('Original attachment deletion is unconfirmed');
        },
      });
      await cleanupPublicationStaging(cleanupRuntime);
    }

    /** Legacy scanners must never recover, import or dispatch rows owned by shared processing. @internal */
    public async hasSharedAuthority(brandId: string): Promise<boolean> {
      const context = await new PublicationMigrationStore(PublicationSync.getDatastore().manager).context(brandId);
      if (context.authority === 'preparing') throw new Error('Publication cutover is in progress');
      return context.authority === 'shared';
    }

    /** Legacy mutation guards also fence cross-brand members of migration writer conflicts. @internal */
    public async assertLegacyPublicationAllowed(brandId: string, oid: string): Promise<void> {
      const record = await RecordsService.getPublicationStorage().getMeta(oid);
      if (!record || record.metaMetadata?.brandId !== brandId)
        throw new Error('Legacy publication record brand mismatch');
      if (await this.hasSharedAuthority(brandId))
        throw new Error('Shared publication authority fences legacy mutation');
      const db: Db = PublicationSync.getDatastore().manager;
      if (await new PublicationMigrationStore(db).quarantineCount(brandId, oid))
        throw new Error('Migration writer quarantine fences legacy mutation');
    }

    /** Resolve old jobs from migration evidence. Job users/article IDs/destination IDs cannot choose authority. @internal */
    public async forwardLegacyProviderJob(
      providerId: string,
      oid: string,
      brandId?: string,
      execute = false
    ): Promise<boolean> {
      const storage = RecordsService.getPublicationStorage();
      const record = await storage.getMeta(oid);
      if (!record) return false;
      const actualBrand = record.metaMetadata.brandId;
      if (brandId && brandId !== actualBrand) throw new Error('Legacy publication job brand mismatch');
      const context = await this.sourceConfigurationContext(actualBrand, storage);
      if (context.authority === 'preparing') throw new Error('Publication cutover is in progress');
      if (context.authority !== 'shared') {
        await this.assertLegacyPublicationAllowed(actualBrand, oid);
        if (record.publicationSource) throw new Error('Protected publication source requires shared authority');
        return false;
      }
      const brand = BrandingService.getBrandById(actualBrand);
      if (!brand) throw new Error('Publication brand is unavailable');
      const config = this.getConfiguration(brand.name, { ...context, publicationStorage: storage });
      const assigned = context.legacyDestinations?.[providerId];
      if (!config || assigned?.length !== 1 || config.destinations[assigned[0]]?.provider !== providerId)
        throw new Error(
          'Legacy publication destination assignment is missing or ambiguous; migration repair is required'
        );
      const key = { brandId: actualBrand, oid, destinationId: assigned[0] };
      if (execute) {
        await importPublicationIntents(this.publicationRuntime(), record);
        await this.executeRecord({ attrs: { data: key } });
      } else await this.wakeRecord(actualBrand, oid);
      return true;
    }

    /** Resolve durable cutover, used-target and verified-target evidence; never accept authority from hook JSON. @internal */
    protected async sourceConfigurationContext(
      brandId: string,
      storage: StorageService | undefined,
      prepareLedger: boolean | 'skip' = true
    ): Promise<PublicationConfigurationContext> {
      const db: Db = PublicationSync.getDatastore().manager;
      const context = await new PublicationMigrationStore(db).context(brandId);
      const store = new PublicationSyncStore(db);
      const used = await store.usedDestinations(brandId);
      for (const [id, identity] of Object.entries(context.usedDestinations ?? {})) {
        if (
          used[id] &&
          (used[id].providerId !== identity.providerId || used[id].targetFingerprint !== identity.targetFingerprint)
        )
          throw new Error('Conflicting durable publication destination identities');
      }
      const backfill = async (reserve: boolean) => {
        const collections = [
          { name: Record.tableName, prefix: '' },
          { name: DeletedRecord.tableName, prefix: 'deletedRecordMetadata.' },
        ];
        for (const { name, prefix } of collections) {
          for await (const record of db.collection(name).find(
            {
              [`${prefix}metaMetadata.brandId`]: brandId,
              [`${prefix}publicationSource.approvals.0`]: { $exists: true },
            },
            { projection: { [`${prefix}publicationSource`]: 1 }, batchSize: 20 }
          )) {
            const state = publicationState(prefix ? record.deletedRecordMetadata : record);
            for (const approval of state?.approvals ?? []) {
              const sealed = await reopenPublicationSource(
                brandId,
                approval.source,
                new PublicationStaging(
                  approval.source.disk,
                  StorageManagerService.disk(approval.source.disk),
                  new PublicationStagingFence(db)
                )
              );
              for (const id of approval.destinationIds) {
                const target = approval.targetFingerprints[id];
                const providerId = sealed.adapterContracts[id]?.providerId;
                if (!target || !providerId) throw new Error('Durable publication destination identity is incomplete');
                if (
                  (used[id] && (used[id].targetFingerprint !== target || used[id].providerId !== providerId)) ||
                  (context.usedDestinations?.[id] &&
                    (context.usedDestinations[id].targetFingerprint !== target ||
                      context.usedDestinations[id].providerId !== providerId))
                )
                  throw new Error('Conflicting durable publication destination identities');
                if (reserve) await store.reserveDestination(brandId, id, providerId, target);
                used[id] = { providerId, targetFingerprint: target };
              }
            }
          }
        }
        if (reserve)
          for (const [id, identity] of Object.entries(context.usedDestinations ?? {}))
            await store.reserveDestination(brandId, id, identity.providerId, identity.targetFingerprint);
      };
      if (!(await store.destinationLedgerReady(brandId)) && prepareLedger !== 'skip') {
        if (prepareLedger) await store.prepareDestinationLedger(brandId, () => backfill(true));
        else await backfill(false);
      }
      // Include reservations accepted by another save/backfill while this context was being read.
      for (const [id, identity] of Object.entries(await store.usedDestinations(brandId))) {
        const prior = used[id] ?? context.usedDestinations?.[id];
        if (
          prior &&
          (prior.providerId !== identity.providerId || prior.targetFingerprint !== identity.targetFingerprint)
        )
          throw new Error('Conflicting durable publication destination identities');
        used[id] = identity;
      }
      return { ...context, publicationStorage: storage, usedDestinations: { ...context.usedDestinations, ...used } };
    }

    private attributionSnapshot(user: Record<string, unknown>): PublicationAttribution {
      if (typeof user.username !== 'string' || !user.username || typeof user.type !== 'string' || !user.type)
        throw new Error('Publication actor identity is unavailable');
      return {
        username: user.username,
        userType: user.type,
        ...(typeof user.name === 'string' && user.name ? { displayName: user.name } : {}),
      };
    }

    private async sourceRuntime(
      record: Record<string, unknown>,
      user: Record<string, unknown>,
      storage: StorageService
    ): Promise<PublicationSourceRuntime | undefined> {
      this.ensureConfigured();
      const brandId = String(get(record, 'metaMetadata.brandId') ?? '');
      const brand = BrandingService.getBrandById(brandId);
      if (!brand) throw new Error('Publication brand is unavailable');
      const context = await this.sourceConfigurationContext(brandId, storage);
      const configuration = this.getConfiguration(brand.name, {
        ...context,
        publicationStorage: storage,
        deferInvalidProviderConfiguration: true,
      });
      if (!configuration) {
        if (record.publicationSource !== undefined)
          throw new Error('Protected publication source requires shared brand authority');
        return undefined;
      }
      assertFullPublicationStorageCapability(storage);
      const actorUsername = typeof user.username === 'string' ? user.username : '';
      let actor: PublicationAttribution | undefined;
      return {
        configuration,
        refresh: async () => {
          const current = await this.sourceRuntime(record, user, storage);
          if (!current) throw new Error('Publication brand authority changed during the save');
          return current;
        },
        assertGrantAccess: async (candidate, requester) => {
          if (
            !actorUsername ||
            requester.username !== actorUsername ||
            requester.disabled === true ||
            requester.loginDisabled === true ||
            requester.effectiveLoginDisabled === true ||
            !RecordsService.hasEditAccess(
              brand,
              requester,
              Array.isArray(requester.roles) ? requester.roles : [],
              candidate
            )
          )
            throw new Error('Publication requester does not have record edit access');
          const current = await firstValueFrom(UsersService.getUserWithUsername(actorUsername));
          if (
            !current ||
            current.disabled === true ||
            current.loginDisabled === true ||
            current.effectiveLoginDisabled === true ||
            (requester.type !== undefined && requester.type !== current.type) ||
            !RecordsService.hasEditAccess(
              brand,
              { ...current },
              (current.roles ?? []).map(role => ({ ...role })),
              candidate
            )
          )
            throw new Error('Publication requester does not have current record edit access');
          actor = this.attributionSnapshot({ ...current });
        },
        attribution: async () => {
          if (!actor) throw new Error('Publication grant actor has not been verified');
          return { requester: actor, approver: actor };
        },
        creator: async candidate => {
          const username = get(candidate, 'metaMetadata.createdBy');
          if (typeof username !== 'string' || !username) return undefined;
          if (username === actor?.username) return actor;
          const creator = await firstValueFrom(UsersService.getUserWithUsername(username));
          return creator ? this.attributionSnapshot({ ...creator }) : { username, userType: 'historical' };
        },
        assertContinuationAccess: async candidate => {
          const service = await firstValueFrom(
            UsersService.getUserWithUsername(configuration.processing.serviceUsername)
          );
          if (
            !service ||
            service.disabled === true ||
            service.loginDisabled === true ||
            service.effectiveLoginDisabled === true ||
            service.type !== configuration.processing.serviceUserType ||
            !RecordsService.hasEditAccess(
              brand,
              { ...service },
              (service.roles ?? []).map(role => ({ ...role })),
              candidate
            )
          )
            throw new Error('Publication service identity does not have current record edit access');
        },
        prepare: async (candidate, policy, sourceRevision, generated) => {
          if (!actor) throw new Error('Publication grant actor has not been verified');
          const disk = configuration.processing.stagingDisk;
          if (!disk) throw new Error('Configure a durable publication staging disk');
          const db: Db = PublicationSync.getDatastore().manager;
          const staging = new PublicationStaging(
            disk,
            StorageManagerService.disk(disk),
            new PublicationStagingFence(db)
          );
          const input: PublicationPreparationInput = {
            brandId,
            oid: String(candidate.redboxOid),
            requestId: randomUUID(),
            sourceRevision,
            record: publicationContentRecord(candidate) as PublicationObject,
            maintenancePaths: [],
            generatedValues: allocatePublicationGeneratedValues(generated),
            relatedInputs: {
              'publication:outputs': publicationOutputSnapshot(
                brandId,
                registeredPublicationOutputs(this.providerRegistry, configuration, policy.destinations)
              ),
            },
            attachments: [],
            destinations: [],
            resolveCrosswalk: async () => {
              throw new Error('Provider must supply approved crosswalk resolution');
            },
          };
          const resolvers: PublicationPreparationInput['resolveCrosswalk'][] = [];
          for (const id of policy.destinations) {
            await new PublicationMigrationStore(PublicationSync.getDatastore().manager).assertNotQuarantined(
              brandId,
              input.oid,
              id
            );
            const destination = configuration.destinations[id];
            const provider = this.providerRegistry.get(destination.provider);
            if (!provider?.prepareSource) throw new Error('Publication source adapter is unavailable');
            const providerInput = {
              brandId,
              oid: input.oid,
              destinationId: id,
              configuration: destination,
              record: input.record,
              requester: actor,
              approver: actor,
              generatedValues: input.generatedValues,
            };
            const before = publicationDigest(input.record);
            const result = await provider.prepareSource(providerInput);
            if (!result.valid) throw new Error('Publication provider local validation failed');
            const dependencies = provider.describeSource
              ? await provider.describeSource(providerInput, result.value)
              : undefined;
            if (publicationDigest(input.record) !== before)
              throw new Error('Publication adapter changed source inputs during preparation');
            if (!dependencies && Object.keys(destination.attachments).length)
              throw new Error('Publication adapter must identify selected attachment bytes');
            input.relatedInputs[`${id}:prepared`] = {
              brandId,
              id,
              version: publicationDigest(result.value),
              value: result.value,
            };
            const selection = {
              attachments: (dependencies?.attachments ?? []).map(({ id, logicalPath }) => ({ id, logicalPath })),
            };
            input.relatedInputs[`${id}:selection`] = {
              brandId,
              id,
              version: publicationDigest(selection),
              value: selection,
            };
            if (dependencies) {
              for (const [name, snapshot] of Object.entries(dependencies.relatedInputs)) {
                if (['prepared', 'selection'].includes(name)) throw new Error('Reserved publication dependency name');
                input.relatedInputs[`${id}:${name}`] = snapshot;
              }
              for (const attachment of dependencies.attachments) {
                const shared = input.attachments.find(
                  item => item.id === attachment.id && item.logicalPath === attachment.logicalPath
                );
                if (shared) {
                  const identities = await Promise.all([shared.inspect(), attachment.inspect()]);
                  const identity = (value: (typeof identities)[number]) => [
                    value.size,
                    value.digest ?? null,
                    value.immutableVersion ?? null,
                    value.changeToken ?? null,
                  ];
                  if (publicationDigest(identity(identities[0])) !== publicationDigest(identity(identities[1])))
                    throw new Error('Publication destinations selected different bytes for one attachment');
                  if (attachment.original) shared.original = attachment.original;
                } else input.attachments.push(attachment);
              }
              resolvers.push(dependencies.resolveCrosswalk);
            }
            input.destinations.push({
              id,
              provider,
              configuration: destination,
              targetFingerprint: provider.targetFingerprint(destination),
              mappingContextVersion: dependencies?.mappingContextVersion ?? 1,
              managedFields: dependencies?.managedFields ?? [],
            });
          }
          input.resolveCrosswalk = async request => {
            const resolved = await Promise.all(resolvers.map(resolve => resolve(request)));
            if (!resolved.length || resolved.some(value => publicationDigest(value) !== publicationDigest(resolved[0])))
              throw new Error('Publication crosswalk resolution is missing or inconsistent');
            return resolved[0];
          };
          const sealed = await sealPublicationSource(input, staging);
          const store = new PublicationSyncStore(db);
          for (const destination of input.destinations)
            await store.reserveDestination(
              brandId,
              destination.id,
              destination.provider.id,
              destination.targetFingerprint
            );
          return sealed;
        },
      };
    }

    /** Prepare server-observed save events. Session capabilities cannot be supplied through JSON. @internal */
    public async prepareSourceRequest(
      session: PublicationSaveSession,
      record: Record<string, unknown>,
      original: Record<string, unknown> | undefined,
      events: string[],
      user: Record<string, unknown>,
      storage: StorageService
    ) {
      assertPublicationSaveSession(session);
      const runtime = await this.sourceRuntime(original ?? record, user, storage);
      if (!runtime) return undefined;
      return preparePublicationSave({
        session,
        runtime,
        record,
        original,
        events,
        user,
        brandId: String(get(record, 'metaMetadata.brandId')),
        oid: String(record.redboxOid),
      });
    }

    /**
     * Participate in a trusted containing save; configured events and policies determine source authority.
     * @param oid - Existing record identity, or null during creation.
     * @param record - Record passed along the synchronous hook chain.
     * @param _options - Ordinary hook options; these cannot grant authority.
     * @param _user - Ordinary hook actor; the host uses its verified save-session actor.
     * @returns The record for hook chaining, before remote completion.
     * @public
     */
    public async acceptRequest(
      oid: string | null,
      record: Record<string, unknown>,
      _options: unknown,
      _user: unknown
    ): Promise<Record<string, unknown>> {
      const context = publicationHookContext.getStore();
      if (!context) throw new Error('Publication approval hooks require a containing record save');
      assertPublicationSaveSession(context.session);
      if (oid && record.redboxOid && oid !== record.redboxOid)
        throw new Error('Publication hook record identity changed');
      return record;
    }

    /** Identifier-only best-effort dispatch wake-up; durable ready state remains authoritative. @internal */
    public async wakeRecord(brandId: string, oid: string): Promise<void> {
      const storage = RecordsService.getPublicationStorage();
      assertFullPublicationStorageCapability(storage);
      const record = await storage.getMeta(oid);
      if (!record || record.metaMetadata?.brandId !== brandId) throw new Error('Publication wake-up brand mismatch');
      if (typeof AgendaQueueService === 'undefined') throw new Error('Publication queue is unavailable');
      await AgendaQueueService.now('Publication-Dispatch', { brandId, oid });
    }

    /** Provider compatibility entry point. Returns false only for an unmigrated brand. @internal */
    public async acceptProviderRequest(
      providerId: string,
      entryPoint: string,
      oid: string | null,
      record: Record<string, unknown>,
      _options: unknown,
      user: unknown
    ): Promise<boolean> {
      const storage = RecordsService.getPublicationStorage();
      const context = publicationHookContext.getStore();
      const actor =
        context?.session.user ?? (user && typeof user === 'object' ? (user as Record<string, unknown>) : {});
      // Resolve standalone authority from storage before deciding whether legacy fallback is allowed.
      // A caller-supplied brand must never route an already migrated OID through a legacy provider.
      const committed = !context && oid ? await storage.getMeta(oid) : undefined;
      if (!context && oid && (!committed || committed.metaMetadata?.brandId !== get(record, 'metaMetadata.brandId')))
        throw new Error('Publication committed record brand mismatch');
      const runtime = await this.sourceRuntime(committed ? { ...committed } : record, actor, storage);
      if (!runtime) return false;
      if (context) {
        assertPublicationSaveSession(context.session);
        if (
          !runtime.configuration.sourcePolicies.some(
            policy =>
              [context.event, entryPoint].includes(policy.event) &&
              policy.destinations.some(id => runtime.configuration.destinations[id]?.provider === providerId)
          )
        )
          throw new Error('Provider hook has no configured publication source policy');
        if (!context.session.events.includes(entryPoint)) context.session.events.push(entryPoint);
        return true;
      }
      if (!oid) throw new Error('Standalone publication requires a committed record');
      if (!committed || committed.metaMetadata?.brandId !== get(record, 'metaMetadata.brandId'))
        throw new Error('Publication committed record is unavailable');
      const snapshot: Record<string, unknown> = { ...committed };
      const currentRuntime = await this.sourceRuntime(snapshot, actor, storage);
      if (!currentRuntime) throw new Error('Publication authority changed');
      const policies = currentRuntime.configuration.sourcePolicies.filter(
        policy =>
          policy.event === entryPoint &&
          policy.destinations.every(id => currentRuntime.configuration.destinations[id]?.provider === providerId)
      );
      if (!policies.length) throw new Error('Standalone provider call has no configured publication source policy');
      const session = createPublicationSaveSession();
      const prepared = await preparePublicationSave({
        session,
        runtime: currentRuntime,
        record: snapshot,
        original: snapshot,
        events: [entryPoint],
        user: actor,
        brandId: committed.metaMetadata.brandId,
        oid,
        policyIds: policies.map(policy => policy.id),
      });
      // Standalone calls have no containing tracker. Re-check dependency/configuration
      // snapshots locally before the exact committed-record CAS accepts any authority.
      const refreshed = await currentRuntime.refresh();
      assertPublicationSavePolicies(prepared, refreshed);
      const revalidated = await preparePublicationSave({
        session,
        runtime: refreshed,
        record: snapshot,
        original: snapshot,
        events: [entryPoint],
        user: actor,
        brandId: prepared.brandId,
        oid,
        policyIds: policies.map(policy => policy.id),
      });
      if (
        publicationDigest(Object.keys(prepared.sealed).sort()) !==
          publicationDigest(Object.keys(revalidated.sealed).sort()) ||
        Object.entries(prepared.sealed).some(
          ([key, source]) =>
            publicationPreparationDigest(source) !== publicationPreparationDigest(revalidated.sealed[key])
        )
      )
        throw new Error('Publication dependencies or configuration changed before acceptance');
      const response = await storage.updateMeta(
        BrandingService.getBrandById(prepared.brandId),
        oid,
        cloneDeep(committed),
        actor,
        {
          publicationIntent: prepared.intent,
          precondition: { expectedRevision: committed.revision ?? 0, requireRevision: true },
        }
      );
      if (response.applicationState !== 'applied') throw new Error('Publication source changed before acceptance');
      if (!prepared.intent.approvals.length) {
        session.closed = true;
        return true;
      }
      const fresh = await storage.getMeta(oid);
      if (
        !fresh ||
        !(await storage.recordPublicationSaveSuccess!(prepared.brandId, oid, prepared.intent.saveToken, {
          evidenceId: session.id,
          sourceRevision: publicationState({ ...fresh })!.revision,
          recordDigest: publicationRecordDigest({ ...fresh }),
        })) ||
        !(await storage.readyPublicationIntent!(prepared.brandId, oid, prepared.intent.saveToken))
      )
        throw new Error('Publication acceptance could not be confirmed');
      session.closed = true;
      void this.wakeRecord(prepared.brandId, oid).catch(() =>
        sails.log.warn('Publication wake-up failed; durable scan will recover')
      );
      return true;
    }

    /**
     * Register built-in and hook adapters before bootstrap freezes provider IDs.
     * @extensionPoint Override in a hook subclass and call super.configureProviders before registering additions.
     */
    protected configureProviders(): void {
      for (const definition of BUILTIN_PUBLICATION_DEFINITIONS) {
        if (definition.id === 'figshare')
          this.registerProvider(createFigsharePublicationProvider(() => FigshareService.publicationAdapterHooks()));
        else if (definition.id === 'oni')
          this.registerProvider(createOniPublicationProvider(() => OniService.publicationAdapterHooks()));
        else this.providerRegistry.registerDefinition(definition);
      }
    }

    /**
     * Register an adapter during configureProviders, before bootstrap freezes IDs.
     * @extensionPoint Call from the hook subclass after super.configureProviders(); never mutate the registry directly.
     * @param provider - Validated provider definition and executable lifecycle with versioned state.
     */
    protected registerProvider<
      Config extends PublicationObject,
      State extends PublicationObject,
      Prepared extends PublicationObject,
    >(provider: PublicationProvider<Config, State, Prepared>): void {
      this.providerRegistry.register(provider);
    }

    /** Register provider metadata once and freeze the registry without starting work. @internal */
    public bootstrap(): void {
      this.ensureConfigured();
    }

    private ensureConfigured(): void {
      if (this.configured) return;
      this.configureProviders();
      this.providerRegistry.freeze();
      const providers = this.providerRegistry.list();
      ConfigModels.register('publicationPublishing', {
        modelName: 'PublicationPublishing',
        title: 'Publication Publishing',
        class: PublicationPublishing,
        schema: {
          ...PUBLICATION_PUBLISHING_SCHEMA,
          properties: {
            ...(isPublicationObject(PUBLICATION_PUBLISHING_SCHEMA.properties)
              ? PUBLICATION_PUBLISHING_SCHEMA.properties
              : {}),
            destinations: {
              type: 'object',
              widget: {
                formlyConfig: {
                  type: 'publication-destinations',
                  props: {
                    providers: providers.map(provider => ({
                      id: provider.id,
                      schema: provider.configurationSchema,
                      secretPaths: [...provider.secretPaths],
                      capabilities: provider.capabilities,
                      executionAvailable: provider.executionAvailable,
                    })),
                  },
                },
              },
              propertyNames: { pattern: '^[a-z][a-z0-9-]{0,63}$' },
              additionalProperties: {
                ...PUBLICATION_DESTINATION_SCHEMA,
                properties: {
                  ...(isPublicationObject(PUBLICATION_DESTINATION_SCHEMA.properties)
                    ? PUBLICATION_DESTINATION_SCHEMA.properties
                    : {}),
                  provider: { type: 'string', enum: providers.map(provider => provider.id) },
                },
                allOf: providers.map(provider => ({
                  if: { properties: { provider: { const: provider.id } }, required: ['provider'] },
                  then: provider.configurationSchema,
                })),
              },
            },
          },
        },
        secretFields: [
          ...new Set(providers.flatMap(provider => provider.secretPaths.map(path => `destinations.*.${path}`))),
        ],
      });
      this.configured = true;
    }

    /**
     * Validate a server-owned AppConfig save while retaining existing fixed targets.
     * @internal
     * @param brandId - Brand owning durable destination and authority evidence.
     * @param value - Candidate configuration after backend-owned secret hydration.
     * @param _existing - Previous masked configuration; editable JSON does not prove destination usage.
     * @returns Validated configuration, or rejects before persistence on invalid input.
     */
    public async validateConfigurationForSave(brandId: string, value: unknown, _existing: unknown) {
      this.ensureConfigured();
      const context = await this.sourceConfigurationContext(
        brandId,
        typeof RecordsService !== 'undefined' && typeof RecordsService.getPublicationStorage === 'function'
          ? RecordsService.getPublicationStorage()
          : undefined
      );
      const used = context.usedDestinations ?? {};
      const result = this.validateConfiguration(value, { ...context, usedDestinations: used });
      if (!result.valid)
        throw new Error(
          `Invalid publicationPublishing configuration: ${result.issues.map(issue => `${issue.path}: ${issue.code}`).join(', ')}`
        );
      return result.value;
    }

    /**
     * Describe registered providers without returning credentials or runtime adapters.
     * @returns Provider IDs, versions, capabilities and execution availability.
     */
    public getProviders() {
      this.ensureConfigured();
      return this.providerRegistry.list().map(provider => ({
        id: provider.id,
        contractVersion: provider.contractVersion,
        stateVersion: provider.stateVersion,
        executionAvailable: provider.executionAvailable,
        capabilities: provider.capabilities,
      }));
    }

    /**
     * Validate configuration locally without granting source authorisation.
     * @param value - Untrusted configuration JSON to validate and normalize.
     * @param context - Backend-owned capability, authority and fixed-target evidence.
     * @returns Validated configuration or safe structured validation issues.
     * @public
     */
    public validateConfiguration(value: unknown, context: PublicationConfigurationContext = {}) {
      this.ensureConfigured();
      return validatePublicationConfiguration(value, this.providerRegistry, context);
    }

    /**
     * Resolve authoritative unified configuration from the branding-aware cache.
     * @internal
     * @param brandName - Name used by AppConfig to scope the branding cache.
     * @param context - Backend-owned authority and capability evidence.
     * @returns Validated shared configuration, or undefined for legacy authority.
     * @public
     */
    public getConfiguration(brandName: string, context: PublicationConfigurationContext) {
      this.ensureConfigured();
      const configuration = AppConfigService.getAppConfigurationForBrand(brandName);
      return resolvePublicationConfiguration(configuration, this.providerRegistry, context);
    }
  }
}

declare global {
  const PublicationService: Services.Publication;
}
