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

//<reference path='./../../typings/loader.d.ts'/>
declare var module;
declare var sails;

declare var BrandingService;
declare var RolesService;
declare var DashboardService;
declare var UsersService;
declare var User;
declare var Record;
declare var _;
import { APIActionResponse, APIErrorResponse, ListAPIResponse } from '@researchdatabox/redbox-core-types';
const moment = require('moment');
/**
 * Package that contains all Controllers.
 */
import { Controllers as controllers } from '@researchdatabox/redbox-core-types';



declare var TranslationService;

export module Controllers {
  /**
   * Responsible for all things related to the Dashboard
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class Report extends controllers.Core.Controller {



    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
      'executeNamedQuery'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }

    private filterObject(obj, predicate) {
      return Object.keys(obj).reduce((memo, key) => {
        if (predicate(obj[key], key)) {
          memo[key] = obj[key]
        }
        return memo
      }, {})
    }

    public async executeNamedQuery(req, res) {
      try {
        const brand = BrandingService.getBrand(req.session.branding);
        let queryName = req.param('queryName');
        if (_.isEmpty(sails.config.namedQuery[queryName])) {
          return this.apiFail(req, res, 400, new APIErrorResponse("Named query not found"));
        }

        let start = 0;
        let rows = 10;
        if (!_.isEmpty(req.param('start'))) {
          start = _.toNumber(req.param('start'))
        }
        if (!_.isEmpty(req.param('rows'))) {
          rows = _.toNumber(req.param('rows'))
        }
        if (rows > 100) {
          return this.apiFail(req, res, 400, new APIErrorResponse("Rows must not be greater than 100"));
        }
        let namedQueryConfig = sails.config.namedQuery[queryName];

        let configMongoQuery = namedQueryConfig.mongoQuery;
        let mongoQuery = _.clone(configMongoQuery);
        let queryParams = namedQueryConfig.queryParams;
        let paramMap = _.clone(req.query);

        //query params
        const dataType = 'type';
        const path = 'path';
        const queryType = 'queryType';
        const whenUndefined = 'whenUndefined';
        const defaultValue = 'defaultValue';
        const ignore = 'ignore';
        const ISODate = 'ISODate';
        const days = 'days';
        const format = 'format';

        //data types
        const dateDT = 'date';
        const numberDT = 'number';
        const stringDT = 'string';

        for (let queryParam in queryParams) {
          
          let value = paramMap[queryParam];
          sails.log.error(`${queryParam} has value ${value}`);
          if (value == undefined && queryParams[queryParam].required === true) {
            return this.apiFail(req, res, 400, new APIErrorResponse(`${queryParam} is a required parameter`));
          }
          if (queryParams[queryParam][dataType] == numberDT) {
            value = _.toNumber(value)
          }

          if (queryParams[queryParam][dataType] == stringDT) {
            if (!_.isEmpty(queryParams[queryParam][queryType])) {
              let query = {}
              // if there is no value pass empty string

              if (value == undefined) {
                if (queryParams[queryParam][whenUndefined] == defaultValue) {
                  value = queryParams[queryParam][defaultValue];
                }
              }
              if (value != undefined || (value == undefined && queryParams[queryParam][whenUndefined] != ignore)) {
                query[queryParams[queryParam][queryType]] = value;
                value = query;
              }
            }
          }

          if(queryParams[queryParam][dataType] == dateDT) {
            if (!_.isEmpty(queryParams[queryParam][queryType])) {
              let query = {};
              if (_.isUndefined(value)) {
                if (queryParams[queryParam][whenUndefined] == defaultValue) {
                  if(queryParams[queryParam][format] == days) {
                    let days = _.toInteger(queryParams[queryParam][defaultValue]);
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
                  } else if(queryParams[queryParam][format] == ISODate) {
                    value = queryParams[queryParam][defaultValue];
                  }
                  query[queryParams[queryParam][queryType]] = value;
                  value = query;
                }
              }
            }
          }
          
          if (value == undefined && queryParams[queryParam][whenUndefined] == ignore) {
            
              delete mongoQuery[queryParams[queryParam][path]];
          } else {

            let existingValue = _.get(mongoQuery,queryParams[queryParam][path])
            if(existingValue != null && _.isObject(existingValue)) {
              _.merge(value,existingValue);
            }
            _.set(mongoQuery, queryParams[queryParam][path], value);
          }
        }
        
        mongoQuery['metaMetadata.brandId'] = brand.id;

        sails.log.error(mongoQuery);
        let totalItems = await Record.count(mongoQuery).meta({
          enableExperimentalDeepTargets: true
        });
        let results = [];
        if (totalItems > 0) {
          results = await Record.find({
            where: mongoQuery,
            skip: start,
            limit: rows
          }).meta({
            enableExperimentalDeepTargets: true
          })
        }
        let responseRecords = []
        for (let record of results) {
          responseRecords.push({
            oid: record.redboxOid,
            title: record.metadata.title,
            metadata: record.metadata
          })
        }
        let response = new ListAPIResponse();


        let startIndex = start;
        let noItems = rows;
        let pageNumber = Math.floor((startIndex / noItems) + 1);

        response.records = responseRecords;
        response.summary.start = start
        response.summary.page = pageNumber
        response.summary.numFound = totalItems;

        return this.apiRespond(req, res, response, 200)
      } catch (error) {
        return this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }



    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.Report().exports();