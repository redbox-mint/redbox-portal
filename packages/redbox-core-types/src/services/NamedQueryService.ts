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
import type { NamedQueryDefinition } from '../config/namedQuery.config';
import { DateTime } from 'luxon';

import { ListAPIResponse } from '../model/ListAPIResponse';
import { Observable, firstValueFrom } from 'rxjs';
import { BrandingModel } from '../model/storage/BrandingModel';
import { RecordModel } from '../model/storage/RecordModel';
import { UserAttributes } from '../waterline-models/User';
import { NamedQueryAttributes } from '../waterline-models/NamedQuery';

export type NamedQueryResponseMetadata = Record<string, unknown> | string | number | boolean | null;

const parseJson = <T>(input: unknown, fallback: T): T => {
  if (typeof input !== 'string' || input.length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(input) as T;
  } catch (_error) {
    return fallback;
  }
};

export module Services {
  type RecordLike = RecordModel & { createdAt?: string | Date; updatedAt?: string | Date };
  type UserLike = UserAttributes & { createdAt?: string | Date; updatedAt?: string | Date };

  /**
   * Named Query related functions...
   * 
   */
  export class NamedQueryService extends services.Core.Service {

  

    protected override _exportedMethods: string[] = [
      "bootstrap",
      "getNamedQueryConfig",
      "performNamedQuery",
      "performNamedQueryFromConfig",
      "performNamedQueryFromConfigResults",
    ];

  public async bootstrap (defBrand: BrandingModel) {
      const namedQueries = await firstValueFrom(super.getObservable(NamedQuery.find({
        branding: defBrand.id
   })));
      
        if (!_.isEmpty(namedQueries)) {
          if (sails.config.appmode.bootstrapAlways) {
            for(let namedQuery of namedQueries) {
              await NamedQuery.destroyOne({id: namedQuery.id});
            }
          } else {
            return;
          }
        } 
        sails.log.verbose("Bootstrapping named query definitions... ");
  await this.createNamedQueriesForBrand(defBrand);
    }

    private async createNamedQueriesForBrand(defBrand: BrandingModel) {
      for (const [namedQuery, config] of Object.entries(sails.config.namedQuery)) {
        const namedQueryConfig = config as NamedQueryConfig;
  await firstValueFrom(this.create(defBrand, namedQuery, namedQueryConfig));
      }
    }

    public create(brand: BrandingModel, name: string, config: NamedQueryConfig) {
      return super.getObservable(NamedQuery.create({
        name: name,
        branding: brand.id,
        mongoQuery: JSON.stringify(config.mongoQuery),
        queryParams: JSON.stringify(config.queryParams),
        collectionName: config.collectionName,
        resultObjectMapping: JSON.stringify(config.resultObjectMapping),
        brandIdFieldPath: config.brandIdFieldPath,
        sort: (config.sort !== undefined && Array.isArray(config.sort) && config.sort.length > 0) ? JSON.stringify(config.sort) : "",
      }));
    }


    async getNamedQueryConfig(brand: BrandingModel, namedQuery: string) {
      let nQDBEntry = await NamedQuery.findOne({
        key: brand.id + "_" + namedQuery
      });
      return new NamedQueryConfig(nQDBEntry)
    }

    async performNamedQuery(
      brandIdFieldPath: string,
      resultObjectMapping: Record<string, unknown>,
      collectionName: string,
      mongoQuery: Record<string, unknown>,
      queryParams: Record<string, QueryParameterDefinition>,
      paramMap: Record<string, unknown>,
      brand: BrandingModel,
      start: number,
      rows: number,
      user: unknown = undefined,
      sort: NamedQuerySortConfig | undefined = undefined
    ): Promise<ListAPIResponse<NamedQueryResponseRecord>> {
      const criteriaMeta = {enableExperimentalDeepTargets: true};
      this.setParamsInQuery(mongoQuery, queryParams, paramMap);

      let that = this;

      // Add branding
      if(brandIdFieldPath != '') {
        mongoQuery[brandIdFieldPath] = brand.id;
      }
      sails.log.debug("Mongo query to be executed", mongoQuery);

      // Get the total count of matching records
      let totalItems = 0;
      if(collectionName == 'user') {
        totalItems = await User.count(mongoQuery).meta(criteriaMeta);
      } else {
        totalItems = await Record.count(mongoQuery).meta(criteriaMeta);
      }

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
        if(collectionName == 'user') {
          results = await User.find(criteria).meta(criteriaMeta);
        } else {
          results = await Record.find(criteria).meta(criteriaMeta);
        }
      }
      
