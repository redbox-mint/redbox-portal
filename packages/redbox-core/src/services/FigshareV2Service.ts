import _ from 'lodash';
import { Services as LegacyServices } from './LegacyFigshareService';
import { resolveFigsharePublishingConfig, getSyncState, setSyncState, getBrandName } from './figshare-v2/config';
import { createRunContext } from './figshare-v2/context';
import { preparePublication as preparePublicationPlan } from './figshare-v2/plan';
import { validateHandlebarsTemplate } from './figshare-v2/bindings';
import { syncAssetsPhase } from './figshare-v2/assets';
import { syncEmbargoPhase } from './figshare-v2/embargo';
import { publishIfNeededPhase } from './figshare-v2/publish';
import { writeBackPhase } from './figshare-v2/writeback';
import { buildMetadataPayload as buildV2MetadataPayload, syncMetadataPhase } from './figshare-v2/metadata';
import { buildDeleteFilesMessage, buildPublishAfterUploadsMessage } from './figshare-v2/queue';
import { shouldRunWorkflowTransitionJob } from './figshare-v2/workflow';
import { FigshareClient, makeFixtureClient, makeLiveClient } from './figshare-v2/http';
import { RBValidationError } from '../model/RBValidationError';
import {
  RecordModel,
  UserModel,
  FigshareArticle,
  FigshareFile,
  FigsharePublicationPlan,
  FigsharePublishResult,
  FigshareSyncState,
  FigshareJob,
  DataLocationEntry,
  WorkflowTransitionJobConfig,
  AssetSyncResult,
  getRecordField,
  setRecordField,
} from './figshare-v2/types';

export namespace Services {
  export class FigshareV2Service extends LegacyServices.LegacyFigshareService {
    private assertV2Config(record: RecordModel, operation: string): NonNullable<ReturnType<typeof resolveFigsharePublishingConfig>> {
      const config = this.getV2Config(record);
      if (config == null) {
        throw new Error(`Figshare V2 config is not enabled for operation '${operation}'`);
      }
      return config;
    }

    public getV2Config(record?: RecordModel) {
      return resolveFigsharePublishingConfig(record);
    }

    public getSyncState(config: NonNullable<ReturnType<typeof resolveFigsharePublishingConfig>>, record: RecordModel): FigshareSyncState {
      return getSyncState(config, record);
    }

    public setSyncState(config: NonNullable<ReturnType<typeof resolveFigsharePublishingConfig>>, record: RecordModel, syncState: FigshareSyncState): void {
      setSyncState(config, record, syncState);
    }

    public validateHandlebarsTemplate(template: string): void {
      validateHandlebarsTemplate(template);
    }

    public async buildMetadataPayload(config: NonNullable<ReturnType<typeof resolveFigsharePublishingConfig>>, record: RecordModel): Promise<Record<string, unknown>> {
      return buildV2MetadataPayload(config, record, this.makeClient(config, record, undefined, 'buildMetadataPayload'));
    }

    public makeClient(config: NonNullable<ReturnType<typeof resolveFigsharePublishingConfig>>, record: RecordModel, jobId?: string, triggerSource: string = 'manual') {
      const runContext = createRunContext(record, config, jobId, triggerSource);
      return config.testing.mode === 'fixture' ? makeFixtureClient(config) : makeLiveClient(config, runContext);
    }

    public preparePublication(record: RecordModel, jobId?: string): FigsharePublicationPlan {
      const config = this.getV2Config(record);
      const rm = record as RecordModel;
      if (config == null) {
        return { action: 'skip', sameJob: false, syncState: { status: 'idle' } };
      }

      const runContext = createRunContext(record, config, jobId);
      const existingState = this.getSyncState(config, rm);
      return preparePublicationPlan(config, rm, existingState, runContext.correlationId);
    }

