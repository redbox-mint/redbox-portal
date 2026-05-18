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

import { SearchService } from '../SearchService';
import type {
  VocabExternalEndpoint,
  VocabServiceLookupConfig,
  VocabServiceLookupOption,
  VocabServiceLookupRequest,
  VocabServiceLookupResponse,
} from '../config/vocab.config';
import { VocabQueryConfig } from '../model/config/VocabQueryConfig';
import { BrandingModel } from '../model/storage/BrandingModel';
import { Services as services } from '../CoreService';
import axios from 'axios';

export namespace Services {
  type FormVocabularyUserContext = Record<string, unknown>;
  type ExternalServiceParams = { options: Record<string, unknown>; postBody?: unknown };
  type ServiceLookupRequestParams = {
    search: string;
    start: number;
    rows: number;
    branding: string;
    portal: string;
    brand: BrandingModel;
    user?: Record<string, unknown> | null;
  };
  type ServiceLookupErrorCode =
    | 'service-lookup-not-configured'
    | 'service-lookup-invalid-target'
    | 'service-lookup-invalid-response';
  type FormVocabularyErrorCode =
    | 'external-vocab-invalid-config'
    | 'external-vocab-not-configured'
    | 'query-vocab-invalid-config'
    | 'query-vocab-not-configured';

  export class FormVocabulary extends services.Core.Service {

    protected override _exportedMethods: string[] = [
      'findInExternalService',
      'findInServiceLookup',
      'findRecords',
      'buildNamedQueryParamMap',
      'getResultObjectMappings'
    ];

    public async findRecords(sourceType: string, brand: BrandingModel, searchString: string, start: number, rows: number, user: FormVocabularyUserContext): Promise<Record<string, unknown> | Array<Record<string, unknown>>> {
      const normalizedSourceType = String(sourceType ?? '').trim();
      const queryConfig = sails.config.vocab.queries?.[normalizedSourceType] as VocabQueryConfig | undefined;
      if (!this.isPlainObject(queryConfig)) {
        throw this.createFormVocabularyError(
          'query-vocab-not-configured',
          `No query vocabulary configured for '${normalizedSourceType}'.`
        );
      }

      if (queryConfig.querySource == 'database') {
        const queryName = String(queryConfig.databaseQuery?.queryName ?? '').trim();
        if (!queryName) {
          throw this.createFormVocabularyError(
            'query-vocab-invalid-config',
            `Query vocabulary '${normalizedSourceType}' is missing a database query name.`
          );
        }

        const namedQueryConfig = await NamedQueryService.getNamedQueryConfig(brand, queryName);
        if (!namedQueryConfig) {
          throw this.createFormVocabularyError(
            'query-vocab-invalid-config',
            `Query vocabulary '${normalizedSourceType}' references unknown named query '${queryName}'.`
          );
        }
        const paramMap = this.buildNamedQueryParamMap(queryConfig, searchString, user);
        const dbResults = await NamedQueryService.performNamedQueryFromConfig(namedQueryConfig, paramMap, brand, start, rows);
        if (queryConfig.resultObjectMapping) {
          return this.getResultObjectMappings(dbResults as unknown as Record<string, unknown>, queryConfig);
        } else {
          return dbResults as unknown as Record<string, unknown>;
        }
      } else if (queryConfig.querySource == 'solr') {
        const searchCore = String(queryConfig.searchQuery?.searchCore ?? '').trim();
        if (!searchCore) {
          throw this.createFormVocabularyError(
            'query-vocab-invalid-config',
            `Query vocabulary '${normalizedSourceType}' is missing a search core.`
          );
        }
        const solrQuery = this.buildSolrParams(brand, searchString, queryConfig, start, rows, 'json', user);
        const solrResults = await this.getSearchService().searchAdvanced(searchCore, '', solrQuery);
        if (queryConfig.resultObjectMapping) {
          return this.getResultObjectMappings(solrResults, queryConfig);
        } else {
          return solrResults;
        }
      }

      throw this.createFormVocabularyError(
        'query-vocab-invalid-config',
        `Query vocabulary '${normalizedSourceType}' has unsupported querySource '${String(queryConfig.querySource ?? '')}'.`
      );
    }