      let responseRecords: NamedQueryResponseRecord[] = []
      for (let record of results) {

        if(collectionName == 'user') {
          const userRecord = record as UserLike;

          let defaultMetadata: NamedQueryResponseMetadata = {};
          let variables: Record<string, unknown> = { record: userRecord };

          if(!_.isEmpty(resultObjectMapping)) {
            let resultMetadata = _.cloneDeep(resultObjectMapping);
            _.forOwn(resultObjectMapping, function(value: unknown, key: string) {
              _.set(resultMetadata,key,that.runTemplate(value as string,variables));
            });
            defaultMetadata = resultMetadata as NamedQueryResponseMetadata;

          } else {
            defaultMetadata = {
              type: that.runTemplate('record.type',variables),
              name: that.runTemplate('record.name',variables),
              email: that.runTemplate('record.email',variables),
              username: that.runTemplate('record.username',variables),
              lastLogin: that.runTemplate('record.lastLogin',variables)
            };
          }

          let responseRecord:NamedQueryResponseRecord = new NamedQueryResponseRecord({
            oid: '',
            title: '',
            metadata: defaultMetadata,
            lastSaveDate: userRecord.updatedAt ?? null,
            dateCreated: userRecord.createdAt ?? null
          });
          responseRecords.push(responseRecord);

        } else {
          const recordItem = record as RecordLike;

          let defaultMetadata: NamedQueryResponseMetadata = {};
          let variables: Record<string, unknown> = { record: recordItem };

          if(!_.isEmpty(resultObjectMapping)) {
            let resultMetadata = _.cloneDeep(resultObjectMapping);
            _.forOwn(resultObjectMapping, function(value: unknown, key: string) {
              _.set(resultMetadata,key,that.runTemplate(value as string,variables));
            });
            defaultMetadata = resultMetadata as NamedQueryResponseMetadata;
            
          } else {
            defaultMetadata =  that.runTemplate('record.metadata',variables) as NamedQueryResponseMetadata;
          }

          let responseRecord:NamedQueryResponseRecord = new NamedQueryResponseRecord({
            oid: recordItem.redboxOid ?? '',
            title: (recordItem.metadata as Record<string, unknown> | undefined)?.title as string ?? '',
            metadata: defaultMetadata,
            lastSaveDate: recordItem.lastSaveDate ?? null,
            dateCreated: recordItem.dateCreated ?? null
          });
          responseRecords.push(responseRecord);

        }
      }
      let response = new ListAPIResponse<NamedQueryResponseRecord>();


      let startIndex = start;
      let noItems = rows;
      let pageNumber = Math.floor((startIndex / noItems) + 1);

      response.records = responseRecords;
      response.summary.start = start
      response.summary.page = pageNumber
      response.summary.numFound = totalItems;
      
      return response;
    }

