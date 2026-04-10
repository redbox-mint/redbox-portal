import _ from 'lodash';
import { Services as LegacyServices } from './LegacyFigshareService';
import { resolveFigsharePublishingConfig, getSyncState, setSyncState } from './figshare-v2/config';
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
import { AnyRecord, FigsharePublicationPlan, FigshareSyncState, RecordLike } from './figshare-v2/types';

export namespace Services {
  export class FigshareV2Service extends LegacyServices.LegacyFigshareService {
    public getV2Config(record?: RecordLike) {
      return resolveFigsharePublishingConfig(record);
    }

    public getSyncState(config: NonNullable<ReturnType<typeof resolveFigsharePublishingConfig>>, record: AnyRecord): FigshareSyncState {
      return getSyncState(config, record) as FigshareSyncState;
    }

    public setSyncState(config: NonNullable<ReturnType<typeof resolveFigsharePublishingConfig>>, record: AnyRecord, syncState: FigshareSyncState): void {
      setSyncState(config, record, syncState);
    }

    public validateHandlebarsTemplate(template: string): void {
      validateHandlebarsTemplate(template);
    }

    public async buildMetadataPayload(config: NonNullable<ReturnType<typeof resolveFigsharePublishingConfig>>, record: AnyRecord): Promise<AnyRecord> {
      return buildV2MetadataPayload(config, record, this.makeClient(config, record, undefined, 'buildMetadataPayload'));
    }

    public makeClient(config: NonNullable<ReturnType<typeof resolveFigsharePublishingConfig>>, record: RecordLike, jobId?: string, triggerSource: string = 'manual') {
      const runContext = createRunContext(record, config, jobId, triggerSource);
      return config.testing.mode === 'fixture' ? makeFixtureClient(config) : makeLiveClient(config, runContext);
    }

    public preparePublication(record: RecordLike, jobId?: string): FigsharePublicationPlan {
      const config = this.getV2Config(record);
      const recordObj = record as AnyRecord;
      if (config == null) {
        return { action: 'skip', sameJob: false, syncState: { status: 'idle' } };
      }

      const runContext = createRunContext(record, config, jobId);
      const existingState = this.getSyncState(config, recordObj);
      return preparePublicationPlan(config, recordObj, existingState, runContext.correlationId);
    }

    public async syncMetadata(record: RecordLike, plan?: FigsharePublicationPlan): Promise<AnyRecord> {
      const config = this.getV2Config(record);
      const recordObj = record as AnyRecord;
      if (config == null) {
        return {};
      }

      const publicationPlan = plan ?? this.preparePublication(recordObj);
      const articleId = publicationPlan.articleId;
      if (articleId) {
        const currentArticle = await this.makeClient(config, recordObj, publicationPlan.syncState.correlationId, 'syncMetadata').getArticle(articleId);
        if (this.isCurationLocked(recordObj, currentArticle)) {
          return currentArticle;
        }
        await this.ensureNoFileUploadInProgress(config, recordObj, articleId);
      }

      const client = this.makeClient(config, recordObj, publicationPlan.syncState.correlationId, 'syncMetadata');
      return syncMetadataPhase(client, config, recordObj, publicationPlan);
    }

    public async syncAssets(record: RecordLike, article: AnyRecord): Promise<AnyRecord> {
      const config = this.getV2Config(record);
      const recordObj = record as AnyRecord;
      if (config == null) {
        return {};
      }

      const syncState = this.getSyncState(config, recordObj);
      const client = this.makeClient(config, recordObj, syncState.correlationId, 'syncAssets');
      return syncAssetsPhase(client, config, recordObj, article, syncState);
    }

    public async syncEmbargo(record: RecordLike, articleId: string): Promise<AnyRecord> {
      const config = this.getV2Config(record);
      const recordObj = record as AnyRecord;
      if (config == null) {
        return {};
      }

      const client = this.makeClient(config, recordObj, undefined, 'syncEmbargo');
      return syncEmbargoPhase(client, config, recordObj, articleId);
    }

