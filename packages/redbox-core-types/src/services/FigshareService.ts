// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import { Services as services } from '../CoreService';
import { DatastreamService } from '../DatastreamService';
import Datastream from '../Datastream';
import { RBValidationError } from '../model/RBValidationError';
import { QueueService } from '../QueueService';
import { BrandingModel } from '../model/storage/BrandingModel';
import { RecordModel } from '../model/storage/RecordModel';
import { FigshareArticleCreate } from '../model/api/FigshareArticleCreate';
import { FigshareArticleUpdate } from '../model/api/FigshareArticleUpdate';
import { FigshareArticleEmbargo } from '../model/api/FigshareArticleEmbargo';
import { momentShim as moment } from '../shims/momentShim';
const axios = require('axios');
const _ = require('lodash');
const fs = require('fs');
const checkDiskSpace = require('check-disk-space').default;

type AnyRecord = Record<string, unknown>;
type RecordLike = RecordModel | AnyRecord;
type AxiosConfigLike = {
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
  data?: unknown;
};
type AxiosResponseLike = {
  status?: number | string;
  statusText?: string;
  data?: unknown;
};
type FigshareFieldMapping = {
  figName?: string;
  rbName?: string;
  template?: string;
  runByNameOnly?: boolean;
  unset?: boolean;
  unsetBeforeSet?: boolean;
  defaultValue?: unknown;
};

type FigshareRuntimeConfig = {
  apiToken: string;
  baseURL: string;
  frontEndURL: string;
  logLevel: string;
  extraVerboseLogging: boolean;
  mappingArtifacts: AnyRecord;
  mapping: AnyRecord;
  forCodesMapping: AnyRecord[];
  figArticleIdPathInRecord: string;
  figArticleURLPathInRecordList: string[];
  dataLocationsPathInRecord: string;
  entityIdFAR: string;
  locationFAR: string;
  curationStatusFA: string;
  curationStatusTargetValueFA: string;
  disableUpdateByCurationStatusFA: boolean;
  figNeedsPublishAfterFileUpload: boolean;
  recordAuthorExternalName: string;
  recordAuthorUniqueBy: string;
  figshareItemGroupId: number;
  figshareItemType: string;
};

type FigshareRetryConfig = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryOnStatusCodes: number[];
  retryOnMethods: string[];
};

type FigshareRequestOptions = {
  label?: string;
  retry?: Partial<FigshareRetryConfig>;
  logResponse?: boolean;
};

const DEFAULT_RETRY_STATUS_CODES = [408, 429, 500, 502, 503, 504];
let figshareLicenseCache: unknown | null = null;
let figshareLicensePromise: Promise<unknown> | null = null;

export namespace Services {

  export class FigshareService extends services.Core.Service {

    private datastreamService!: DatastreamService;
    private queueService!: QueueService;

    protected override _exportedMethods: string[] = [
      'createUpdateFigshareArticle',
      'uploadFilesToFigshareArticle',
      'deleteFilesFromRedbox',
      'deleteFilesFromRedboxTrigger',
      'publishAfterUploadFilesJob',
      'queueDeleteFiles',
      'queuePublishAfterUploadFiles',
      'transitionRecordWorkflowFromFigshareArticlePropertiesJob',
    ];



    constructor() {
      //Better not use 'this.createUpdateFigshareArticleLogLevel' in the constructor as it may not be available for certain events.
      //There is no harm to use error log level to ensure minimal logging is always printed because services are singletons therefore
      //it's printed only once and it's critical to have logs to ensure this service has loaded correctly during development face until
      //it reaches a certain level of stability/maturity. Then it can be changed to verbose
      super();
      const that = this;
      this.registerSailsHook('on', 'ready', function () {
        const datastreamServiceName = sails.config.record.datastreamService;
        const queueServiceName = sails.config.queue.serviceName;
        sails.log.verbose(`FigshareTrigger ready, using datastream service: ${datastreamServiceName}`);
        if (datastreamServiceName != undefined) {
          that.datastreamService = sails.services[datastreamServiceName] as unknown as DatastreamService;
        }
        sails.log.verbose(`FigshareTrigger ready, using queue service: ${queueServiceName}`);
        if (queueServiceName != undefined) {
          that.queueService = sails.services[queueServiceName] as unknown as QueueService;
        }
      });
      this.registerSailsHook('on', 'lifted', function () {
        const runtimeConfig = that.getRuntimeConfig();
        if (that.isFigshareAPIEnabled(runtimeConfig)) {
          sails.log.verbose('FigService - constructor start');
          that.getFigPrivateLicenses(runtimeConfig)
            .then(function () {
              sails.log.verbose('FigService - SUCCESSFULY LOADED LICENSES');
            })
            .catch(function (error) {
              sails.log.error('FigService - ERROR LOADING LICENSES');
              sails.log.error(error);
            });
          sails.log.verbose('FigService - constructor end');
        }
      });
    }

    private getRuntimeConfig(): FigshareRuntimeConfig {
      const figshareConfig = sails.config.figshareAPI || {};
      const overrideArtifacts = _.get(sails.config, 'figshareAPIEnv.overrideArtifacts', {});
      const baseMapping = figshareConfig.mapping || {};
      const overrideMapping = _.get(overrideArtifacts, 'mapping', {});
      const mapping = _.mergeWith({}, baseMapping, overrideMapping, (_objValue: unknown, srcValue: unknown) => {
        if (_.isArray(srcValue)) {
          return srcValue;
        }
        return undefined;
      });
      const mappingArtifacts = _.get(overrideMapping, 'artifacts', _.get(baseMapping, 'artifacts', {}));
      const figArticleURLPathInRecordList = _.isArray(mapping.recordFigArticleURL)
        ? mapping.recordFigArticleURL
        : _.isEmpty(mapping.recordFigArticleURL)
          ? []
          : [mapping.recordFigArticleURL];
      const figshareItemGroupId = _.toNumber(_.get(overrideArtifacts, 'mapping.figshareItemGroupId', mapping.figshareItemGroupId));
      const figshareItemType = _.get(overrideArtifacts, 'mapping.figshareItemType', mapping.figshareItemType);
      return {
        apiToken: _.get(overrideArtifacts, 'APIToken', figshareConfig.APIToken) || '',
        baseURL: _.get(overrideArtifacts, 'baseURL', figshareConfig.baseURL) || '',
        frontEndURL: _.get(overrideArtifacts, 'frontEndURL', figshareConfig.frontEndURL) || '',
        logLevel: _.get(sails.config, 'record.createUpdateFigshareArticleLogLevel', 'verbose'),
        extraVerboseLogging: !!figshareConfig.extraVerboseLogging,
        mappingArtifacts: (_.isPlainObject(mappingArtifacts) ? mappingArtifacts : {}) as AnyRecord,
        mapping: (_.isPlainObject(mapping) ? mapping : {}) as AnyRecord,
        forCodesMapping: (_.isArray(_.get(sails.config, 'figshareReDBoxFORMapping.FORMapping', []))
          ? _.get(sails.config, 'figshareReDBoxFORMapping.FORMapping', [])
          : []) as AnyRecord[],
        figArticleIdPathInRecord: mapping.recordFigArticleId || '',
        figArticleURLPathInRecordList: figArticleURLPathInRecordList,
        dataLocationsPathInRecord: mapping.recordDataLocations || '',
        entityIdFAR: _.get(mapping, 'response.entityId', ''),
        locationFAR: _.get(mapping, 'response.location', ''),
        curationStatusFA: mapping.figshareCurationStatus || '',
        curationStatusTargetValueFA: mapping.figshareCurationStatusTargetValue || 'public',
        disableUpdateByCurationStatusFA: !!mapping.figshareDisableUpdateByCurationStatus,
        figNeedsPublishAfterFileUpload: !!mapping.figshareNeedsPublishAfterFileUpload,
        recordAuthorExternalName: mapping.recordAuthorExternalName || '',
        recordAuthorUniqueBy: mapping.recordAuthorUniqueBy || '',
        figshareItemGroupId: Number.isFinite(figshareItemGroupId) ? figshareItemGroupId : 0,
        figshareItemType: typeof figshareItemType === 'string' ? figshareItemType : ''
      };
    }

    private isFigshareAPIEnabled(config: FigshareRuntimeConfig) {
      return !_.isEmpty(config.apiToken) && !_.isEmpty(config.baseURL) && !_.isEmpty(config.frontEndURL);
    }

    private getAxiosConfig(config: FigshareRuntimeConfig, method: string, urlSectionPattern: string, requestBody: unknown): AxiosConfigLike {
      const figshareBaseUrl = config.baseURL + urlSectionPattern;
      const figAccessToken = 'token ' + config.apiToken;

      const figHeaders = {
        'Content-Type': 'application/json',
        'Authorization': figAccessToken
      };

      const axiosConfig: AxiosConfigLike = {
        method: method,
        url: figshareBaseUrl,
        headers: figHeaders,
        data: requestBody
      };
      if (method == 'get') {
        delete axiosConfig.data;
      } else if (method == 'put' || method == 'post' || method == 'delete') {
        // no-op
      } else {
        this.logWithLevel(config.logLevel, 'Invalid API method ' + method);
        this.logWithLevel(config.logLevel, 'urlSectionPattern ' + urlSectionPattern);
        this.logWithLevel(config.logLevel, requestBody);
      }
      return axiosConfig;
    }

    private logWithLevel(logLevel: string, ...args: unknown[]) {
      const logger = sails.log[logLevel] || sails.log.info;
      logger(...args);
    }

    private logVerbose(config: FigshareRuntimeConfig, ...args: unknown[]) {
      if (config.extraVerboseLogging) {
        this.logWithLevel(config.logLevel, ...args);
      }
    }

    private getRetryConfig(override: Partial<FigshareRetryConfig> = {}): FigshareRetryConfig {
      const configured = _.get(sails.config, 'figshareAPI.retry', {});
      const configOverride = _.isObject(configured) ? configured : {};
      const maxAttempts = _.toNumber(override.maxAttempts ?? configOverride.maxAttempts ?? 3);
      const baseDelayMs = _.toNumber(override.baseDelayMs ?? configOverride.baseDelayMs ?? 500);
      const maxDelayMs = _.toNumber(override.maxDelayMs ?? configOverride.maxDelayMs ?? 4000);
      const retryOnStatusCodes = _.isArray(override.retryOnStatusCodes)
        ? override.retryOnStatusCodes
        : _.isArray(configOverride.retryOnStatusCodes)
          ? configOverride.retryOnStatusCodes
          : DEFAULT_RETRY_STATUS_CODES;
      const retryOnMethods = _.isArray(override.retryOnMethods)
        ? override.retryOnMethods
        : _.isArray(configOverride.retryOnMethods)
          ? configOverride.retryOnMethods
          : ['get', 'put', 'delete'];
      return {
        maxAttempts: Math.max(1, maxAttempts),
        baseDelayMs: Math.max(0, baseDelayMs),
        maxDelayMs: Math.max(baseDelayMs, maxDelayMs),
        retryOnStatusCodes: retryOnStatusCodes,
        retryOnMethods: retryOnMethods.map((method: string) => method.toLowerCase())
      };
    }

    private shouldRetryRequest(error: unknown, axiosConfig: AxiosConfigLike, retryConfig: FigshareRetryConfig): boolean {
      const method = _.get(axiosConfig, 'method', 'get').toLowerCase();
      if (!retryConfig.retryOnMethods.includes(method)) {
        return false;
      }
      const status = _.get(error, 'response.status');
      if (!status) {
        return true;
      }
      return retryConfig.retryOnStatusCodes.includes(status);
    }

    private redactAxiosConfig(axiosConfig: AxiosConfigLike): AxiosConfigLike {
      if (!axiosConfig || !axiosConfig.headers) {
        return axiosConfig;
      }
      return {
        ...axiosConfig,
        headers: {
          ...axiosConfig.headers,
          Authorization: axiosConfig.headers.Authorization ? 'REDACTED' : undefined
        }
      };
    }

    private describeAxiosError(error: unknown): string {
      const status = _.get(error, 'response.status');
      const statusText = _.get(error, 'response.statusText');
      const message = _.get(error, 'message');
      const responseMessage = _.get(error, 'response.data.message');
      return [status, statusText, responseMessage, message].filter(Boolean).join(' - ');
    }

    protected override async sleep(delayMs: number): Promise<void> {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    private async requestWithRetry(config: FigshareRuntimeConfig, axiosConfig: AxiosConfigLike, options: FigshareRequestOptions = {}): Promise<AxiosResponseLike> {
      const retryConfig = this.getRetryConfig(options.retry);
      const label = options.label || `${(axiosConfig?.method || 'get').toUpperCase()} ${axiosConfig?.url || ''}`.trim();
      for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
        try {
          if (config.extraVerboseLogging) {
            this.logWithLevel(config.logLevel, `FigService - request ${label} attempt ${attempt}`, this.redactAxiosConfig(axiosConfig));
          }
          const response = await axios(axiosConfig);
          if (options.logResponse) {
            this.logWithLevel(config.logLevel, `FigService - response ${label} status ${response.status} ${response.statusText}`);
          }
          return response as AxiosResponseLike;
        } catch (error) {
          const retryable = this.shouldRetryRequest(error, axiosConfig, retryConfig);
          const status = _.get(error, 'response.status');
          this.logWithLevel('warn', `FigService - request ${label} failed (attempt ${attempt}/${retryConfig.maxAttempts}) status ${status || 'no-response'}`);
          if (!retryable || attempt === retryConfig.maxAttempts) {
            this.logWithLevel('error', `FigService - request ${label} failed permanently: ${this.describeAxiosError(error)}`);
            throw error;
          }
          const delay = Math.min(retryConfig.maxDelayMs, retryConfig.baseDelayMs * Math.pow(2, attempt - 1));
          const jitter = Math.floor(Math.random() * Math.min(250, retryConfig.baseDelayMs));
          await this.sleep(delay + jitter);
        }
      }
      throw new Error(`FigService - request ${label} failed after retries`);
    }

    private getValueFromObject(config: FigshareRuntimeConfig, field: unknown, pathOrTemplate: unknown) {
      const fieldObj = (_.isPlainObject(field) ? field : {}) as AnyRecord;
      const template = String(pathOrTemplate ?? '');
      let value: unknown;
      if (template.indexOf('<%') != -1) {
        const context = {
          moment: moment,
          field: fieldObj,
          artifacts: config.mappingArtifacts
        }
        value = _.template(template)(context);
        this.logVerbose(config, `FigService ---- getValueFromObject ---- ${JSON.stringify(fieldObj)}`);
      } else {
        value = _.get(fieldObj, template);
      }
      return value;
    }

    private getValueFromRecord(config: FigshareRuntimeConfig, record: unknown, pathOrTemplate: unknown) {
      const recordObj = (_.isPlainObject(record) ? record : {}) as AnyRecord;
      const template = String(pathOrTemplate ?? '');
      let value: unknown;
      if (template.indexOf('<%') != -1) {
        const context = {
          moment: moment,
          record: recordObj,
          artifacts: config.mappingArtifacts
        }
        value = _.template(template)(context);
        if (config.extraVerboseLogging) {
          if (_.isObject(value)) {
            this.logWithLevel(config.logLevel, `FigService ---- getValueFromRecord ---- ${JSON.stringify(value)}`);
          } else {
            this.logWithLevel(config.logLevel, `FigService ---- getValueFromRecord ---- ${value}`);
          }
        }
      } else {
        value = _.get(recordObj, template);
      }
      return value;
    }

