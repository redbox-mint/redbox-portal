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
import { APIErrorResponse } from '@researchdatabox/redbox-core-types';
/**
 * Package that contains all Controllers.
 */
import { Controllers as controllers } from '@researchdatabox/redbox-core-types';



declare var NamedQueryService;

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


    public async executeNamedQuery(req, res) {
      try {
        const brand = BrandingService.getBrand(req.session.branding);
        let queryName = req.param('queryName');
        let namedQuery = await NamedQueryService.getNamedQueryConfig(brand,queryName);
        if (_.isEmpty(namedQuery)) {
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
        let collectionName = _.get(namedQueryConfig, 'collectionName', '');
        let mongoQuery = _.clone(configMongoQuery);
        let queryParams = namedQueryConfig.queryParams;
        let paramMap = _.clone(req.query);
        let response = await NamedQueryService.performNamedQuery(collectionName,mongoQuery,queryParams,paramMap,brand,start,rows)
        sails.log.error("NamedQueryService response")
        sails.log.error(response)
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