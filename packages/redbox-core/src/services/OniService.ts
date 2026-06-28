// Copyright (c) 2023 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991

import _ from 'lodash';
import { firstValueFrom } from 'rxjs';
import { Services as services } from '../CoreService';
import { RBValidationError } from '../model/RBValidationError';
import { IntegrationAuditAction } from '../model/storage/IntegrationAuditModel';
import type { IntegrationAuditContext } from './IntegrationAuditService';
import { getBrand, resolveOniPublishingConfig, resolveOniSite } from './oni-v2/config';
import { createRunContext } from './oni-v2/context';
import { applyCitationWriteBack, applyPublicationError } from './oni-v2/crate';
import { createOniRepository } from './oni-v2/repository';
import { completeOniAudit, failOniAudit, startOniAudit } from './oni-v2/audit';
import { runPublishDatasetProgram } from './oni-v2/runtime';
import type { AnyRecord, OniRecordModel, OniUserModel } from './oni-v2/types';
import type { OniPublishingSiteConfig } from '../configmodels/OniPublishing';
import type {
  OniOcflRepository,
  OniPublishInput,
  OniPublishResult,
  OniRunContext,
  ResolvedOniPublishingConfigData,
} from './oni-v2/types';

export namespace Services {
  /**
   * Creates an RO-Crate from a ReDBox data publication record and publishes it as
   * an OCFL object using the per-brand oniPublishing app-config.
   */
  export class OniService extends services.Core.Service {
    protected override _exportedMethods: string[] = ['exportDataset', 'init', 'getConfig'];

    constructor() {
      super();
      this.logHeader = 'OniService::';
    }

    public override init(): void {
      // Kept as an exported lifecycle method for loader compatibility. Runtime
      // dependencies are resolved lazily per publish so brand config is current.
    }

    public getConfig(record?: OniRecordModel) {
      return resolveOniPublishingConfig(record);
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
      const creator = await firstValueFrom(UsersService.getUserWithUsername(creatorUsername));
      if (_.isEmpty(creator)) {
        const msg = 'Error getting creator for record';
        throw new RBValidationError({
          message: `${msg}: site ${siteName} oid ${oid} creator ${creatorUsername}`,
          displayErrors: [{ detail: msg, meta: { oid, site: siteName, creator: creatorUsername } }],
        });
      }
      return creator as OniUserModel;
    }

    private summarizeError(error: unknown): Record<string, unknown> {
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

    private async persistRecord(oid: string, record: OniRecordModel, user: OniUserModel): Promise<void> {
      const brand = getBrand(record);
      await RecordsService.updateMeta(brand, oid, record as AnyRecord, user as AnyRecord, true, false);
    }

    private async recordPublicationError(
      oid: string,
      record: OniRecordModel,
      user: OniUserModel,
      error: Error
    ): Promise<void> {
      const config = this.getConfig(record);
      if (config == null) {
        return;
      }
      applyPublicationError(record, config, error);
      await this.persistRecord(oid, record, user);
    }

    protected createRepository(
      config: ResolvedOniPublishingConfigData,
      site: OniPublishingSiteConfig
    ): OniOcflRepository {
      return createOniRepository(config, site);
    }

    protected runPublishDataset(
      input: OniPublishInput,
      config: ResolvedOniPublishingConfigData,
      runContext: OniRunContext,
      repository: OniOcflRepository,
      auditContext: IntegrationAuditContext | null
    ): Promise<OniPublishResult> {
      return runPublishDatasetProgram(input, config, runContext, repository, { auditContext });
    }

    public async exportDataset(oid: string, record: unknown, options: unknown, user: unknown): Promise<OniRecordModel> {
      const recordObj = this.ensureRecord(record);
      const optionsObj = options != null && typeof options === 'object' ? (options as AnyRecord) : {};
      if (this.metTriggerCondition(oid, recordObj as AnyRecord, optionsObj, user) !== 'true') {
        sails.log.debug(`Not publishing: ${oid}, condition not met: ${String(optionsObj.triggerCondition ?? '')}`);
        return recordObj;
      }

      const config = this.getConfig(recordObj);
      if (config == null) {
        sails.log.debug(`Not publishing: ${oid}, oniPublishing is disabled`);
        return recordObj;
      }

      const { siteName, site } = resolveOniSite(config, optionsObj);
      const userObj = this.ensureUser(user, oid, siteName);
      const runContext = createRunContext(
        recordObj,
        oid,
        siteName,
        String(optionsObj.jobId ?? `${oid}:${siteName}`),
        String(optionsObj.triggerSource ?? 'exportDataset')
      );
      let auditCtx: IntegrationAuditContext | null = null;
      auditCtx = startOniAudit(oid, IntegrationAuditAction.publishOniDataset, runContext, {
        site: siteName,
        storageDriver: site.storage.driver,
        triggerSource: runContext.triggerSource,
      });

      let result: OniPublishResult;
      try {
        const creator = await this.resolveCreator(recordObj, oid, siteName);
        const repository = this.createRepository(config, site);
        result = await this.runPublishDataset(
          { oid, record: recordObj, options: optionsObj, user: userObj, creator },
          config,
          runContext,
          repository,
          auditCtx
        );
      } catch (error) {
        const err = this.asError(error);
        try {
          await this.recordPublicationError(oid, recordObj, userObj, err);
        } catch (persistError) {
          sails.log.error(`${this.logHeader} failed to persist Oni publication error for '${oid}'`);
          sails.log.error(persistError);
        }
        failOniAudit(auditCtx, error, {
          message: 'Oni dataset publish failed.',
          ...this.summarizeError(error),
        });
        throw this.toValidationError(error, oid, siteName, 'Error publishing dataset to Oni OCFL');
      }

      applyCitationWriteBack(recordObj, config, result.datasetUrl);
      try {
        await this.persistRecord(oid, recordObj, userObj);
        completeOniAudit(auditCtx, {
          message: 'Oni dataset publish completed.',
          responseSummary: {
            site: siteName,
            storageDriver: result.storageDriver,
            rootId: result.rootId,
            datasetUrl: result.datasetUrl,
            attachmentCount: result.attachments.length,
          },
        });
        return recordObj;
      } catch (error) {
        failOniAudit(auditCtx, error, {
          message: 'Oni dataset publish metadata persistence failed.',
          ...this.summarizeError(error),
        });
        throw this.toValidationError(error, oid, siteName, 'Error persisting Oni publication metadata');
      }
    }
  }
}

declare global {
  let OniService: Services.OniService;
}