    private setFieldInRecord(config: FigshareRuntimeConfig, record: AnyRecord, article: AnyRecord, field: FigshareFieldMapping) {
      let value = '';
      const template = field.template ?? '';
      const runByNameOnly = !!field.runByNameOnly;
      const unset = !!field.unset;
      const unsetBeforeSet = !!field.unsetBeforeSet;
      const figName = typeof field.figName === 'string' ? field.figName : '';
      const rbName = typeof field.rbName === 'string' ? field.rbName : '';
      if (unset) {
        if (figName) {
          _.unset(record, figName);
        }
      } else if (!runByNameOnly) {
        if (template.indexOf('<%') != -1) {
          const context = {
            record: record,
            article: article,
            moment: moment,
            field: field,
            artifacts: config.mappingArtifacts
          }
          value = _.template(template)(context);

          if (config.extraVerboseLogging) {
            if (_.isObject(value)) {
              this.logWithLevel(config.logLevel, `FigService ---- setFieldInRecord ---- ${figName} ----  template ---- ${JSON.stringify(value)}`);
            } else {
              this.logWithLevel(config.logLevel, `FigService ---- setFieldInRecord ---- ${figName} ----  template ---- ${value}`);
            }
          }
        } else {
          const orignalValue = rbName ? _.get(record, rbName) : undefined;

          if (config.extraVerboseLogging) {
            this.logWithLevel(config.logLevel, `FigService ---- setFieldInRecord ---- ${rbName} ----  orignalValue ---- ${orignalValue}`);
          }
          value = figName ? _.get(article, figName, orignalValue) : orignalValue;

          if (config.extraVerboseLogging) {
            this.logWithLevel(config.logLevel, `FigService ---- setFieldInRecord ---- ${figName} ----  value ---- ${value}`);
          }
        }

        if (unsetBeforeSet) {
          if (rbName) {
            _.unset(record, rbName);
          }
        }

        if (config.extraVerboseLogging) {
          this.logWithLevel(config.logLevel, `FigService ---- setFieldInRecord ---- ${rbName} ----  value ---- ${value}`);
        }
        if (rbName) {
          _.set(record, rbName, value);
        }
      }
    }

    private setStandardFieldInRequestBody(config: FigshareRuntimeConfig, record: AnyRecord, requestBody: AnyRecord, standardField: FigshareFieldMapping) {
      let value = '';
      const template = standardField.template ?? '';
      const runByNameOnly = !!standardField.runByNameOnly;
      const unset = !!standardField.unset;
      const unsetBeforeSet = !!standardField.unsetBeforeSet;
      const figName = typeof standardField.figName === 'string' ? standardField.figName : '';
      const rbName = typeof standardField.rbName === 'string' ? standardField.rbName : '';
      if (unset) {
        if (figName) {
          _.unset(requestBody, figName);
        }
      } else if (!runByNameOnly) {
        if (template.indexOf('<%') != -1) {
          const context = {
            record: record,
            moment: moment,
            field: standardField,
            artifacts: config.mappingArtifacts
          }
          value = _.template(template)(context);

          if (config.extraVerboseLogging) {
            if (_.isObject(value)) {
              this.logWithLevel(config.logLevel, `FigService ---- standardField ---- ${figName} ----  template ---- ${JSON.stringify(value)}`);
            } else {
              this.logWithLevel(config.logLevel, `FigService ---- standardField ---- ${figName} ----  template ---- ${value}`);
            }
          }
        } else {
          value = rbName ? _.get(record, rbName, standardField.defaultValue) : standardField.defaultValue;
        }
        if (unsetBeforeSet) {
          if (figName) {
            _.unset(requestBody, figName);
          }
        }
        if (figName) {
          _.set(requestBody, figName, value);
        }
      }
    }

    private setCustomFieldInRequestBody(config: FigshareRuntimeConfig, record: AnyRecord, customFieldsTemplate: AnyRecord, keyName: string, customFieldsMappings: FigshareFieldMapping[]) {
      const customField = _.find(customFieldsMappings, { 'figName': keyName });
      let value = '';
      if (_.isObject(customField)) {
        const template = customField.template ?? '';
        if (template.indexOf('<%') != -1) {
          const context = {
            record: record,
            moment: moment,
            field: customField,
            artifacts: config.mappingArtifacts
          }
          value = _.template(template)(context);

          if (config.extraVerboseLogging) {
            this.logWithLevel(config.logLevel, `FigService ---- ${keyName} ----  template ---- ${value}`);
          }
        } else {
          const rbName = typeof customField.rbName === 'string' ? customField.rbName : '';
          value = rbName ? _.get(record, rbName, customField.defaultValue) : customField.defaultValue;
        }
        _.set(customFieldsTemplate, keyName, value);
      }
    }

    private setFieldByNameInRequestBody(config: FigshareRuntimeConfig, record: AnyRecord, requestBody: AnyRecord, fieldConfig: FigshareFieldMapping[], fieldName: string, runtimeArtifacts: unknown = {}) {
      let value = '';
      const field = _.find(fieldConfig, { figName: fieldName });
      if (!_.isEmpty(field)) {
        const template = field.template ?? '';
        const unset = !!field.unset;
        const unsetBeforeSet = !!field.unsetBeforeSet;
        const figName = typeof field.figName === 'string' ? field.figName : '';
        const rbName = typeof field.rbName === 'string' ? field.rbName : '';
        if (unset) {

          if (config.extraVerboseLogging) {
            this.logWithLevel(config.logLevel, `FigService ---- setFieldByNameInRequestBody ---- before unset ${figName} ---- ${JSON.stringify(requestBody)}`);
          }
          if (figName) {
            _.unset(requestBody, figName);
          }

          if (config.extraVerboseLogging) {
            this.logWithLevel(config.logLevel, `FigService ---- setFieldByNameInRequestBody ---- after unset ${figName} ---- ${JSON.stringify(requestBody)}`);
          }
        } else if (template.indexOf('<%') != -1) {
          const context = {
            record: record,
            moment: moment,
            field: field,
            artifacts: config.mappingArtifacts,
            runtimeArtifacts: runtimeArtifacts
          }
          value = _.template(template)(context);

          if (config.extraVerboseLogging) {
            if (_.isObject(value)) {
              this.logWithLevel(config.logLevel, `FigService ---- setFieldByNameInRequestBody ---- ${figName} ----  template ---- ${JSON.stringify(value)}`);
            } else {
              this.logWithLevel(config.logLevel, `FigService ---- setFieldByNameInRequestBody ---- ${figName} ----  template ---- ${value}`);
            }
          }
        } else {
          value = rbName ? _.get(record, rbName, field.defaultValue) : field.defaultValue;
        }
        if (unsetBeforeSet) {
          if (figName) {
            _.unset(requestBody, figName);
          }
        }
        if (figName) {
          _.set(requestBody, figName, value);
        }
      }
    }

    //These method takes the list of contributors found in the ReDBox record and will try to match the
    //ReDBox Id to a Figshare Id. The Identifier(s) to be used are defined in figshareAPI config file
    private async getAuthorUserIDs(config: FigshareRuntimeConfig, authors: AnyRecord[]) {
      this.logWithLevel(config.logLevel, 'FigService - getAuthorUserIDs enter');
      const authorList: AnyRecord[] = [];
      let uniqueAuthors: AnyRecord[] = authors;
      if (!_.isUndefined(config.recordAuthorUniqueBy) && !_.isEmpty(config.recordAuthorUniqueBy)) {
        uniqueAuthors = _.uniqBy(authors, config.recordAuthorUniqueBy);
      }
      this.logWithLevel(config.logLevel, 'FigService - uniqueAuthors');
      this.logWithLevel(config.logLevel, uniqueAuthors);
      const getAuthorTemplateRequests = (_.isArray(sails.config.figshareAPI.mapping.templates.getAuthor)
        ? sails.config.figshareAPI.mapping.templates.getAuthor
        : []) as AnyRecord[];

      const uniqueAuthorsControlList = _.clone(uniqueAuthors) as AnyRecord[];

      for (const author of uniqueAuthors) {
        this.logWithLevel(config.logLevel, author);

        for (const requestBodyTemplate of getAuthorTemplateRequests) {
          const template = String(requestBodyTemplate.template ?? '');
          let userId = this.getValueFromObject(config, author, template);

          if (!_.isUndefined(userId) && !_.isEmpty(userId)) {

            const requestBody = _.clone(requestBodyTemplate) as AnyRecord;
            _.unset(requestBody, 'template');
            const keys = _.keys(requestBody);
            const searchBy = keys[0];

            //This code is added for the sole purpose of facilitating test/staging use case that some
            //intitutions have a different domain in their test environment compared to production and
            //it's intended to be restrictive
            if (searchBy == 'email') {
              const userIdStr = _.isString(userId) ? (userId as string) : '';
              if (_.has(requestBody, 'prefix') && userIdStr.indexOf('@') > 0) {
                const tmpEmailArray = _.split(userIdStr, '@');
                if (tmpEmailArray.length == 2) {
                  const tmpEmail = tmpEmailArray[0] + '@' + _.get(requestBody, 'prefix', '') + tmpEmailArray[1];
                  userId = tmpEmail;
                }
                _.unset(requestBody, 'prefix');
              } else if (_.has(requestBody, 'override') && userIdStr.indexOf('@') > 0) {
                const tmpEmailArray = _.split(userIdStr, '@');
                if (tmpEmailArray.length == 2) {
                  const tmpEmail = tmpEmailArray[0] + '@' + _.get(requestBody, 'override', '');
                  userId = tmpEmail;
                }
                _.unset(requestBody, 'override');
              }
            }

            //Set request body with the userId value that matches the searchBy template in example:
            //
            // 1- Search by email:
            // {
            //   institution_user_id: user1234
            // }
            //
            // 2- Search by email:
            // {
            //   email: staging.user@institution.edu.au
            // }
            //
            // 3- Search by symplectic_user_id:
            // {
            //   symplectic_user_id: user1234
            // }
            //
            _.set(requestBody, searchBy, userId);

            const requestConfig = this.getAxiosConfig(config, 'post', '/account/institution/accounts/search', requestBody);

            if (config.extraVerboseLogging) {
              this.logWithLevel(config.logLevel, `FigService - getAuthorUserIDs - userId ${userId} - ${requestConfig.method} - ${requestConfig.url}`);
            }
            try {
              const response = await this.requestWithRetry(config, requestConfig, { label: 'getAuthorUserIDs', retry: { retryOnMethods: ['post'] } });
              const authorData = response.data as AnyRecord[];

              if (config.extraVerboseLogging) {
                this.logWithLevel(config.logLevel, authorData);
              }

              if (!_.isEmpty(authorData)) {
                const authorDataEntry = authorData[0] || {};
                const figshareAccountUserID = {
                  id: _.toNumber((authorDataEntry as AnyRecord)[sails.config.figshareAPI.mapping.figshareAuthorUserId])
                };

                if (config.extraVerboseLogging) {
                  this.logWithLevel(config.logLevel, `FigService - getAuthorUserIDs - author `);
                  this.logWithLevel(config.logLevel, figshareAccountUserID);
                }
                authorList.push(figshareAccountUserID);
                _.remove(uniqueAuthorsControlList, author);
                break;
              }
            } catch (error) {
              sails.log.error(error);
              sails.log.error(`FigService - getAuthorUserIDs - author error`);
              sails.log.error(author);
            }
          }
        }
      }

      for (const externalAuthor of uniqueAuthorsControlList) {
        const otherContributor = { name: (externalAuthor as AnyRecord)[config.recordAuthorExternalName] };
        if (!_.isUndefined(otherContributor)) {
          authorList.push(otherContributor);
        }
      }

      return authorList;
    }

    //This method allows for defining rules to gather a list of all relevant contributors from a ReDBox record
    //The rules can be configured in the artifacts method getContributorsFromRecord that uses a lodash template
    //and these rules are meant to be project spefic and hence these are set in figshareAPI config file
    private getContributorsFromRecord(config: FigshareRuntimeConfig, record: RecordLike) {
      let authors: AnyRecord[] = [];
      const template = sails.config.figshareAPI.mapping.runtimeArtifacts.getContributorsFromRecord.template;
      if (!_.isUndefined(template) && template.indexOf('<%') != -1) {
        const context = {
          record: record as AnyRecord
        }
        const result = _.template(template)(context);
        if (_.isArray(result)) {
          authors = result as AnyRecord[];
        }

        this.logVerbose(config, `FigService ---- getContributorsFromRecord ----  template`);
      }

      this.logVerbose(config, `FigService - getContributorsFromRecord: ${JSON.stringify(authors)}`);
      return authors;
    }

    //This method allows for defining rules to check if an ReDBox record is embargoed
    private isRecordEmbargoed(config: FigshareRuntimeConfig, request: AnyRecord, filesOrURLsAttached: boolean) {
      let isEmbargoed = false;
      if (!_.isEmpty(sails.config.figshareAPI.mapping.standardFields.embargo)) {
        const template = sails.config.figshareAPI.mapping.runtimeArtifacts.isRecordEmbargoed.template;
        if (!_.isUndefined(template) && template.indexOf('<%') != -1) {
          const context = {
            request: request,
            filesOrURLsAttached: filesOrURLsAttached
          }
          isEmbargoed = !!_.template(template)(context);

          this.logVerbose(config, `FigService ---- isRecordEmbargoed ----  template`);
        }
      }

      this.logVerbose(config, `FigService - isRecordEmbargoed: ${isEmbargoed}`);
      return isEmbargoed;
    }

    private async isClearEmbargoNeeded(config: FigshareRuntimeConfig, request: AnyRecord, articleId: string | number, articleDetails: AnyRecord) {

      let isEmbargoCleared = false;
      if (_.isUndefined(articleDetails) || _.isEmpty(articleDetails)) {
        articleDetails = await this.getArticleDetails(config, articleId);
      }

      const isEmbargoSet = _.get(articleDetails, 'is_embargoed', false);
      if (isEmbargoSet) {
        if (!_.isEmpty(sails.config.figshareAPI.mapping.standardFields.embargo)) {
          const template = sails.config.figshareAPI.mapping.runtimeArtifacts.isRecordEmbargoCleared.template;
          if (!_.isUndefined(template) && template.indexOf('<%') != -1) {
            const context = {
              request: request
            }
            isEmbargoCleared = !!_.template(template)(context);

            this.logVerbose(config, `FigService ---- isRecordEmbargoCleared ----  template`);
          }
        }
      }

      this.logVerbose(config, `FigService - isRecordEmbargoCleared: ${isEmbargoCleared}`);

      return isEmbargoCleared;
    }

    private async checkEmbargoDetailsChanged(config: FigshareRuntimeConfig, requestEmbargoBody: AnyRecord, articleId: string | number, articleDetails: AnyRecord) {

      let embargoDetailsChanged = false;

      if (!_.isEmpty(sails.config.figshareAPI.mapping.standardFields.embargo)) {

        if (_.isUndefined(articleDetails) || _.isEmpty(articleDetails)) {
          articleDetails = await this.getArticleDetails(config, articleId);
        }

        if (sails.config.figshareAPI.mapping.figshareForceEmbargoUpdateAlways) {
          embargoDetailsChanged = true;
          return embargoDetailsChanged;
        }

        for (const standardField of sails.config.figshareAPI.mapping.standardFields.embargo) {
          const checkChangedBeforeUpdate = _.get(standardField, 'checkChangedBeforeUpdate', false);
          if (checkChangedBeforeUpdate) {
            const requestFieldValue = _.get(requestEmbargoBody, standardField.figName, '')
            const articleFieldValue = _.get(articleDetails, standardField.figName, '');
            // if(this.extraVerboseLogging) {
            this.logWithLevel(config.logLevel, `FigService - ${standardField.figName}: redbox request value ${requestFieldValue} - figshare value ${articleFieldValue} `);
            // }
            if (requestFieldValue != articleFieldValue) {
              embargoDetailsChanged = true;
              break;
            }
          }
        }
      }

      return embargoDetailsChanged;
    }

