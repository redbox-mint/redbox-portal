// Copyright (c) 2023 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991

import _ from 'lodash';
import { metTriggerCondition } from '../utilities/metTriggerCondition';
import type { OniInput } from './oni/input';
import { RBValidationError } from '../model/RBValidationError';
import { IntegrationAuditAction } from '../model/storage/IntegrationAuditModel';
import type { IntegrationAuditContext } from '../queries/IntegrationAudits';
import { getRequestedOniSiteName, resolveOniSite } from './oni/config';
import { createRunContext } from './oni/context';
import { applyCitationWriteBack, applyPublicationError } from '../services/oni-v2/crate';
import type { AnyRecord, OniRecordModel, OniUserModel } from '../services/oni-v2/types';
import type { OniPublishingSiteConfig } from '../configmodels/OniPublishing';
import type {
  OniOcflRepository,
  OniPublishInput,
  OniPublishResult,
  OniRunContext,
  ResolvedOniPublishingConfigData,
} from '../services/oni-v2/types';
import { ingestOniRepository, type OniIngestionResult } from '../services/oni-v2/ingestion';
import { createRecordMetadataDelta } from '../RecordsService';

export namespace Services {
  /**
   * Creates an RO-Crate from a ReDBox data publication record and publishes it as
   * an OCFL object using the per-brand oniPublishing app-config.
   */
  export class OniService {
    private readonly pending = new Set<Promise<unknown>>();
    public async drain(): Promise<void> {
      while (this.pending.size) await Promise.allSettled([...this.pending]);
    }
    public close(): Promise<void> {
      return this.drain();
    }
    private retain<T>(operation: () => Promise<T>): Promise<T> {
      const work = this.input.runWork(operation);
      this.pending.add(work);
      void work.then(
        () => this.pending.delete(work),
        () => this.pending.delete(work)
      );
      return work;
    }
    public readonly logHeader = 'OniService::';
    protected metTriggerCondition(...args: Parameters<typeof metTriggerCondition>): string {
      return metTriggerCondition(...args);
    }
    protected _exportedMethods: string[] = ['exportDataset', 'init', 'getConfig'];

    constructor(protected readonly input: OniInput) {}

    public init(): void {
      // Kept as an exported lifecycle method for loader compatibility. Runtime
      // dependencies are resolved lazily per publish so brand config is current.
    }

    public getConfig(record?: OniRecordModel) {
      return this.input.configuration(record);
    }

    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
    }

    private ensureRecord(record: unknown): OniRecordModel {
      const recordObj = record != null && typeof record === 'object' ? (record as OniRecordModel) : { metadata: {} };
      recordObj.metadata = recordObj.metadata ?? {};
      return recordObj;
    }

    private ensureUser(user: unknown, oid: string, siteName: string): OniUserModel {
      const userObj = user != null && typeof user === 'object' ? (user as OniUserModel) : {};
      if (_.isEmpty(userObj.email)) {
        const msg = 'Empty user or no email found';
        throw new RBValidationError({
          message: `${msg}: site ${siteName} oid ${oid}`,
          displayErrors: [{ detail: msg, meta: { oid, site: siteName } }],
        });
      }
      return userObj;
    }

    private async resolveCreator(record: OniRecordModel, oid: string, siteName: string): Promise<OniUserModel> {
      const creatorUsername = String(record.metaMetadata?.createdBy ?? '').trim();
      const creator = await this.input.creator(creatorUsername);
      if (_.isEmpty(creator)) {
        const msg = 'Error getting creator for record';
        throw new RBValidationError({
          message: `${msg}: site ${siteName} oid ${oid} creator ${creatorUsername}`,
          displayErrors: [{ detail: msg, meta: { oid, site: siteName, creator: creatorUsername } }],
        });
      }
      return creator as OniUserModel;
    }