    setParamsInQuery(mongoQuery: Record<string, unknown>, queryParams: Record<string, QueryParameterDefinition>, paramMap: Record<string, unknown>) {
      for (let queryParamKey in queryParams) {
        
        let value = paramMap[queryParamKey];
        let queryParam:QueryParameterDefinition = queryParams[queryParamKey];
        sails.log.debug(`${queryParamKey} has value ${value}`);
        if (value == undefined && queryParam.required === true) {
          throw Error(`${queryParamKey} is a required parameter`);
        }
        if (!_.isEmpty(queryParam.template))  {
          value = this.runTemplate(queryParam.template, { value: value, queryParams: queryParams, paramMap: paramMap });
        }
        if (queryParam.type == DataType.Number) {
          value = _.toNumber(value)
        }

        if (queryParam.type == DataType.String) {
          if (!_.isEmpty(queryParam.queryType)) {
            let query: Record<string, unknown> = {}
            // if there is no value pass empty string
            if (value == undefined) {
              if (queryParam.whenUndefined == NamedQueryWhenUndefinedOptions.defaultValue) {
                value = queryParam.defaultValue;
              }
            }
            if (value != undefined || (value == undefined && queryParam.whenUndefined != NamedQueryWhenUndefinedOptions.ignore)) {
              
              query[queryParam.queryType] = value;
              value = query;
            }
          }
        }

        if(queryParam.type == DataType.Date) {
          if (!_.isEmpty(queryParam.queryType)) { 
            let query: Record<string, unknown> = {};
            if (_.isUndefined(value)) {
              if (queryParam.whenUndefined == NamedQueryWhenUndefinedOptions.defaultValue) {
                value = queryParam.defaultValue;
              }
            }
            if(queryParam.format == NamedQueryFormatOptions.days) {
              let days = _.toInteger(value);
              let nowDateAddOrSubtract = DateTime.local();
              if (days > 0) {
                //Going forward in time X number of days
                nowDateAddOrSubtract = nowDateAddOrSubtract.plus({ days: days });
              } else if(days < 0) {
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
          
            delete mongoQuery[queryParam.path];
        } else {

          let existingValue = _.get(mongoQuery,queryParam.path)
          if(existingValue != null && _.isObject(existingValue)) {
            _.merge(value,existingValue);
          }
          _.set(mongoQuery, queryParam.path, value);
        }
      }
      return mongoQuery;
    }

    runTemplate(templateOrPath: string, variables: Record<string, unknown>): unknown {
      if (templateOrPath && templateOrPath.indexOf('<%') != -1) {
        return _.template(templateOrPath)(variables);
      }
      return _.get(variables, templateOrPath);
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
      const brandIdFieldPath = _.get(config, 'brandIdFieldPath', '') ?? '';
      const mongoQuery = _.clone(_.get(config, 'mongoQuery', {}) ?? {});
      const queryParams = (_.get(config, 'queryParams', {}) ?? {}) as Record<string, QueryParameterDefinition>;
      const sort = _.get(config, 'sort', []) ?? [];
      return await this.performNamedQuery(brandIdFieldPath, resultObjectMapping, collectionName, mongoQuery, queryParams, paramMap, brand, start, rows, user, sort);
    }

    public async performNamedQueryFromConfigResults(config: NamedQueryConfig, paramMap: Record<string, string>, brand: BrandingModel, queryName: string, start: number = 0,rows: number = 30, maxRecords: number = 100, user = undefined) {
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
        if (records.length > maxRecords){
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

  constructor(values: Partial<NamedQueryAttributes> & { metadata?: unknown; createdAt?: string; updatedAt?: string; sort?: string } | null | undefined) {
      this.name = values?.name ?? '';
      this.branding = (values?.branding as string) ?? '';
      this.metadata = values?.metadata;
      this.createdAt = values?.createdAt ?? '';
      this.updatedAt = values?.updatedAt ?? '';
      this.key = values?.key ?? '';
      this.queryParams = parseJson<Record<string, QueryParameterDefinition>>(values?.queryParams, {});
      this.mongoQuery = parseJson<Record<string, unknown>>(values?.mongoQuery, {});
      this.collectionName = values?.collectionName ?? '';
      this.resultObjectMapping = parseJson<Record<string, unknown>>(values?.resultObjectMapping, {});
      this.brandIdFieldPath = values?.brandIdFieldPath ?? '';
      this.sort = parseJson<NamedQuerySortConfig>(values?.sort, []);
  }
}

export class NamedQueryResponseRecord {
  oid: string;
  title: string;
  metadata: NamedQueryResponseMetadata;
  lastSaveDate: string | Date | null;
  dateCreated: string | Date | null;

  constructor(values: { oid: string; title: string; metadata: NamedQueryResponseMetadata; lastSaveDate: string | Date | null; dateCreated: string | Date | null }) {
      this.oid= values.oid
      this.title= values.title
      this.metadata= values.metadata
      this.lastSaveDate= values.lastSaveDate
      this.dateCreated= values.dateCreated
  }
}

declare global {
  let NamedQueryService: Services.NamedQueryService;
}