    public async syncMetadata(record: RecordModel, plan?: FigsharePublicationPlan): Promise<FigshareArticle> {
      const config = this.assertV2Config(record, 'syncMetadata');
      const rm = record as RecordModel;

      const publicationPlan = plan ?? this.preparePublication(rm);
      const articleId = publicationPlan.articleId;
      if (articleId) {
        const currentArticle = await this.makeClient(config, rm, publicationPlan.syncState.correlationId, 'syncMetadata').getArticle(articleId);
        if (this.isCurationLocked(rm, currentArticle)) {
          return currentArticle;
        }
        await this.ensureNoFileUploadInProgress(config, rm, articleId);
      }

      const client = this.makeClient(config, rm, publicationPlan.syncState.correlationId, 'syncMetadata');
      return syncMetadataPhase(client, config, rm, publicationPlan);
    }

    public async syncAssets(record: RecordModel, article: FigshareArticle): Promise<AssetSyncResult & Record<string, unknown>> {
      const config = this.assertV2Config(record, 'syncAssets');
      const rm = record as RecordModel;

      const syncState = this.getSyncState(config, rm);
      const client = this.makeClient(config, rm, syncState.correlationId, 'syncAssets');
      return syncAssetsPhase(client, config, rm, article, syncState);
    }

    public async syncEmbargo(record: RecordModel, articleId: string): Promise<Record<string, unknown>> {
      const config = this.assertV2Config(record, 'syncEmbargo');
      const rm = record as RecordModel;

      const client = this.makeClient(config, rm, undefined, 'syncEmbargo');
      return syncEmbargoPhase(client, config, rm, articleId);
    }

    public async publishIfNeeded(record: RecordModel, articleId: string): Promise<FigsharePublishResult> {
      const config = this.assertV2Config(record, 'publishIfNeeded');
      const rm = record as RecordModel;

      const client = this.makeClient(config, rm, undefined, 'publishIfNeeded');
      return publishIfNeededPhase(client, config, rm, articleId, this.getSyncState(config, rm));
    }

    public writeBack(record: RecordModel, article: FigshareArticle, publishResult?: FigsharePublishResult, assetSyncResult?: Record<string, unknown>): RecordModel {
      const config = this.getV2Config(record);
      if (config == null) {
        return record;
      }
      return writeBackPhase(config, record, article, publishResult, assetSyncResult as AssetSyncResult | undefined);
    }

    private async getArticleFiles(client: FigshareClient, articleId: string): Promise<FigshareFile[]> {
      const files: FigshareFile[] = [];
      let page = 1;
      const pageSize = 20;
      while (true) {
        const pageResults = await client.listArticleFiles(articleId, page, pageSize);
        if (!Array.isArray(pageResults) || pageResults.length === 0) {
          break;
        }
        files.push(...pageResults);
        if (pageResults.length < pageSize) {
          break;
        }
        page++;
      }
      return files;
    }

    private isCurationLocked(record: RecordModel, article: FigshareArticle): boolean {
      const config = this.getV2Config(record);
      const legacyConfig = (sails.config as Record<string, unknown>).figshareAPI as Record<string, unknown> | undefined;
      const legacyMapping = legacyConfig?.mapping as Record<string, unknown> | undefined;

      const statusField = config?.article.curationLock?.statusField || String(legacyMapping?.figshareCurationStatus ?? '');
      const targetValue = config?.article.curationLock?.targetValue || String(legacyMapping?.figshareCurationStatusTargetValue ?? 'public');
      const updatesDisabled = config?.article.curationLock?.enabled === true ||
        legacyMapping?.figshareDisableUpdateByCurationStatus === true;
      if (!updatesDisabled || statusField === '') {
        return false;
      }
      return String((article as Record<string, unknown>)[statusField] ?? '') === targetValue;
    }

    private async ensureNoFileUploadInProgress(config: NonNullable<ReturnType<typeof resolveFigsharePublishingConfig>>, record: RecordModel, articleId: string): Promise<void> {
      const client = this.makeClient(config, record, undefined, 'ensureNoFileUploadInProgress');
      const files = await this.getArticleFiles(client, articleId);
      const inProgress = files.some((entry) => String(entry.status ?? '').toLowerCase() === 'created');
      if (inProgress) {
        throw new RBValidationError({
          message: `Figshare file uploads are still in progress for article '${articleId}'`,
          displayErrors: [{
            title: 'Figshare file uploads are still in progress',
            detail: `Figshare file uploads are still in progress for article '${articleId}'`
          }]
        });
      }
    }