    private summarizeError(error: unknown): { responseSummary: Record<string, unknown> } {
      if (error instanceof RBValidationError) {
        return {
          responseSummary: {
            displayErrors: error.displayErrors,
          },
        };
      }
      return {
        responseSummary: {
          errorType: error instanceof Error ? error.name : typeof error,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }

    private toValidationError(error: unknown, oid: string, siteName: string, message: string): RBValidationError {
      if (error instanceof RBValidationError) {
        return error;
      }
      return new RBValidationError({
        message: `${message}: site ${siteName} oid ${oid}`,
        options: { cause: error },
        displayErrors: [{ detail: message, meta: { oid, site: siteName } }],
      });
    }

    private async persistRecord(
      oid: string,
      record: OniRecordModel,
      user: OniUserModel,
      previousMetadata: unknown
    ): Promise<void> {
      const brand = this.input.brand(record);
      const response = await this.input.records.updateMetaInternal({
        actor: { kind: 'service', id: 'OniService.persistRecord' },
        authorization: { kind: 'service' },
        mutationClass: 'external-side-effect',
        brand,
        oid,
        record: record as AnyRecord,
        user: user as AnyRecord,
        triggerPreSaveTriggers: true,
        triggerPostSaveTriggers: false,
        metadata: createRecordMetadataDelta(previousMetadata, record.metadata),
        metadataMode: 'pre-applied',
      });
      if (!response.wasPersisted()) {
        throw new Error(String(response.message ?? response.outcome));
      }
      if (response.outcome === 'saved-with-warnings') {
        this.input.log.warn(`OniService - metadata writeback persisted with warnings for ${oid}`, {
          requestId: response.requestId,
        });
      }
    }

    private async recordPublicationError(
      oid: string,
      record: OniRecordModel,
      user: OniUserModel,
      error: Error,
      previousMetadata: unknown
    ): Promise<void> {
      const config = this.getConfig(record);
      if (config == null) {
        return;
      }
      applyPublicationError(record, config, error);
      await this.persistRecord(oid, record, user, previousMetadata);
    }

    protected createRepository(
      config: ResolvedOniPublishingConfigData,
      site: OniPublishingSiteConfig
    ): OniOcflRepository {
      const repository = this.input.createRepository(config, site);
      return {
        ensureStorageRoot: () => this.retain(() => repository.ensureStorageRoot()),
        ensureRootCollection: (...args) => this.retain(() => repository.ensureRootCollection(...args)),
        writeDatasetObject: (...args) => this.retain(() => repository.writeDatasetObject(...args)),
      };
    }

    protected runPublishDataset(
      input: OniPublishInput,
      config: ResolvedOniPublishingConfigData,
      runContext: OniRunContext,
      repository: OniOcflRepository,
      auditContext: IntegrationAuditContext | null
    ): Promise<OniPublishResult> {
      return this.input.publish(input, config, runContext, repository, {
        auditContext,
        auditService: this.input.audit,
      });
    }

    protected async ingestDataset(
      oid: string,
      site: OniPublishingSiteConfig,
      runContext: OniRunContext,
      parentAuditContext: IntegrationAuditContext | null
    ): Promise<OniIngestionResult | undefined> {
      const ingestion = site.ingestion;
      if (ingestion?.enabled !== true) {
        return undefined;
      }
      const auditContext = this.input.audit.start(
        oid,
        IntegrationAuditAction.ingestOniDataset,
        runContext,
        {
          site: runContext.siteName,
          phase: 'ingest-oni',
          apiUrl: ingestion.apiUrl,
          forceReindex: ingestion.forceReindex,
        },
        parentAuditContext
      );
      try {
        const result = await ingestOniRepository(ingestion);
        await this.input.audit.complete(auditContext, {
          message: 'Oni repository ingestion completed.',
          responseSummary: {
            site: runContext.siteName,
            structuralObjects: result.structuralObjects,
            searchItems: result.searchItems,
          },
        });
        return result;
      } catch (error) {
        await this.input.audit.fail(auditContext, error, {
          message: 'Oni repository ingestion failed.',
          ...this.summarizeError(error),
        });
        throw error;
      }
    }

    public async exportDataset(oid: string, record: unknown, options: unknown, user: unknown): Promise<OniRecordModel> {
      const recordObj = this.ensureRecord(record);
      const optionsObj = options != null && typeof options === 'object' ? (options as AnyRecord) : {};
      if (this.metTriggerCondition(oid, recordObj as AnyRecord, optionsObj, user) !== 'true') {
        this.input.log.debug(`Not publishing: ${oid}, condition not met: ${String(optionsObj.triggerCondition ?? '')}`);
        return recordObj;
      }

      const config = this.getConfig(recordObj);
      if (config == null) {
        this.input.log.debug(`Not publishing: ${oid}, oniPublishing is disabled`);
        return recordObj;
      }
      const previousMetadata = _.cloneDeep(recordObj.metadata);

      let siteName = getRequestedOniSiteName(config, optionsObj);
      if (siteName === '') {
        siteName = 'unresolved';
      }
      const runContext = createRunContext(
        this.input.brandName(recordObj),
        recordObj,
        oid,
        siteName,
        String(optionsObj.jobId ?? `${oid}:${siteName}`),
        String(optionsObj.triggerSource ?? 'exportDataset')
      );
      let auditCtx: IntegrationAuditContext | null = null;
      auditCtx = this.input.audit.start(oid, IntegrationAuditAction.publishOniDataset, runContext, {
        site: siteName,
        triggerSource: runContext.triggerSource,
      });

      let result: OniPublishResult | undefined;
      let ingestionResult: OniIngestionResult | undefined;
      let userObj: OniUserModel | null = null;
      try {
        userObj = this.ensureUser(user, oid, siteName);
        const resolvedSite = resolveOniSite(config, optionsObj);
        siteName = resolvedSite.siteName;
        runContext.siteName = siteName;
        const creator = await this.resolveCreator(recordObj, oid, siteName);
        const repository = this.createRepository(config, resolvedSite.site);
        result = await this.runPublishDataset(
          { oid, record: recordObj, options: optionsObj, user: userObj, creator },
          config,
          runContext,
          repository,
          auditCtx
        );
        applyCitationWriteBack(recordObj, config, result.datasetUrl);
        ingestionResult = await this.ingestDataset(oid, resolvedSite.site, runContext, auditCtx);
      } catch (error) {
        const err = this.asError(error);
        if (userObj != null) {
          try {
            await this.recordPublicationError(oid, recordObj, userObj, err, previousMetadata);
          } catch (persistError) {
            this.input.log.error(`${this.logHeader} failed to persist Oni publication error for '${oid}'`);
            this.input.log.error(persistError);
          }
        }
        const errorSummary = this.summarizeError(error).responseSummary;
        await this.input.audit.fail(auditCtx, error, {
          message:
            result == null
              ? 'Oni dataset publish failed.'
              : 'Oni OCFL write completed, but repository ingestion failed.',
          responseSummary: {
            ...errorSummary,
            ...(result == null
              ? {}
              : {
                  ocflWriteCompleted: true,
                  storageDriver: result.storageDriver,
                  rootId: result.rootId,
                  datasetUrl: result.datasetUrl,
                }),
          },
        });
        throw this.toValidationError(
          error,
          oid,
          siteName,
          result == null
            ? 'Error publishing dataset to Oni OCFL'
            : 'Oni OCFL publication completed but repository ingestion failed'
        );
      }

      if (userObj == null) {
        throw new Error(`Oni publish completed without a resolved user for '${oid}'`);
      }
      try {
        await this.persistRecord(oid, recordObj, userObj, previousMetadata);
        await this.input.audit.complete(auditCtx, {
          message: 'Oni dataset publish completed.',
          responseSummary: {
            site: siteName,
            storageDriver: result.storageDriver,
            rootId: result.rootId,
            datasetUrl: result.datasetUrl,
            attachmentCount: result.attachments.length,
            ...(ingestionResult == null
              ? {}
              : {
                  structuralObjects: ingestionResult.structuralObjects,
                  searchItems: ingestionResult.searchItems,
                }),
          },
        });
        return recordObj;
      } catch (error) {
        await this.input.audit.fail(auditCtx, error, {
          message: 'Oni dataset publish metadata persistence failed.',
          ...this.summarizeError(error),
        });
        throw this.toValidationError(error, oid, siteName, 'Error persisting Oni publication metadata');
      }
    }
  }
}
