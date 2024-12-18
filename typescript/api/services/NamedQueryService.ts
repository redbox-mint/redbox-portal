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

import { Services as services } from '@researchdatabox/redbox-core-types';

import {
  Sails,
  Model
} from "sails";

declare var sails: Sails;
declare var Record: Model;
declare var User: Model;
declare var NamedQuery: Model;
const moment = require('moment');
declare var _this;
declare var _;

import { ListAPIResponse } from '@researchdatabox/redbox-core-types';
import { Observable } from 'rxjs';

export module Services {
  /**
   * Named Query related functions...
   * 
   */
  export class NamedQueryService extends services.Core.Service {

  

    protected _exportedMethods: any = [
      "bootstrap",
      "performNamedQuery",
      "getNamedQueryConfig"
    ];

     public async bootstrap (defBrand) {
      let namedQueries = await super.getObservable(NamedQuery.find({
        branding: defBrand.id
      })).toPromise()
      
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

    private async createNamedQueriesForBrand(defBrand: any) {
      for (const [namedQuery, config] of Object.entries(sails.config.namedQuery)) {
        const namedQueryConfig: any = config;
        await this.create(defBrand, namedQuery, namedQueryConfig).toPromise();
      }
    }

    public create(brand, name, config: NamedQueryConfig) {
      return super.getObservable(NamedQuery.create({
        name: name,
        branding: brand.id,
        mongoQuery: JSON.stringify(config.mongoQuery),
        queryParams: JSON.stringify(config.queryParams),
        collectionName: config.collectionName,
        resultObjectMapping: JSON.stringify(config.resultObjectMapping),
        brandIdFieldPath: config.brandIdFieldPath
      }));
    }


    async getNamedQueryConfig(brand, namedQuery) {
      let nQDBEntry = await NamedQuery.findOne({
        key: brand.id + "_" + namedQuery
      });
      return new NamedQueryConfig(nQDBEntry)
    }

    async performNamedQuery(brandIdFieldPath, resultObjectMapping, collectionName, mongoQuery, queryParams, paramMap, brand, start, rows, user=undefined):Promise<ListAPIResponse<Object>> {
      
      this.setParamsInQuery(mongoQuery, queryParams, paramMap);

      let that = this;
      
      if(brandIdFieldPath != '') {
        mongoQuery[brandIdFieldPath] = brand.id;
      }
      sails.log.debug("Mongo query to be executed");
      sails.log.debug(mongoQuery);
      
      let totalItems = 0;
      if(collectionName == 'user') {
        totalItems = await User.count(mongoQuery).meta({
          enableExperimentalDeepTargets: true
        });
      } else {
        totalItems = await Record.count(mongoQuery).meta({
          enableExperimentalDeepTargets: true
        });
      }

      let results = [];
      if (totalItems > 0) {
        if(collectionName == 'user') {
          results = await User.find({
            where: mongoQuery,
            skip: start,
            limit: rows
          }).meta({
            enableExperimentalDeepTargets: true
          });
        } else {
          results = await Record.find({
            where: mongoQuery,
            skip: start,
            limit: rows
          }).meta({
            enableExperimentalDeepTargets: true
          });
        }
      }
      
      let responseRecords:NamedQueryResponseRecord[] = []
      for (let record of results) {

        if(collectionName == 'user') {

          let defaultMetadata = {};
          let variables = { record: record };

          if(!_.isEmpty(resultObjectMapping)) {
            let resultMetadata = _.cloneDeep(resultObjectMapping);
            _.forOwn(resultObjectMapping, function(value, key) {
              _.set(resultMetadata,key,that.runTemplate(value,variables));
            });
            defaultMetadata = resultMetadata;

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
            lastSaveDate: record.updatedAt,
            dateCreated: record.createdAt
          });
          responseRecords.push(responseRecord);

        } else {

          let defaultMetadata = {};
          let variables = { record: record };

          if(!_.isEmpty(resultObjectMapping)) {
            let resultMetadata = _.cloneDeep(resultObjectMapping);
            _.forOwn(resultObjectMapping, function(value, key) {
              _.set(resultMetadata,key,that.runTemplate(value,variables));
            });
            defaultMetadata = resultMetadata;
            
          } else {
            defaultMetadata =  that.runTemplate('record.metadata',variables);
          }

          let responseRecord:NamedQueryResponseRecord = new NamedQueryResponseRecord({
            oid: record.redboxOid,
            title: record.metadata.title,
            metadata: defaultMetadata,
            lastSaveDate: record.lastSaveDate,
            dateCreated: record.dateCreated
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

    setParamsInQuery(mongoQuery: any, queryParams: Map<string, QueryParameterDefinition>, paramMap:any) {
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
            let query = {}
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
            let query = {};
            if (_.isUndefined(value)) {
              if (queryParam.whenUndefined == NamedQueryWhenUndefinedOptions.defaultValue) {
                value = queryParam.defaultValue;
              }
            }
            if(queryParam.format == NamedQueryFormatOptions.days) {
              let days = _.toInteger(value);
              let nowDateAddOrSubtract = moment();
              if (days > 0) {
                //Going forward in time X number of days
                nowDateAddOrSubtract = nowDateAddOrSubtract.add(days, 'days');
              } else if(days < 0) {
                //This "additional" step makes the code self explanatory
                days = days * -1;
                //Going backwards in time X number of days
                nowDateAddOrSubtract = nowDateAddOrSubtract.subtract(days, 'days');
              }
              value = nowDateAddOrSubtract.toISOString();
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

    runTemplate(templateOrPath: string, variables: any) {
      if (templateOrPath && templateOrPath.indexOf('<%') != -1) {
        return _.template(templateOrPath)(variables);
      }
      return _.get(variables, templateOrPath);
    }

  }
}
module.exports = new Services.NamedQueryService().exports();

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

class QueryParameterDefinition {
  required:boolean
  type:DataType
  defaultValue: any
  queryType:string
  whenUndefined:NamedQueryWhenUndefinedOptions
  format: NamedQueryFormatOptions;
  path: string;
  template: string;
}

export class NamedQueryConfig {
  name: string;
  branding: string;
  metadata: any;
  createdAt: string;
  updatedAt: string;
  key: string;
  queryParams: Map<string,QueryParameterDefinition>;
  mongoQuery: object;
  collectionName: string;
  resultObjectMapping: any;
  brandIdFieldPath: string;

  constructor(values:any) {
      this.name = values.name;
      this.branding = values.branding;
      this.metadata = values.metadata;
      this.createdAt = values.createdAt;
      this.updatedAt = values.updatedAt;
      this.key = values.key;
      this.queryParams = JSON.parse(values.queryParams);
      this.mongoQuery = JSON.parse(values.mongoQuery);
      this.collectionName = values.collectionName;
      this.resultObjectMapping = JSON.parse(values.resultObjectMapping);
      this.brandIdFieldPath = values.brandIdFieldPath;
  }
}

export class NamedQueryResponseRecord {
  oid: string;
  title: string;
  metadata: any;
  lastSaveDate: string;
  dateCreated: string;

  constructor(values:any) {
      this.oid= values.oid
      this.title= values.title
      this.metadata= values.metadata
      this.lastSaveDate= values.lastSaveDate
      this.dateCreated= values.dateCreated
  }
}