    public async findInExternalService(providerName: string, params: ExternalServiceParams): Promise<Record<string, unknown>> {
      const normalizedProviderName = String(providerName ?? '').trim();
      const providerConfig = sails.config.vocab.external?.[normalizedProviderName] as VocabExternalEndpoint | undefined;
      if (!this.isPlainObject(providerConfig)) {
        throw this.createFormVocabularyError(
          'external-vocab-not-configured',
          `No external vocabulary provider configured for '${normalizedProviderName}'.`
        );
      }

      const method = providerConfig.method;
      let url = String(providerConfig.url ?? '').trim();
      if (!url || (method !== 'get' && method !== 'post')) {
        throw this.createFormVocabularyError(
          'external-vocab-invalid-config',
          `External vocabulary provider '${normalizedProviderName}' has an invalid method or URL.`
        );
      }

      const templateFunction = this.getTemplateStringFunction(url, normalizedProviderName);
      const optionMap = this.isPlainObject(params?.options) ? params.options : {};
      url = templateFunction(optionMap);

      sails.log.info(url);
      const options = this.isPlainObject(providerConfig.options) ? providerConfig.options : {};

      if (method == 'post') {
        const post = {
          method: method,
          url: url,
          data: params?.postBody,
          params: options
        };
        sails.log.verbose(post);

        const response = await axios(post);
        return response.data as Record<string, unknown>;
      } else {
        const getSearch = {
          method: method,
          url: url,
          params: options
        };
        sails.log.verbose(getSearch);

        const response = await axios(getSearch);
        return response.data as Record<string, unknown>;
      }
    }

    public async findInServiceLookup(serviceId: string, requestParams: ServiceLookupRequestParams): Promise<VocabServiceLookupResponse> {
      const normalizedServiceId = String(serviceId ?? '').trim();
      const serviceConfig = sails.config.vocab.services?.[normalizedServiceId] as VocabServiceLookupConfig | undefined;
      if (!serviceConfig) {
        throw this.createServiceLookupError(
          'service-lookup-not-configured',
          `No service lookup configured for '${normalizedServiceId}'.`
        );
      }

      const serviceName = String(serviceConfig.serviceName ?? '').trim();
      const methodName = String(serviceConfig.methodName ?? '').trim();
      if (!serviceName || !methodName) {
        throw this.createServiceLookupError(
          'service-lookup-invalid-target',
          `Service lookup '${normalizedServiceId}' has an invalid target configuration.`
        );
      }

      const servicesRegistry = sails.services as Record<string, Record<string, unknown>> | undefined;
      const targetService = servicesRegistry?.[serviceName]
        ?? servicesRegistry?.[serviceName.toLowerCase()]
        ?? Object.entries(servicesRegistry ?? {}).find(([registeredServiceName]) => registeredServiceName.toLowerCase() === serviceName.toLowerCase())?.[1];
      const targetMethod = targetService?.[methodName];
      if (!targetService || typeof targetMethod !== 'function') {
        throw this.createServiceLookupError(
          'service-lookup-invalid-target',
          `Service lookup '${normalizedServiceId}' could not resolve ${serviceName}.${methodName}().`
        );
      }

      const lookupRequest: VocabServiceLookupRequest = {
        serviceId: normalizedServiceId,
        search: String(requestParams.search ?? ''),
        start: requestParams.start,
        rows: requestParams.rows,
        branding: String(requestParams.branding ?? ''),
        portal: String(requestParams.portal ?? ''),
        brand: requestParams.brand,
        user: this.isPlainObject(requestParams.user) ? requestParams.user : {},
        options: serviceConfig.options ?? {},
      };

      const response = await (targetMethod as (request: VocabServiceLookupRequest) => Promise<unknown>).call(
        targetService,
        lookupRequest
      );
      return this.normalizeServiceLookupResponse(normalizedServiceId, response);
    }

