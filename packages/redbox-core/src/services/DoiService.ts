// Copyright (c) 2021 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991

import { of } from 'rxjs';
import _ from 'lodash';
import { Services as services } from '../CoreService';
import { RBValidationError } from '../model/RBValidationError';
import { BrandingModel } from '../model/storage/BrandingModel';
import { evaluateBinding, asTrimmedString } from './doi-v2/bindings';
import { completeDoiAudit, failDoiAudit, startDoiAudit } from './doi-v2/audit';
import { resolveDoiPublishingConfig, resolveDoiPublishingConfigAsync } from './doi-v2/config';
import { createBindingContext, createRunContext } from './doi-v2/context';
import { buildDoiPayload } from './doi-v2/payload';
import { resolveProfile } from './doi-v2/profiles';
import {
  runChangeDoiStateProgram,
  runCreateDoiProgram,
  runDeleteDoiProgram,
  runUpdateDoiProgram
} from './doi-v2/runtime';
import type { DoiRecordModel } from './doi-v2/types';
import { IntegrationAuditAction } from '../model/storage/IntegrationAuditModel';
import { DoiPublishing } from '../configmodels/DoiPublishing';
import type { IntegrationAuditContext } from './IntegrationAuditService';

type DoiAction = 'create' | 'update';
type DoiAuditOptions = Record<string, unknown> & {
  auditParentContext?: Pick<IntegrationAuditContext, 'traceId' | 'spanId'>;
};

