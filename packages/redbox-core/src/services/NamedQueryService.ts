import { executeNamedQuery, namedQueryTarget, assertNamedQueryPath } from '../persistence/reference/NamedQueryExecution';
import { getReferenceRepositories } from '../persistence/runtime';
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
import type { NamedQueryDefinition, NamedQueryParam } from '../config/namedQuery.config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DateTime } from 'luxon';
import { ListAPIResponse } from '../model/ListAPIResponse';
import { firstValueFrom } from 'rxjs';
import { BrandingModel } from '../model/storage/BrandingModel';
import { RecordModel } from '../model/storage/RecordModel';
import type { RecordsService } from '../RecordsService';
import { NamedQueryAttributes } from '../persistence/rows';
import {handlebarsCompile} from "@researchdatabox/sails-ng-common";

export type NamedQueryResponseMetadata = Record<string, unknown> | string | number | boolean | null;

type AnyRecord = Record<string, unknown>;
type BrandScope =
  | { type: 'field'; fieldPath: string }
  | { type: 'userRoles'; fieldPath: '' };
const isRecordValue = (value: unknown): value is AnyRecord => typeof value === 'object' && value !== null;

const getStringProperty = (value: unknown, propertyName: string): string | undefined => {
  if (!isRecordValue(value)) {
    return undefined;
  }

  const propertyValue = value[propertyName];
  return typeof propertyValue === 'string' ? propertyValue : undefined;
};

const getIdentifierProperty = (value: unknown, propertyName: string): string | undefined => {
  if (!isRecordValue(value)) {
    return undefined;
  }

  const propertyValue = value[propertyName];
  if (typeof propertyValue === 'string' || typeof propertyValue === 'number') {
    return String(propertyValue);
  }

  return undefined;
};

const parseSerializedValue = <T>(input: unknown, fallback: T): T => {
  if (typeof input === 'string') {
    if (input.length === 0) {
      return fallback;
    }
    try {
      return JSON.parse(input) as T;
    } catch (_error) {
      return fallback;
    }
  }

  if (input === undefined || input === null) {
    return fallback;
  }

  return input as T;
};

const parseStoredValue = <T>(input: unknown, fallback: T): T => {
  if (typeof input === 'string' && input.length > 0) {
    try { return JSON.parse(input) as T; }
    catch { throw new Error('Invalid stored named-query JSON. Repair the definition using the named-query API or restore the operator checkpoint before execution.'); }
  }
  return input === undefined || input === null || input === '' ? fallback : input as T;
};