    buildNamedQueryParamMap(queryConfig: VocabQueryConfig, searchString: string, user: FormVocabularyUserContext): Record<string, unknown> {
      const paramMap: Record<string, unknown> = {}
      if (queryConfig.queryField.type == 'text') {
        paramMap[queryConfig.queryField.property] = searchString;
      }
      if (queryConfig.userQueryFields != null) {
        for (const userQueryField of queryConfig.userQueryFields) {
          paramMap[userQueryField.property] = _.get(user, userQueryField.userValueProperty, null);
        }
      }
      return paramMap;
    }

    getResultObjectMappings(results: Record<string, unknown>, queryConfig: VocabQueryConfig): Array<Record<string, unknown>> {

      let responseRecords = _.get(results, 'response.docs', '') as Array<Record<string, unknown>> | '';
      if (responseRecords == '') {
        responseRecords = (results as { records?: Array<Record<string, unknown>> }).records ?? [];
      }
      const response: Array<Record<string, unknown>> = [];
      const that = this;
      const resultObjectMapping = queryConfig.resultObjectMapping;
      for (const record of responseRecords) {
        try {
          const variables = {
            record: record,
            _: _
          };
          let defaultMetadata: Record<string, unknown> = {};
          if (!_.isEmpty(resultObjectMapping)) {
            const resultMetadata = _.cloneDeep(resultObjectMapping);
            _.forOwn(resultObjectMapping, function (value: unknown, key: string) {
              _.set(resultMetadata, key, that.runTemplate(value as string, variables));
            });
            defaultMetadata = resultMetadata as Record<string, unknown>;
            response.push(defaultMetadata);
          }
        } catch (_error) {
          continue;
        }
      }
      return response;
    }

    private buildSolrParams(brand: BrandingModel, searchString: string, queryConfig: VocabQueryConfig, start: number, rows: number, format: string = 'json', user: FormVocabularyUserContext): string {
      let query = `${queryConfig.searchQuery.baseQuery}&sort=date_object_modified desc&version=2.2&start=${start}&rows=${rows}`;
      query = query + `&fq=metaMetadata_brandId:${brand.id}&wt=${format}`;

      if (queryConfig.queryField.type == 'text') {
        const value = searchString;
        if (!_.isEmpty(value)) {
          const searchProperty = queryConfig.queryField.property;
          query = query + '&fq=' + searchProperty + ':';
          if (value.indexOf('*') != -1) {
            query = query + value.replaceAll('*', '') + '*';
          } else {
            query = query + value + '*';
          }
        }
      }

      if (queryConfig.userQueryFields != null) {
        for (const userQueryField of queryConfig.userQueryFields) {
          const searchProperty = userQueryField.property;
          query = query + '&fq=' + searchProperty + ':' + _.get(user, userQueryField.userValueProperty, null);
        }
      }

      return query;
    }

    private getSearchService(): SearchService {
      return sails.services[sails.config.search.serviceName] as unknown as SearchService;
    }

    private runTemplate(templateOrPath: string, variables: Record<string, unknown>) {
      if (templateOrPath && templateOrPath.indexOf('<%') != -1) {
        return _.template(templateOrPath)(variables);
      }
      return _.get(variables, templateOrPath);
    }

    private getTemplateStringFunction(template: string, providerName: string) {
      return (map: Record<string, unknown>) => template.replace(/\$\{([^}]+)\}/g, (_match: string, rawPath: string) => {
        const propertyPath = String(rawPath ?? '').trim();
        if (!this.isSafeTemplatePath(propertyPath)) {
          throw this.createFormVocabularyError(
            'external-vocab-invalid-config',
            `External vocabulary provider '${providerName}' contains unsupported template path '${propertyPath}'.`
          );
        }

        const value = _.get(map, propertyPath);
        return this.normalizeTemplateValue(value);
      });
    }

