import { workerClient } from '../services/figshare-v2/execution';
import type { FigshareInput } from './figshare/input';
import { metTriggerCondition } from '../utilities/metTriggerCondition';
import { getSyncState, setSyncState } from './figshare/config';
import { preparePublication as preparePublicationPlan } from '../services/figshare-v2/plan';
import { publishIfNeededPhase } from '../services/figshare-v2/publish';
import { writeBackPhase } from '../services/figshare-v2/writeback';
import {
  isCurationLocked as isArticleCurationLocked,
  ensureNoFileUploadInProgress as ensureNoUploadsInProgress,
} from './figshare/runtime';
import { makeFixtureClient, makeLiveClient } from '../services/figshare-v2/http';
import {
  RecordModel,
  UserModel,
  FigshareArticle,
  FigsharePublicationPlan,
  FigsharePublishResult,
  FigshareSyncState,
  FigshareJob,
  AssetSyncResult,
} from '../services/figshare-v2/types';

export namespace Services {
  export class FigshareService {

    public init(): void {}
    constructor(protected readonly input: FigshareInput) {}
    protected metTriggerCondition(...args: Parameters<typeof metTriggerCondition>): string {
      return metTriggerCondition(...args);
    }
    public drain(): Promise<void> {
      return this.input.drain();
    }
    public close(): Promise<void> {
      return this.input.close();
    }

    private hasConfiguredTriggerCondition(options: Record<string, unknown>): boolean {
      return typeof options?.triggerCondition === 'string' && options.triggerCondition.length > 0;
    }

    private shouldRunFigshareLifecycleSync(
      oid: string | null,
      record: RecordModel,
      options: Record<string, unknown>,
      user: unknown
    ): boolean {
      if (!this.hasConfiguredTriggerCondition(options) && !Boolean(options?.forceRun)) {
        return true;
      }
      return this.metTriggerCondition(oid, record, options, user) === 'true';
    }

    private assertConfig(
      record: RecordModel,
      operation: string
    ): NonNullable<ReturnType<FigshareInput['configuration']>> {
      const config = this.getConfig(record);
      if (config == null) {
        throw new Error(`Figshare config is not enabled for operation '${operation}'`);
      }
      return config;
    }

    public getConfig(record?: RecordModel) {
      return this.input.configuration(record);
    }

    public getSyncState(
      config: NonNullable<ReturnType<FigshareInput['configuration']>>,
      record: RecordModel
    ): FigshareSyncState {
      return getSyncState(config, record);
    }

    public setSyncState(
      config: NonNullable<ReturnType<FigshareInput['configuration']>>,
      record: RecordModel,
      syncState: FigshareSyncState
    ): void {
      setSyncState(config, record, syncState);
    }

    public validateHandlebarsTemplate(template: string): void {
      this.input.bindings.validateHandlebarsTemplate(template);
    }

    public async buildMetadataPayload(
      config: NonNullable<ReturnType<FigshareInput['configuration']>>,
      record: RecordModel
    ): Promise<Record<string, unknown>> {
      return this.input.runtime.runBuildMetadataPayload(config, record);
    }

    public makeClient(
      config: NonNullable<ReturnType<FigshareInput['configuration']>>,
      record: RecordModel,
      jobId?: string,
      triggerSource: string = 'manual'
    ) {
      const runContext = this.input.context(record, config, jobId, triggerSource);
      return workerClient(
        config.runtime.mode === 'fixture'
          ? makeFixtureClient(config)
          : makeLiveClient(config, runContext, this.input.log)
      );
    }

    public preparePublication(record: RecordModel, jobId?: string): FigsharePublicationPlan {
      const config = this.getConfig(record);
      const rm = record as RecordModel;
      if (config == null) {
        return { action: 'skip', sameJob: false, syncState: { status: 'idle' } };
      }

      const runContext = this.input.context(record, config, jobId);
      const existingState = this.getSyncState(config, rm);
      return preparePublicationPlan(config, rm, existingState, runContext.correlationId);
    }