    private findCategoryIDs(config: FigshareRuntimeConfig, record: AnyRecord) {
      let catIDs: number[] = [];
      if (!_.isUndefined(config.forCodesMapping) && !_.isEmpty(config.forCodesMapping)) {
        const template = sails.config.figshareAPI.mapping.runtimeArtifacts.getCategoryIDs.template;
        if (!_.isUndefined(template) && template.indexOf('<%') != -1) {
          const context = {
            record: record,
            forCodes: config.forCodesMapping
          }
          const result = _.template(template)(context);
          if (_.isArray(result)) {
            catIDs = result as number[];
          }

          this.logVerbose(config, `FigService ---- findCategoryIDs ----  template`);
        }

        this.logVerbose(config, catIDs);
      }
      return catIDs;
    }

    private async getFigPrivateLicenses(config: FigshareRuntimeConfig) {
      if (figshareLicenseCache) {
        return figshareLicenseCache;
      }
      if (figshareLicensePromise) {
        return figshareLicensePromise;
      }

      const requestConfig = this.getAxiosConfig(config, 'get', '/account/licenses', null);

      if (config.extraVerboseLogging) {
        this.logWithLevel(config.logLevel, `FigService - getFigPrivateLicenses - ${requestConfig.method} - ${requestConfig.url}`);
        this.logWithLevel(config.logLevel, `FigService - getFigPrivateLicenses - config ${JSON.stringify(this.redactAxiosConfig(requestConfig))}`);
      }
      figshareLicensePromise = (async () => {
        try {
          const response = await this.requestWithRetry(config, requestConfig, { label: 'getFigPrivateLicenses', logResponse: true });
          figshareLicenseCache = response.data;
          return figshareLicenseCache;
        } catch (error) {
          if (!_.isEmpty(sails.config.figshareAPI.testLicenses)) {
            figshareLicenseCache = sails.config.figshareAPI.testLicenses;
            return figshareLicenseCache;
          }
          this.logWithLevel('error', error);
          figshareLicenseCache = null;
          return null;
        } finally {
          figshareLicensePromise = null;
        }
      })();
      return figshareLicensePromise;
    }

    private async getArticleDetails(config: FigshareRuntimeConfig, articleId: string | number): Promise<AnyRecord> {
      const articleIdStr = String(articleId);
      const articleDetailsConfig = this.getAxiosConfig(config, 'get', `/account/articles/${articleIdStr}`, null);

      if (config.extraVerboseLogging) {
        this.logWithLevel(config.logLevel, `FigService - getArticleDetails checkStatusConfig ${articleDetailsConfig.method} - ${articleDetailsConfig.url}`);
      }
      const responseArticleDetails = await this.requestWithRetry(config, articleDetailsConfig, { label: 'getArticleDetails', logResponse: true });

      const articleDetails = responseArticleDetails.data as AnyRecord;
      return articleDetails;
    }

    private async isArticleApprovedAndPublished(config: FigshareRuntimeConfig, articleId: string | number, articleDetails: AnyRecord) {

      if (_.isUndefined(articleDetails) || _.isEmpty(articleDetails)) {
        articleDetails = await this.getArticleDetails(config, articleId);
      }

      if (_.has(articleDetails, config.curationStatusFA) && (articleDetails as AnyRecord)[config.curationStatusFA] == config.curationStatusTargetValueFA) {
        this.logWithLevel(config.logLevel, 'FigService - isArticleApprovedAndPublished - true');
        return true;
      } else {
        return false;
      }
    }

    private async getArticleFileList(config: FigshareRuntimeConfig, articleId: string | number, logEnabled: boolean = true): Promise<AnyRecord[]> {
      const articleIdStr = String(articleId);
      const defaultPageSize = 20;
      const pageSizeConfig = _.get(sails.config, 'figshareAPI.mapping.upload.fileListPageSize', defaultPageSize);
      const pageSize = _.isNumber(pageSizeConfig) && pageSizeConfig > 0 ? pageSizeConfig : defaultPageSize;

      let page = 1;
      const articleFileList: AnyRecord[] = [];
      let hasMorePages = true;

      while (hasMorePages) {
        const articleFileListConfig = this.getAxiosConfig(config, 'get', `/account/articles/${articleIdStr}/files?page_size=${pageSize}&page=${page}`, null);
        if (logEnabled) {
          this.logWithLevel(config.logLevel, `FigService - getArticleFileList - page ${page} - ${articleFileListConfig.method} - ${articleFileListConfig.url}`);
        }
        const responseArticleList = await this.requestWithRetry(config, articleFileListConfig, { label: 'getArticleFileList', logResponse: logEnabled });
        if (logEnabled) {
          this.logWithLevel(config.logLevel, `FigService - getArticleFileList - page ${page} status: ${responseArticleList.status} statusText: ${responseArticleList.statusText}`);
        }

        const currentPage = responseArticleList.data as AnyRecord[];
        if (_.isArray(currentPage) && currentPage.length > 0) {
          articleFileList.push(...currentPage);
          hasMorePages = currentPage.length >= pageSize;
        } else {
          hasMorePages = false;
        }
        page++;
      }

      if (logEnabled) {
        this.logWithLevel(config.logLevel, `FigService - getArticleFileList - total files fetched ${articleFileList.length}`);
      }

      return articleFileList;
    }

    private async isFileUploadInProgress(config: FigshareRuntimeConfig, articleId: string | number, articleFileList: AnyRecord[]) {

      if (_.isUndefined(articleFileList) || _.isEmpty(articleFileList)) {
        articleFileList = await this.getArticleFileList(config, articleId);
      }
      //Files in figshare article have to be status available. Status 'created' means that the file is still being uploaded to the article
      const fileUploadInProgress = _.find(articleFileList, ['status', 'created']);
      if (!_.isUndefined(fileUploadInProgress)) {
        this.logWithLevel(config.logLevel, `FigService - isFileUploadInProgress - true - articleId ${articleId}`);
        return true;
      } else {
        return false;
      }
    }

    private async checkArticleHasURLsOrFilesAttached(config: FigshareRuntimeConfig, articleId: string | number, articleFileList: AnyRecord[]) {
      let stringifyFileList = '';
      if (!_.isUndefined(articleFileList)) {
        stringifyFileList = JSON.stringify(articleFileList);
      }
      this.logWithLevel(config.logLevel, 'FigService - checkArticleHasURLsOrFilesAttached - articleFileList before ' + stringifyFileList);

      if (_.isUndefined(articleFileList) || _.isEmpty(articleFileList)) {
        articleFileList = await this.getArticleFileList(config, articleId);
      }
      if (!_.isUndefined(articleFileList)) {
        stringifyFileList = JSON.stringify(articleFileList);
      }
      this.logWithLevel(config.logLevel, 'FigService - checkArticleHasURLsOrFilesAttached - articleFileList after ' + stringifyFileList);

      const fileUploadInProgress = _.find(articleFileList, ['status', 'created']);
      const filesOrURLsAttached = _.find(articleFileList, ['status', 'available']);
      if (_.isUndefined(fileUploadInProgress) && !_.isUndefined(filesOrURLsAttached)) {
        this.logWithLevel(config.logLevel, 'FigService - checkArticleHasURLsOrFilesAttached - true');
        return true;
      } else {
        return false;
      }
    }

    private getArticleUpdateRequestBody(
      config: FigshareRuntimeConfig,
      record: AnyRecord,
      figshareAccountAuthorIDs: AnyRecord[],
      figCategoryIDs: number[],
      figLicenceIDs: AnyRecord[]
    ) {
      //Custom_fields is a dict not an array
      const customFields = _.clone(sails.config.figshareAPI.mapping.templates.customFields.update);

      //Encountered shared reference issues even when creating a new object hence _.cloneDeep is required
      const requestBodyUpdate = _.cloneDeep(new FigshareArticleUpdate(config.figshareItemGroupId, config.figshareItemType));

      //FindAuthor_Step3 - set list of contributors in request body to be sent to Fighare passed in as a runtime artifact
      this.setFieldByNameInRequestBody(config, record, requestBodyUpdate, sails.config.figshareAPI.mapping.standardFields.update, 'authors', figshareAccountAuthorIDs);
      this.setFieldByNameInRequestBody(config, record, requestBodyUpdate, sails.config.figshareAPI.mapping.standardFields.update, 'license', figLicenceIDs);
      this.setFieldByNameInRequestBody(config, record, requestBodyUpdate, sails.config.figshareAPI.mapping.standardFields.update, 'categories', figCategoryIDs);
      this.setFieldByNameInRequestBody(config, record, requestBodyUpdate, sails.config.figshareAPI.mapping.standardFields.update, 'impersonate', figshareAccountAuthorIDs);

      for (const standardField of sails.config.figshareAPI.mapping.standardFields.update) {
        this.setStandardFieldInRequestBody(config, record, requestBodyUpdate, standardField);
      }

      const customFieldsKeys = _.keys(customFields);
      for (const customFieldKey of customFieldsKeys) {
        this.setCustomFieldInRequestBody(config, record, customFields, customFieldKey, sails.config.figshareAPI.mapping.customFields.update);
      }

      _.set(requestBodyUpdate, sails.config.figshareAPI.mapping.customFields.path, customFields);

      return requestBodyUpdate;
    }

    private getArticleCreateRequestBody(
      config: FigshareRuntimeConfig,
      record: AnyRecord,
      figshareAccountAuthorIDs: AnyRecord[],
      figCategoryIDs: number[],
      figLicenceIDs: AnyRecord[]
    ) {
      //Encountered shared reference issues even when creating a new object hence _.cloneDeep is required
      const requestBodyCreate = _.cloneDeep(new FigshareArticleCreate());
      //Open Access and Full Text URL custom fields have to be set on create because the figshare article
      //cannot be Made non draft (publish) so reviewers can pick it up from the queue
      const customFields = _.clone(sails.config.figshareAPI.mapping.templates.customFields.create);
      const customFieldsKeys = _.keys(customFields);

      this.setFieldByNameInRequestBody(config, record, requestBodyCreate, sails.config.figshareAPI.mapping.standardFields.update, 'categories', figCategoryIDs);
      this.setFieldByNameInRequestBody(config, record, requestBodyCreate, sails.config.figshareAPI.mapping.standardFields.create, 'license', figLicenceIDs);
      this.setFieldByNameInRequestBody(config, record, requestBodyCreate, sails.config.figshareAPI.mapping.standardFields.create, 'impersonate', figshareAccountAuthorIDs);

      for (const customFieldKey of customFieldsKeys) {
        this.setCustomFieldInRequestBody(config, record, customFields, customFieldKey, sails.config.figshareAPI.mapping.customFields.create);
      }

      for (const standardField of sails.config.figshareAPI.mapping.standardFields.create) {
        this.setStandardFieldInRequestBody(config, record, requestBodyCreate, standardField);
      }

      _.set(requestBodyCreate, sails.config.figshareAPI.mapping.customFields.path, customFields);
      return requestBodyCreate;
    }

    private getEmbargoRequestBody(config: FigshareRuntimeConfig, record: AnyRecord, figshareAccountAuthorIDs?: AnyRecord[]) {

      let requestEmbargoBody: AnyRecord = {};
      if (!_.isEmpty(sails.config.figshareAPI.mapping.standardFields.embargo)) {

        //Encountered shared reference issues even when creating a new object hence _.cloneDeep is required
        requestEmbargoBody = _.cloneDeep(new FigshareArticleEmbargo(0, false, '', '', '', '', [])) as AnyRecord;

        this.setFieldByNameInRequestBody(config, record, requestEmbargoBody, sails.config.figshareAPI.mapping.standardFields.embargo, 'impersonate', figshareAccountAuthorIDs || []);

        for (const standardField of sails.config.figshareAPI.mapping.standardFields.embargo) {
          this.setStandardFieldInRequestBody(config, record, requestEmbargoBody, standardField);
        }
      }

      return requestEmbargoBody;
    }

    private getPublishRequestBody(config: FigshareRuntimeConfig, figshareAccountAuthorIDs?: AnyRecord[]) {
      const requestBody = sails.config.figshareAPI.mapping.templates.impersonate as AnyRecord;
      const targetStatePublish = (sails.config.figshareAPI.mapping.targetState.publish || []) as FigshareFieldMapping[];
      this.setFieldByNameInRequestBody(config, {}, requestBody, targetStatePublish, 'impersonate', figshareAccountAuthorIDs || []);
      return requestBody;
    }

