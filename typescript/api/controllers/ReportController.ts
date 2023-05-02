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
declare var BrandingService, RolesService, DashboardService, ReportsService;
declare var _;
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
  export class Report extends controllers.Core.Controller {


    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
      'render',
      'get',
      'getResults',
      'downloadCSV'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }

    public render(req, res) {
      return this.sendView(req, res, 'admin/report');
    }

    public async get(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const report: Report = await ReportsService.get(brand, req.param('name'));
      return this.ajaxOk(req, res, null, ReportsService.getReportDto(report));
    }

    public getResults(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var response = ReportsService.getResults(brand, req.param('name'),  req, req.param('start'), req.param('rows'));
      return response.map(results => {
        var totalItems = results["response"]["numFound"];
        var startIndex = results["response"]["start"];
        var noItems = _.isUndefined(req.param('rows')) ? 10  : req.param('rows');
        var pageNumber = (startIndex / noItems) + 1;

        var response = {};
        response["total"] = totalItems;
        response["pageNum"] = pageNumber;
        response["recordPerPage"] = _.toNumber(noItems);

        var items = [];
        var docs = results["response"]["docs"];

        for (var i = 0; i < docs.length; i++) {
          var doc = docs[i];
          var item = {};
          for(var key in doc) {
            item[key] = doc[key];
          }
          items.push(item);
        }

        response["records"] = items;
        return Observable.of(response);
      }).flatMap(results => {
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
        });;
    }

    public downloadCSV(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);

      var response = ReportsService.getCSVResult(brand, req.param('name'), req);
      response.subscribe(results => {
        let fileName = req.param('name')+'.csv';
        sails.log.verbose("fileName "+fileName);
        res.attachment(fileName);
        res.set('Content-Type', 'text/csv');
        res.status(200).send(results);
        return res
      });
    }

    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.Report().exports();