    public async syncMetadata(record: RecordModel, plan?: FigsharePublicationPlan): Promise<FigshareArticle> {
      const config = this.assertConfig(record, 'syncMetadata');
      const rm = record as RecordModel;

      const publicationPlan = plan ?? this.preparePublication(rm);
      // The runtime program handles the curation lock and upload-in-progress checks.
      const runContext = this.input.context(rm, config, publicationPlan.syncState.correlationId, 'syncMetadata');
      return this.input.runtime.runSyncMetadataProgram(config, runContext, rm, publicationPlan);
    }

    public async syncAssets(
      record: RecordModel,
      article: FigshareArticle
    ): Promise<AssetSyncResult & Record<string, unknown>> {
      const config = this.assertConfig(record, 'syncAssets');
      const rm = record as RecordModel;

      const syncState = this.getSyncState(config, rm);
      const client = this.makeClient(config, rm, syncState.correlationId, 'syncAssets');
      return this.input.assets.syncAssetsPhase(client, config, rm, article, syncState, this.input.log);
    }

    public async syncEmbargo(record: RecordModel, articleId: string): Promise<Record<string, unknown>> {
      const config = this.assertConfig(record, 'syncEmbargo');
      const rm = record as RecordModel;

      const client = this.makeClient(config, rm, undefined, 'syncEmbargo');
      return this.input.embargo.syncEmbargoPhase(client, config, rm, articleId);
    }

    public async publishIfNeeded(record: RecordModel, articleId: string): Promise<FigsharePublishResult> {
      const config = this.assertConfig(record, 'publishIfNeeded');
      const rm = record as RecordModel;

      const client = this.makeClient(config, rm, undefined, 'publishIfNeeded');
      return publishIfNeededPhase(client, config, rm, articleId, this.getSyncState(config, rm));
    }

    public writeBack(
      record: RecordModel,
      article: FigshareArticle,
      publishResult?: FigsharePublishResult,
      assetSyncResult?: Record<string, unknown>
    ): RecordModel {
      const config = this.getConfig(record);
      if (config == null) {
        return record;
      }
      return writeBackPhase(config, record, article, publishResult, assetSyncResult as AssetSyncResult | undefined);
    }

    // Thin delegates to the figshare-v2 runtime helpers (single implementation lives
    // there, shared with the Effect programs). Kept as instance methods so callers and
    // tests retain a stub seam on the service.

    private isCurationLocked(record: RecordModel, article: FigshareArticle): boolean {
      const config = this.getConfig(record);
      if (config == null) {
        return false;
      }
      return isArticleCurationLocked(config, article);
    }

    private async ensureNoFileUploadInProgress(
      config: NonNullable<ReturnType<FigshareInput['configuration']>>,
      record: RecordModel,
      articleId: string
    ): Promise<void> {
      const client = this.makeClient(config, record, undefined, 'ensureNoFileUploadInProgress');
      await ensureNoUploadsInProgress(client, articleId);
    }

    private readonly warnedDisabledBrands = new Set<string>();
    private warnDisabledProcessing(record: RecordModel): void {
      const config = this.input.configuration(record, { requireToken: false });
      const brand = this.input.brandName(record);
      if (!config || config.processing?.enabled || this.warnedDisabledBrands.has(brand)) return;
      this.warnedDisabledBrands.add(brand);
      this.input.log.warn(
        `Figshare legacy hook for brand ${brand} cannot synchronise articles while figsharePublishing.processing.enabled is false; enable queued processing after completing the migration checks.`
      );
    }

    private readonly warnedAliases = new Set<string>();
    private deprecate(name: string, replacement: string): void {
      if (this.warnedAliases.has(name)) return;
      this.warnedAliases.add(name);
      this.input.log.warn(`Figshare ${name} is deprecated; configure ${replacement}.`);
    }

    public async validateFigshareRecord(
      oid: string | null,
      record: RecordModel,
      options: Record<string, unknown> = {},
      user?: unknown
    ): Promise<RecordModel> {
      if (!this.shouldRunFigshareLifecycleSync(oid, record, options, user)) return record;
      const config = this.input.configuration(record, { requireToken: false });
      if (!config) return record;
      // Bindings and local validation only. Account/license network lookup belongs to the worker.
      await this.input.mapping.buildMetadataPayload(config, record);
      return record;
    }