export namespace Services {
  export class Doi extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'init',
      'publishDoi',
      'publishDoiTrigger',
      'publishDoiTriggerSync',
      'updateDoiTriggerSync',
      'deleteDoi',
      'changeDoiState',
      'getAuthenticationString',
      'addDoiDataToRecord'
    ];

    private _msgPrefix!: string;

    private msgPrefix() {
      if (!this._msgPrefix) {
        this._msgPrefix = TranslationService.t('Datacite API error');
      }
      return this._msgPrefix;
    }

    private async resolveConfig(record?: DoiRecordModel): Promise<DoiPublishing | null> {
      return resolveDoiPublishingConfigAsync(record);
    }

    private summarizeError(error: unknown): { statusCode?: number; requestSummary?: Record<string, unknown>; responseSummary?: Record<string, unknown> } {
      if (error instanceof RBValidationError) {
        return {
          requestSummary: _.get(error, 'requestSummary') as Record<string, unknown> | undefined,
          responseSummary: {
            displayErrors: error.displayErrors
          }
        };
      }
      const statusCode = _.get(error, 'statusCode') as number | undefined;
      const responseBody = _.get(error, 'responseBody') as Record<string, unknown> | undefined;
      const causeCode = _.get(error, 'cause.code') as string | undefined;
      const causeMessage = _.get(error, 'cause.message') as string | undefined;
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        statusCode,
        responseSummary: responseBody != null && typeof responseBody === 'object'
          ? responseBody
          : {
            errorType: error instanceof Error ? error.name : typeof error,
            message: errorMessage,
            ...(statusCode != null ? { statusCode } : {}),
            ...(causeCode != null ? { causeCode } : {}),
            ...(causeMessage != null ? { causeMessage } : {})
          }
      };
    }

    private wrapHttpError(error: unknown, message: string, fallbackStatus?: number): never {
      const statusCode = (_.get(error, 'statusCode') as number | undefined) ?? fallbackStatus;
      if (error instanceof RBValidationError) {
        throw error;
      }
      throw new RBValidationError({
        message: `${this.msgPrefix()} ${message}`,
        options: { cause: error },
        displayErrors: this.doiResponseToRBValidationError(statusCode ?? 500).displayErrors
      });
    }

    private doiResponseToRBValidationError(statusCode: number, messagePrefix?: string): RBValidationError {
      let message: string;
      switch (statusCode) {
        case 403:
          message = 'not-authorised';
          break;
        case 404:
          message = 'not-found';
          break;
        case 422:
          message = 'invalid-format';
          break;
        case 500:
          message = 'server-error';
          break;
        default:
          message = 'unknown-error';
          break;
      }
      const translated = TranslationService.t(message);
      return new RBValidationError({
        message: `${this.msgPrefix()} ${messagePrefix ?? translated}`,
        displayErrors: [{ code: message, title: this.msgPrefix(), detail: translated }]
      });
    }

    public getAuthenticationString(record?: DoiRecordModel) {
      const config = resolveDoiPublishingConfig(record);
      const username = String(config?.connection.username ?? '');
      const password = String(config?.connection.password ?? '');
      return Buffer.from(`${username}:${password}`).toString('base64');
    }

    private async publishV2Doi(
      oid: string,
      record: DoiRecordModel,
      config: DoiPublishing,
      event: string,
      action: DoiAction,
      options: DoiAuditOptions
    ): Promise<string | null> {
      const resolvedProfile = resolveProfile(config, options);
      const runContext = createRunContext(record, resolvedProfile.name, undefined, String(options.triggerSource ?? 'publishDoi'));
      const auditAction = action === 'update' ? IntegrationAuditAction.updateDoi : IntegrationAuditAction.publishDoi;
      const auditCtx = startDoiAudit(oid, auditAction, runContext, {
        event,
        action,
        profile: resolvedProfile.name
      }, options.auditParentContext);
      let requestSummary: Record<string, unknown> | undefined;

      try {
        const prefix = asTrimmedString(await evaluateBinding(resolvedProfile.profile.metadata.prefix, createBindingContext(record, oid, resolvedProfile.profile)));
        const citationDoi = asTrimmedString(_.get(record, resolvedProfile.profile.writeBack.citationDoiPath));
        if (action === 'update' && citationDoi == null) {
          throw new RBValidationError({
            message: `Could not update DOI for oid ${oid}: doi-required`,
            displayErrors: [{ code: 'doi-required', title: 'datacite-validation-error', meta: { oid, action, event } }]
          });
        }
        if (action === 'update' && citationDoi != null && prefix != null && !citationDoi.startsWith(prefix)) {
          sails.log.warn(`The citation DOI ${citationDoi} does not begin with the correct prefix ${prefix}. Will not attempt to update`);
          completeDoiAudit(auditCtx, { message: 'Skipped DOI update because the stored DOI prefix does not match the configured profile prefix.' });
          return null;
        }

        const payload = await buildDoiPayload(record, oid, resolvedProfile.profile, action, event);
        requestSummary = {
          event,
          action,
          profile: resolvedProfile.name,
          ...(citationDoi != null ? { doi: citationDoi } : {}),
          requestBody: payload,
        };
        const result = action === 'update'
          ? await runUpdateDoiProgram(config, runContext, String(citationDoi), payload)
          : await runCreateDoiProgram(config, runContext, payload);

        completeDoiAudit(auditCtx, {
          message: action === 'update' ? 'DOI updated successfully.' : 'DOI published successfully.',
          httpStatusCode: result.statusCode,
          requestSummary,
          responseSummary: result.responseSummary
        });
        return result.doi ?? null;
      } catch (error) {
        const errorSummary = this.summarizeError(error);
        failDoiAudit(auditCtx, error, {
          message: action === 'update' ? 'DOI update failed.' : 'DOI publish failed.',
          httpStatusCode: errorSummary.statusCode,
          requestSummary: requestSummary ?? errorSummary.requestSummary,
          responseSummary: errorSummary.responseSummary
        });
        this.wrapHttpError(error, action === 'update' ? TranslationService.t('Error updating DOI') : TranslationService.t('Error creating DOI'));
      }
    }

    public async publishDoi(
      oid: string,
      record: DoiRecordModel,
      event = 'publish',
      action: DoiAction = 'create',
      options: DoiAuditOptions = {}
    ): Promise<string | null> {
      const config = await this.resolveConfig(record);
      if (config == null) {
        return null;
      }
      const effectiveEvent = event || (action === 'update' ? config.operations.updateEvent : config.operations.createEvent);
      return this.publishV2Doi(oid, record, config, effectiveEvent, action, options);
    }

    public async deleteDoi(doi: string): Promise<boolean> {
      const config = await this.resolveConfig();
      if (config == null) {
        return false;
      }

      const runContext = createRunContext({ metadata: {}, branding: 'default' }, undefined, undefined, 'deleteDoi');
      const auditCtx = startDoiAudit(doi, IntegrationAuditAction.deleteDoi, runContext, { doi });
      try {
        const result = await runDeleteDoiProgram(config, runContext, doi);
        completeDoiAudit(auditCtx, {
          message: 'DOI deleted successfully.',
          httpStatusCode: result.statusCode,
          responseSummary: result.responseSummary
        });
        return result.statusCode === 204;
      } catch (error) {
        const errorSummary = this.summarizeError(error);
        failDoiAudit(auditCtx, error, {
          message: 'DOI delete failed.',
          httpStatusCode: errorSummary.statusCode,
          responseSummary: errorSummary.responseSummary
        });
        this.wrapHttpError(error, TranslationService.t('Error deleting DOI'));
      }
    }

    public async changeDoiState(doi: string, event: string): Promise<boolean> {
      const config = await this.resolveConfig();
      if (config == null) {
        return false;
      }

      const runContext = createRunContext({ metadata: {}, branding: 'default' }, undefined, undefined, 'changeDoiState');
      const auditCtx = startDoiAudit(doi, IntegrationAuditAction.changeDoiState, runContext, { doi, event });
      try {
        const result = await runChangeDoiStateProgram(config, runContext, doi, event);
        completeDoiAudit(auditCtx, {
          message: 'DOI state changed successfully.',
          httpStatusCode: result.statusCode,
          responseSummary: result.responseSummary
        });
        return result.statusCode === 200;
      } catch (error) {
        const errorSummary = this.summarizeError(error);
        failDoiAudit(auditCtx, error, {
          message: 'DOI state change failed.',
          httpStatusCode: errorSummary.statusCode,
          responseSummary: errorSummary.responseSummary
        });
        this.wrapHttpError(error, TranslationService.t('Error changing DOI state'));
      }
    }

    public async publishDoiTrigger(oid: string, record: DoiRecordModel, options: Record<string, unknown>): Promise<unknown> {
      if (this.metTriggerCondition(oid, record, options) === 'true') {
        const runContext = createRunContext(record, String(options.profile ?? ''), undefined, 'publishDoiTrigger');
        const auditCtx = startDoiAudit(oid, IntegrationAuditAction.publishDoiTrigger, runContext, options);
        try {
          const brand: BrandingModel = BrandingService.getBrand('default');
          const doi = await this.publishDoi(oid, record, String(options.event ?? 'publish'), 'create', {
            ...options,
            triggerSource: 'publishDoiTrigger',
            auditParentContext: auditCtx ?? undefined,
          });
          if (doi != null) {
            record = await this.addDoiDataToRecord(oid, record, doi, options);
            RecordsService.updateMeta(brand, oid, record).then(() => { });
          }
          completeDoiAudit(auditCtx, { message: 'DOI trigger completed.' });
        } catch (error) {
          failDoiAudit(auditCtx, error, this.summarizeError(error));
          throw error;
        }
      }
      return of(null);
    }

    public async publishDoiTriggerSync(oid: string, record: DoiRecordModel, options: Record<string, unknown>): Promise<DoiRecordModel> {
      if (this.metTriggerCondition(oid, record, options) === 'true') {
        const runContext = createRunContext(record, String(options.profile ?? ''), undefined, 'publishDoiTriggerSync');
        const auditCtx = startDoiAudit(oid, IntegrationAuditAction.publishDoiTriggerSync, runContext, options);
        try {
          const doi = await this.publishDoi(oid, record, String(options.event ?? 'publish'), 'create', {
            ...options,
            triggerSource: 'publishDoiTriggerSync',
            auditParentContext: auditCtx ?? undefined,
          });
          if (doi != null) {
            record = await this.addDoiDataToRecord(oid, record, doi, options);
          }
          completeDoiAudit(auditCtx, { message: 'DOI trigger sync completed.' });
        } catch (error) {
          failDoiAudit(auditCtx, error, this.summarizeError(error));
          throw error;
        }
      }
      return record;
    }

    public async updateDoiTriggerSync(oid: string, record: DoiRecordModel, options: Record<string, unknown>): Promise<DoiRecordModel> {
      if (this.metTriggerCondition(oid, record, options) === 'true') {
        const runContext = createRunContext(record, String(options.profile ?? ''), undefined, 'updateDoiTriggerSync');
        const auditCtx = startDoiAudit(oid, IntegrationAuditAction.updateDoiTriggerSync, runContext, options);
        try {
          await this.publishDoi(oid, record, String(options.event ?? 'publish'), 'update', {
            ...options,
            triggerSource: 'updateDoiTriggerSync',
            auditParentContext: auditCtx ?? undefined,
          });
          completeDoiAudit(auditCtx, { message: 'DOI update trigger sync completed.' });
        } catch (error) {
          failDoiAudit(auditCtx, error, this.summarizeError(error));
          throw error;
        }
      }
      return record;
    }

    public async addDoiDataToRecord(
      oid: string,
      record: DoiRecordModel,
      doi: string,
      options: Record<string, unknown> = {}
    ): Promise<DoiRecordModel> {
      const config = await this.resolveConfig(record);
      if (config == null) {
        return record;
      }

      const resolvedProfile = resolveProfile(config, options);
      const url = asTrimmedString(await evaluateBinding(resolvedProfile.profile.metadata.url, createBindingContext(record, oid, resolvedProfile.profile)));
      _.set(record, resolvedProfile.profile.writeBack.citationDoiPath, doi);
      if (url != null) {
        _.set(record, resolvedProfile.profile.writeBack.citationUrlPath, url);
      }

      const generatedPath = String(resolvedProfile.profile.writeBack.generatedCitationPath ?? '').trim();
      if (generatedPath !== '' && resolvedProfile.profile.writeBack.citationString != null) {
        const citationValue = await evaluateBinding(
          resolvedProfile.profile.writeBack.citationString,
          createBindingContext(record, oid, resolvedProfile.profile)
        );
        const citation = asTrimmedString(citationValue);
        if (citation != null) {
          _.set(record, generatedPath, citation);
        }
      }

      for (const extraField of resolvedProfile.profile.writeBack.extraFields ?? []) {
        const value = _.get(record, extraField.sourcePath);
        if (value !== undefined) {
          _.set(record, extraField.targetPath, value);
        }
      }
      return record;
    }
  }
}
