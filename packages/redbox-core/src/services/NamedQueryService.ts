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
import { DateTime } from 'luxon';
import Handlebars from 'handlebars';
import { registerSharedHandlebarsHelpers } from '@researchdatabox/sails-ng-common';

import { ListAPIResponse } from '../model/ListAPIResponse';
import { firstValueFrom } from 'rxjs';
import { BrandingModel } from '../model/storage/BrandingModel';
import { RecordModel } from '../model/storage/RecordModel';
import type { RecordsService } from '../RecordsService';
import { UserAttributes } from '../waterline-models/User';
import { NamedQueryAttributes } from '../waterline-models/NamedQuery';

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

let namedQueryHandlebarsHelpersRegistered = false;

const ensureNamedQueryHandlebarsHelpers = () => {
  if (namedQueryHandlebarsHelpersRegistered) {
    return;
  }

  registerSharedHandlebarsHelpers(Handlebars);
  namedQueryHandlebarsHelpersRegistered = true;
};

export namespace Services {
  type RecordLike = AnyRecord & Partial<RecordModel> & { createdAt?: string | Date; updatedAt?: string | Date };
  type UserLike = AnyRecord & UserAttributes & { createdAt?: string | Date; updatedAt?: string | Date };

  /**
   * Named Query related functions...
   * 
   */
  export class NamedQueryService extends services.Core.Service {



