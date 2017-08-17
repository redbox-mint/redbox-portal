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
import { Observable } from 'rxjs/Rx';
declare var BrandingService;
declare var RolesService;
declare var  DashboardService;
/**
 * Package that contains all Controllers.
 */
import controller = require('../../../typescript/controllers/CoreController.js');
export module Controllers {
  /**
   * Responsible for all things related to the Dashboard
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class Dashboard extends controller.Controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
        'render',
        'getPlanList'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }

    public render(req, res) {
      return this.sendView(req, res, 'dashboard');
    }


    public getPlanList(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var roles = [];
      var username = "guest";
      if (req.isAuthenticated()) {
        roles = req.user.roles;
        username = req.user.username;
      } else {
        // assign default role if needed...
        roles = [];
        roles.push(RolesService.getDefUnathenticatedRole(brand));
      }


      const workflowState = req.param('state');
      const start = req.param('start');
      const rows = req.param('rows');
      this.getPlans(workflowState,start,rows,username,roles,brand).flatMap(results => {
          return results;
        }).subscribe(response => {
          if (response && response.code == "200") {
            response.success = true;
            this.ajaxOk(req, res, null, response);
          } else {
            this.ajaxFail(req, res, null, response);
          }
        }, error => {
          sails.log.error("Error updating meta:");
          sails.log.error(error);
          this.ajaxFail(req, res, error.message);
        });
    }

    protected getPlans(workflowState,start,rows,username, roles, brand) {
      var response = DashboardService.getPlans(workflowState,start,rows,username,roles,brand);

      return response.map(results => {
        var totalItems = results["response"]["numFound"];
        var startIndex = results["response"]["start"];
        var noItems = 10;
        var pageNumber = (startIndex / noItems) + 1;

        var response = {};
        response["totalItems"] = totalItems;
        response["currentPage"] = pageNumber;
        response["noItems"] = noItems;

        var items = [];
        var docs = results["response"]["docs"];
        for (var i = 0; i < docs.length; i++) {
          var doc = docs[i];
          var item = {};
          item["oid"] = doc["storage_id"];
          item["title"] = doc["title"];
          item["dateCreated"] =  doc["date_object_created"];
          item["dateModified"] = doc["date_object_modified"];
          items.push(item);
        }

        response["items"] = items;
        return Observable.of(response);
      });
    }

    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.Dashboard().exports();