const parseObjectParamValue = (queryParamKey: string, value: unknown): Record<string, unknown> => {
  if (_.isPlainObject(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (_.isPlainObject(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch (_error) {
      throw Error(`${queryParamKey} must be a valid JSON object`);
    }
  }

  throw Error(`${queryParamKey} must be a valid JSON object`);
};

const DEFAULT_BOOTSTRAP_DATA_PATH = 'bootstrap-data';

export namespace Services {
  type RecordLike = AnyRecord & Partial<RecordModel> & { createdAt?: string | Date; updatedAt?: string | Date };

  /**
   * Named Query related functions...
   *
   */
  export class NamedQueryService extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      "bootstrapData",
      "getNamedQueryConfig",
      "getSupportedCollections",
      "performNamedQuery",
      "performNamedQueryFromConfig",
      "performNamedQueryFromConfigResults",
      "create",
      "list",
      "update",
      "delete",
    ];

    public async bootstrapData(defBrand: BrandingModel) {
      const bootstrapPath = this.getBootstrapDataPath();
      let fileNames: string[] = [];
      const fileOps = this.getBootstrapFileOps();

      try {
        const fileEntries = await fileOps.readdir(bootstrapPath, { withFileTypes: true });
        fileNames = fileEntries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
          .map((entry) => entry.name)
          .sort((a, b) => a.localeCompare(b));
      } catch (error) {
        const ioError = error as NodeJS.ErrnoException;
        if (ioError.code === 'ENOENT') {
          sails.log.verbose(`Named query bootstrap data path not found: ${bootstrapPath}`);
          return;
        }
        sails.log.error(`Failed to read named query bootstrap data path: ${bootstrapPath}`, error);
        return;
      }

      for (const fileName of fileNames) {
        try {
          const filePath = path.join(bootstrapPath, fileName);
          const definition = await this.readJsonFile<NamedQueryDefinition>(filePath);
          if (!definition) {
            continue;
          }

          const name = fileName.replace(/\.json$/, '');
          if (!name || typeof definition.collectionName !== 'string' || definition.collectionName.length === 0) {
            sails.log.error(`Skipping named query bootstrap file with missing name or collectionName: ${fileName}`);
            continue;
          }

          const existing = await getReferenceRepositories().namedQueries.findByKey(`${defBrand.id}_${name}`);
          if (existing) {
            sails.log.verbose(`Skipping existing named query bootstrap data: ${name}`);
            continue;
          }

          await this.create(defBrand, name, definition);
          sails.log.verbose(`Bootstrapped named query: ${name}`);
        } catch (error) {
          sails.log.error(`Failed to bootstrap named query from file: ${fileName}`, error);
        }
      }
    }

    private getBootstrapDataPath(): string {
      const configuredPath = _.get(sails.config, 'bootstrap.bootstrapDataPath', DEFAULT_BOOTSTRAP_DATA_PATH);
      return path.resolve(String(configuredPath), 'namedqueries');
    }

    protected getBootstrapFileOps(): Pick<typeof fs, 'readdir' | 'readFile'> {
      return fs;
    }

    private async readJsonFile<T>(filePath: string): Promise<T | null> {
      try {
        const content = await this.getBootstrapFileOps().readFile(filePath, 'utf8');
        return JSON.parse(content) as T;
      } catch (error) {
        sails.log.error(`Failed to read named query bootstrap file: ${path.basename(filePath)}`, error);
        return null;
      }
    }

    private resolveBrandScope(collectionName: string): BrandScope {
      return namedQueryTarget(sails, collectionName).scope;
    }

    private getMongoQueryValue(mongoQuery: Record<string, unknown>, path: string): unknown {
      return Object.prototype.hasOwnProperty.call(mongoQuery, path) ? mongoQuery[path] : _.get(mongoQuery, path);
    }

    private setMongoQueryValue(mongoQuery: Record<string, unknown>, path: string, value: unknown): void {
      if (path.includes('.')) {
        mongoQuery[path] = value;
      } else {
        _.set(mongoQuery, path, value);
      }
    }

    private unsetMongoQueryValue(mongoQuery: Record<string, unknown>, path: string): void {
      if (Object.prototype.hasOwnProperty.call(mongoQuery, path)) {
        delete mongoQuery[path];
      } else {
        _.unset(mongoQuery, path);
      }
    }

    public async create(brand: BrandingModel, name: string, config: NamedQueryDefinition) {
      const key = `${brand.id}_${name}`;
      const existing = await getReferenceRepositories().namedQueries.findByKey(key);
      if (existing) {
        throw new Error(`Named query '${name}' already exists`);
      }
      const brandScope = this.resolveBrandScope(config.collectionName);
      return firstValueFrom(super.getObservable(() => getReferenceRepositories().namedQueries.createDefinition({
        name: name,
        branding: brand.id,
        mongoQuery: JSON.stringify(config.mongoQuery),
        queryParams: JSON.stringify(config.queryParams),
        collectionName: config.collectionName,
        resultObjectMapping: JSON.stringify(config.resultObjectMapping),
        brandIdFieldPath: brandScope.fieldPath,
        sort: (config.sort !== undefined && Array.isArray(config.sort) && config.sort.length > 0) ? JSON.stringify(config.sort) : "",
        expandRelations: config.expandRelations === true,
        relatedRecordFilters: (config.relatedRecordFilters !== undefined && Array.isArray(config.relatedRecordFilters) && config.relatedRecordFilters.length > 0)
          ? JSON.stringify(config.relatedRecordFilters)
          : "",
      })));
    }

    public async list(brand: BrandingModel): Promise<NamedQueryDefinition[]> {
      const records = (await getReferenceRepositories().namedQueries.listForBrand(brand.id)) as NamedQueryAttributes[];
      return records.map((r) => ({
        name: r.name,
        collectionName: r.collectionName,
        mongoQuery: parseStoredValue<Record<string, unknown>>(r.mongoQuery, {}),
        queryParams: parseStoredValue<Record<string, NamedQueryParam>>(r.queryParams, {}),
        resultObjectMapping: parseStoredValue<Record<string, string>>(r.resultObjectMapping, {}),
        brandIdFieldPath: r.brandIdFieldPath || undefined,
        sort: r.sort ? parseStoredValue<Array<Record<string, 'ASC' | 'DESC'>>>(r.sort, []) as Array<Record<string, 'ASC' | 'DESC'>> : undefined,
        expandRelations: r.expandRelations || false,
        relatedRecordFilters: r.relatedRecordFilters ? parseStoredValue<RelatedRecordFilter[]>(r.relatedRecordFilters, []) : undefined,
      })) as unknown as NamedQueryDefinition[];
    }

    public async update(brand: BrandingModel, name: string, config: NamedQueryDefinition) {
      const key = `${brand.id}_${name}`;
      const existing = await getReferenceRepositories().namedQueries.findByKey(key);
      if (!existing) {
        throw new Error(`Named query '${name}' not found`);
      }
      const brandScope = this.resolveBrandScope(config.collectionName);
      const updated = await firstValueFrom(super.getObservable(() => getReferenceRepositories().namedQueries.reviseDefinition(key, {
        name: name,
        branding: brand.id,
        mongoQuery: JSON.stringify(config.mongoQuery),
        queryParams: JSON.stringify(config.queryParams),
        collectionName: config.collectionName,
        resultObjectMapping: JSON.stringify(config.resultObjectMapping),
        brandIdFieldPath: brandScope.fieldPath,
        sort: (config.sort !== undefined && Array.isArray(config.sort) && config.sort.length > 0) ? JSON.stringify(config.sort) : "",
        expandRelations: config.expandRelations === true,
        relatedRecordFilters: (config.relatedRecordFilters !== undefined && Array.isArray(config.relatedRecordFilters) && config.relatedRecordFilters.length > 0)
          ? JSON.stringify(config.relatedRecordFilters)
          : "",
      })));
      if (!updated) {
        throw new Error(`Named query '${name}' not found`);
      }
      return updated;
    }

    public async delete(brand: BrandingModel, name: string) {
      const key = `${brand.id}_${name}`;
      const existing = await getReferenceRepositories().namedQueries.findByKey(key);
      if (!existing) {
        throw new Error(`Named query '${name}' not found`);
      }
      return firstValueFrom(super.getObservable(() => getReferenceRepositories().namedQueries.removeByKey(key)));
    }

    async getNamedQueryConfig(brand: BrandingModel, namedQuery: string): Promise<NamedQueryConfig | null> {
      const nQDBEntry = await getReferenceRepositories().namedQueries.findByKey(brand.id + "_" + namedQuery);
      if (nQDBEntry) {
        return new NamedQueryConfig(nQDBEntry)
      }

      return null;
    }

    getSupportedCollections(): string[] {
      const collections = _.get(sails.config, ['namedQuery', 'supportedCollections'], []) as unknown;
      return Array.isArray(collections) ? collections.filter((c): c is string => typeof c === 'string') : [];
    }

    async performNamedQuery(
      _brandIdFieldPath: string,
      resultObjectMapping: Record<string, unknown>,
      collectionName: string,
      mongoQuery: Record<string, unknown>,
      queryParams: Record<string, QueryParameterDefinition>,
      paramMap: Record<string, unknown>,
      brand: BrandingModel,
      start: number,
      rows: number,
      _user: unknown = undefined,
      sort: NamedQuerySortConfig | undefined = undefined,
      expandRelations: boolean = false,
      relatedRecordFilters: RelatedRecordFilter[] = []
    ): Promise<ListAPIResponse<NamedQueryResponseRecord>> {
      this.setParamsInQuery(mongoQuery, queryParams, paramMap);

      if (relatedRecordFilters && relatedRecordFilters.length > 0) {
        for (const filter of relatedRecordFilters) {
          assertNamedQueryPath(filter.localField);
          assertNamedQueryPath(filter.foreignField);
          const filterMongoQuery = _.cloneDeep(filter.mongoQuery);
          const filterQueryParams = _.pickBy(queryParams, (queryParam) => _.has(filterMongoQuery, queryParam.path));
          this.setParamsInQuery(filterMongoQuery, filterQueryParams, paramMap);
          const { records: relatedRecords } = await executeNamedQuery(sails, { target: filter.collectionName, tenant: String(brand.id), expression: filterMongoQuery, start: 0, select: [filter.foreignField] }, false);
          const relatedIds = _.uniq(relatedRecords.map((relatedRecord) => _.get(relatedRecord, filter.foreignField)).filter((id) => id != null && id !== ''));
          const existingLocalFieldFilter = this.getMongoQueryValue(mongoQuery, filter.localField);
          const existingRelatedIds = _.isPlainObject(existingLocalFieldFilter) ? _.get(existingLocalFieldFilter, '$in') : undefined;
          if (existingLocalFieldFilter != null && !(Array.isArray(existingRelatedIds) && Object.keys(existingLocalFieldFilter as Record<string, unknown>).length === 1)) {
            throw new Error('Unsupported stored named-query related-filter intersection. Move the existing local-field criterion to an explicit and/$and clause before using a related filter. See p3-r-operations.md.');
          }
          if (Array.isArray(existingRelatedIds)) {
            this.setMongoQueryValue(mongoQuery, filter.localField, {
              $in: _.intersection(existingRelatedIds, relatedIds)
            });
          } else {
            this.setMongoQueryValue(mongoQuery, filter.localField, { $in: relatedIds });
          }
        }
      }

      const brandScope = this.resolveBrandScope(collectionName);
      const that = this;
      if (brandScope.type === 'userRoles') {
        return this.performUserNamedQuery(resultObjectMapping, mongoQuery, brand, start, rows, sort);
      }

      const { total: totalItems, records: results } = await executeNamedQuery(sails, {
        target: collectionName, tenant: String(brand.id), expression: mongoQuery, start, rows, sort,
      });
      this.updateChronicle({ namedQueryCollection: collectionName, namedQueryStart: start, namedQueryRows: rows, namedQueryTotalItems: totalItems });

      const responseRecords: NamedQueryResponseRecord[] = []
      const recordsService = sails.services.recordsservice as unknown as RecordsService | undefined;
      const expandRelationsActual = expandRelations === true && collectionName === 'record';
      if (expandRelations === true && collectionName !== 'record') {
        this.updateChronicle({ namedQueryRelationsIgnored: true });
      }

      // 'user' collections are scoped and rendered separately via performUserNamedQuery,
      // so anything reaching this loop is a record-like (record or scoped dynamic) model.
      for (const record of results) {
        const recordItem = record as RecordLike;

        if (expandRelationsActual && recordsService && recordItem.redboxOid) {
          try {
            const relationships = await recordsService.getRelatedRecords(recordItem.redboxOid, brand);
            recordItem.relationships = relationships;
          } catch (err) {
            this.updateChronicle(
              { namedQueryRelationshipOid: recordItem.redboxOid, namedQueryRelationshipOutcome: 'failed' },
              [err]
            );
          }
        }

        let defaultMetadata: NamedQueryResponseMetadata = {};
        const variables: Record<string, unknown> = { record: recordItem };
        if (!_.isEmpty(resultObjectMapping)) {
          const resultMetadata = _.cloneDeep(resultObjectMapping);
          _.forOwn(resultObjectMapping, function (value: unknown, key: string) {
            _.set(resultMetadata, key, that.runTemplate(value as string, variables));
          });
          defaultMetadata = resultMetadata as NamedQueryResponseMetadata;
        } else {
          defaultMetadata = collectionName === 'record'
            ? that.runTemplate('record.metadata', variables) as NamedQueryResponseMetadata
            : recordItem as unknown as NamedQueryResponseMetadata;
        }

        const responseRecord: NamedQueryResponseRecord = new NamedQueryResponseRecord({
          oid: recordItem.redboxOid ?? getIdentifierProperty(recordItem, 'id') ?? '',
          title: getStringProperty(recordItem.metadata, 'title') ?? getStringProperty(recordItem, 'name') ?? getStringProperty(recordItem, 'title') ?? '',
          metadata: defaultMetadata,
          lastSaveDate: recordItem.lastSaveDate ?? null,
          dateCreated: recordItem.dateCreated ?? null
        });
        responseRecords.push(responseRecord);
      }
      const response = new ListAPIResponse<NamedQueryResponseRecord>();

      const startIndex = start;
      const noItems = rows;
      const pageNumber = Math.floor((startIndex / noItems) + 1);

      response.records = responseRecords;
      response.summary.start = start
      response.summary.page = pageNumber
      response.summary.numFound = totalItems;

      return response;
    }

    private async performUserNamedQuery(
      resultObjectMapping: Record<string, unknown>,
      mongoQuery: Record<string, unknown>,
      brand: BrandingModel,
      start: number,
      rows: number,
      sort: NamedQuerySortConfig | undefined = undefined
    ): Promise<ListAPIResponse<NamedQueryResponseRecord>> {
      const { total: totalItems, records: pagedUsers } = await executeNamedQuery(sails, {
        target: 'user', tenant: String(brand.id), expression: mongoQuery, start, rows, sort,
      });
      const responseRecords: NamedQueryResponseRecord[] = [];

      for (const userRecord of pagedUsers) {
        let defaultMetadata: NamedQueryResponseMetadata = {};
        const variables: Record<string, unknown> = { record: userRecord };
        if (!_.isEmpty(resultObjectMapping)) {
          const resultMetadata = _.cloneDeep(resultObjectMapping);
          _.forOwn(resultObjectMapping, (value: unknown, key: string) => {
            _.set(resultMetadata, key, this.runTemplate(value as string, variables));
          });
          defaultMetadata = resultMetadata as NamedQueryResponseMetadata;
        } else {
          defaultMetadata = {
            type: this.runTemplate('record.type', variables),
            name: this.runTemplate('record.name', variables),
            email: this.runTemplate('record.email', variables),
            username: this.runTemplate('record.username', variables),
            lastLogin: this.runTemplate('record.lastLogin', variables)
          };
        }

        responseRecords.push(new NamedQueryResponseRecord({
          oid: '',
          title: '',
          metadata: defaultMetadata,
          lastSaveDate: typeof userRecord.updatedAt === 'string' ? userRecord.updatedAt : null,
          dateCreated: typeof userRecord.createdAt === 'string' ? userRecord.createdAt : null
        }));
      }

      const response = new ListAPIResponse<NamedQueryResponseRecord>();
      response.records = responseRecords;
      response.summary.start = start;
      response.summary.page = Math.floor((start / rows) + 1);
      response.summary.numFound = totalItems;
      return response;
    }

    setParamsInQuery(mongoQuery: Record<string, unknown>, queryParams: Record<string, QueryParameterDefinition>, paramMap: Record<string, unknown>) {
      for (const queryParamKey in queryParams) {
        let value = paramMap[queryParamKey];
        const queryParam: QueryParameterDefinition = queryParams[queryParamKey];
        assertNamedQueryPath(queryParam.path);

        if (_.isUndefined(value) && queryParam.required === true) {
          throw Error(`${queryParamKey} is a required parameter`);
        }

        if (_.isUndefined(value)) {
          if (queryParam.whenUndefined == NamedQueryWhenUndefinedOptions.ignore) {
            this.unsetMongoQueryValue(mongoQuery, queryParam.path);
            continue;
          }

          if (queryParam.whenUndefined == NamedQueryWhenUndefinedOptions.defaultValue) {
            value = queryParam.defaultValue;
          }
        }

        if (!_.isEmpty(queryParam.template)) {
          value = this.runTemplate(queryParam.template, { value: value, queryParams: queryParams, paramMap: paramMap });
        }

        if (queryParam.type == DataType.Number) {
          if (!_.isUndefined(value) && value !== null && value !== '') {
            value = _.toNumber(value)
          }
        }

        if (queryParam.type == DataType.Boolean) {
          if (!_.isUndefined(value)) {
            if (typeof value === 'string') {
              value = value.toLowerCase() === 'true';
            } else {
              value = Boolean(value);
            }
          }
        }

        if (queryParam.type == DataType.Array) {
          if (!_.isUndefined(value) && !Array.isArray(value)) {
            if (typeof value === 'string') {
              const trimmed = value.trim();
              if (trimmed === '') {
                value = [];
              } else if (trimmed.startsWith('[')) {
                const parsed = parseSerializedValue<unknown[]>(trimmed, [value]);
                value = Array.isArray(parsed) ? parsed : [value];
              } else {
                value = [value];
              }
            } else {
              value = value !== null && value !== '' ? [value] : [];
            }
          }
        }

        if (queryParam.type == DataType.Object && !_.isUndefined(value)) {
          value = parseObjectParamValue(queryParamKey, value);
        }

        if (
          queryParam.type != DataType.Date &&
          !_.isEmpty(queryParam.queryType)
        ) {
          const query: Record<string, unknown> = {}
          if (value != undefined || (value == undefined && queryParam.whenUndefined != NamedQueryWhenUndefinedOptions.ignore)) {
            query[queryParam.queryType] = value;
            value = query;
          }
        }

        if (queryParam.type == DataType.Date) {
          if (!_.isEmpty(queryParam.queryType)) {
            const query: Record<string, unknown> = {};
            if (queryParam.format == NamedQueryFormatOptions.days && !_.isUndefined(value)) {
              let days = _.toInteger(value);
              let nowDateAddOrSubtract = DateTime.local();
              if (days > 0) {
                //Going forward in time X number of days
                nowDateAddOrSubtract = nowDateAddOrSubtract.plus({ days: days });
              } else if (days < 0) {
                //This "additional" step makes the code self explanatory
                days = days * -1;
                //Going backwards in time X number of days
                nowDateAddOrSubtract = nowDateAddOrSubtract.minus({ days: days });
              }
              value = nowDateAddOrSubtract.toISO();
            }

            query[queryParam.queryType] = value;
            value = query;
          }
        }

        if (value == undefined && queryParam.whenUndefined == NamedQueryWhenUndefinedOptions.ignore) {
          this.unsetMongoQueryValue(mongoQuery, queryParam.path);
        } else {
          const existingValue = this.getMongoQueryValue(mongoQuery, queryParam.path)
          if (_.isPlainObject(existingValue) && _.isPlainObject(value)) {
            _.merge(value, existingValue);
          }
          this.setMongoQueryValue(mongoQuery, queryParam.path, value);
        }
      }
      return mongoQuery;
    }

    runTemplate(templateOrPath: string, variables: Record<string, unknown>): unknown {
      const templateVars = { ...variables };

      if (templateOrPath && templateOrPath.indexOf('{{') != -1) {
        try {
          const compiledTemplate = handlebarsCompile(templateOrPath, { noEscape: true });
          return compiledTemplate(templateVars);
        } catch (err) {
          this.updateChronicle({ namedQueryTemplateOutcome: 'failed' }, [err]);
          throw err;
        }
      }
      return _.get(templateVars, templateOrPath);
    }

    public async performNamedQueryFromConfig(config: NamedQueryDefinition | NamedQueryConfig, paramMap: Record<string, unknown>, brand: BrandingModel, start: number, rows: number, user?: unknown) {
      this.updateChronicle({ namedQueryBrandId: brand.id, namedQueryParameterCount: _.size(paramMap) });
      const collectionName = _.get(config, 'collectionName', '') ?? '';
      const resultObjectMapping = _.get(config, 'resultObjectMapping', {}) ?? {};
      const mongoQuery = _.cloneDeep(_.get(config, 'mongoQuery', {}) ?? {});
      const queryParams = (_.get(config, 'queryParams', {}) ?? {}) as Record<string, QueryParameterDefinition>;
      const sort = _.cloneDeep(_.get(config, 'sort', []) ?? []);
      const expandRelations = _.get(config, 'expandRelations', false) as boolean;
      const relatedRecordFilters = _.cloneDeep(_.get(config, 'relatedRecordFilters', []) ?? []) as RelatedRecordFilter[];
      return await this.performNamedQuery('', resultObjectMapping, collectionName, mongoQuery, queryParams, paramMap, brand, start, rows, user, sort, expandRelations, relatedRecordFilters);
    }

    public async performNamedQueryFromConfigResults(config: NamedQueryConfig, paramMap: Record<string, string>, brand: BrandingModel, queryName: string, start: number = 0, rows: number = 30, maxRecords: number = 100, user: unknown = undefined) {
      const records = [];
      let requestCount = 0;
      this.updateChronicle({ namedQueryName: queryName, namedQueryMaxRecords: maxRecords });

      while (true) {
        // Keep going while there are more results.

        const response = await this.performNamedQueryFromConfig(config, paramMap, brand, start, rows, user);
        requestCount += 1;

        if (!response) {
          // stop if there is no response
          this.updateChronicle({ namedQueryOutcome: 'invalid-response' }, [], 'warn');
          break;
        }

        // add the new records to the collected records
        this.updateChronicle({ namedQueryPageResultCount: response.records.length });
        for (const record of response.records) {
          records.push(record);
        }

        const currentRetrievedCount = start + rows;
        if (response.summary.numFound <= currentRetrievedCount) {
          // stop if the total count is less than or equal to the number of records retrieved so far
          this.updateChronicle({ namedQueryOutcome: 'complete' });
          break;
        }

        // update the start point
        start = currentRetrievedCount;

        // Check the number of records and stop if it exceeds maxRecords.
        if (records.length > maxRecords) {
          this.updateChronicle({ namedQueryOutcome: 'limit-reached' }, [], 'warn');
          break;
        }

        // continue the while loop
      }

      this.updateChronicle({ namedQueryResultCount: records.length, namedQueryRequestCount: requestCount });
      return records;
    }
  }
}

enum DataType {
  Date = 'date',
  Number = 'number',
  String = 'string',
  Boolean = 'boolean',
  Array = 'array',
  Object = 'object',
}

enum NamedQueryWhenUndefinedOptions {
  defaultValue = 'defaultValue',
  ignore = "ignore"
}

enum NamedQueryFormatOptions {
  days = 'days',
  ISODate = 'ISODate'
}

type NamedQuerySortConfig = Record<string, "ASC" | "DESC">[];

class QueryParameterDefinition {
  required: boolean = false;
  type: DataType = DataType.String;
  defaultValue: unknown = null;
  queryType: string = '';
  whenUndefined: NamedQueryWhenUndefinedOptions = NamedQueryWhenUndefinedOptions.ignore;
  format: NamedQueryFormatOptions = NamedQueryFormatOptions.days;
  path: string = '';
  template: string = '';
}

export class RelatedRecordFilter {
  collectionName: string = '';
  mongoQuery: Record<string, unknown> = {};
  localField: string = '';
  foreignField: string = '';
}

type NamedQueryConfigInput = Omit<Partial<NamedQueryAttributes>, 'branding' | 'queryParams' | 'mongoQuery' | 'resultObjectMapping' | 'sort' | 'expandRelations' | 'relatedRecordFilters'> & {
  branding?: unknown;
  metadata?: unknown;
  createdAt?: string;
  updatedAt?: string;
  sort?: unknown;
  expandRelations?: boolean | string;
  relatedRecordFilters?: unknown;
  queryParams?: unknown;
  mongoQuery?: unknown;
  resultObjectMapping?: unknown;
};

export class NamedQueryConfig {
  name: string;
  branding: string;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  key: string;
  queryParams: Record<string, QueryParameterDefinition>;
  mongoQuery: Record<string, unknown>;
  collectionName: string;
  resultObjectMapping: Record<string, unknown>;
  brandIdFieldPath: string;
  sort: NamedQuerySortConfig | undefined;
  expandRelations: boolean;
  relatedRecordFilters: RelatedRecordFilter[];

  constructor(values: NamedQueryConfigInput | null | undefined) {
    this.name = values?.name ?? '';
    this.branding = values?.branding != null ? String(values.branding) : '';
    this.metadata = values?.metadata;
    this.createdAt = values?.createdAt ?? '';
    this.updatedAt = values?.updatedAt ?? '';
    this.key = values?.key ?? '';
    this.queryParams = parseStoredValue<Record<string, QueryParameterDefinition>>(values?.queryParams, {});
    this.mongoQuery = parseStoredValue<Record<string, unknown>>(values?.mongoQuery, {});
    this.collectionName = values?.collectionName ?? '';
    this.resultObjectMapping = parseStoredValue<Record<string, unknown>>(values?.resultObjectMapping, {});
    this.brandIdFieldPath = values?.brandIdFieldPath ?? '';
    this.sort = parseStoredValue<NamedQuerySortConfig>(values?.sort, []);
    this.expandRelations = values?.expandRelations === true || values?.expandRelations === 'true';
    this.relatedRecordFilters = parseStoredValue<RelatedRecordFilter[]>(values?.relatedRecordFilters, []);
    if (!_.isPlainObject(this.mongoQuery) || !_.isPlainObject(this.queryParams) || !_.isPlainObject(this.resultObjectMapping) || !Array.isArray(this.sort) || !Array.isArray(this.relatedRecordFilters)) {
      throw new Error('Invalid stored named-query structure. Migrate the stored definition through the named-query API before execution.');
    }
  }
}

export class NamedQueryResponseRecord {
  oid: string;
  title: string;
  metadata: NamedQueryResponseMetadata;
  lastSaveDate: string | Date | null;
  dateCreated: string | Date | null;

  constructor(values: { oid: string; title: string; metadata: NamedQueryResponseMetadata; lastSaveDate: string | Date | null; dateCreated: string | Date | null }) {
    this.oid = values.oid
    this.title = values.title
    this.metadata = values.metadata
    this.lastSaveDate = values.lastSaveDate
    this.dateCreated = values.dateCreated
  }
}

declare global {
  let NamedQueryService: Services.NamedQueryService;
}
