// Copyright (c) 2021 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991

import { of } from 'rxjs';
import axios from 'axios';
import _ from 'lodash';
import { Services as services } from '../CoreService';
import { RBValidationError } from '../model/RBValidationError';
import { BrandingModel } from '../model/storage/BrandingModel';
import type {
  VocabServiceLookupOption,
  VocabServiceLookupRequest,
  VocabServiceLookupResponse
} from '../config/vocab.config';
import { evaluateBinding, asTrimmedString } from './doi-v2/bindings';
import { completeDoiAudit, failDoiAudit, startDoiAudit } from './doi-v2/audit';
import { resolveDoiPublishingConfig, resolveDoiPublishingConfigAsync, resolveDoiPublishingConfigForBrand } from './doi-v2/config';
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
  auditContext?: IntegrationAuditContext | null;
};
type DataciteLookupValueField = 'doi' | 'id' | 'url';
type DataciteLookupParamValue = string | number | boolean | Array<string | number | boolean>;

interface DataciteDoiLookupOptions {
  baseUrl?: string;
  timeoutMs?: number;
  maxRows?: number;
  defaultParams?: Record<string, DataciteLookupParamValue>;
  fields?: string[];
  labelTemplate?: string;
  valueField?: DataciteLookupValueField;
  includeRaw?: boolean;
  allowEmptySearch?: boolean;
}

interface NormalizedDataciteDoiLookupOptions {
  baseUrl: string;
  timeoutMs: number;
  maxRows: number;
  defaultParams: Record<string, DataciteLookupParamValue>;
  fields: string[];
  labelTemplate?: string;
  valueField: DataciteLookupValueField;
  includeRaw: boolean;
  allowEmptySearch: boolean;
}

interface DataciteDoiItem {
  id?: string;
  attributes?: {
    doi?: string;
    titles?: Array<{ title?: string }>;
    publisher?: string | { name?: string };
    publicationYear?: number;
    types?: { resourceTypeGeneral?: string; resourceType?: string };
    url?: string;
  };
}