    private normalizeServiceLookupResponse(serviceId: string, response: unknown): VocabServiceLookupResponse {
      if (!this.isPlainObject(response)) {
        throw this.createServiceLookupError(
          'service-lookup-invalid-response',
          `Service lookup '${serviceId}' returned a non-object response.`
        );
      }

      const data = response['data'];
      if (!Array.isArray(data)) {
        throw this.createServiceLookupError(
          'service-lookup-invalid-response',
          `Service lookup '${serviceId}' response is missing a data array.`
        );
      }

      const normalized: VocabServiceLookupResponse = {
        data: data.map((item, index) => this.normalizeServiceLookupOption(serviceId, item, index)),
      };

      if (response['meta'] !== undefined) {
        if (!this.isPlainObject(response['meta'])) {
          throw this.createServiceLookupError(
            'service-lookup-invalid-response',
            `Service lookup '${serviceId}' response meta must be an object.`
          );
        }
        normalized.meta = response['meta'];
      }

      return normalized;
    }

    private normalizeServiceLookupOption(serviceId: string, item: unknown, index: number): VocabServiceLookupOption {
      if (!this.isPlainObject(item)) {
        throw this.createServiceLookupError(
          'service-lookup-invalid-response',
          `Service lookup '${serviceId}' returned a non-object option at index ${index}.`
        );
      }

      const label = this.normalizeServiceLookupString(item['label']);
      const value = this.normalizeServiceLookupString(item['value']);
      if (!label || !value) {
        throw this.createServiceLookupError(
          'service-lookup-invalid-response',
          `Service lookup '${serviceId}' returned an option without a valid label/value at index ${index}.`
        );
      }

      if (item['historical'] !== undefined && typeof item['historical'] !== 'boolean') {
        throw this.createServiceLookupError(
          'service-lookup-invalid-response',
          `Service lookup '${serviceId}' returned a non-boolean historical flag at index ${index}.`
        );
      }

      if (item['disabled'] !== undefined && typeof item['disabled'] !== 'boolean') {
        throw this.createServiceLookupError(
          'service-lookup-invalid-response',
          `Service lookup '${serviceId}' returned a non-boolean disabled flag at index ${index}.`
        );
      }

      const normalized: VocabServiceLookupOption = {
        label,
        value,
        sourceType: 'service',
      };

      if (item['historical'] === true) {
        normalized.historical = true;
      }
      if (item['disabled'] === true) {
        normalized.disabled = true;
      }
      if (Object.prototype.hasOwnProperty.call(item, 'raw')) {
        normalized.raw = item['raw'];
      }

      return normalized;
    }

    private normalizeServiceLookupString(value: unknown): string | null {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
      }
      if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return String(value);
      }
      return null;
    }

    private isPlainObject(value: unknown): value is Record<string, unknown> {
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    private isSafeTemplatePath(propertyPath: string): boolean {
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.(?:[A-Za-z_$][A-Za-z0-9_$]*|\d+))*$/.test(propertyPath)) {
        return false;
      }

      return propertyPath
        .split('.')
        .every(segment => !['__proto__', 'constructor', 'prototype'].includes(segment));
    }

    private normalizeTemplateValue(value: unknown): string {
      if (typeof value === 'string') {
        return value;
      }
      if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return String(value);
      }
      return '';
    }

    private createFormVocabularyError(code: FormVocabularyErrorCode, message: string): Error & { code: FormVocabularyErrorCode } {
      const error = new Error(message) as Error & { code: FormVocabularyErrorCode };
      error.code = code;
      return error;
    }

    private createServiceLookupError(code: ServiceLookupErrorCode, message: string): Error & { code: ServiceLookupErrorCode } {
      const error = new Error(message) as Error & { code: ServiceLookupErrorCode };
      error.code = code;
      return error;
    }
  }
}

declare global {
  let FormVocabularyService: Services.FormVocabulary;
}
