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
declare var _;
/**
 * Package that contains all Controllers.
 */
 import {APIErrorResponse, APIObjectActionResponse, Controllers as controllers,  RecordsService, SearchService} from '@researchdatabox/redbox-core-types';

export module Controllers {
  /**
   * Responsible for all things related to the Dashboard
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class Search extends controllers.Core.Controller {

    searchService: SearchService;
    RecordsService: RecordsService = sails.services.recordsservice;

    constructor() {
      super();
      let that = this;
      sails.on('ready', function () {
        that.searchService = sails.services[sails.config.search.serviceName];
      });
    }

    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
      'search',
      'index',
      'indexAll',
      'removeAll'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }

    public async index(req, res) {
      let oid = req.param('oid');
      let record = await this.RecordsService.getMeta(oid);
      await this.searchService.index(oid,record);

      return this.apiRespond(req,res,new APIObjectActionResponse(oid, "Index request added to message queue for processing"),200)
    }

    public async indexAll(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      sails.log.verbose(`SearchController::indexAll() -> Indexing all records has been requested!`);
      let itemsPerPage = 100;
      let itemsRead = 0;
      let totalItems = 0;
      let totalPages = 0;
      let pageCount = 0;
      // keep going until we retrieve all records
      do {
        let response = await this.RecordsService.getRecords(undefined, undefined, itemsRead, itemsPerPage, req.user.username, req.user.roles, brand, undefined, undefined, undefined, undefined, undefined);
        if (itemsRead == 0) {
          totalItems = response.totalItems;
          totalPages = Math.ceil(totalItems / itemsPerPage);
        } 
        pageCount++;
        sails.log.verbose(`SearchController::indexAll() -> Indexing ${totalItems} records(s), page: ${pageCount} of ${ totalPages }`);
        itemsRead += _.size(response.items);
        for (let responseRec of response.items) {
          _.unset(responseRec, '_id');
          await this.searchService.index(responseRec.redboxOid, responseRec);
        }
      } while (itemsRead < totalItems)
      
      sails.log.verbose(`SearchController::indexAll() -> All records submitted for indexing`);
      return this.apiRespond(req,res,new APIObjectActionResponse("", "Index all records request added to message queue for processing"),200);
    }

    public async removeAll(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      sails.log.verbose(`SearchController::removeAll() -> Removing all records has been requested!`);

      // delete all documents by specifying id as '*'
      await this.searchService.remove('*');

      sails.log.verbose(`SearchController::indexAll() -> Submitted request to remove all`);
      return this.apiRespond(req, res, new APIObjectActionResponse("", "Remove all records request added to message queue for processing"), 200);
    }

    public async search(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const type = req.query.type;
      const workflow = req.query.workflow;
      const searchString = req.query.searchStr;
      const exactSearchNames = _.isEmpty(req.query.exactNames) ? [] : req.query.exactNames.split(',');
      const exactSearches = [];
      const facetSearchNames = _.isEmpty(req.query.facetNames) ? [] : req.query.facetNames.split(',');
      const facetSearches = [];

      _.forEach(exactSearchNames, (exactSearch) => {
        exactSearches.push({
          name: exactSearch,
          value: req.query[`exact_${exactSearch}`]
        });
      });
      _.forEach(facetSearchNames, (facetSearch) => {
        facetSearches.push({
          name: facetSearch,
          value: req.query[`facet_${facetSearch}`]
        });
      });

      try {
        const searchRes = await this.searchService.searchFuzzy(type, workflow, searchString, exactSearches, facetSearches, brand, req.user, req.user.roles, sails.config.record.search.returnFields);
        this.apiRespond(req, res,searchRes);
      } catch (error) {
        this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }


    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.Search().exports();