interface DataciteDoiLookupApiResponse {
  data?: DataciteDoiItem[];
  meta?: {
    total?: number;
    totalPages?: number;
    page?: number;
  };
  links?: Record<string, unknown>;
}

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
      'lookupDataciteDois',
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

    public async lookupDataciteDois(request: VocabServiceLookupRequest): Promise<VocabServiceLookupResponse> {
      const options = this.normalizeDataciteLookupOptions(request.options);
      const requestedRows = Number.isInteger(request.rows) ? request.rows : 0;
      const start = Number.isInteger(request.start) && request.start > 0 ? request.start : 0;

      if (requestedRows <= 0) {
        return {
          data: [],
          meta: {
            total: 0,
            start,
            rows: 0,
            source: 'datacite'
          }
        };
      }

      const rows = Math.min(requestedRows, options.maxRows);
      const search = String(request.search ?? '').trim().slice(0, 300);
      if (search === '' && !options.allowEmptySearch) {
        return {
          data: [],
          meta: {
            total: 0,
            start,
            rows,
            source: 'datacite'
          }
        };
      }

      const params = new URLSearchParams();
      if (search !== '') {
        params.set('query', search);
      }
      params.set('page[number]', String(Math.floor(start / rows) + 1));
      params.set('page[size]', String(rows));
      this.appendDataciteParams(params, options.defaultParams);
      if (options.fields.length > 0) {
        params.set('fields[dois]', options.fields.join(','));
      }

      try {
        const response = await axios.get<DataciteDoiLookupApiResponse>(`${options.baseUrl}/dois`, {
          timeout: options.timeoutMs,
          headers: {
            Accept: 'application/vnd.api+json'
          },
          params
        });
        return this.mapDataciteLookupResponse(response.data, request, rows, options);
      } catch (error) {
        if (this.isDataciteLookupError(error)) {
          throw error;
        }

        const statusCode = axios.isAxiosError(error) ? error.response?.status : undefined;
        sails.log.warn(
          `DataCite DOI lookup failed for provider '${request.serviceId}' with status '${statusCode ?? 'unknown'}' and query length ${search.length}.`
        );
        throw this.createDataciteLookupError(
          `DataCite DOI lookup request failed${statusCode != null ? ` with status ${statusCode}` : ''}.`,
          statusCode,
          error
        );
      }
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
      }, options.auditContext);
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
          ? await runUpdateDoiProgram(config, runContext, String(citationDoi), payload, {
            auditContext: auditCtx,
            requestSummary,
          })
          : await runCreateDoiProgram(config, runContext, payload, {
            auditContext: auditCtx,
            requestSummary,
          });

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

    public async deleteDoi(brand: BrandingModel, doi: string): Promise<boolean> {
      const config = resolveDoiPublishingConfigForBrand(brand);
      if (config == null) {
        return false;
      }

      const runContext = createRunContext({ metadata: {}, branding: brand.name, metaMetadata: { brandId: brand.id } }, undefined, undefined, 'deleteDoi');
      const auditCtx = startDoiAudit(doi, IntegrationAuditAction.deleteDoi, runContext, { doi });
      try {
        const result = await runDeleteDoiProgram(config, runContext, doi, {
          auditContext: auditCtx,
          requestSummary: { doi },
        });
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

    public async changeDoiState(brand: BrandingModel, doi: string, event: string): Promise<boolean> {
      const config = resolveDoiPublishingConfigForBrand(brand);
      if (config == null) {
        return false;
      }

      const runContext = createRunContext({ metadata: {}, branding: brand.name, metaMetadata: { brandId: brand.id } }, undefined, undefined, 'changeDoiState');
      const auditCtx = startDoiAudit(doi, IntegrationAuditAction.changeDoiState, runContext, { doi, event });
      try {
        const result = await runChangeDoiStateProgram(config, runContext, doi, event, {
          auditContext: auditCtx,
          requestSummary: { doi, event },
        });
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
            auditContext: auditCtx,
          });
          if (doi != null) {
            record = await this.addDoiDataToRecord(oid, record, doi, options);
            try {
              await RecordsService.updateMeta(brand, oid, record);
            } catch (error) {
              sails.log.error(`Failed to persist DOI metadata for record '${oid}'.`);
              sails.log.error(error);
              throw error;
            }
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
            auditContext: auditCtx,
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
            auditContext: auditCtx,
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

    private normalizeDataciteLookupOptions(options: Record<string, unknown>): NormalizedDataciteDoiLookupOptions {
      const rawOptions = _.isPlainObject(options) ? options as DataciteDoiLookupOptions : {};
      const baseUrl = String(rawOptions.baseUrl ?? 'https://api.datacite.org').trim().replace(/\/+$/, '');
      const timeoutMs = Number.isInteger(rawOptions.timeoutMs) && Number(rawOptions.timeoutMs) > 0
        ? Number(rawOptions.timeoutMs)
        : 10000;
      const maxRows = Number.isInteger(rawOptions.maxRows) && Number(rawOptions.maxRows) > 0
        ? Number(rawOptions.maxRows)
        : 25;
      const fields = Array.isArray(rawOptions.fields)
        ? rawOptions.fields.map(field => String(field ?? '').trim()).filter(field => field !== '')
        : ['doi', 'titles', 'publisher', 'publicationYear', 'types', 'url'];
      const valueField = rawOptions.valueField === 'id' || rawOptions.valueField === 'url'
        ? rawOptions.valueField
        : 'doi';

      return {
        baseUrl: baseUrl || 'https://api.datacite.org',
        timeoutMs,
        maxRows,
        defaultParams: this.normalizeDataciteDefaultParams(rawOptions.defaultParams),
        fields,
        labelTemplate: typeof rawOptions.labelTemplate === 'string' ? rawOptions.labelTemplate : undefined,
        valueField,
        includeRaw: rawOptions.includeRaw !== false,
        allowEmptySearch: rawOptions.allowEmptySearch === true
      };
    }

    private normalizeDataciteDefaultParams(value: unknown): Record<string, DataciteLookupParamValue> {
      const defaults: Record<string, DataciteLookupParamValue> = {
        'disable-facets': true,
        state: 'findable',
        sort: 'relevance'
      };
      if (!_.isPlainObject(value)) {
        return defaults;
      }

      const providedDefaults = value as Record<string, unknown>;

      for (const [key, rawValue] of Object.entries(providedDefaults)) {
        const normalizedKey = String(key ?? '').trim();
        if (!normalizedKey) {
          continue;
        }
        if (Array.isArray(rawValue)) {
          defaults[normalizedKey] = rawValue
            .filter(item => ['string', 'number', 'boolean'].includes(typeof item)) as Array<string | number | boolean>;
          continue;
        }
        if (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean') {
          defaults[normalizedKey] = rawValue;
        }
      }
      return defaults;
    }

    private appendDataciteParams(params: URLSearchParams, values: Record<string, DataciteLookupParamValue>): void {
      for (const [key, value] of Object.entries(values)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            params.append(key, String(item));
          }
          continue;
        }
        params.set(key, String(value));
      }
    }

    private mapDataciteLookupResponse(
      response: DataciteDoiLookupApiResponse | undefined,
      request: VocabServiceLookupRequest,
      rows: number,
      options: NormalizedDataciteDoiLookupOptions
    ): VocabServiceLookupResponse {
      const candidate = response as DataciteDoiLookupApiResponse | undefined;
      if (!candidate || !_.isPlainObject(candidate) || !Array.isArray(candidate.data)) {
        throw this.createDataciteLookupError('DataCite DOI lookup returned an invalid response.');
      }

      const validResponse = candidate as DataciteDoiLookupApiResponse & { data: DataciteDoiItem[] };

      const data = validResponse.data
        .map(item => this.mapDataciteLookupItem(item, options))
        .filter((item): item is VocabServiceLookupOption => item != null);

      return {
        data,
        meta: {
          total: typeof validResponse.meta?.total === 'number' ? validResponse.meta.total : data.length,
          totalPages: validResponse.meta?.totalPages,
          page: validResponse.meta?.page,
          start: request.start,
          rows,
          source: 'datacite',
          links: _.isPlainObject(validResponse.links) ? validResponse.links : undefined
        }
      };
    }

    private mapDataciteLookupItem(
      item: DataciteDoiItem,
      options: NormalizedDataciteDoiLookupOptions
    ): VocabServiceLookupOption | null {
      const id = this.asNonEmptyString(item?.id);
      const doi = this.asNonEmptyString(item?.attributes?.doi) ?? id;
      if (!doi) {
        return null;
      }

      const value = this.selectDataciteLookupValue(item, options.valueField);
      if (!value) {
        return null;
      }

      const title = Array.isArray(item.attributes?.titles)
        ? item.attributes?.titles.map(entry => this.asNonEmptyString(entry?.title)).find(Boolean)
        : undefined;
      const publisher = typeof item.attributes?.publisher === 'string'
        ? this.asNonEmptyString(item.attributes.publisher)
        : this.asNonEmptyString(item.attributes?.publisher?.name);
      const year = item.attributes?.publicationYear != null ? String(item.attributes.publicationYear) : undefined;
      const details = [publisher, year].filter((part): part is string => Boolean(part));
      const label = title
        ? `${title} (${doi})${details.length > 0 ? ` - ${details.join(', ')}` : ''}`
        : doi;

      return {
        label,
        value,
        sourceType: 'service',
        ...(options.includeRaw ? { raw: item } : {})
      };
    }

    private selectDataciteLookupValue(item: DataciteDoiItem, valueField: DataciteLookupValueField): string | null {
      const doi = this.asNonEmptyString(item.attributes?.doi);
      const id = this.asNonEmptyString(item.id);
      const url = this.asNonEmptyString(item.attributes?.url);

      switch (valueField) {
        case 'id':
          return id ?? doi ?? null;
        case 'url':
          return url ?? doi ?? id ?? null;
        case 'doi':
        default:
          return doi ?? id ?? null;
      }
    }

    private asNonEmptyString(value: unknown): string | undefined {
      const normalized = String(value ?? '').trim();
      return normalized !== '' ? normalized : undefined;
    }

    private createDataciteLookupError(message: string, statusCode?: number, cause?: unknown): Error & {
      code: 'datacite-lookup-failed';
      statusCode?: number;
      cause?: unknown;
    } {
      const error = new Error(message) as Error & {
        code: 'datacite-lookup-failed';
        statusCode?: number;
        cause?: unknown;
      };
      error.code = 'datacite-lookup-failed';
      if (statusCode != null) {
        error.statusCode = statusCode;
      }
      if (cause !== undefined) {
        error.cause = cause;
      }
      return error;
    }

    private isDataciteLookupError(error: unknown): error is Error & { code: 'datacite-lookup-failed' } {
      return _.isObject(error) && (error as { code?: string }).code === 'datacite-lookup-failed';
    }
  }
}
