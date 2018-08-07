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
import moment from 'moment-es6';
declare var RecordsService, DashboardService, BrandingService, TranslationService;
/**
 * Package that contains all Controllers.
 */
import controller = require('../core/CoreController.js');
export module Controllers {
  /**
   * Responsible for all things related to exporting anything
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Export extends controller.Controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
        'index',
        'downloadRecs'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */
    public index(req, res) {
      return this.sendView(req, res, 'export/index');
    }

    public downloadRecs(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const format = req.param('format');
      const recType = req.param('recType');
      const before = _.isEmpty(req.query.before) ? null : req.query.before;
      const after = _.isEmpty(req.query.after) ? null : req.query.after;
      const filename = `${TranslationService.t(`${recType}-title`)} - Exported Records.${format}`;
      if (format == 'csv') {
        res.set('Content-Type', 'text/csv');
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
        DashboardService.exportAllPlans(req.user.username, req.user.roles, brand, format, before, after, recType).subscribe(response => {
          return res.send(200, response);
        });
      } else {
        return res.send(500, 'Unsupported export format');
      }
    }
    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.Export().exports();