    public wakeFigshareRecord(oid: string, record?: RecordModel): Promise<RecordModel | undefined> {
      return this.input.work(() => this.wakeAccepted(oid, record));
    }
    private async wakeAccepted(oid: string, record?: RecordModel): Promise<RecordModel | undefined> {
      const fresh = await this.input.records.getMeta(oid);
      const config = fresh && this.input.configuration(fresh, { requireToken: false });
      if (
        !fresh ||
        !config?.processing?.enabled ||
        config.processingError ||
        fresh.figshareSyncIntent?.readiness === 'initialising'
      )
        return record;
      const store = this.input.worker.getSyncStore();
      await store.assertReady();
      await this.input.worker.importRecordIntent(store, fresh);
      const state = await store.get(oid);
      if (state?.nextActionAt != null) {
        await this.input.queue.schedule(
          'Figshare-SyncRecord',
          `in ${Math.min(config.processing.coalesceMs, 900000)} milliseconds`,
          { oid, brandId: fresh.metaMetadata.brandId }
        );
      }
      return record;
    }
    public async dispatchSyncJob(): Promise<void> {
      await this.input.worker.dispatchFigshare();
    }
    public async syncRecordJob(job: FigshareJob): Promise<void> {
      await this.input.worker.runFigshareWorker(this, job);
    }

    public createUpdateFigshareArticle(
      oid: string | null,
      record: RecordModel,
      options: Record<string, unknown>,
      user: unknown
    ) {
      this.deprecate('createUpdateFigshareArticle', 'validateFigshareRecord');
      this.warnDisabledProcessing(record);
      return this.validateFigshareRecord(oid, record, options, user);
    }
    public uploadFilesToFigshareArticle(
      oid: string,
      record: RecordModel,
      _options?: Record<string, unknown>,
      _user?: UserModel
    ) {
      this.deprecate('uploadFilesToFigshareArticle', 'wakeFigshareRecord');
      this.warnDisabledProcessing(record);
      return this.wakeFigshareRecord(oid, record);
    }
    public requestFigshareCleanup(
      _oid: string,
      record: RecordModel,
      _options?: Record<string, unknown>,
      _user?: UserModel
    ) {
      // RecordsService recognises this configured hook and commits cleanup-only intent.
      return record;
    }
    public deleteFilesFromRedboxTrigger(
      oid: string,
      record: RecordModel,
      options: Record<string, unknown>,
      user: UserModel
    ) {
      this.deprecate('deleteFilesFromRedboxTrigger', 'requestFigshareCleanup');
      this.warnDisabledProcessing(record);
      return this.requestFigshareCleanup(oid, record, options, user);
    }
    public async syncRecordWithFigshare(
      record: RecordModel,
      _jobId?: string,
      _triggerSource?: string
    ): Promise<RecordModel> {
      this.deprecate('syncRecordWithFigshare', 'wakeFigshareRecord');
      this.warnDisabledProcessing(record);
      await this.wakeFigshareRecord(record.redboxOid ?? record.id, record);
      return record;
    }
    public async publishAfterUploadFilesJob(job: FigshareJob): Promise<void> {
      this.deprecate('publishAfterUploadFilesJob', 'syncRecordJob');
      if (job.attrs?.data?.oid) await this.wakeFigshareRecord(job.attrs.data.oid);
    }
    public async deleteFilesFromRedbox(job: FigshareJob): Promise<void> {
      this.deprecate('deleteFilesFromRedbox', 'syncRecordJob');
      if (job.attrs?.data?.oid) await this.wakeFigshareRecord(job.attrs.data.oid);
    }
    public queuePublishAfterUploadFiles(oid: string, _articleId: string, _user: UserModel, _brandId: string) {
      return this.wakeFigshareRecord(oid);
    }
    public queueDeleteFiles(oid: string, _user: UserModel, _brandId: string, _articleId: string) {
      return this.wakeFigshareRecord(oid);
    }
    public async transitionRecordWorkflowFromFigshareArticlePropertiesJob(
      _job: Record<string, unknown>
    ): Promise<void> {
      // Observation is durable and scheduled by the worker. Legacy scanners only redeliver it.
      await this.dispatchSyncJob();
    }
  }
}