    private async sendDataPublicationToFigshare(record: AnyRecord) {
      const config = this.getRuntimeConfig();
      if (!this.isFigshareAPIEnabled(config)) {
        this.logWithLevel('warn', 'FigService - Figshare API is disabled. Skipping sendDataPublicationToFigshare.');
        return record;
      }
      try {
        this.logWithLevel(config.logLevel, 'FigService - -------------------------------------------');
        this.logWithLevel(config.logLevel, 'FigService - sendDataPublicationToFigshare - enter ');
        this.logWithLevel(config.logLevel, 'FigService - -------------------------------------------');
        let articleId = 0;

        if (_.has(record, config.figArticleIdPathInRecord) && !_.isUndefined(_.get(record, config.figArticleIdPathInRecord)) &&
          _.get(record, config.figArticleIdPathInRecord) > 0) {
          articleId = _.toNumber(_.get(record, config.figArticleIdPathInRecord));
          this.logWithLevel(config.logLevel, 'FigService - sendDataPublicationToFigshare - metadata.figshare_article_id ' + articleId);
        }
        this.logWithLevel(config.logLevel, 'FigService - sendDataPublicationToFigshare - articleId ' + articleId);
        //FindAuthor_Step1 - get list of contributors from record (Configurabe with lodash template)
        const contributorsDP = this.getContributorsFromRecord(config, record);
        this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare - contributorsDP ${JSON.stringify(contributorsDP)}`);
        let figshareAccountAuthorIDs: AnyRecord[] = [];
        if (!_.isEmpty(sails.config.figshareAPI.testUsers)) {
          figshareAccountAuthorIDs = sails.config.figshareAPI.testUsers as AnyRecord[];
        } else {
          //FindAuthor_Step2 - get list of contributors by matched Figshare IDs plus externals/unmatched added by name only (Configurabe with lodash template)
          figshareAccountAuthorIDs = await this.getAuthorUserIDs(config, contributorsDP);
        }
        const figLicenceIDs = (await this.getFigPrivateLicenses(config)) as AnyRecord[];
        let figCategoryIDs: number[] = [];
        if (!_.isEmpty(sails.config.figshareAPI.testCategories)) {
          figCategoryIDs = sails.config.figshareAPI.testCategories as number[];
        } else {
          //FindCat_Step1 - to get the list of Figshare category IDs from a ReDBox record (Configurabe with lodash template)
          figCategoryIDs = this.findCategoryIDs(config, record);
        }
        this.logWithLevel(config.logLevel, 'FigService - sendDataPublicationToFigshare - figshareAccountAuthorIDs');
        this.logWithLevel(config.logLevel, figshareAccountAuthorIDs);
        if (articleId == 0) {
          const requestBodyCreate = this.getArticleCreateRequestBody(config, record, figshareAccountAuthorIDs, figCategoryIDs, figLicenceIDs);
          this.logWithLevel(config.logLevel, 'FigService before early validation - requestBodyCreate -------------------------');
          this.logWithLevel(config.logLevel, 'FigService before early validation - requestBodyCreate ' + JSON.stringify(requestBodyCreate));
          this.logWithLevel(config.logLevel, 'FigService before early validation - requestBodyCreate -------------------------');
          this.validateCreateRequestBody(config, requestBodyCreate);
          //Need to pre validate the update request body as well before creating the article because if the article gets
          //created and then a backend validation is thrown before update the DP record will not save the article ID given
          //this process is occurring in a pre save trigger
          const dummyRequestBodyUpdate = this.getArticleUpdateRequestBody(config, record, figshareAccountAuthorIDs, figCategoryIDs, figLicenceIDs);
          this.logWithLevel(config.logLevel, 'FigService before early validation - requestBodyUpdate -------------------------');
          this.logWithLevel(config.logLevel, 'FigService before early validation - requestBodyUpdate ' + JSON.stringify(dummyRequestBodyUpdate));
          this.logWithLevel(config.logLevel, 'FigService before early validation - requestBodyUpdate -------------------------');
          this.validateUpdateRequestBody(config, dummyRequestBodyUpdate);

          const dummyEmbargoRequestBody = this.getEmbargoRequestBody(config, record, figshareAccountAuthorIDs);
          this.logWithLevel(config.logLevel, 'FigService before early validation - embargoRequestBody ------------------------');
          this.logWithLevel(config.logLevel, 'FigService before early validation - embargoRequestBody ' + JSON.stringify(dummyEmbargoRequestBody));
          this.logWithLevel(config.logLevel, 'FigService before early validation - embargoRequestBody ------------------------');
          this.validateEmbargoRequestBody(config, record, dummyEmbargoRequestBody);

          //config for create article
          const figshareArticleConfig = this.getAxiosConfig(config, 'post', '/account/articles', requestBodyCreate);
          this.logWithLevel(config.logLevel, 'FigService - -------------------------------------------');
          this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare ${figshareArticleConfig.method} - ${figshareArticleConfig.url}`);
          this.logWithLevel(config.logLevel, 'FigService - -------------------------------------------');
          this.logWithLevel(config.logLevel, 'FigService - sendDataPublicationToFigshare before create');
          this.logWithLevel(config.logLevel, 'FigService - sendDataPublicationToFigshare before post -------------------------------------------');
          this.logWithLevel(config.logLevel, 'FigService - sendDataPublicationToFigshare before post requestBodyCreate ' + JSON.stringify(requestBodyCreate));
          this.logWithLevel(config.logLevel, 'FigService - sendDataPublicationToFigshare before post -------------------------------------------');

          //create article
          let responseCreate: AxiosResponseLike = {
            status: '',
            statusText: '',
            data: {
              location: '',
              entity_id: 0,
              warnings: ['']
            }
          };
          try {
            responseCreate = await this.requestWithRetry(config, figshareArticleConfig, { label: 'createArticle', logResponse: true });
          } catch (createError) {
            if (sails.config.figshareAPI.testMode) {
              responseCreate = _.get(sails.config.figshareAPI, 'testResponse', {}) as AxiosResponseLike;
            } else {
              throw new RBValidationError({
                message: `Failed to create FigShare article for oid '${record.redboxOid}'`,
                options: { cause: createError },
                displayErrors: [{ title: "Failed to create FigShare article.", meta: { oid: record.redboxOid } }],
              });
            }
          }
          const responseCreateData = (responseCreate.data ?? {}) as AnyRecord;
          this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare status: ${responseCreate.status} statusText: ${responseCreate.statusText}`);
          this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare entityIdFAR: ${config.entityIdFAR} `);
          this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare sails.config.figshareAPI.testMode: ${sails.config.figshareAPI.testMode} `);
          this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare responseCreate.data: ${JSON.stringify(responseCreateData)} `);
          this.logWithLevel(config.logLevel, responseCreateData);
          //Note that lodash isEmpty will return true if the value is a number therefore had to be removed from the condition
          if (_.has(responseCreateData, config.entityIdFAR)) {

            articleId = _.toNumber(responseCreateData[config.entityIdFAR]);

            if (!_.isUndefined(articleId) && articleId > 0) {

              _.set(record, config.figArticleIdPathInRecord, articleId + '');
              this.logWithLevel(config.logLevel, 'FigService - sendDataPublicationToFigshare responseCreate.data.location ' + responseCreateData.location);

              if (_.has(responseCreateData, config.locationFAR) && !_.isEmpty(responseCreateData.location)) {

                const articleLocationURL = responseCreateData.location as string;
                this.logWithLevel(config.logLevel, 'FigService - sendDataPublicationToFigshare articleLocationURL response ' + articleLocationURL);

                if (_.isArray(config.figArticleURLPathInRecordList) && !_.isEmpty(config.figArticleURLPathInRecordList)) {

                  const figArticleURLPathInRecordResponse = config.figArticleURLPathInRecordList[0] + '_response';
                  _.set(record, figArticleURLPathInRecordResponse, articleLocationURL);

                  for (const figArticleURLPathInRecord of config.figArticleURLPathInRecordList) {
                    _.set(record, figArticleURLPathInRecord, `${config.frontEndURL}/${articleId}`);
                  }
                }

                const requestEmbargoBody = this.getEmbargoRequestBody(config, record, figshareAccountAuthorIDs);

                const isEmbargoed = this.isRecordEmbargoed(config, requestEmbargoBody, false);
                this.logWithLevel(config.logLevel, 'FigService - sendDataPublicationToFigshare - first post create check isEmbargoed ' + isEmbargoed);
                this.logWithLevel(config.logLevel, 'FigService - sendDataPublicationToFigshare - targetState ' + JSON.stringify(sails.config.figshareAPI.mapping.targetState));

                if (_.isUndefined(sails.config.figshareAPI.mapping.targetState.draft) && !isEmbargoed) {
                  //https://docs.figshare.com/#private_article_publish
                  const requestBodyPublishAfterCreate = this.getPublishRequestBody(config, figshareAccountAuthorIDs);
                  const publishConfig = this.getAxiosConfig(config, 'post', `/account/articles/${articleId}/publish`, requestBodyPublishAfterCreate);
                  this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare ${publishConfig.method} - ${publishConfig.url}`);

                  let responsePublish: AxiosResponseLike = { status: '', statusText: '' }
                  try {
                    responsePublish = await this.requestWithRetry(config, publishConfig, { label: 'publishAfterCreate', logResponse: true });

                  } catch (updateError) {
                    if (!sails.config.figshareAPI.testMode) {
                      throw new RBValidationError({
                        message: `Failed to update FigShare article id '${articleId}'`,
                        options: { cause: updateError },
                        displayErrors: [{
                          title: "Failed to update FigShare article.",
                          meta: { articleId, oid: record.redboxOid }
                        }],
                      });
                    }
                  }
                  this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare status: ${responsePublish.status} statusText: ${responsePublish.statusText}`);
                }
              }
            }
          }
        }

        if (!_.isUndefined(articleId) && articleId > 0) {

          let articleDetails = await this.getArticleDetails(config, articleId);
          const articleApprovedPublished = await this.isArticleApprovedAndPublished(config, articleId, articleDetails);
          const articleFileList = await this.getArticleFileList(config, articleId);
          const fileUploadInProgress = await this.isFileUploadInProgress(config, articleId, articleFileList);
          this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare - articleApprovedPublished ${articleApprovedPublished}`);
          this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare - fileUploadInProgress ${fileUploadInProgress}`);
          this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare - articleDetails ${JSON.stringify(articleDetails)}`);

          if (articleApprovedPublished && config.disableUpdateByCurationStatusFA) {
            this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare cannot be modified any further after it has been Approved & Published`);
          } else if (fileUploadInProgress) {
            throw new RBValidationError({
              message: `sendDataPublicationToFigshare file uploads still in progress: ${fileUploadInProgress}`,
              displayErrors: [{
                code: '@backend-Upload-In-Progress-validationMessage',
                meta: { articleId: articleId, oid: record.redboxOid }
              }],
            });
          } else {
            //set request body for updating Figshare article
            const requestBodyUpdate = this.getArticleUpdateRequestBody(config, record, figshareAccountAuthorIDs, figCategoryIDs, figLicenceIDs);
            this.logWithLevel(config.logLevel, requestBodyUpdate);
            this.validateUpdateRequestBody(config, requestBodyUpdate);

            //articleId is passed in then changed config to update (put) instead of create (post) config for update
            const figshareArticleConfig = this.getAxiosConfig(config, 'put', `/account/articles/${articleId}`, requestBodyUpdate);
            this.logWithLevel(config.logLevel, 'FigService - -------------------------------------------');
            this.logWithLevel(config.logLevel, 'FigService - sendDataPublicationToFigshare before update articleId ' + articleId);
            this.logWithLevel(config.logLevel, 'FigService - -------------------------------------------');
            this.logWithLevel(config.logLevel, 'FigService - figLicenceIDs ' + JSON.stringify(figLicenceIDs));
            this.logWithLevel(config.logLevel, 'FigService - -------------------------------------------');
            this.logWithLevel(config.logLevel, 'FigService - requestBodyUpdate ' + JSON.stringify(requestBodyUpdate));
            this.logWithLevel(config.logLevel, 'FigService - -------------------------------------------');
            this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare - ${figshareArticleConfig.method} - ${figshareArticleConfig.url}`);
            this.logWithLevel(config.logLevel, 'FigService - -------------------------------------------');
            //update article without impersonate
            const responseUpdate = await this.requestWithRetry(config, figshareArticleConfig, { label: 'updateArticle', logResponse: true });
            const responseUpdateData = (responseUpdate.data ?? {}) as AnyRecord;
            this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare status: ${responseUpdate.status} statusText: ${responseUpdate.statusText}`);
            this.logWithLevel(config.logLevel, 'FigService - sendDataPublicationToFigshare responseUpdate.data.location ' + responseUpdateData.location);

            if (_.has(responseUpdateData, config.locationFAR) && !_.isEmpty(responseUpdateData.location)) {

              const articleLocationURL = responseUpdateData.location as string;
              this.logWithLevel(config.logLevel, 'FigService - articleLocationURL response ' + articleLocationURL);

              if (_.isArray(config.figArticleURLPathInRecordList) && !_.isEmpty(config.figArticleURLPathInRecordList)) {

                const figArticleURLPathInRecordResponse = config.figArticleURLPathInRecordList[0] + '_response';
                _.set(record, figArticleURLPathInRecordResponse, articleLocationURL);

                for (const figArticleURLPathInRecord of config.figArticleURLPathInRecordList) {
                  _.set(record, figArticleURLPathInRecord, `${config.frontEndURL}/${articleId}`);
                }
              }

              const filesOrURLsAttached = await this.checkArticleHasURLsOrFilesAttached(config, articleId, articleFileList);
              const requestEmbargoBody = this.getEmbargoRequestBody(config, record, figshareAccountAuthorIDs);
              const isEmbargoed = this.isRecordEmbargoed(config, requestEmbargoBody, filesOrURLsAttached);
              this.logWithLevel(config.logLevel, 'FigService - sendDataPublicationToFigshare - post update check isEmbargoed ' + isEmbargoed);
              this.logWithLevel(config.logLevel, 'FigService - sendDataPublicationToFigshare - targetState ' + JSON.stringify(sails.config.figshareAPI.mapping.targetState));

              if (_.isUndefined(sails.config.figshareAPI.mapping.targetState.draft) && !isEmbargoed) {
                const requestBodyPublishAfterUpdate = this.getPublishRequestBody(config, figshareAccountAuthorIDs);
                this.logWithLevel(config.logLevel, 'FigService - sendDataPublicationToFigshare before publish response location ' + responseUpdateData.location);
                this.logWithLevel(config.logLevel, 'FigService - sendDataPublicationToFigshare before publish requestBodyPublishAfterUpdate ' + JSON.stringify(requestBodyPublishAfterUpdate));

                //https://docs.figshare.com/#private_article_publish
                const publishConfig = this.getAxiosConfig(config, 'post', `/account/articles/${articleId}/publish`, requestBodyPublishAfterUpdate);
                this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare - ${publishConfig.method} - ${publishConfig.url}`);
                const responsePublish = await this.requestWithRetry(config, publishConfig, { label: 'publishAfterUpdate', logResponse: true });
                this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare - status: ${responsePublish.status} statusText: ${responsePublish.statusText}`);

                if (!_.isEmpty(sails.config.figshareAPI.mapping.response.article)) {
                  const responseArticleFields = (sails.config.figshareAPI.mapping.response.article || []) as FigshareFieldMapping[];
                  articleDetails = await this.getArticleDetails(config, articleId);
                  this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare - after publish articleDetails ${JSON.stringify(articleDetails)}`);
                  this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare - after publish mapping.response.article ${JSON.stringify(sails.config.figshareAPI.mapping.response.article)}`);
                  for (const field of responseArticleFields) {
                    this.setFieldInRecord(config, record, articleDetails, field);
                  }
                }
              }
            }
          }

          const requestEmbargoBody = this.getEmbargoRequestBody(config, record, figshareAccountAuthorIDs);
          const filesOrURLsAttached = await this.checkArticleHasURLsOrFilesAttached(config, articleId, articleFileList);
          const isEmbargoed = this.isRecordEmbargoed(config, requestEmbargoBody, filesOrURLsAttached);
          const isEmbargoCleared = await this.isClearEmbargoNeeded(config, requestEmbargoBody, articleId, articleDetails);
          this.logWithLevel(config.logLevel, 'FigService - sendDataPublicationToFigshare - post update check 2 isEmbargoed ' + isEmbargoed);
          this.logWithLevel(config.logLevel, 'FigService - sendDataPublicationToFigshare - post update check 2 isEmbargoCleared ' + isEmbargoCleared);

          if (isEmbargoed) {

            const embargoDetailsChanged = await this.checkEmbargoDetailsChanged(config, requestEmbargoBody, articleId, articleDetails);
            if (embargoDetailsChanged) {

              //validate requestEmbargoBody
              this.validateEmbargoRequestBody(config, record, requestEmbargoBody);

              //Update full article embargo info because Figshare rules allow for full article embargo to be set regardless if there are files uploaded
              const embargoConfig = this.getAxiosConfig(config, 'put', `/account/articles/${articleId}/embargo`, requestEmbargoBody);
              this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare - ${embargoConfig.method} - ${embargoConfig.url}`);

              this.logWithLevel(config.logLevel, 'FigService - before embargo -------------------------------------------');
              this.logWithLevel(config.logLevel, 'FigService - before embargo requestEmbargoBody ' + JSON.stringify(requestEmbargoBody));
              this.logWithLevel(config.logLevel, 'FigService - before embargo -------------------------------------------');

              const responseEmbargo = await this.requestWithRetry(config, embargoConfig, { label: 'setEmbargo', logResponse: true });
              this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare status: ${responseEmbargo.status} statusText: ${responseEmbargo.statusText}`);
            }
          } else if (isEmbargoCleared) {

            const embargoDeleteConfig = this.getAxiosConfig(config, 'delete', `/account/articles/${articleId}/embargo`, {});
            this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare - ${embargoDeleteConfig.method} - ${embargoDeleteConfig.url}`);

            this.logWithLevel(config.logLevel, 'FigService - before clear embargo -------------------------------------------');
            this.logWithLevel(config.logLevel, 'FigService - before clear embargo requestEmbargoBody ' + JSON.stringify(requestEmbargoBody));
            this.logWithLevel(config.logLevel, 'FigService - before clear embargo -------------------------------------------');

            const responseEmbargoDelete = await this.requestWithRetry(config, embargoDeleteConfig, { label: 'clearEmbargo', logResponse: true });
            this.logWithLevel(config.logLevel, `FigService - sendDataPublicationToFigshare status: ${responseEmbargoDelete.status} statusText: ${responseEmbargoDelete.statusText}`);
          }
        }

      } catch (error) {
        const msg = "Failed communicating with FigShare";
        throw new RBValidationError({
          message: _.get(error, 'response.data.message') || msg,
          options: { cause: error },
          displayErrors: [{ title: msg }],
        });
      }

      return record;
    }

    private validateEmbargoRequestBody(config: FigshareRuntimeConfig, record: AnyRecord, requestBody: AnyRecord) {
      let valid = '';
      if (!_.isEmpty(sails.config.figshareAPI.mapping.standardFields.embargo)) {
        for (const embargoField of sails.config.figshareAPI.mapping.standardFields.embargo) {
          valid = this.validateFieldInRequestBody(config, requestBody, embargoField, '', record);
          if (valid != '') {
            throw new RBValidationError({
              message: `FigShare embargo request body was not valid: field ${embargoField} message ${valid} body ${JSON.stringify(requestBody)}`,
              displayErrors: [{ detail: valid }],
            });
          }
        }
      }
    }

    private checkCreateFields(config: FigshareRuntimeConfig, requestBody: AnyRecord) {
      let valid = '';

      const impersonate = sails.config.figshareAPI.mapping.standardFields.create;
      if (!_.isEmpty(impersonate)) {
        for (const impersonateField of impersonate) {
          valid = this.validateFieldInRequestBody(config, requestBody, impersonateField);
          if (valid != '') {
            return valid;
          }
        }
      }

      for (const standardField of sails.config.figshareAPI.mapping.standardFields.create) {
        valid = this.validateFieldInRequestBody(config, requestBody, standardField);
        if (valid != '') {
          return valid;
        }
      }

      for (const customField of sails.config.figshareAPI.mapping.customFields.create) {
        valid = this.validateFieldInRequestBody(config, requestBody, customField, sails.config.figshareAPI.mapping.customFields.path);
        if (valid != '') {
          return valid;
        }
      }

      return valid;
    }

    private validateFieldInRequestBody(config: FigshareRuntimeConfig, requestBody: AnyRecord, field: FigshareFieldMapping, customFieldPath: string = '', record: AnyRecord = {}) {
      const invalidValueForField = TranslationService.t('@backend-prefix-validationMessage'); //Invalid value for field:
      const maxLengthIs = TranslationService.t('@backend-maxlength-validationMessage'); //maximum length is
      const minLengthIs = TranslationService.t('@backend-minlength-validationMessage'); //minimum length is
      const idNotFound = TranslationService.t('@backend-idNotFound-validationMessage'); //Id Not Found in Figshare
      let valid = '';
      let passed = true;
      let context: AnyRecord = {};
      const validations = _.get(field, 'validations', []) as AnyRecord[];
      const figName = typeof field.figName === 'string' ? field.figName : '';

      if (config.extraVerboseLogging) {
        this.logWithLevel(config.logLevel, `FigService ---- requestBody ---- ${JSON.stringify(requestBody)}`);
        this.logWithLevel(config.logLevel, `FigService ---- field ---- ${JSON.stringify(field)} --- path ${customFieldPath}`);
      }
      if (!_.isEmpty(validations)) {
        for (const validation of validations) {
          const template = _.get(validation, 'template');
          const minLength = _.get(validation, 'minLength', 0);
          const maxLength = _.get(validation, 'maxLength', 0);
          const addPrefix = _.get(validation, 'addPrefix', true);
          const addSuffix = _.get(validation, 'addSuffix', false);
          const overridePrefix = _.get(validation, 'overridePrefix', '');
          const overrideSuffix = _.get(validation, 'overrideSuffix', '');
          const regexValidation = _.get(validation, 'regexValidation', '');
          if (!_.isUndefined(template) && template.indexOf('<%') != -1) {
            if (_.isEmpty(context)) {
              if (!_.isEmpty(record)) {
                context = {
                  request: requestBody,
                  moment: moment,
                  field: field,
                  artifacts: config.mappingArtifacts,
                  record: record
                }
              } else {
                context = {
                  request: requestBody,
                  moment: moment,
                  field: field,
                  artifacts: config.mappingArtifacts
                }
              }
            }
            passed = _.template(template)(context);

            if (config.extraVerboseLogging) {
              this.logWithLevel(config.logLevel, `FigService ---- field ---- ${figName} ----  template ---- ${passed}`);
            }
            if (!passed) {
              valid = TranslationService.t(_.get(validation, 'message', 'Error on request to Figshare'));
            }
          } else if (maxLength > 0) {
            let val = figName ? _.get(requestBody, figName, '') : '';
            if (customFieldPath != '') {
              val = figName ? _.get(requestBody, customFieldPath + '.' + figName, '') : '';
            }
            if (val.length > maxLength) {
              passed = false;
            } else {
              passed = true;
            }

            if (config.extraVerboseLogging) {
              this.logWithLevel(config.logLevel, `FigService ---- standardField ---- ${figName} ----  maxLength ---- ${passed}`);
            }
            if (!passed) {
              valid = TranslationService.t(_.get(validation, 'message', 'Error on request to Figshare')) + ' ' + maxLengthIs + ' ' + maxLength;
            }
          } else if (minLength > 0) {
            let val = figName ? _.get(requestBody, figName, '') : '';
            if (customFieldPath != '') {
              val = figName ? _.get(requestBody, customFieldPath + '.' + figName, '') : '';
            }
            if (val.length <= minLength) {
              passed = false;
            } else {
              passed = true;
            }

            if (config.extraVerboseLogging) {
              this.logWithLevel(config.logLevel, `FigService ---- standardField ---- ${figName} ----  minLength ---- ${passed}`);
            }
            if (!passed) {
              valid = TranslationService.t(_.get(validation, 'message', 'Error on request to Figshare')) + ' ' + minLengthIs + ' ' + minLength;
            }
          } else if (regexValidation != '') {
            const val = figName ? _.get(requestBody, figName, '') : '';
            const caseSensitive = _.get(validation, 'caseSensitive', true);
            const skipIfEmpty = _.get(validation, 'skipIfEmpty', false);
            if (skipIfEmpty && _.trim(val) == '') {
              //do nothing
            } else {
              if (caseSensitive) {
                const re = new RegExp(regexValidation);
                if (!re.test(val)) {
                  valid = TranslationService.t(_.get(validation, 'message', 'Error on request to Figshare'));
                }
              } else {
                const re = new RegExp(regexValidation, 'i');
                if (!re.test(val)) {
                  valid = TranslationService.t(_.get(validation, 'message', 'Error on request to Figshare'));
                }
              }
            }
          }
          if (valid != '') {
            if (addPrefix) {
              if (overridePrefix != '') {
                valid = TranslationService.t(overridePrefix) + ' ' + valid;
              } else {
                valid = invalidValueForField + ' ' + valid;
              }
            }
            if (addSuffix) {
              if (overrideSuffix != '') {
                valid = valid + ' ' + TranslationService.t(overrideSuffix);
              } else {
                valid = valid + ' ' + idNotFound;
              }
            }
          }
        }
      }
      return valid;
    }

    private validateCreateRequestBody(config: FigshareRuntimeConfig, requestBody: AnyRecord) {
      const valid = this.checkCreateFields(config, requestBody);
      this.logWithLevel(config.logLevel, `FigService - validateCreateArticleRequestBody - validMessage ${valid}`);
      if (valid != '') {
        throw new RBValidationError({
          message: `FigShare create request body was not valid: message ${valid} body ${JSON.stringify(requestBody)}`,
          displayErrors: [{ detail: valid }],
        });
      }
    }

    private checkRequestUpdateFields(config: FigshareRuntimeConfig, requestBody: AnyRecord) {
      let valid = '';

      for (const standardField of sails.config.figshareAPI.mapping.standardFields.update) {
        valid = this.validateFieldInRequestBody(config, requestBody, standardField);
        if (valid != '') {
          return valid;
        }
      }

      for (const customField of sails.config.figshareAPI.mapping.customFields.update) {
        valid = this.validateFieldInRequestBody(config, requestBody, customField, sails.config.figshareAPI.mapping.customFields.path);
        if (valid != '') {
          return valid;
        }
      }

      return valid;
    }

    private validateUpdateRequestBody(config: FigshareRuntimeConfig, requestBody: AnyRecord) {
      const valid = this.checkRequestUpdateFields(config, requestBody);
      this.logWithLevel(config.logLevel, `FigService - validateUpdateArticleRequestBody - validMessage ${valid}`);
      if (valid != '') {
        throw new RBValidationError({
          message: `FigShare update request body was not valid: message ${valid} body ${JSON.stringify(requestBody)}`,
          displayErrors: [{ detail: valid }],
        });
      }
    }

    private isFileAttachmentInDataLocations(dataLocations: AnyRecord[]) {
      let foundAttachment = false;
      if (sails.config.figshareAPI.mapping.figshareOnlyPublishSelectedAttachmentFiles) {
        for (const attachmentFile of dataLocations) {
          if (!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && attachmentFile.type == 'attachment' && attachmentFile.selected == true) {
            foundAttachment = true;
            break;
          }
        }
      } else {
        for (const attachmentFile of dataLocations) {
          if (!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && attachmentFile.type == 'attachment') {
            foundAttachment = true;
            break;
          }
        }
      }
      return foundAttachment;
    }

    private isURLAttachmentInDataLocations(dataLocations: AnyRecord[]) {
      let foundURLAttachment = false;
      if (sails.config.figshareAPI.mapping.figshareOnlyPublishSelectedAttachmentFiles) {
        for (const urlAttachment of dataLocations) {
          if (!_.isUndefined(urlAttachment) && !_.isEmpty(urlAttachment) && urlAttachment.type == 'url' && urlAttachment.selected == true) {
            foundURLAttachment = true;
            break;
          }
        }
      } else {
        for (const urlAttachment of dataLocations) {
          if (!_.isUndefined(urlAttachment) && !_.isEmpty(urlAttachment) && urlAttachment.type == 'url') {
            foundURLAttachment = true;
            break;
          }
        }
      }
      return foundURLAttachment;
    }

    private countFileAttachmentsInDataLocations(dataLocations: AnyRecord[]) {
      let count = 0;
      if (sails.config.figshareAPI.mapping.figshareOnlyPublishSelectedAttachmentFiles) {
        for (const attachmentFile of dataLocations) {
          if (!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && attachmentFile.type == 'attachment' && attachmentFile.selected == true) {
            count++;
          }
        }
      } else {
        for (const attachmentFile of dataLocations) {
          if (!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && attachmentFile.type == 'attachment') {
            count++;
          }
        }
      }
      return count;
    }

    private async checkUploadFilesPending(config: FigshareRuntimeConfig, record: AnyRecord, oid: string, user: AnyRecord, figshareAccountAuthorIDs?: AnyRecord[]) {

      try {
        this.logWithLevel(config.logLevel, 'FigService - -------------------------------------------');
        this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - enter');
        this.logWithLevel(config.logLevel, 'FigService - -------------------------------------------');

        let articleId = 0;
        if (_.has(record, config.figArticleIdPathInRecord) && !_.isUndefined(_.get(record, config.figArticleIdPathInRecord)) &&
          _.get(record, config.figArticleIdPathInRecord) > 0) {
          articleId = _.toNumber(_.get(record, config.figArticleIdPathInRecord));
          this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - metadata.figshare_article_id ' + articleId);
        }
        this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - articleId ' + articleId);
        this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - oid ' + oid);

        if (articleId > 0) {

          if (!figshareAccountAuthorIDs) {
            const contributorsDP = this.getContributorsFromRecord(config, record);
            if (!_.isEmpty(sails.config.figshareAPI.testUsers)) {
              figshareAccountAuthorIDs = sails.config.figshareAPI.testUsers as AnyRecord[];
            } else {
              figshareAccountAuthorIDs = await this.getAuthorUserIDs(config, contributorsDP);
            }
          }

          //Check article curation status and if approved cannot be updated
          const checkStatusConfig = this.getAxiosConfig(config, 'get', `/account/articles/${articleId}`, null);
          this.logWithLevel(config.logLevel, `FigService - checkUploadFilesPending - ${checkStatusConfig.method} - ${checkStatusConfig.url}`);
          const responseArticleDetails = await this.requestWithRetry(config, checkStatusConfig, { label: 'checkUploadFilesPendingStatus', logResponse: true });
          this.logWithLevel(config.logLevel, `FigService - checkUploadFilesPending - status: ${responseArticleDetails.status} statusText: ${responseArticleDetails.statusText}`);
          let articleDetails = (responseArticleDetails.data ?? {}) as AnyRecord;
          const articleApprovedPublished = await this.isArticleApprovedAndPublished(config, articleId, articleDetails);
          if (articleApprovedPublished && config.disableUpdateByCurationStatusFA) {
            this.logWithLevel(config.logLevel, `FigService - checkUploadFilesPending - cannot be modified any further after it has been Approved & Published`);
          } else {

            //Try to upload files to article
            const that = this;
            let articleFileList = await this.getArticleFileList(config, articleId);
            const filePath = sails.config.figshareAPI.attachmentsFigshareTempDir;
            this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - attachmentsFigshareTempDir ' + filePath);

            if (!fs.existsSync(filePath)) {
              fs.mkdirSync(filePath);
            }

            const dataLocations = (_.get(record, config.dataLocationsPathInRecord) as AnyRecord[]) || [];
            const dataLocationsAlreadyUploaded = _.filter(dataLocations, { 'ignore': true });
            let foundFileAttachment = this.isFileAttachmentInDataLocations(dataLocations);
            const countFileAttachments = this.countFileAttachmentsInDataLocations(dataLocations);

            this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - before override foundAttachment ' + foundFileAttachment);
            //Evaluate project specific rules that can override the need to upload files present in data locations list
            const uploadOverrideConfig = sails.config.figshareAPI.mapping.upload.override;
            if (uploadOverrideConfig && !_.isEmpty(uploadOverrideConfig) && foundFileAttachment) {
              const overrideTemplate = uploadOverrideConfig.template;
              if (overrideTemplate) {
                foundFileAttachment = !!this.getValueFromRecord(config, record, overrideTemplate);
              }
            }
            this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - foundAttachment ' + foundFileAttachment);

            if (foundFileAttachment) {
              //Files in figshare article have to be status available. Status 'created' means that the file is still being uploaded to the article
              const fileUploadsInProgress = await this.isFileUploadInProgress(config, articleId, articleFileList);
              if (fileUploadsInProgress) {
                this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - file uploads still in progress');
              }

              const onlyUploadIfSelected = sails.config.figshareAPI.mapping.figshareOnlyPublishSelectedAttachmentFiles;

              for (const attachmentFile of dataLocations) {
                if (!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && attachmentFile.type == 'attachment') {
                  this.logWithLevel(config.logLevel, attachmentFile);
                  const attachId = String(attachmentFile.fileId ?? '');
                  const fileName = String(attachmentFile.name ?? '');
                  const fileSize = _.toNumber(attachmentFile.size);
                  if (!attachId || !fileName || !Number.isFinite(fileSize)) {
                    continue;
                  }
                  //check if the file has been uploaded already or not to the figshare article
                  articleFileList = await this.getArticleFileList(config, articleId, false);
                  this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - article file list: ' + JSON.stringify(articleFileList));
                  const filePendingToBeUploaded = _.find(articleFileList, ['name', fileName]);
                  const fileFullPath = filePath + '/' + fileName;
                  const thresholdAppliedFileSize = fileSize + sails.config.figshareAPI.diskSpaceThreshold;
                  if (_.isUndefined(filePendingToBeUploaded) && !fileUploadsInProgress && ((onlyUploadIfSelected && _.get(attachmentFile, 'selected', false)) || !onlyUploadIfSelected)) {
                    //if file name not found on the articleFileList means it's not yet uploaded and an agenda queue job needs to be queued
                    this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - attachmentsTempDir ' + sails.config.figshareAPI.attachmentsTempDir);
                    const diskSpace = await checkDiskSpace(sails.config.figshareAPI.attachmentsTempDir);
                    this.logWithLevel(config.logLevel, diskSpace);
                    this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - total file size ' + fileSize);
                    this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - total free disk space ' + diskSpace.free);
                    if (diskSpace.free > thresholdAppliedFileSize) {
                      that.logWithLevel(config.logLevel, `FigService - checkUploadFilesPending - saving file to temp location in ${fileFullPath}`);
                      that.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - start processing file upload ');
                      that.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - fileSize ' + fileSize);
                      //Refactor not to use agenda queue and processing only one file at a time per one data publication although concurrent file uploads can
                      //happen with different data publication records and once a file upload process is finished it will do a recursive call to this method
                      //checkUploadFilesPending to process to process the next file upload to Figshare
                      this.processFileUploadToFigshare(config, oid, attachId, String(articleId), record, fileName, fileSize, user, figshareAccountAuthorIDs);
                      break;
                    } else {
                      this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - Not enough free space on disk');
                    }
                  }
                }
              }

              this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - fileUploadsInProgress ' + fileUploadsInProgress);
              this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - articleFileList.length ' + articleFileList.length);
              this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - countFileAttachments ' + countFileAttachments);
              this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - figNeedsPublishAfterFileUpload ' + config.figNeedsPublishAfterFileUpload);
              this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - recordAllFilesUploaded ' + sails.config.figshareAPI.mapping.recordAllFilesUploaded);
              this.logWithLevel(config.logLevel, `FigService - checkUploadFilesPending - articleFileList: ${JSON.stringify(articleFileList)}`);

              if (!fileUploadsInProgress && ((articleFileList.length == countFileAttachments && !onlyUploadIfSelected) || ((articleFileList.length - dataLocationsAlreadyUploaded.length) == countFileAttachments && articleFileList.length >= dataLocationsAlreadyUploaded.length && onlyUploadIfSelected))) {

                //Update file embargo info if required
                //Figshare rules allow for full article embargo to be set regardless if there are files uploaded however a file
                //embargo can be set only after at least one file has been successfully uploaded however it's best to allow the
                //file upload process to run it's course and set file embargo after processing of file uploads
                const requestEmbargoBody = this.getEmbargoRequestBody(config, record, figshareAccountAuthorIDs);
                const filesOrURLsAttached = await this.checkArticleHasURLsOrFilesAttached(config, articleId, []);
                const isEmbargoed = this.isRecordEmbargoed(config, requestEmbargoBody, filesOrURLsAttached);
                const isEmbargoCleared = await this.isClearEmbargoNeeded(config, requestEmbargoBody, articleId, articleDetails);
                this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - final check isEmbargoed ' + isEmbargoed);
                this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - final check isEmbargoCleared ' + isEmbargoCleared);

                if (isEmbargoed) {
                  //validate requestEmbargoBody
                  this.validateEmbargoRequestBody(config, record, requestEmbargoBody);

                  const embargoDetailsChanged = await this.checkEmbargoDetailsChanged(config, requestEmbargoBody, articleId, articleDetails);
                  if (embargoDetailsChanged) {
                    const embargoConfig = this.getAxiosConfig(config, 'put', `/account/articles/${articleId}/embargo`, requestEmbargoBody);
                    this.logWithLevel(config.logLevel, `FigService - checkUploadFilesPending - embargo - ${embargoConfig.method} - ${embargoConfig.url}`);
                    const responseEmbargo = await this.requestWithRetry(config, embargoConfig, { label: 'checkUploadFilesPendingEmbargo', logResponse: true });
                    this.logWithLevel(config.logLevel, `FigService - checkUploadFilesPending - status: ${responseEmbargo.status} statusText: ${responseEmbargo.statusText}`);
                  }

                } else if (isEmbargoCleared) {

                  const embargoDeleteConfig = this.getAxiosConfig(config, 'delete', `/account/articles/${articleId}/embargo`, {});
                  this.logWithLevel(config.logLevel, `FigService - checkUploadFilesPending - ${embargoDeleteConfig.method} - ${embargoDeleteConfig.url}`);
                  const responseEmbargoDelete = await this.requestWithRetry(config, embargoDeleteConfig, { label: 'checkUploadFilesPendingClearEmbargo', logResponse: true });
                  this.logWithLevel(config.logLevel, `FigService - checkUploadFilesPending status: ${responseEmbargoDelete.status} statusText: ${responseEmbargoDelete.statusText}`);
                }

                if (config.figNeedsPublishAfterFileUpload) {
                  const recordMeta = (record.metaMetadata ?? {}) as AnyRecord;
                  this.queuePublishAfterUploadFiles(oid, String(articleId), user, String(recordMeta.brandId ?? ''));
                }
              }

            } else {
              const onlyUploadURLIfSelected = sails.config.figshareAPI.mapping.figshareOnlyPublishSelectedLocationURLs;
              let foundURLAttachment = this.isURLAttachmentInDataLocations(dataLocations);
              this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - before override foundURLAttachment ' + foundURLAttachment);
              //Evaluate project specific rules that can override the need to upload files present in data locations list
              const uploadOverrideConfig = sails.config.figshareAPI.mapping.upload.override;
              if (uploadOverrideConfig && !_.isEmpty(uploadOverrideConfig) && foundURLAttachment) {
                const overrideTemplate = uploadOverrideConfig.template;
                if (overrideTemplate) {
                  foundURLAttachment = !!this.getValueFromRecord(config, record, overrideTemplate);
                }
              }
              this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - foundURLAttachment ' + foundURLAttachment);

              if (foundURLAttachment) {

                for (const attachmentFile of dataLocations) {
                  if (!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && attachmentFile.type == 'url' && ((onlyUploadURLIfSelected && _.get(attachmentFile, 'selected', false)) || !onlyUploadURLIfSelected) && !_.get(attachmentFile, 'ignore', false)) {

                    let linkOnlyFileFound = false;
                    let linkOnlyId;
                    for (const linkOnly of articleFileList) {
                      if (linkOnly['is_link_only'] == true) {
                        linkOnlyFileFound = true;
                        linkOnlyId = linkOnly['id'];
                        break;
                      }
                    }

                    if (linkOnlyFileFound) {
                      const configDelete = this.getAxiosConfig(config, 'delete', `/account/articles/${articleId}/files/${linkOnlyId}`, {});
                      this.logWithLevel(config.logLevel, `FigService - checkUploadFilesPending - ${configDelete.method} - ${configDelete.url}`);
                      const responseDelete = await this.requestWithRetry(config, configDelete, { label: 'deleteLinkOnlyFile', logResponse: true });
                      this.logWithLevel(config.logLevel, `FigService - checkUploadFilesPending - responseDelete status: ${responseDelete.status} statusText: ${responseDelete.statusText}`);
                      const responseDeleteData = (responseDelete.data ?? {}) as AnyRecord;
                      this.logWithLevel(config.logLevel, responseDeleteData);
                    }

                    const requestBody =
                    {
                      link: attachmentFile.location
                    }
                    const configUpload = this.getAxiosConfig(config, 'post', `/account/articles/${articleId}/files`, requestBody);

                    this.logWithLevel(config.logLevel, `FigService - checkUploadFilesPending - ${configUpload.method} - ${configUpload.url}`);
                    const response = await this.requestWithRetry(config, configUpload, { label: 'uploadLinkOnly', logResponse: true });
                    this.logWithLevel(config.logLevel, `FigService - checkUploadFilesPending - response link only status: ${response.status} statusText: ${response.statusText}`);
                    const responseData = (response.data ?? {}) as AnyRecord;
                    this.logWithLevel(config.logLevel, responseData);
                    this.logWithLevel(config.logLevel, 'FigService - -------------------------------------------');
                    this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - response link only ' + responseData.location);
                    this.logWithLevel(config.logLevel, 'FigService - -------------------------------------------');

                    //File embargo can be set only if there are file attachments and these have been successfully uploaded
                    //therefore if the attachments are sigle URL link then only embargo type article can be set
                    const requestEmbargoBody = this.getEmbargoRequestBody(config, record, figshareAccountAuthorIDs);
                    const isEmbargoed = this.isRecordEmbargoed(config, requestEmbargoBody, false);
                    const isEmbargoCleared = await this.isClearEmbargoNeeded(config, requestEmbargoBody, articleId, articleDetails);
                    this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - in progress check isEmbargoed ' + isEmbargoed);
                    this.logWithLevel(config.logLevel, 'FigService - checkUploadFilesPending - in progress check isEmbargoCleared ' + isEmbargoCleared);

                    if ((isEmbargoed)) {
                      //validate requestEmbargoBody
                      this.validateEmbargoRequestBody(config, record, requestEmbargoBody);

                      const embargoDetailsChanged = await this.checkEmbargoDetailsChanged(config, requestEmbargoBody, articleId, articleDetails);
                      if (embargoDetailsChanged) {
                        const embargoConfig = this.getAxiosConfig(config, 'put', `/account/articles/${articleId}/embargo`, requestEmbargoBody);
                        this.logWithLevel(config.logLevel, `FigService - checkUploadFilesPending update embargo - ${embargoConfig.method} - ${embargoConfig.url}`);
                        const responseEmbargo = await this.requestWithRetry(config, embargoConfig, { label: 'uploadLinkOnlyEmbargo', logResponse: true });
                        this.logWithLevel(config.logLevel, `FigService - checkUploadFilesPending - status: ${responseEmbargo.status} statusText: ${responseEmbargo.statusText}`);
                      }
                    } else if (isEmbargoCleared) {
                      const embargoDeleteConfig = this.getAxiosConfig(config, 'delete', `/account/articles/${articleId}/embargo`, {});
                      this.logWithLevel(config.logLevel, `FigService - checkUploadFilesPending clear embargo - ${embargoDeleteConfig.method} - ${embargoDeleteConfig.url}`);
                      const responseEmbargoDelete = await this.requestWithRetry(config, embargoDeleteConfig, { label: 'uploadLinkOnlyClearEmbargo', logResponse: true });
                      this.logWithLevel(config.logLevel, `FigService - checkUploadFilesPending status: ${responseEmbargoDelete.status} statusText: ${responseEmbargoDelete.statusText}`);
                    }

                    if (config.figNeedsPublishAfterFileUpload) {
                      //https://docs.figshare.com/#private_article_publish
                      const requestBodyPublishAfterFileUploads = this.getPublishRequestBody(config, figshareAccountAuthorIDs);
                      this.logWithLevel(config.logLevel, `FigService - publish checkUploadFilesPending requestBodyPublishAfterFileUploads ${JSON.stringify(requestBodyPublishAfterFileUploads)}`);
                      const publishConfig = this.getAxiosConfig(config, 'post', `/account/articles/${articleId}/publish`, requestBodyPublishAfterFileUploads);
                      this.logWithLevel(config.logLevel, `FigService - publish checkUploadFilesPending ${publishConfig.method} - ${publishConfig.url}`);
                      let responsePublish: AxiosResponseLike = { status: '', statusText: '' }

                      this.logWithLevel(config.logLevel, `FigService - linkOnlyFileFound publish checkUploadFilesPending status: ${responsePublish.status} statusText: ${responsePublish.statusText}`);
                      responsePublish = await this.requestWithRetry(config, publishConfig, { label: 'publishLinkOnly', logResponse: true });
                      this.logWithLevel(config.logLevel, `FigService - publish checkUploadFilesPending status: ${responsePublish.status} statusText: ${responsePublish.statusText}`);

                      if (!_.isEmpty(sails.config.figshareAPI.mapping.response.article)) {
                        const responseArticleFields = (sails.config.figshareAPI.mapping.response.article || []) as FigshareFieldMapping[];
                        //articleDetails needs to be retrieved after publish to update handle and doi and other fields that may have been empty
                        articleDetails = await this.getArticleDetails(config, articleId);
                        this.logVerbose(config, `FigService - checkUploadFilesPending - after publish articleDetails ${JSON.stringify(articleDetails)}`);
                        this.logWithLevel(config.logLevel, `FigService - checkUploadFilesPending - after publish mapping.response.article ${JSON.stringify(sails.config.figshareAPI.mapping.response.article)}`);
                        for (const field of responseArticleFields) {
                          this.setFieldInRecord(config, record, articleDetails, field);
                        }
                        this.logVerbose(config, `FigService - checkUploadFilesPending record before ${JSON.stringify(record)}`);
                        const recordMeta = (record.metaMetadata ?? {}) as AnyRecord;
                        const brand: BrandingModel = BrandingService.getBrandById(recordMeta.brandId as string);
                        this.logWithLevel(config.logLevel, `FigService - checkUploadFilesPending oid: ${oid} user: ${JSON.stringify(user)}`);
                        if (!_.isUndefined(sails.config.figshareAPI.mapping.recordAllFilesUploaded) && !_.isEmpty(sails.config.figshareAPI.mapping.recordAllFilesUploaded)) {
                          _.set(record, sails.config.figshareAPI.mapping.recordAllFilesUploaded, 'yes');
                        }
                        await RecordsService.updateMeta(brand, oid, record, user, false, false);
                      }
                    }

                    break;
                  }
                }
              }
            }
          }
        }

      } catch (error) {
        this.logWithLevel(config.logLevel, `FigService - publish checkUploadFilesPending error: ${JSON.stringify(error)}`);
        sails.log.error(error);
      }
    }

    //Fixed version, unminified and ES6'ed
    //taken from SO
    //https://stackoverflow.com/questions/15900485/correct-way-to-convert-size-in-bytes-to-kb-mb-gb-in-javascript
    private formatBytes(bytes: number, decimals = 2) {
      if (bytes === 0) return '0 Bytes';

      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

      const i = Math.floor(Math.log(bytes) / Math.log(k));

      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    private async processFileUploadToFigshare(
      config: FigshareRuntimeConfig,
      oid: string,
      attachId: string,
      articleId: string | number,
      record: AnyRecord,
      fileName: string,
      fileSize: number,
      user: AnyRecord,
      figshareAccountAuthorIDs: AnyRecord[] | undefined = undefined
    ) {

      this.logWithLevel(config.logLevel, 'FigService - processFileUploadToFigshare - enter');
      this.logWithLevel(config.logLevel, 'FigService - processFileUploadToFigshare - oid ' + oid);
      this.logWithLevel(config.logLevel, 'FigService - processFileUploadToFigshare - attachId ' + attachId);
      this.logWithLevel(config.logLevel, attachId);
      const filePath = sails.config.figshareAPI.attachmentsFigshareTempDir;
      const fileFullPath = filePath + '/' + fileName;

      this.logWithLevel(config.logLevel, record);
      const dataLocations = (_.get(record, config.dataLocationsPathInRecord) as AnyRecord[]) || [];
      //Print the list of files in the dataPublication record
      for (const attachmentFile of dataLocations) {
        this.logWithLevel(config.logLevel, attachmentFile);
      }

      try {
        const file = fs.createWriteStream(fileFullPath);

        try {
          const response = await this.datastreamService.getDatastream(oid, attachId);

          const readStream = response.readstream;
          if (readStream) {
            await new Promise((resolve, reject) => {
              readStream.pipe(file);
              readStream.on("error", (err: unknown) => {
                reject(err);
              });
              readStream.on("close", () => {
                resolve(file);
              });
            });
          }
        } catch (err) {
          sails.log.error('FigService - processFileUploadToFigshare ' + JSON.stringify(err));
        }

        const fileStats = fs.statSync(fileFullPath);
        const aproxFileSize = this.formatBytes(fileStats.size);
        this.logWithLevel(config.logLevel, 'FigService - processFileUploadToFigshare - fileFullPath ' + fileFullPath + ' aproxFileSize ' + aproxFileSize);

        if (fs.existsSync(fileFullPath) && fileStats.size > 0) {

          this.logWithLevel(config.logLevel, 'FigService - processFileUploadToFigshare - file saved to ' + fileFullPath);
          let uploadURL = '';
          let fileId: number | string | undefined;
          let uploadParts: AnyRecord[] = [];

          this.logWithLevel(config.logLevel, 'FigService - processFileUploadToFigshare - articleId ' + articleId);
          this.logWithLevel(config.logLevel, 'FigService - processFileUploadToFigshare - fileName ' + fileName);
          this.logWithLevel(config.logLevel, 'FigService - processFileUploadToFigshare - filePath ' + filePath);

          const requestStep1 =
          {
            impersonate: 0,
            name: fileName,
            size: fileSize
          }
          this.setFieldByNameInRequestBody(config, record, requestStep1, sails.config.figshareAPI.mapping.upload.attachments, 'impersonate', figshareAccountAuthorIDs);

          const configStep1 = this.getAxiosConfig(config, 'post', `/account/articles/${articleId}/files`, requestStep1);

          this.logWithLevel(config.logLevel, `FigService - processFileUploadToFigshare - ${configStep1.method} - ${configStep1.url}`);
          const responseStep1 = await this.requestWithRetry(config, configStep1, { label: 'uploadFileStep1', logResponse: true });
          this.logWithLevel(config.logLevel, `FigService - processFileUploadToFigshare- response step 1 status: ${responseStep1.status} statusText: ${responseStep1.statusText}`);
          this.logWithLevel(config.logLevel, 'FigService - -------------------------------------------');
          const responseStep1Data = (responseStep1.data ?? {}) as AnyRecord;
          this.logWithLevel(config.logLevel, 'FigService - processFileUploadToFigshare - response step 1 ' + responseStep1Data.location);
          this.logWithLevel(config.logLevel, 'FigService - -------------------------------------------');

          //example reply
          /*
          {
          "location": "https://api.figsh.com/v2/account/articles/7554216/files/829883224"
          }
          */

          const uploadFileLocation = responseStep1Data.location as string;

          const figAccessToken = 'token ' + config.apiToken;

          const figHeaders = {
            'Content-Type': 'application/json',
            'Authorization': figAccessToken
          };

          const configStep2 = {
            method: 'get',
            url: uploadFileLocation,
            headers: figHeaders
          };

          this.logWithLevel(config.logLevel, `FigService - processFileUploadToFigshare - ${configStep2.method} - ${configStep2.url}`);
          const responseStep2 = await this.requestWithRetry(config, configStep2, { label: 'uploadFileStep2', logResponse: true });
          this.logWithLevel(config.logLevel, `FigService - processFileUploadToFigshare - response step 2 status: ${responseStep2.status} statusText: ${responseStep2.statusText}`);
          const responseStep2Data = (responseStep2.data ?? {}) as AnyRecord;
          uploadURL = (responseStep2Data.upload_url as string) || '';
          fileId = responseStep2Data.id as number | string;

          //example reply
          /*
          {
          "upload_token": "563297df-249f-48a7-a7a2-80aa25af12b4",
          "upload_url": "https://fup1010100.figsh.com/upload/563297df-249f-48a7-a7a2-80aa25af12b4",
          "status": "created",
          "preview_state": "preview_not_available",
          "viewer_type": "",
          "id": 829883224,
          "name": "Untitled4.png",
          "size": 18850,
          "is_link_only": false,
          "download_url": "https://ndownloader.figsh.com/files/829883224",
          "supplied_md5": "0c13924e817babc9afb2a1bcdec72067",
          "computed_md5": ""
          }
          */

          this.logWithLevel(config.logLevel, 'FigService - -------------------------------------------');
          this.logWithLevel(config.logLevel, 'FigService - processFileUploadToFigshare - response step 2 - id ' + fileId + ' - url ' + uploadURL);
          this.logWithLevel(config.logLevel, 'FigService - -------------------------------------------');

          const configStep3 = {
            method: 'get',
            url: uploadURL,
            headers: figHeaders
          };

          this.logWithLevel(config.logLevel, `FigService - processFileUploadToFigshare - ${configStep3.method} - ${configStep3.url}`);
          const responseStep3 = await this.requestWithRetry(config, configStep3, { label: 'uploadFileStep3', logResponse: true });
          this.logWithLevel(config.logLevel, `FigService - processFileUploadToFigshare - response step 3 status: ${responseStep3.status} statusText: ${responseStep3.statusText}`);
          const responseStep3Data = (responseStep3.data ?? {}) as AnyRecord;
          uploadParts = (responseStep3Data.parts as AnyRecord[]) || [];

          //example reply
          /*
          {
          "token": "563297df-249f-48a7-a7a2-80aa25af12b4",
          "md5": "0c13924e817babc9afb2a1bcdec72067",
          "size": 18850,
          "name": "829883224/Untitled4.png",
          "status": "PENDING",
          "parts": [
              {
                  "partNo": 1,
                  "startOffset": 0,
                  "endOffset": 18849,
                  "status": "PENDING",
                  "locked": false
              }
          ]
          }
          */

          const totalParts = uploadParts.length;
          this.logWithLevel(config.logLevel, 'FigService - processFileUploadToFigshare - uploadParts.length ' + totalParts);
          if (!_.isUndefined(uploadParts) && uploadParts.length > 0) {

            if (uploadParts.length > 0) {

              for (const part of uploadParts) {

                const partNo = _.toNumber(part.partNo);
                const startReadByte = _.toNumber(part.startOffset);
                const endReadByte = _.toNumber(part.endOffset);
                // let chunkSize = endReadByte - startReadByte + 1;
                const readStreamConfig = {
                  start: startReadByte,
                  end: endReadByte
                }

                //https://stackoverflow.com/questions/30386768/is-createreadstream-asynchronous
                //Based on the above SO question/answer await cannot be used here because It does not
                //return a promise or accept a callback or accept a callback but it's also not required
                const bufferChunk = fs.createReadStream(fileFullPath, readStreamConfig);

                this.logWithLevel(config.logLevel, 'FigService - processFileUploadToFigshare - createReadStream end - totalParts ' + totalParts + ' partNo ' + partNo + ' fileName ' + fileName);
                const paramsImpersonate = {
                  impersonate: 0
                };
                this.setFieldByNameInRequestBody(config, record, paramsImpersonate, sails.config.figshareAPI.mapping.upload.attachments, 'impersonate', figshareAccountAuthorIDs);
                const configStep4 = {
                  headers: {
                    'Content-Type': 'application/octet-stream',
                    'Authorization': 'Token ' + config.apiToken
                  },
                  maxContentLength: Infinity,
                  maxBodyLength: Infinity,
                  method: 'put',
                  params: paramsImpersonate,
                  url: `${uploadURL}/${partNo}`,
                  data: bufferChunk
                }
                this.logWithLevel(config.logLevel, `FigService - processFilePartUploadToFigshare - ${configStep4.method} - ${configStep4.url}`);
                //this is when the read stream or file or bufferChunk is open and read therefore this is the only await that is required
                const responseStep4 = await this.requestWithRetry(config, configStep4, { label: 'uploadFileStep4', logResponse: true });
                this.logWithLevel(config.logLevel, `FigService - processFilePartUploadToFigshare - response step 4 status: ${responseStep4.status} statusText: ${responseStep4.statusText}`);
                this.logWithLevel(config.logLevel, 'FigService - processFilePartUploadToFigshare - uploaded file chunk totalParts ' + totalParts + ' partNo ' + partNo + ' fileName ' + fileName);
              }

              //complete upload step 5
              const requestBodyComplete = { impersonate: 0 };
              this.logWithLevel(config.logLevel, `FigService - processFilePartUploadToFigshare - before complete file upload`);
              this.setFieldByNameInRequestBody(config, record, requestBodyComplete, sails.config.figshareAPI.mapping.upload.attachments, 'impersonate', figshareAccountAuthorIDs);
              this.logWithLevel(config.logLevel, `FigService - processFilePartUploadToFigshare requestBodyComplete - ${JSON.stringify(requestBodyComplete)}`);
              const configStep5 = this.getAxiosConfig(config, 'post', `/account/articles/${articleId}/files/${fileId}`, requestBodyComplete);
              this.logWithLevel(config.logLevel, `FigService - processFilePartUploadToFigshare - ${configStep5.method} - ${configStep5.url}`);
              const responseStep5 = await this.requestWithRetry(config, configStep5, { label: 'uploadFileStep5', logResponse: true });
              this.logWithLevel(config.logLevel, `FigService - processFilePartUploadToFigshare - response step 5 status: ${responseStep5.status} statusText: ${responseStep5.statusText}`);
              sails.log.info(`FigService - processFilePartUploadToFigshare - file upload completed articleId ${articleId} totalParts ${totalParts} fileName ${fileName}`);

              //Delete the file from the temp directory
              fs.unlinkSync(fileFullPath);
            }
          }
        } else {
          sails.log.info(`FigService - processFileUploadToFigshare - filePath ${fileFullPath} not found articleId ${articleId}`);
        }

      } catch (error) {
        sails.log.error(error);
        if (fs.existsSync(fileFullPath)) {
          fs.unlinkSync(fileFullPath);
        }
      }

      //After successful or failure of uploading a file still check if there are other files pending to be uploaded to figshare
      this.checkUploadFilesPending(config, record, oid, user, figshareAccountAuthorIDs);

      return record;
    }

    private async deleteFilesAndUpdateDataLocationEntries(config: FigshareRuntimeConfig, record: AnyRecord, oid: string) {

      try {
        this.logWithLevel(config.logLevel, 'FigService - -------------------------------------------');
        this.logWithLevel(config.logLevel, 'FigService - deleteFilesAndUpdateDataLocationEntries - enter');
        this.logWithLevel(config.logLevel, 'FigService - -------------------------------------------');

        let articleId;
        if (_.has(record, config.figArticleIdPathInRecord) && !_.isUndefined(_.get(record, config.figArticleIdPathInRecord)) &&
          _.get(record, config.figArticleIdPathInRecord) > 0) {
          articleId = _.get(record, config.figArticleIdPathInRecord);
          this.logWithLevel(config.logLevel, 'FigService - deleteFilesAndUpdateDataLocationEntries - metadata.figshare_article_id ' + articleId);
        } else {
          articleId = 0;
        }
        this.logWithLevel(config.logLevel, 'FigService - deleteFilesAndUpdateDataLocationEntries - articleId ' + articleId);
        this.logWithLevel(config.logLevel, 'FigService - deleteFilesAndUpdateDataLocationEntries - oid ' + oid);

        if (articleId > 0) {

          const articleFileList = await this.getArticleFileList(config, articleId);

          const dataLocations = (_.get(record, config.dataLocationsPathInRecord) as AnyRecord[]) || [];
          const urlList: AnyRecord[] = [];

          //delete files from redbox
          for (const attachmentFile of dataLocations) {
            if (!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && _.has(attachmentFile, 'fileId')) {
              const figFileDetails = _.find(articleFileList, ['name', attachmentFile['name']]);
              if (!_.isUndefined(figFileDetails)) {
                urlList.push(figFileDetails);
                this.logWithLevel(config.logLevel, attachmentFile);
                await this.datastreamService.removeDatastream(oid, attachmentFile as unknown as Datastream);
              }
            }
          }

          if (!_.isEmpty(urlList)) {
            //update entries in data location widget to point to the Figshare URL
            for (const fileUrl of urlList) {
              this.logWithLevel(config.logLevel, fileUrl);
              const fileName = fileUrl['name'] as string;
              const fileNameNotes = 'File name: ' + fileName;
              const newUrl = { type: 'url', location: fileUrl['download_url'], notes: fileNameNotes, originalFileName: fileName, ignore: true };
              if (sails.config.figshareAPI.mapping.figshareOnlyPublishSelectedAttachmentFiles) {
                _.set(newUrl, 'selected', true);
              }
              this.logWithLevel(config.logLevel, newUrl);
              //remove existing entry to the file attachment
              const locationList = (_.get(record, config.dataLocationsPathInRecord) as AnyRecord[]) || [];
              _.remove(locationList, ['name', fileName]);
              //add new entry as URL to the same file already uploaded to Figshare
              locationList.push(newUrl);
              _.set(record, config.dataLocationsPathInRecord, locationList);
            }
          }

        }
      } catch (error) {
        sails.log.error(error);
      }

      return record;
    }

    private async isArticleInExpectedState(config: FigshareRuntimeConfig, articleId: string | number, figshareTargetFieldKey: string, figshareTargetFieldValue: string) {
      const prefix = "FigService -"
      if (!articleId?.toString()?.trim()) {
        sails.log.error(`${prefix} the article id '${articleId}' is not valid`);
        return false;
      }

      // Check if the figshare item has expected property key and value.
      const articleDetails = await this.getArticleDetails(config, articleId);
      const figshareFieldValue = _.get(articleDetails, figshareTargetFieldKey, null);
      const figshareFieldValueMatches = figshareFieldValue !== null && figshareFieldValue === figshareTargetFieldValue;
      if (!figshareFieldValueMatches) {
        sails.log.warn(`${prefix} the article id '${articleId}' item property '${figshareTargetFieldKey}' value '${JSON.stringify(figshareFieldValue)}' is not '${JSON.stringify(figshareTargetFieldValue)}'`);
        return false;
      }

      // Exclude figshare items that have in progress uploads.
      const articleFileList = await this.getArticleFileList(config, articleId, false);
      const figshareIsUploadInProgressResult = await this.isFileUploadInProgress(config, articleId, articleFileList);
      if (figshareIsUploadInProgressResult) {
        sails.log.warn(`${prefix} the article id '${articleId}' has an upload in progress`);
        return false;
      }

      sails.log.debug(`${prefix} the article id '${articleId}' item property '${figshareTargetFieldKey}' value '${JSON.stringify(figshareFieldValue)}' matches expected value '${JSON.stringify(figshareTargetFieldValue)}'`);
      return true;
    }

    private async transitionRecordWorkflowFromFigshareArticleProperties(
      config: FigshareRuntimeConfig,
      brand: BrandingModel,
      user: AnyRecord,
      oid: string,
      articleId: string,
      targetStep: string,
      figshareTargetFieldKey: string,
      figshareTargetFieldValue: string
    ) {
      const prefix = "FigService -"
      const msgPartial = `record oid '${oid}' with figshare article id '${articleId}' to step '${targetStep}'`;

      if (!oid) {
        sails.log.error(`${prefix} cannot transition ${msgPartial} because the record oid is not valid`);
        return;
      }

      const isArticleInExpectedState = await this.isArticleInExpectedState(config, articleId, figshareTargetFieldKey, figshareTargetFieldValue);
      if (!isArticleInExpectedState) {
        sails.log.warn(`${prefix} cannot transition ${msgPartial} because the linked article is not in the required state`);
        return;
      }

      // --> If there are any ReDBox records in stage queued that the corresponding Figshare item
      // status is public then move the dataPublication record to stage 'targetStep'
      // The automated processing of ReDBox dataPublication records should be equivalent to the
      // action performed by the user.
      // The process to replicate is when a user manually opens a data publication in stage queued,
      // and then they click Submit for publication button.
      const currentRec = await RecordsService.getMeta(oid);
      const userRoles = (user.roles ?? []) as AnyRecord[];
      const hasEditAccess = await RecordsService.hasEditAccess(brand, user, userRoles, currentRec as unknown as AnyRecord)
      if (!hasEditAccess) {
        sails.log.warn(`${prefix} cannot transition ${msgPartial} because user '${user}' does not have edit permission`);
        return;
      }
      const recordType = await RecordTypesService.get(brand, currentRec.metaMetadata.type).toPromise();
      if (!recordType) {
        sails.log.warn(`${prefix} cannot transition ${msgPartial} because record type is missing`);
        return;
      }
      const nextStepResp = await WorkflowStepsService.get(recordType, targetStep).toPromise();
      const metadata = currentRec.metadata;
      const recordUpdateResult = await RecordsService.updateMeta(brand, oid, currentRec as unknown as AnyRecord, user, true, true, nextStepResp, metadata as AnyRecord);
      const isSuccessful = _.get(recordUpdateResult, 'success', true)?.toString() === 'true';
      if (isSuccessful) {
        sails.log.info(`${prefix} updated ${msgPartial}`);
      } else {
        sails.log.error(`${prefix} failed to update ${msgPartial}: ${JSON.stringify(recordUpdateResult)}`);
      }
    }

    //This method has been designed to be called by a pre save trigger that executes after a user has performed an action
    //In example when a record is moved from one workflow state to another and the trigger conditons are met
    public createUpdateFigshareArticle(oid: string, record: RecordLike, options: AnyRecord, user: AnyRecord) {
      const config = this.getRuntimeConfig();
      sails.log.info(`FigService - createUpdateFigshareArticle - log level ${config.logLevel}`);

      const recordObj = record as unknown as AnyRecord;
      if (this.metTriggerCondition(oid, recordObj, options, user) === 'true') {
        return this.sendDataPublicationToFigshare(recordObj);
      } else {
        return record;
      }
    }

    //This method has been designed to be called by a post save trigger that executes after a user has performed an action
    //In example when a record is moved from one workflow state to another and the trigger conditons are met
    public uploadFilesToFigshareArticle(oid: string, record: RecordLike, options: AnyRecord, user: AnyRecord) {
      const config = this.getRuntimeConfig();
      sails.log.info(`FigService - uploadFilesToFigshareArticle - log level ${config.logLevel}`);

      const recordObj = record as unknown as AnyRecord;
      if (this.metTriggerCondition(oid, recordObj, options, user) === 'true') {
        this.logWithLevel(config.logLevel, 'FigService - uploadFilesToFigshareArticle - enter');
        this.logWithLevel(config.logLevel, 'FigService - uploadFilesToFigshareArticle - oid ' + oid);
        this.checkUploadFilesPending(config, recordObj, oid, user);
      }
    }

    //This method has been designed to be called by a pre save trigger that executes after a user has performed an action
    //In example when a record is moved from one workflow state to another and the trigger conditons are met
    public deleteFilesFromRedboxTrigger(oid: string, record: RecordLike, options: AnyRecord, user: AnyRecord) {
      const config = this.getRuntimeConfig();
      sails.log.info(`FigService - deleteFilesFromRedboxTrigger - log level ${config.logLevel}`);

      const recordObj = record as unknown as AnyRecord;
      if (this.metTriggerCondition(oid, recordObj, options, user) === 'true') {
        return this.deleteFilesAndUpdateDataLocationEntries(config, recordObj, oid);
      } else {
        return record;
      }
    }

    //This method will be called automatically when the setting figshareNeedsPublishAfterFileUpload is set to true
    //and will be called by a scheduled agendaQueue job
    public async publishAfterUploadFilesJob(job: AnyRecord) {
      const jobAttrs = (job.attrs ?? {}) as AnyRecord;
      const data = (jobAttrs.data ?? {}) as AnyRecord;
      const config = this.getRuntimeConfig();
      this.logWithLevel(config.logLevel, 'FigService - publishAfterUploadFilesJob - data ' + JSON.stringify(data));
      if (!_.isUndefined(data) && !_.isNull(data) && !_.isEmpty(data)) {
        const oid = String(data.oid ?? '');
        const articleId = String(data.articleId ?? '');
        const user = data.user as AnyRecord;
        const brandId = String(data.brandId ?? '');
        //https://docs.figshare.com/#private_article_publish
        const record = await RecordsService.getMeta(oid);
        let figshareAccountAuthorIDs: AnyRecord[] = [];
        if (!_.isEmpty(sails.config.figshareAPI.testUsers)) {
          figshareAccountAuthorIDs = sails.config.figshareAPI.testUsers as AnyRecord[];
        } else {
          const contributorsDP = this.getContributorsFromRecord(config, record);
          figshareAccountAuthorIDs = await this.getAuthorUserIDs(config, contributorsDP);
        }
        const requestBodyPublishAfterFileUploads = this.getPublishRequestBody(config, figshareAccountAuthorIDs);
        this.logWithLevel(config.logLevel, `FigService - publish publishAfterUploadFilesJob requestBodyPublishAfterFileUploads ${JSON.stringify(requestBodyPublishAfterFileUploads)}`);
        const publishConfig = this.getAxiosConfig(config, 'post', `/account/articles/${articleId}/publish`, requestBodyPublishAfterFileUploads);
        this.logWithLevel(config.logLevel, `FigService - publish publishAfterUploadFiles ${publishConfig.method} - ${publishConfig.url}`);
        let responsePublish: AxiosResponseLike = { status: '', statusText: '' }
        try {
          this.logWithLevel(config.logLevel, `FigService - publishAfterUploadFiles - all file uploads finished starting publishing`);
          responsePublish = await this.requestWithRetry(config, publishConfig, { label: 'publishAfterUploadFilesJob', logResponse: true });
          this.logWithLevel(config.logLevel, `FigService - publish publishAfterUploadFiles status: ${responsePublish.status} statusText: ${responsePublish.statusText}`);
          this.queueDeleteFiles(oid, user, brandId, articleId);
        } catch (error) {
          this.logWithLevel(config.logLevel, `FigService - publish publishAfterUploadFiles error: ${responsePublish.status} statusText: ${responsePublish.statusText}`);
          this.logWithLevel(config.logLevel, `FigService - publish publishAfterUploadFiles error: ${JSON.stringify(error)}`);
          this.logWithLevel(config.logLevel, error);
        }
      }
    }

    //This method will be called automatically when the setting figshareNeedsPublishAfterFileUpload is set to true
    //and will be called by a scheduled agendaQueue job
    public async deleteFilesFromRedbox(job: AnyRecord) {
      const jobAttrs = (job.attrs ?? {}) as AnyRecord;
      const data = (jobAttrs.data ?? {}) as AnyRecord;
      const config = this.getRuntimeConfig();
      this.logWithLevel(config.logLevel, 'FigService - deleteFilesFromRedbox - data ' + JSON.stringify(data));
      if (!_.isUndefined(data) && !_.isNull(data) && !_.isEmpty(data)) {
        try {
          sails.log.info(`FigService - deleteFilesFromRedbox - log level ${config.logLevel}`);
          const oid = String(data.oid ?? '');
          this.logWithLevel(config.logLevel, `FigService - deleteFilesFromRedbox record oid ${oid}`);
          let record: AnyRecord = (await RecordsService.getMeta(oid)) as unknown as AnyRecord;
          this.logWithLevel(config.logLevel, `FigService - deleteFilesFromRedbox record before ${JSON.stringify(record)}`);
          record = await this.deleteFilesAndUpdateDataLocationEntries(config, record as AnyRecord, oid);
          this.logWithLevel(config.logLevel, `FigService - deleteFilesFromRedbox record after ${JSON.stringify(record)}`);
          const brandId = String(data.brandId ?? '');
          this.logWithLevel(config.logLevel, `FigService - deleteFilesFromRedbox record brandId ${brandId}`);
          const brand: BrandingModel = BrandingService.getBrandById(brandId);
          this.logWithLevel(config.logLevel, `FigService - deleteFilesFromRedbox oid: ${oid} user: ${JSON.stringify(data.user)}`);
          if (!_.isUndefined(sails.config.figshareAPI.mapping.recordAllFilesUploaded) && !_.isEmpty(sails.config.figshareAPI.mapping.recordAllFilesUploaded)) {
            _.set(record, sails.config.figshareAPI.mapping.recordAllFilesUploaded, 'yes');
          }
          if (!_.isEmpty(sails.config.figshareAPI.mapping.response.article)) {
            const responseArticleFields = (sails.config.figshareAPI.mapping.response.article || []) as FigshareFieldMapping[];
            //articleDetails needs to be retrieved after publish to update handle and doi and other fields that may have been empty
            const articleDetails = await this.getArticleDetails(config, String(data.articleId ?? ''));
            this.logVerbose(config, `FigService - deleteFilesFromRedbox articleDetails ${JSON.stringify(articleDetails)}`);
            this.logWithLevel(config.logLevel, `FigService - deleteFilesFromRedbox - mapping.response.article ${JSON.stringify(sails.config.figshareAPI.mapping.response.article)}`);
            for (const field of responseArticleFields) {
              this.setFieldInRecord(config, record, articleDetails, field);
            }
            this.logVerbose(config, `FigService - deleteFilesFromRedbox record before ${JSON.stringify(record)}`);
          }
          const result = await RecordsService.updateMeta(brand, oid, record as AnyRecord, data.user as AnyRecord, false, false);
          this.logWithLevel(config.logLevel, 'FigService - deleteFilesFromRedbox - result ' + JSON.stringify(result));
        } catch (error) {
          this.logWithLevel(config.logLevel, `FigService - deleteFilesFromRedbox error: ${JSON.stringify(error)}`);
          this.logWithLevel(config.logLevel, error);
        }
      }
    }

    //This method will be called automatically when the setting figshareNeedsPublishAfterFileUpload is set to true
    //and will be scheduled after all the file uploads have been finished successfully for a particular article
    public queuePublishAfterUploadFiles(oid: string, articleId: string, user: AnyRecord, brandId: string) {

      const jobName = 'Figshare-PublishAfterUpload-Service';
      const queueMessage = {
        oid: oid,
        articleId: articleId,
        user: user,
        brandId: brandId
      };

      const config = this.getRuntimeConfig();
      this.logWithLevel(config.logLevel, `FigService - queuePublishAfterUploadFiles - Queueing up trigger using jobName ${jobName}`);
      this.logWithLevel(config.logLevel, 'FigService - queuePublishAfterUploadFiles - queueMessage ' + JSON.stringify(queueMessage));
      const scheduleIn = _.get(sails.config.figshareAPI.mapping.schedulePublishAfterUploadJob, 'in 2 minutes');
      this.logWithLevel(config.logLevel, 'FigService - queuePublishAfterUploadFiles - scheduleIn ' + scheduleIn);
      if (scheduleIn == 'immediate') {
        this.queueService.now(jobName, queueMessage);
      } else {
        this.queueService.schedule(jobName, scheduleIn, queueMessage);
      }
    }

    //This method will be called automatically when the setting figshareNeedsPublishAfterFileUpload is set to true
    //and will be scheduled after the Figshare-PublishAfterUpload-Service job has finished
    public queueDeleteFiles(oid: string, user: AnyRecord, brandId: string, articleId: string) {

      const jobName = 'Figshare-UploadedFilesCleanup-Service';
      const queueMessage = {
        oid: oid,
        user: user,
        brandId: brandId,
        articleId: articleId
      };

      const config = this.getRuntimeConfig();
      this.logWithLevel(config.logLevel, `FigService - queueDeleteFiles - Queueing up trigger using jobName ${jobName}`);
      this.logWithLevel(config.logLevel, 'FigService - queueDeleteFiles - queueMessage ' + JSON.stringify(queueMessage));
      const scheduleIn = _.get(sails.config.figshareAPI.mapping.scheduleUploadedFilesCleanupJob, 'in 5 minutes');
      this.logWithLevel(config.logLevel, 'FigService - queueDeleteFiles - scheduleIn ' + scheduleIn);
      if (scheduleIn == 'immediate') {
        this.queueService.now(jobName, queueMessage);
      } else {
        this.queueService.schedule(jobName, scheduleIn, queueMessage);
      }
    }

    public async transitionRecordWorkflowFromFigshareArticlePropertiesJob(_job: AnyRecord): Promise<void> {
      const prefix = "FigService -";
      const config = this.getRuntimeConfig();

      try {
        //For the moment it is ok to hard code the branding. Once multi tenancy is fully implemented this can be revisited
        const brand: BrandingModel = BrandingService.getBrand('default');

        const start = 0;
        const rows = 30;
        const maxRecords = 100;

        // configurable criteria
        const jobConfig = _.get(sails.config, 'figshareAPI.mapping.figshareScheduledTransitionRecordWorkflowFromArticlePropertiesJob', {}) ?? {};
        const enabled = _.get(jobConfig, 'enabled', '')?.toString() === 'true';
        const namedQuery = _.get(jobConfig, 'namedQuery', '') ?? "";
        const targetStep = _.get(jobConfig, 'targetStep', '') ?? "";
        const paramMap = _.get(jobConfig, 'paramMap', {}) ?? {};
        const figshareTargetFieldKey = _.get(jobConfig, 'figshareTargetFieldKey', '') ?? "";
        const figshareTargetFieldValue = _.get(jobConfig, 'figshareTargetFieldValue', '') ?? "";
        const username = _.get(jobConfig, 'username', '') ?? "";
        const userType = _.get(jobConfig, 'userType', '') ?? "";

        const user = await UsersService.getUserWithUsername(username).toPromise();

        if (!user || !user?.username || user?.type !== userType) {
          sails.log.error(`${prefix} cannot run job because could not find user with username '${username}' and type '${userType} user:`, user);
          return;
        }

        // --> Check whether this process is enabled.
        if (!enabled) {
          sails.log.info(`${prefix} transitionRecordWorkflowFromFigshareArticlePropertiesJob is disabled by config`);
          return;
        }

        // --> Find dataPublication records in stage queued in ReDBox database
        const namedQueryConfig = await NamedQueryService.getNamedQueryConfig(brand, namedQuery);
        const queryResults = await NamedQueryService.performNamedQueryFromConfigResults(namedQueryConfig, paramMap, brand, namedQuery, start, rows, maxRecords, user);

        for (const queryResult of queryResults) {
          const oid = _.get(queryResult, 'oid');
          const articleId = _.get(queryResult, config.figArticleIdPathInRecord);
          try {
            await this.transitionRecordWorkflowFromFigshareArticleProperties(config, brand, user, oid, articleId, targetStep, figshareTargetFieldKey, figshareTargetFieldValue);
          } catch (error) {
            sails.log.verbose(`${prefix} transitionRecordWorkflowFromFigshareArticlePropertiesJob unable to process articleId ${articleId}`, error);
          }
        }
      } catch (err) {
        sails.log.error(`${prefix} error in transitionRecordWorkflowFromFigshareArticlePropertiesJob`, err);
      }
    }

  }
}
module.exports.Services = Services;

declare global {
  let FigshareService: Services.FigshareService;
}
