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

import { Observable } from 'rxjs/Rx';
import services = require('../../typescript/services/CoreService.js');
import {Sails, Model} from "sails";
import * as request from "request-promise";

declare var sails: Sails;
declare var _this;

export module Services {
  /**
   * Records related functions...
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   *
   */
  export class Dashboard extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'getPlans',
      'exportAllPlans'
    ];


    public getPlans(workflowState, start, rows = 10, username, roles, brand) {

      var url = this.addQueryParams(sails.config.record.api.search.url, workflowState);
      url = this.addPaginationParams(url, start, rows);
      url = this.addAuthFilter(url, username, roles, brand)
      url = url+"&fq=metaMetadata_brandId:"+brand.id
      var options = this.getOptions(url);
      sails.log.error("Query URL is: "+ url);
      return Observable.fromPromise(request[sails.config.record.api.search.method](options));
    }

    exportAllPlans(username, roles, brand, format, modBefore, modAfter) {
      const dateQ = modBefore || modAfter ? ` AND date_object_modified:[${modAfter ? `${modAfter}T00:00:00Z`: '*'} TO ${modBefore ? `${modBefore}T23:59:59Z` : '*'}]` : '';
      var url = `${sails.config.record.api.search.url}?q=metaMetadata_type:rdmp${dateQ}&sort=date_object_modified desc&version=2.2&wt=${format}`;
      url = `${url}&start=0&rows=${sails.config.record.export.maxRecords}`;
      url = this.addAuthFilter(url, username, roles, brand)
      url = url+"&fq=metaMetadata_brandId:"+brand.id
      var options = this.getOptions(url);
      sails.log.verbose("Query URL is: "+ url);
      return Observable.fromPromise(request[sails.config.record.api.search.method](options));
    }


    protected addQueryParams(url, workflowState) {
      url = url + "?q=metaMetadata_type:rdmp AND workflow_stage:" + workflowState + "&sort=date_object_modified desc&version=2.2"
      return url;
    }

    protected addPaginationParams(url, start, rows) {
      url = url + "&start=" + start + "&rows=" + rows + "&wt=json";
      return url;
    }

    protected addAuthFilter(url, username, roles, brand) {

      var roleString = ""
      var matched = false;
      for (var i = 0; i < roles.length; i++) {
        var role = roles[i]
        if (role.branding == brand.id) {
          if (matched) {
            roleString += " OR ";
            matched = false;
          }
          roleString += roles[i].name;
          matched = true;
        }
      }
      url = url + "&fq=authorization_edit:" + username + " OR authorization_view:" + username + " OR authorization_viewRoles:(" + roleString + ") OR authorization_editRoles:(" + roleString + ")";
      return url;
    }

    protected getOptions(url) {
      return { url: url, json: true, headers: { 'Authorization': `Bearer ${sails.config.redbox.apiKey}`, 'Content-Type': 'application/json; charset=utf-8' } };
    }

  }
}
module.exports = new Services.Dashboard().exports();