    public async publishIfNeeded(record: RecordLike, articleId: string): Promise<AnyRecord> {
      const config = this.getV2Config(record);
      const recordObj = record as AnyRecord;
      if (config == null) {
        return {};
      }

      const client = this.makeClient(config, recordObj, undefined, 'publishIfNeeded');
      return publishIfNeededPhase(client, config, recordObj, articleId, this.getSyncState(config, recordObj));
    }

    public writeBack(record: RecordLike, article: AnyRecord, publishResult?: AnyRecord, assetSyncResult?: AnyRecord): RecordLike {
      const config = this.getV2Config(record);
      if (config == null) {
        return record;
      }
      return writeBackPhase(config, record, article, publishResult, assetSyncResult);
    }

    private async getArticleFiles(client: FigshareClient, articleId: string): Promise<AnyRecord[]> {
      const files: AnyRecord[] = [];
      let page = 1;
      const pageSize = 20;
      while (true) {
        const pageResults = await client.listArticleFiles(articleId, page, pageSize);
        if (!_.isArray(pageResults) || pageResults.length === 0) {
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

    private isCurationLocked(record: AnyRecord, article: AnyRecord): boolean {
      const config = this.getV2Config(record);
      const statusField = String(
        _.get(config, 'article.curationLock.statusField', '') ||
        _.get(sails.config, 'figshareAPI.mapping.figshareCurationStatus', '')
      );
      const targetValue = String(
        _.get(config, 'article.curationLock.targetValue', 'public') ||
        _.get(sails.config, 'figshareAPI.mapping.figshareCurationStatusTargetValue', 'public')
      );
      const updatesDisabled = _.get(config, 'article.curationLock.enabled') === true ||
        _.get(sails.config, 'figshareAPI.mapping.figshareDisableUpdateByCurationStatus', false) === true;
      if (!updatesDisabled || statusField === '') {
        return false;
      }
      return String(_.get(article, statusField, '')) === targetValue;
    }

    private async ensureNoFileUploadInProgress(config: NonNullable<ReturnType<typeof resolveFigsharePublishingConfig>>, record: AnyRecord, articleId: string): Promise<void> {
      const client = this.makeClient(config, record, undefined, 'ensureNoFileUploadInProgress');
      const files = await this.getArticleFiles(client, articleId);
      const inProgress = files.some((entry: AnyRecord) => String(_.get(entry, 'status', '')).toLowerCase() === 'created');
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

    private async cleanupUploadedFiles(record: AnyRecord, articleId: string): Promise<RecordLike> {
      const config = this.getV2Config(record);
      if (config == null) {
        return record;
      }

      const client = this.makeClient(config, record, undefined, 'cleanupUploadedFiles');
      const articleFiles = await this.getArticleFiles(client, articleId);
      const dataLocations = (_.get(record, config.record.dataLocationsPath, []) || []) as AnyRecord[];
      const datastreamServiceName = String(_.get(sails.config, 'record.datastreamService', ''));
      const datastreamService = ((sails.services || {}) as AnyRecord)[datastreamServiceName];

      for (const entry of [...dataLocations]) {
        if (entry?.type !== 'attachment' || _.isNil(entry?.fileId)) {
          continue;
        }

        const uploaded = articleFiles.find((file: AnyRecord) => String(_.get(file, 'name', '')) === String(_.get(entry, 'name', '')));
        if (uploaded == null) {
          continue;
        }

        const removeDatastream = (datastreamService as any)?.removeDatastream as ((oid: string, entry: AnyRecord) => Promise<unknown>) | undefined;
        if (removeDatastream != null) {
          await removeDatastream(String(_.get(record, 'redboxOid', _.get(record, 'oid', ''))), entry);
        }

        _.remove(dataLocations, (location: AnyRecord) => location === entry);
        dataLocations.push({
          type: 'url',
          location: _.get(uploaded, 'download_url', ''),
          notes: `File name: ${_.get(uploaded, 'name', '')}`,
          originalFileName: _.get(uploaded, 'name', ''),
          ignore: true,
          selected: _.get(entry, 'selected', false)
        });
      }

      _.set(record, config.record.dataLocationsPath, dataLocations);
      const uploadedFlagPath = _.get(sails.config, 'figshareAPI.mapping.recordAllFilesUploaded');
      if (typeof uploadedFlagPath === 'string' && uploadedFlagPath !== '') {
        _.set(record, uploadedFlagPath, 'yes');
      }
      return record;
    }

    private async isArticleReadyForWorkflowTransition(
      config: NonNullable<ReturnType<typeof resolveFigsharePublishingConfig>>,
      record: AnyRecord,
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
      const figshareFieldValue = _.get(article, figshareTargetFieldKey, null);
      if (figshareFieldValue == null || figshareFieldValue !== figshareTargetFieldValue) {
        sails.log.warn(`FigService - the article id '${articleId}' item property '${figshareTargetFieldKey}' value '${JSON.stringify(figshareFieldValue)}' is not '${JSON.stringify(figshareTargetFieldValue)}'`);
        return false;
      }

      const files = await this.getArticleFiles(client, articleId);
      const uploadInProgress = files.some((entry: AnyRecord) => String(_.get(entry, 'status', '')).toLowerCase() === 'created');
      if (uploadInProgress) {
        sails.log.warn(`FigService - the article id '${articleId}' has an upload in progress`);
        return false;
      }

      return true;
    }

    private async transitionWorkflowForRecord(
      record: AnyRecord,
      user: AnyRecord,
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

      const brand = BrandingService.getBrand('default');
      const currentRec = await RecordsService.getMeta(oid) as AnyRecord;
      const userRoles = (user.roles ?? []) as AnyRecord[];
      const hasEditAccess = await RecordsService.hasEditAccess(brand, user, userRoles, currentRec as AnyRecord);
      if (!hasEditAccess) {
        sails.log.warn(`FigService - cannot transition ${msgPartial} because user '${user}' does not have edit permission`);
        return;
      }

      const recordTypeName = String(_.get(currentRec, 'metaMetadata.type', ''));
      const recordType = await RecordTypesService.get(brand, recordTypeName).toPromise();
      if (!recordType) {
        sails.log.warn(`FigService - cannot transition ${msgPartial} because record type is missing`);
        return;
      }

      const nextStepResp = await WorkflowStepsService.get(recordType, targetStep).toPromise();
      const metadata = currentRec.metadata;
      const recordUpdateResult = await RecordsService.updateMeta(brand, oid, currentRec as AnyRecord, user, true, true, nextStepResp, metadata as AnyRecord);
      const isSuccessful = _.get(recordUpdateResult, 'success', true)?.toString() === 'true';
      if (isSuccessful) {
        sails.log.info(`FigService - updated ${msgPartial}`);
      } else {
        sails.log.error(`FigService - failed to update ${msgPartial}: ${JSON.stringify(recordUpdateResult)}`);
      }
    }

    public async syncRecordWithFigshareV2(record: RecordLike, jobId?: string, triggerSource: string = 'manual'): Promise<RecordLike> {
      const config = this.getV2Config(record);
      const recordObj = record as AnyRecord;
      if (config == null) {
        return record;
      }

      const plan = this.preparePublication(recordObj, jobId);
      if (plan.action === 'skip') {
        return record;
      }

      try {
        let article = await this.syncMetadata(recordObj, plan);
        const assetSyncResult = await this.syncAssets(recordObj, article);
        await this.syncEmbargo(recordObj, String(article?.id ?? plan.articleId ?? ''));
        const publishResult = await this.publishIfNeeded(recordObj, String(article?.id ?? plan.articleId ?? ''));
        if (!_.isEmpty(publishResult)) {
          article = await this.makeClient(config, recordObj, plan.syncState.correlationId, triggerSource).getArticle(String(article?.id ?? plan.articleId ?? ''));
        }
        return this.writeBack(recordObj, article, publishResult, assetSyncResult);
      } catch (error) {
        const syncState = this.getSyncState(config, recordObj);
        syncState.status = 'failed';
        syncState.lastError = error instanceof Error ? error.message : String(error);
        this.setSyncState(config, recordObj, syncState);
        throw error;
      }
    }

    public async persistV2SyncRecord(oid: string, record: RecordLike, user: AnyRecord): Promise<void> {
      try {
        const recordObj = record as AnyRecord;
        const brandName = String(_.get(recordObj, 'metaMetadata.branding', _.get(recordObj, 'branding', 'default')) || 'default');
        const brand = BrandingService.getBrand(brandName);
        await RecordsService.updateMeta(brand, oid, recordObj, user, false, false);
      } catch (error) {
        sails.log.error(`FigService - failed to persist V2 sync state for ${oid}`, error);
      }
    }

    public override createUpdateFigshareArticle(oid: string, record: RecordLike, options: AnyRecord, user: AnyRecord) {
      if (this.getV2Config(record) != null) {
        return this.syncRecordWithFigshareV2(record, `${oid}:pre`, 'pre-save');
      }
      return super.createUpdateFigshareArticle(oid, record, options, user);
    }

    public override uploadFilesToFigshareArticle(oid: string, record: RecordLike, options: AnyRecord, user: AnyRecord) {
      if (this.getV2Config(record) != null) {
        void this.syncRecordWithFigshareV2(record, `${oid}:post`, 'post-save')
          .then(async (updatedRecord: RecordLike) => {
            await this.persistV2SyncRecord(oid, updatedRecord, user);
            const config = this.getV2Config(updatedRecord);
            if (config != null) {
              const syncState = this.getSyncState(config, updatedRecord as AnyRecord);
              const articleId = String(_.get(updatedRecord as AnyRecord, config.record.articleIdPath, ''));
              const brandId = String(_.get(updatedRecord as AnyRecord, 'metaMetadata.brandId', ''));
              const attachmentCount = _.toNumber(_.get(syncState, 'partialProgress.attachmentCount', 0));
              const uploadsComplete = _.get(syncState, 'partialProgress.uploadsComplete', false) === true;
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

    public override deleteFilesFromRedboxTrigger(oid: string, record: RecordLike, options: AnyRecord, user: AnyRecord) {
      const config = this.getV2Config(record);
      const recordObj = record as AnyRecord;
      if (config != null) {
        if (this.metTriggerCondition(oid, recordObj, options, user) === 'true') {
          const articleId = String(_.get(recordObj, config.record.articleIdPath, ''));
          if (articleId === '') {
            return record;
          }
          return this.cleanupUploadedFiles(recordObj, articleId);
        }
        return record;
      }
      return super.deleteFilesFromRedboxTrigger(oid, record, options, user);
    }

    public override async publishAfterUploadFilesJob(job: AnyRecord) {
      const attrs = (job?.attrs ?? {}) as AnyRecord;
      const data = (attrs.data ?? {}) as AnyRecord;
      if (_.isEmpty(data)) {
        return;
      }

      const oid = String(data.oid ?? '');
      const articleId = String(data.articleId ?? '');
      const brandId = String(data.brandId ?? '');
      const user = data.user as AnyRecord;
      const record = await RecordsService.getMeta(oid) as AnyRecord;
      const config = this.getV2Config(record);
      if (config == null) {
        return super.publishAfterUploadFilesJob(job);
      }

      const client = this.makeClient(config, record, `${oid}:publish-job`, 'publishAfterUploadFilesJob');
      const publishResult = await client.publishArticle(articleId, {});
      const article = await client.getArticle(articleId);
      const updatedRecord = this.writeBack(record, article, publishResult, {});
      await this.persistV2SyncRecord(oid, updatedRecord, user);
      this.queueDeleteFiles(oid, user, brandId, articleId);
    }

    public override async deleteFilesFromRedbox(job: AnyRecord) {
      const attrs = (job?.attrs ?? {}) as AnyRecord;
      const data = (attrs.data ?? {}) as AnyRecord;
      if (_.isEmpty(data)) {
        return;
      }

      const oid = String(data.oid ?? '');
      const articleId = String(data.articleId ?? '');
      const user = data.user as AnyRecord;
      let record = await RecordsService.getMeta(oid) as AnyRecord;
      const config = this.getV2Config(record);
      if (config == null) {
        return super.deleteFilesFromRedbox(job);
      }
      record = await this.cleanupUploadedFiles(record, articleId) as AnyRecord;
      await this.persistV2SyncRecord(oid, record, user);
    }

    public override queuePublishAfterUploadFiles(oid: string, articleId: string, user: AnyRecord, brandId: string) {
      const queueMessage = buildPublishAfterUploadsMessage(oid, articleId, user, brandId);
      const jobName = 'Figshare-PublishAfterUpload-Service';
      const scheduleIn = String(_.get(sails.config.figshareAPI.mapping, 'schedulePublishAfterUploadJob', 'in 2 minutes'));
      if (scheduleIn === 'immediate') {
        this['queueService'].now(jobName, queueMessage);
      } else {
        this['queueService'].schedule(jobName, scheduleIn, queueMessage);
      }
    }

    public override queueDeleteFiles(oid: string, user: AnyRecord, brandId: string, articleId: string) {
      const queueMessage = buildDeleteFilesMessage(oid, user, brandId, articleId);
      const jobName = 'Figshare-UploadedFilesCleanup-Service';
      const scheduleIn = String(_.get(sails.config.figshareAPI.mapping, 'scheduleUploadedFilesCleanupJob', 'in 5 minutes'));
      if (scheduleIn === 'immediate') {
        this['queueService'].now(jobName, queueMessage);
      } else {
        this['queueService'].schedule(jobName, scheduleIn, queueMessage);
      }
    }

    public override async transitionRecordWorkflowFromFigshareArticlePropertiesJob(job: AnyRecord): Promise<void> {
      const jobConfig = (_.get(sails.config, 'figshareAPI.mapping.figshareScheduledTransitionRecordWorkflowFromArticlePropertiesJob', {}) ?? {}) as AnyRecord;
      if (!shouldRunWorkflowTransitionJob(jobConfig)) {
        sails.log.info('FigService - transitionRecordWorkflowFromFigshareArticlePropertiesJob is disabled by config');
        return;
      }

      try {
        const brand = BrandingService.getBrand('default');
        const start = 0;
        const rows = 30;
        const maxRecords = 100;
        const namedQuery = String(_.get(jobConfig, 'namedQuery', '') ?? '');
        const targetStep = String(_.get(jobConfig, 'targetStep', '') ?? '');
        const paramMap = (_.get(jobConfig, 'paramMap', {}) ?? {}) as Record<string, string>;
        const figshareTargetFieldKey = String(_.get(jobConfig, 'figshareTargetFieldKey', '') ?? '');
        const figshareTargetFieldValue = String(_.get(jobConfig, 'figshareTargetFieldValue', '') ?? '');
        const username = String(_.get(jobConfig, 'username', '') ?? '');
        const userType = String(_.get(jobConfig, 'userType', '') ?? '');
        const user = await UsersService.getUserWithUsername(username).toPromise();

        if (!user || !user?.username || user?.type !== userType) {
          sails.log.error(`FigService - cannot run job because could not find user with username '${username}' and type '${userType}' user:`, user);
          return;
        }

        const namedQueryConfig = await NamedQueryService.getNamedQueryConfig(brand, namedQuery);
        const queryResults = await NamedQueryService.performNamedQueryFromConfigResults(namedQueryConfig, paramMap, brand, namedQuery, start, rows, maxRecords, user);

        for (const queryResult of queryResults) {
          const oid = String(_.get(queryResult, 'oid', ''));
          if (oid === '') {
            continue;
          }
          try {
            const record = await RecordsService.getMeta(oid) as AnyRecord;
            const config = this.getV2Config(record);
            if (config == null) {
              continue;
            }
            const articleId = String(_.get(record, config.record.articleIdPath, ''));
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