    private async cleanupUploadedFiles(record: RecordModel, articleId: string): Promise<RecordModel> {
      const config = this.getV2Config(record);
      if (config == null) {
        return record;
      }

      const client = this.makeClient(config, record, undefined, 'cleanupUploadedFiles');
      const articleFiles = await this.getArticleFiles(client, articleId);
      const dataLocations = (getRecordField(record, config.record.dataLocationsPath) ?? []) as DataLocationEntry[];
      const recordConfig = (sails.config as Record<string, unknown>).record as Record<string, unknown> | undefined;
      const datastreamServiceName = String(recordConfig?.datastreamService ?? '');
      const datastreamService = datastreamServiceName ? (sails.services as Record<string, unknown>)?.[datastreamServiceName] as Record<string, unknown> | undefined : undefined;

      for (const entry of [...dataLocations]) {
        if (entry.type !== 'attachment' || entry.fileId == null) {
          continue;
        }

        const uploaded = articleFiles.find((file) => file.name === (entry.name ?? ''));
        if (uploaded == null) {
          continue;
        }

        const removeDatastream = datastreamService?.removeDatastream as ((oid: string, entry: DataLocationEntry) => Promise<unknown>) | undefined;
        if (removeDatastream != null) {
          try {
            await removeDatastream(record.redboxOid ?? record.id ?? '', entry);
          } catch (error) {
            sails.log.warn(`FigService - failed to remove datastream for record '${record.redboxOid ?? record.id ?? ''}'`, {
              entry,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        const idx = dataLocations.indexOf(entry);
        if (idx >= 0) {
          dataLocations.splice(idx, 1);
        }
        const downloadUrl = typeof uploaded.download_url === 'string' ? uploaded.download_url.trim() : '';
        if (downloadUrl === '') {
          sails.log.warn(`FigService - uploaded file '${uploaded.name}' for entry '${String(entry.selected ?? '')}' has no download URL; skipping write-back URL replacement`);
          continue;
        }
        dataLocations.push({
          type: 'url',
          location: downloadUrl,
          notes: `File name: ${uploaded.name}`,
          originalFileName: uploaded.name,
          ignore: true,
          selected: entry.selected ?? false
        });
      }

      setRecordField(record, config.record.dataLocationsPath, dataLocations);
      const legacyConfig = (sails.config as Record<string, unknown>).figshareAPI as Record<string, unknown> | undefined;
      const legacyMapping = legacyConfig?.mapping as Record<string, unknown> | undefined;
      const uploadedFlagPath = legacyMapping?.recordAllFilesUploaded;
      if (typeof uploadedFlagPath === 'string' && uploadedFlagPath !== '') {
        setRecordField(record, uploadedFlagPath, 'yes');
      }
      return record;
    }

    private async isArticleReadyForWorkflowTransition(
      config: NonNullable<ReturnType<typeof resolveFigsharePublishingConfig>>,
      record: RecordModel,
      articleId: string,
      figshareTargetFieldKey: string,
      figshareTargetFieldValue: string
    ): Promise<boolean> {
      if (!articleId.trim()) {
        sails.log.error(`FigService - the article id '${articleId}' is not valid`);
        return false;
      }

      const client = this.makeClient(config, record, `${articleId}:workflow-transition`, 'transitionRecordWorkflowFromFigshareArticlePropertiesJob');
      const article = await client.getArticle(articleId);
      const figshareFieldValue = (article as Record<string, unknown>)[figshareTargetFieldKey] ?? null;
      if (figshareFieldValue == null || figshareFieldValue !== figshareTargetFieldValue) {
        sails.log.warn(`FigService - the article id '${articleId}' item property '${figshareTargetFieldKey}' value '${JSON.stringify(figshareFieldValue)}' is not '${JSON.stringify(figshareTargetFieldValue)}'`);
        return false;
      }

      const files = await this.getArticleFiles(client, articleId);
      const uploadInProgress = files.some((entry) => String(entry.status ?? '').toLowerCase() === 'created');
      if (uploadInProgress) {
        sails.log.warn(`FigService - the article id '${articleId}' has an upload in progress`);
        return false;
      }

      return true;
    }

    private async transitionWorkflowForRecord(
      record: RecordModel,
      user: UserModel,
      oid: string,
      articleId: string,
      targetStep: string,
      figshareTargetFieldKey: string,
      figshareTargetFieldValue: string
    ): Promise<void> {
      const config = this.getV2Config(record);
      if (config == null) {
        return;
      }

      const msgPartial = `record oid '${oid}' with figshare article id '${articleId}' to step '${targetStep}'`;
      if (!(await this.isArticleReadyForWorkflowTransition(config, record, articleId, figshareTargetFieldKey, figshareTargetFieldValue))) {
        sails.log.warn(`FigService - cannot transition ${msgPartial} because the linked article is not in the required state`);
        return;
      }

      const currentRec = await RecordsService.getMeta(oid) as RecordModel;
      const brand = BrandingService.getBrand(currentRec.metaMetadata?.brandId ?? 'default');
      const userRoles = user.roles ?? [];
      const hasEditAccess = await RecordsService.hasEditAccess(brand, user, userRoles as unknown as Record<string, unknown>[], currentRec as unknown as Record<string, unknown>);
      if (!hasEditAccess) {
        sails.log.warn(`FigService - cannot transition ${msgPartial} because user '${user.username}' does not have edit permission`);
        return;
      }

      const recordTypeName = currentRec.metaMetadata?.type ?? '';
      const recordType = await RecordTypesService.get(brand, recordTypeName).toPromise();
      if (!recordType) {
        sails.log.warn(`FigService - cannot transition ${msgPartial} because record type is missing`);
        return;
      }

      const nextStepResp = await WorkflowStepsService.get(recordType, targetStep).toPromise();
      const metadata = currentRec.metadata;
      const recordUpdateResult = await RecordsService.updateMeta(brand, oid, currentRec as Record<string, unknown>, user, true, true, nextStepResp, metadata as Record<string, unknown>);
      const isSuccessful = recordUpdateResult.isSuccessful();
      if (isSuccessful) {
        sails.log.info(`FigService - updated ${msgPartial}`);
      } else {
        sails.log.error(`FigService - failed to update ${msgPartial}: ${JSON.stringify(recordUpdateResult)}`);
      }
    }

    public async syncRecordWithFigshareV2(record: RecordModel, jobId?: string, triggerSource: string = 'manual'): Promise<RecordModel> {
      const config = this.getV2Config(record);
      const rm = record as RecordModel;
      if (config == null) {
        return record;
      }

      const plan = this.preparePublication(rm, jobId);
      if (plan.action === 'skip') {
        return record;
      }

      try {
        let article = await this.syncMetadata(rm, plan);
        const assetSyncResult = await this.syncAssets(rm, article);
        await this.syncEmbargo(rm, String(article?.id ?? plan.articleId ?? ''));
        const publishResult = await this.publishIfNeeded(rm, String(article?.id ?? plan.articleId ?? ''));
        if (Object.keys(publishResult).length > 0) {
          article = await this.makeClient(config, rm, plan.syncState.correlationId, triggerSource).getArticle(String(article?.id ?? plan.articleId ?? ''));
        }
        return this.writeBack(rm, article, publishResult, assetSyncResult);
      } catch (error) {
        const syncState = this.getSyncState(config, rm);
        syncState.status = 'failed';
        syncState.lastError = error instanceof Error ? error.message : String(error);
        this.setSyncState(config, rm, syncState);
        throw error;
      }
    }

    public async persistV2SyncRecord(oid: string, record: RecordModel, user: UserModel): Promise<void> {
      try {
        const brandName = getBrandName(record);
        const brand = BrandingService.getBrand(brandName);
        await RecordsService.updateMeta(brand, oid, record as Record<string, unknown>, user, false, false);
      } catch (error) {
        sails.log.error(`FigService - failed to persist V2 sync state for ${oid}`, error);
      }
    }

    public override createUpdateFigshareArticle(oid: string, record: RecordModel, options: Record<string, unknown>, user: Record<string, unknown>) {
      if (this.getV2Config(record) != null) {
        return this.syncRecordWithFigshareV2(record, `${oid}:pre`, 'pre-save');
      }
      return super.createUpdateFigshareArticle(oid, record, options, user);
    }

    public override uploadFilesToFigshareArticle(oid: string, record: RecordModel, options: Record<string, unknown>, user: UserModel) {
      if (this.getV2Config(record) != null) {
        void this.syncRecordWithFigshareV2(record, `${oid}:post`, 'post-save')
          .then(async (updatedRecord: RecordModel) => {
            await this.persistV2SyncRecord(oid, updatedRecord, user);
            const config = this.getV2Config(updatedRecord);
            if (config != null) {
              const rm = updatedRecord as RecordModel;
              const syncState = this.getSyncState(config, rm);
              const articleId = String(getRecordField(rm, config.record.articleIdPath) ?? '');
              const brandId = rm.metaMetadata?.brandId ?? '';
              const attachmentCount = Number(syncState.partialProgress?.attachmentCount ?? 0);
              const uploadsComplete = syncState.partialProgress?.uploadsComplete === true;
              if (attachmentCount > 0 && uploadsComplete) {
                if (config.article.publishMode === 'afterUploadsComplete') {
                  this.queuePublishAfterUploadFiles(oid, articleId, user, brandId);
                } else if (config.article.publishMode === 'immediate') {
                  this.queueDeleteFiles(oid, user, brandId, articleId);
                }
              }
            }
          })
          .catch(async (error: unknown) => {
            await this.persistV2SyncRecord(oid, record, user);
            sails.log.error(`FigService - uploadFilesToFigshareArticle V2 sync failed for ${oid}`, error);
          });
        return;
      }
      return super.uploadFilesToFigshareArticle(oid, record, options, user);
    }

    public override deleteFilesFromRedboxTrigger(oid: string, record: RecordModel, options: Record<string, unknown>, user: Record<string, unknown>) {
      const config = this.getV2Config(record);
      const rm = record as RecordModel;
      if (config != null) {
        if (this.metTriggerCondition(oid, rm as Record<string, unknown>, options, user) === 'true') {
          const articleId = String(getRecordField(rm, config.record.articleIdPath) ?? '');
          if (articleId === '') {
            return record;
          }
          return this.cleanupUploadedFiles(rm, articleId);
        }
        return record;
      }
      return super.deleteFilesFromRedboxTrigger(oid, record, options, user);
    }

    public override async publishAfterUploadFilesJob(job: FigshareJob) {
      const data = job?.attrs?.data;
      if (data == null || (data.oid == null && data.articleId == null)) {
        return;
      }

      const oid = data.oid ?? '';
      const articleId = data.articleId ?? '';
      const brandId = data.brandId ?? '';
      const user = data.user as UserModel;
      const record = await RecordsService.getMeta(oid) as RecordModel;
      const config = this.getV2Config(record);
      if (config == null) {
        return super.publishAfterUploadFilesJob(job as Record<string, unknown>);
      }
      if (!articleId.trim()) {
        sails.log.error(`FigService - cannot publish uploaded files for record '${oid}' because the Figshare article id is empty`);
        return;
      }

      const client = this.makeClient(config, record, `${oid}:publish-job`, 'publishAfterUploadFilesJob');
      const publishResult = await client.publishArticle(articleId, {});
      const article = await client.getArticle(articleId);
      const updatedRecord = this.writeBack(record, article, publishResult);
      await this.persistV2SyncRecord(oid, updatedRecord, user);
      this.queueDeleteFiles(oid, user, brandId, articleId);
    }

    public override async deleteFilesFromRedbox(job: FigshareJob) {
      const data = job?.attrs?.data;
      if (data == null || (data.oid == null && data.articleId == null)) {
        return;
      }

      const oid = data.oid ?? '';
      const articleId = data.articleId ?? '';
      const user = data.user as UserModel;
      let record = await RecordsService.getMeta(oid) as RecordModel;
      const config = this.getV2Config(record);
      if (config == null) {
        return super.deleteFilesFromRedbox(job as Record<string, unknown>);
      }
      record = await this.cleanupUploadedFiles(record, articleId) as RecordModel;
      await this.persistV2SyncRecord(oid, record, user);
    }

    public override queuePublishAfterUploadFiles(oid: string, articleId: string, user: UserModel, brandId: string) {
      const queueMessage = buildPublishAfterUploadsMessage(oid, articleId, user, brandId);
      const jobName = 'Figshare-PublishAfterUpload-Service';
      const legacyConfig = (sails.config as Record<string, unknown>).figshareAPI as Record<string, unknown> | undefined;
      const legacyMapping = legacyConfig?.mapping as Record<string, unknown> | undefined;
      const scheduleIn = String(legacyMapping?.schedulePublishAfterUploadJob ?? 'in 2 minutes');
      if (scheduleIn === 'immediate') {
        this['queueService'].now(jobName, queueMessage);
      } else {
        this['queueService'].schedule(jobName, scheduleIn, queueMessage);
      }
    }

    public override queueDeleteFiles(oid: string, user: UserModel, brandId: string, articleId: string) {
      const queueMessage = buildDeleteFilesMessage(oid, user, brandId, articleId);
      const jobName = 'Figshare-UploadedFilesCleanup-Service';
      const legacyConfig = (sails.config as Record<string, unknown>).figshareAPI as Record<string, unknown> | undefined;
      const legacyMapping = legacyConfig?.mapping as Record<string, unknown> | undefined;
      const scheduleIn = String(legacyMapping?.scheduleUploadedFilesCleanupJob ?? 'in 5 minutes');
      if (scheduleIn === 'immediate') {
        this['queueService'].now(jobName, queueMessage);
      } else {
        this['queueService'].schedule(jobName, scheduleIn, queueMessage);
      }
    }

    public override async transitionRecordWorkflowFromFigshareArticlePropertiesJob(job: Record<string, unknown>): Promise<void> {
      const legacyConfig = (sails.config as Record<string, unknown>).figshareAPI as Record<string, unknown> | undefined;
      const legacyMapping = legacyConfig?.mapping as Record<string, unknown> | undefined;
      const jobConfig = (legacyMapping?.figshareScheduledTransitionRecordWorkflowFromArticlePropertiesJob ?? {}) as WorkflowTransitionJobConfig;
      if (!shouldRunWorkflowTransitionJob(jobConfig)) {
        sails.log.info('FigService - transitionRecordWorkflowFromFigshareArticlePropertiesJob is disabled by config');
        return;
      }

      try {
        const brand = BrandingService.getBrand('default');
        const start = 0;
        const rows = 30;
        const maxRecords = 100;
        const namedQuery = jobConfig.namedQuery ?? '';
        const targetStep = jobConfig.targetStep ?? '';
        const paramMap = jobConfig.paramMap ?? {};
        const figshareTargetFieldKey = jobConfig.figshareTargetFieldKey ?? '';
        const figshareTargetFieldValue = jobConfig.figshareTargetFieldValue ?? '';
        const username = jobConfig.username ?? '';
        const userType = jobConfig.userType ?? '';
        const user = await UsersService.getUserWithUsername(username).toPromise();

        if (!user || !user?.username || user?.type !== userType) {
          sails.log.error(`FigService - cannot run job because could not find user with username '${username}' and type '${userType}' user:`, user);
          return;
        }

        const namedQueryConfig = await NamedQueryService.getNamedQueryConfig(brand, namedQuery);
        const queryResults = await NamedQueryService.performNamedQueryFromConfigResults(namedQueryConfig, paramMap, brand, namedQuery, start, rows, maxRecords, user);

        for (const queryResult of queryResults) {
          const oid = String(queryResult.oid ?? '');
          if (oid === '') {
            continue;
          }
          try {
            const record = await RecordsService.getMeta(oid) as RecordModel;
            const config = this.getV2Config(record);
            if (config == null) {
              continue;
            }
            const articleId = String(getRecordField(record, config.record.articleIdPath) ?? '');
            await this.transitionWorkflowForRecord(record, user, oid, articleId, targetStep, figshareTargetFieldKey, figshareTargetFieldValue);
          } catch (error) {
            sails.log.verbose(`FigService - transitionRecordWorkflowFromFigshareArticlePropertiesJob unable to process oid ${oid}`, error);
          }
        }
      } catch (error) {
        sails.log.error('FigService - error in transitionRecordWorkflowFromFigshareArticlePropertiesJob', error);
      }
    }
  }
}

module.exports.Services = Services;

declare global {
  let FigshareV2Service: Services.FigshareV2Service;
}
