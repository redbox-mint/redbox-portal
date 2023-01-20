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
declare var _;
import { Observable } from 'rxjs/Rx';
declare var BrandingService, RolesService, RecordsService, TranslationService;

/**
 * Package that contains all Controllers.
 */
 import { Controllers as controllers} from '@researchdatabox/redbox-core-types';
export module Controllers {
  /**
   * Responsible for all things related to the Dashboard
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class Dashboard extends controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
        'render',
        'getRecordList',
        'listWorkspaces'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }

    public listWorkspaces(req, res) {
      const url = `${BrandingService.getFullPath(req)}/dashboard/workspace?packageType=workspace&titleLabel=workspaces`;
      return res.redirect(url);
    }

    public render(req, res) {
      const recordType = req.param('recordType') ? req.param('recordType') : '';
      const packageType = req.param('packageType') ? req.param('packageType') : '';
      const titleLabel = req.param('titleLabel') ? TranslationService.t(req.param('titleLabel')) : `${TranslationService.t('edit-dashboard')} ${TranslationService.t(recordType+'-title-label')}`;
      sails.log.error('Dashboard controller render: '+recordType+' '+titleLabel);
      return this.sendView(req, res, 'dashboard', {recordType: recordType, packageType: packageType, titleLabel: titleLabel });
    }


    public async getRecordList(req, res) {

      const brand = BrandingService.getBrand(req.session.branding);

      const editAccessOnly = req.query.editOnly;

      var roles = [];
      var username = "guest";
      let user = {};
      if (req.isAuthenticated()) {
        roles = req.user.roles;
        user = req.user;
        username = req.user.username;
      } else {
        // assign default role if needed...
        user = {username: username};
        roles = [];
        roles.push(RolesService.getDefUnathenticatedRole(brand));
      }
      const recordType = req.param('recordType');
      const workflowState = req.param('state');
      const start = req.param('start');
      const rows = req.param('rows');
      const packageType = req.param('packageType');
      const sort = req.param('sort');
      const filterFieldString = req.param('filterFields');
      let filterString = req.param('filter');
      let filterFields = undefined;

       if(!_.isEmpty(filterFieldString)) {
         filterFields = filterFieldString.split(',')
       } else {
         filterString = undefined;
       }

      try {
        const response = await this.getRecords(workflowState, recordType, start,rows,user,roles,brand,editAccessOnly, packageType,sort,filterFields,filterString);
        if (response) {
          this.ajaxOk(req, res, null, response);
        } else {
          this.ajaxFail(req, res, null, response);
        }
      } catch (error) {
        sails.log.error("Error updating meta:");
        sails.log.error(error);
        this.ajaxFail(req, res, error.message);
      }
    }

    private getDocMetadata(doc) {
      var metadata = {};
      for(var key in doc){
        if(key.indexOf('authorization_') != 0 && key.indexOf('metaMetadata_') != 0) {
          metadata[key] = doc[key];
        }
        if(key == 'authorization_editRoles') {
          metadata[key] = doc[key];
        }
      }
      return metadata;
    }

    protected async getRecords(workflowState, recordType, start,rows,user, roles, brand, editAccessOnly=undefined, packageType = undefined, sort=undefined, filterFields=undefined, filterString=undefined) {
      const username = user.username;
      if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
        recordType = recordType.split(',');
      }
      if (!_.isUndefined(packageType) && !_.isEmpty(packageType)) {
        packageType = packageType.split(',');
      }
      var results = await RecordsService.getRecords(workflowState,recordType, start,rows,username,roles,brand,editAccessOnly, packageType, sort,filterFields,filterString);
      if (!results.isSuccessful()) {
        sails.log.verbose(`Failed to retrieve records!`);
        return null;
      }

      var totalItems = results.totalItems;
      var startIndex = start;
      var noItems = rows;
      var pageNumber = (startIndex / noItems) + 1;

      var response = {};
      response["totalItems"] = totalItems;
      response["currentPage"] = pageNumber;
      response["noItems"] = noItems;

      var items = [];
      var docs = results.items;

      for (var i = 0; i < docs.length; i++) {
        var doc = docs[i];
        var item = {};
        item["oid"] = doc["redboxOid"];
        item["title"] = doc["metadata"]["title"];
        item["metadata"]= this.getDocMetadata(doc);
        item["dateCreated"] =  doc["dateCreated"];
        item["dateModified"] = doc["lastSaveDate"];
        item["hasEditAccess"] = RecordsService.hasEditAccess(brand, user, roles, doc);
        items.push(item);
      }

      response["items"] = items;
      return response;
    }

    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.Dashboard().exports();