    protected override _exportedMethods: string[] = [
      "bootstrap",
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

    public async bootstrap(defBrand: BrandingModel) {
      const namedQueries = await firstValueFrom(super.getObservable<Array<{ id?: string | number }>>(NamedQuery.find({
        branding: defBrand.id
      })));

      if (!_.isEmpty(namedQueries)) {
        if (sails.config.appmode.bootstrapAlways) {
          for (const namedQuery of namedQueries) {
            await NamedQuery.destroyOne({ id: namedQuery.id });
          }
        } else {
          return;
        }
      }
      sails.log.verbose("Bootstrapping named query definitions... ");
      await this.createNamedQueriesForBrand(defBrand);
    }

    private async createNamedQueriesForBrand(defBrand: BrandingModel) {
      for (const [namedQuery, config] of Object.entries(sails.config.namedQuery.queries ?? {})) {
        const namedQueryConfig = config as NamedQueryDefinition;
        await this.create(defBrand, namedQuery, namedQueryConfig);
      }
    }

    private getModel(collectionName: string): AnyRecord | undefined {
      return sails.models?.[collectionName] as AnyRecord | undefined;
    }

    private resolveBrandScope(collectionName: string): BrandScope {
      if (_.isEmpty(collectionName)) {
        throw new Error('collectionName is required');
      }

      if (collectionName === 'record') {
        return { type: 'field', fieldPath: 'metaMetadata.brandId' };
      }

      if (collectionName === 'user') {
        return { type: 'userRoles', fieldPath: '' };
      }

      const model = this.getModel(collectionName);
      if (!model) {
        throw new Error(`Invalid collectionName '${collectionName}': model not found`);
      }

      const attributes = model.attributes as Record<string, unknown> | undefined;
      if (attributes && Object.prototype.hasOwnProperty.call(attributes, 'branding')) {
        return { type: 'field', fieldPath: 'branding' };
      }

      throw new Error(`Invalid collectionName '${collectionName}': model does not expose a brand scope`);
    }

    private hasRoleInBrand(user: UserLike, brandId: string): boolean {
      return _.some(user.roles as unknown[] ?? [], (role: unknown) => {
        const roleObj = role as AnyRecord;
        const branding = roleObj?.branding;
        const roleBrandId = _.isObject(branding) ? String((branding as AnyRecord).id ?? '') : String(branding ?? '');
        return roleBrandId === brandId;
      });
    }

    private async getLinkedSecondaryUserIds(brandId: string): Promise<Set<string>> {
      if (typeof UserLink === 'undefined') {
        return new Set<string>();
      }
      const activeLinks = await UserLink.find({ brandId, status: 'active' }) as unknown as AnyRecord[];
      return new Set(
        _.map(activeLinks, (link: AnyRecord) => String(link.secondaryUserId ?? '')).filter((id: string) => id !== '')
      );
    }

    private sanitizeUserForNamedQuery(user: UserLike): UserLike {
      const sanitized = { ...user };
      delete sanitized.password;
      delete sanitized.token;
      return sanitized;
    }

    public async create(brand: BrandingModel, name: string, config: NamedQueryDefinition) {
      const key = `${brand.id}_${name}`;
      const existing = await NamedQuery.findOne({ key });
      if (existing) {
        throw new Error(`Named query '${name}' already exists`);
      }
      const brandScope = this.resolveBrandScope(config.collectionName);
      return firstValueFrom(super.getObservable(NamedQuery.create({
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
      const records = (await NamedQuery.find({
        branding: brand.id
      })) as NamedQueryAttributes[];
      return records.map((r) => ({
        name: r.name,
        collectionName: r.collectionName,
        mongoQuery: parseSerializedValue<Record<string, unknown>>(r.mongoQuery, {}),
        queryParams: parseSerializedValue<Record<string, NamedQueryParam>>(r.queryParams, {}),
        resultObjectMapping: parseSerializedValue<Record<string, string>>(r.resultObjectMapping, {}),
        brandIdFieldPath: r.brandIdFieldPath || undefined,
        sort: r.sort ? parseSerializedValue<Array<Record<string, 'ASC' | 'DESC'>>>(r.sort, []) as Array<Record<string, 'ASC' | 'DESC'>> : undefined,
        expandRelations: r.expandRelations || false,
        relatedRecordFilters: r.relatedRecordFilters ? parseSerializedValue<RelatedRecordFilter[]>(r.relatedRecordFilters, []) : undefined,
      })) as unknown as NamedQueryDefinition[];
    }

    public async update(brand: BrandingModel, name: string, config: NamedQueryDefinition) {
      const key = `${brand.id}_${name}`;
      const existing = await NamedQuery.findOne({ key });
      if (!existing) {
        throw new Error(`Named query '${name}' not found`);
      }
      const brandScope = this.resolveBrandScope(config.collectionName);
      return firstValueFrom(super.getObservable(NamedQuery.update({ key }, {
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

    public async delete(brand: BrandingModel, name: string) {
      const key = `${brand.id}_${name}`;
      const existing = await NamedQuery.findOne({ key });
      if (!existing) {
        throw new Error(`Named query '${name}' not found`);
      }
      return firstValueFrom(super.getObservable(NamedQuery.destroy({ key })));
    }


    async getNamedQueryConfig(brand: BrandingModel, namedQuery: string): Promise<NamedQueryConfig | null> {
      const nQDBEntry = await NamedQuery.findOne({
        key: brand.id + "_" + namedQuery
      });
      if (nQDBEntry) {
        return new NamedQueryConfig(nQDBEntry)
      }

      const configuredNamedQuery = _.get(sails.config, ['namedQuery', 'queries', namedQuery]) as NamedQueryDefinition | undefined;
      if (!configuredNamedQuery || typeof configuredNamedQuery !== 'object') {
        return null;
      }

      const configFromSource: NamedQueryDefinition = configuredNamedQuery;

      return new NamedQueryConfig({
        name: namedQuery,
        branding: String(brand.id),
        collectionName: configFromSource.collectionName,
        brandIdFieldPath: configFromSource.brandIdFieldPath,
        mongoQuery: _.cloneDeep(configFromSource.mongoQuery),
        queryParams: _.cloneDeep(configFromSource.queryParams),
        resultObjectMapping: _.cloneDeep(configFromSource.resultObjectMapping),
        sort: _.cloneDeep(configFromSource.sort),
        expandRelations: configFromSource.expandRelations,
        relatedRecordFilters: _.cloneDeep(configFromSource.relatedRecordFilters),
      })
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
      const criteriaMeta = { enableExperimentalDeepTargets: true };
      this.setParamsInQuery(mongoQuery, queryParams, paramMap);

      if (relatedRecordFilters && relatedRecordFilters.length > 0) {
        for (const filter of relatedRecordFilters) {
          const filterModel = sails.models[filter.collectionName];
          if (!filterModel) {
            sails.log.warn(`Skipping related record filter: model '${filter.collectionName}' not found for collectionName='${filter.collectionName}', localField='${filter.localField}', foreignField='${filter.foreignField}'`);
            continue;
          }
          const filterMongoQuery = _.cloneDeep(filter.mongoQuery);
          const filterQueryParams = _.pickBy(queryParams, (queryParam) => _.has(filterMongoQuery, queryParam.path));
          this.setParamsInQuery(filterMongoQuery, filterQueryParams, paramMap);
          const relatedRecords = await filterModel.find({ where: filterMongoQuery, select: [filter.foreignField] }).meta(criteriaMeta) as unknown as AnyRecord[];
          const relatedIds = _.uniq(relatedRecords.map((relatedRecord) => _.get(relatedRecord, filter.foreignField)).filter((id) => id != null && id !== ''));
          const existingLocalFieldFilter = _.get(mongoQuery, filter.localField);
          const existingRelatedIds = _.isPlainObject(existingLocalFieldFilter) ? _.get(existingLocalFieldFilter, '$in') : undefined;
          if (Array.isArray(existingRelatedIds)) {
            _.set(mongoQuery, filter.localField, {
              $in: _.intersection(existingRelatedIds, relatedIds)
            });
          } else {
            _.set(mongoQuery, filter.localField, { $in: relatedIds });
          }
        }
      }

      const brandScope = this.resolveBrandScope(collectionName);
      const that = this;
      if (brandScope.type === 'userRoles') {
        return this.performUserNamedQuery(resultObjectMapping, mongoQuery, brand, start, rows, sort);
      }

      _.set(mongoQuery, brandScope.fieldPath, brand.id);
      sails.log.debug("Mongo query to be executed", mongoQuery);

      // Get the total count of matching records
      let totalItems = 0;
      const model = sails.models[collectionName];
      if (!model) {
        throw new Error(`Model ${collectionName} not found`);
      }
      totalItems = await model.count(mongoQuery).meta(criteriaMeta);

      // Build query criteria
      const criteria: { where: Record<string, unknown>; skip: number; limit: number; sort?: NamedQuerySortConfig } = {
        where: mongoQuery,
        skip: start,
        limit: rows,
      };

      // Add sorting
      if (sort !== undefined && Array.isArray(sort) && (sort?.length ?? 0) > 0) {
        // e.g. [{ name:  'ASC'}, { age: 'DESC' }]
        criteria['sort'] = sort;
      }

      // Run query
      sails.log.debug("Mongo query criteria", criteria);
      let results: Array<RecordLike | UserLike> = [];
      if (totalItems > 0) {
        results = await model.find(criteria).meta(criteriaMeta) as unknown as Array<RecordLike | UserLike>;
      }

      const responseRecords: NamedQueryResponseRecord[] = []
      const recordsService = sails.services.recordsservice as unknown as RecordsService | undefined;
      const expandRelationsActual = expandRelations === true && collectionName === 'record';
      if (expandRelations === true && collectionName !== 'record') {
        sails.log.debug(`expandRelations is only supported for the 'record' collection; ignoring for '${collectionName}'`);
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
            sails.log.warn(`Failed to fetch relationships for record ${recordItem.redboxOid}`, err);
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
      const criteriaMeta = { enableExperimentalDeepTargets: true };
      const model = this.getModel('user');
      if (!model) {
        throw new Error(`Invalid collectionName 'user': model not found`);
      }
      const userModel = model as { find: (criteria: { where: Record<string, unknown>; sort?: NamedQuerySortConfig }) => unknown };

      const criteria: { where: Record<string, unknown>; sort?: NamedQuerySortConfig } = { where: mongoQuery };
      if (sort !== undefined && Array.isArray(sort) && (sort?.length ?? 0) > 0) {
        criteria.sort = sort;
      }

      let query = userModel.find(criteria) as AnyRecord;
      if (query && typeof query.populate === 'function') {
        query = query.populate('roles');
      }
      const allUsers = query && typeof query.meta === 'function'
        ? (await query.meta(criteriaMeta) as unknown as UserLike[])
        : (await query as unknown as UserLike[]);

      const brandId = String(brand.id);
      const linkedSecondaryUserIds = await this.getLinkedSecondaryUserIds(brandId);
      const scopedUsers = allUsers
        .filter((user) => this.hasRoleInBrand(user, brandId) || linkedSecondaryUserIds.has(String(user.id ?? '')))
        .map((user) => this.sanitizeUserForNamedQuery(user));
      const pagedUsers = scopedUsers.slice(start, start + rows);
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
          lastSaveDate: userRecord.updatedAt ?? null,
          dateCreated: userRecord.createdAt ?? null
        }));
      }

      const response = new ListAPIResponse<NamedQueryResponseRecord>();
      response.records = responseRecords;
      response.summary.start = start;
      response.summary.page = Math.floor((start / rows) + 1);
      response.summary.numFound = scopedUsers.length;
      return response;
    }

    setParamsInQuery(mongoQuery: Record<string, unknown>, queryParams: Record<string, QueryParameterDefinition>, paramMap: Record<string, unknown>) {
      for (const queryParamKey in queryParams) {

        let value = paramMap[queryParamKey];
        const queryParam: QueryParameterDefinition = queryParams[queryParamKey];
        sails.log.debug(`${queryParamKey} has value ${value}`);

        if (_.isUndefined(value) && queryParam.required === true) {
          throw Error(`${queryParamKey} is a required parameter`);
        }

        if (_.isUndefined(value)) {
          if (queryParam.whenUndefined == NamedQueryWhenUndefinedOptions.ignore) {
            _.unset(mongoQuery, queryParam.path);
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
          _.unset(mongoQuery, queryParam.path);
        } else {

          const existingValue = _.get(mongoQuery, queryParam.path)
          if (_.isPlainObject(existingValue) && _.isPlainObject(value)) {
            _.merge(value, existingValue);
          }
          _.set(mongoQuery, queryParam.path, value);
        }
      }
      return mongoQuery;
    }

    runTemplate(templateOrPath: string, variables: Record<string, unknown>): unknown {
      const templateVars = { ...variables };

      if (templateOrPath && templateOrPath.indexOf('{{') != -1) {
        try {
          ensureNamedQueryHandlebarsHelpers();
          const compiledTemplate = Handlebars.compile(templateOrPath, { noEscape: true });
          return compiledTemplate(templateVars);
        } catch (err) {
          sails.log.error(`Template compilation failed for ${templateOrPath}`, err);
          throw err;
        }
      }
      return _.get(templateVars, templateOrPath);
    }

    public async performNamedQueryFromConfig(config: NamedQueryDefinition | NamedQueryConfig, paramMap: Record<string, unknown>, brand: BrandingModel, start: number, rows: number, user?: unknown) {
      sails.log.debug("performNamedQueryFromConfig with parameters", {
        config: config,
        paramMap: paramMap,
        brand: brand,
        start: start,
        rows: rows,
        user: user
      });
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
      sails.log.debug(`All named query results: start query with name '${queryName}' brand ${JSON.stringify(brand)} start ${start} rows ${rows} paramMap ${JSON.stringify(paramMap)}`);

      while (true) {
        // Keep going while there are more results.

        const response = await this.performNamedQueryFromConfig(config, paramMap, brand, start, rows, user);
        requestCount += 1;

        if (!response) {
          // stop if there is no response
          sails.log.warn(`All named query results: invalid query response for '${queryName}'`);
          break;
        }

        // add the new records to the collected records
        sails.log.debug(`All named query results: add results for '${queryName}': start ${start} rows ${rows} new results ${response.records.length} summary ${JSON.stringify(response.summary)}`);
        for (const record of response.records) {
          records.push(record);
        }

        const currentRetrievedCount = start + rows;
        if (response.summary.numFound <= currentRetrievedCount) {
          // stop if the total count is less than or equal to the number of records retrieved so far
          sails.log.debug(`All named query results: reached end of results for '${queryName}': start ${start} rows ${rows} total results ${records.length}`);
          break;
        }

        // update the start point
        start = currentRetrievedCount;

        // Check the number of records and fail if it is more than maxRecords.
        if (records.length > maxRecords) {
          sails.log.warn(`All named query results: returning early before finished with ${records.length} results for '${queryName}' from ${requestCount} requests because the number of records is more than max records ${maxRecords}`);
        }

        // continue the while loop
      }

      sails.log.debug(`All named query results: returning ${records.length} results for '${queryName}' from ${requestCount} requests`);
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
    this.queryParams = parseSerializedValue<Record<string, QueryParameterDefinition>>(values?.queryParams, {});
    this.mongoQuery = parseSerializedValue<Record<string, unknown>>(values?.mongoQuery, {});
    this.collectionName = values?.collectionName ?? '';
    this.resultObjectMapping = parseSerializedValue<Record<string, unknown>>(values?.resultObjectMapping, {});
    this.brandIdFieldPath = values?.brandIdFieldPath ?? '';
    this.sort = parseSerializedValue<NamedQuerySortConfig>(values?.sort, []);
    this.expandRelations = values?.expandRelations === true || values?.expandRelations === 'true';
    this.relatedRecordFilters = parseSerializedValue<RelatedRecordFilter[]>(values?.relatedRecordFilters, []);
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
