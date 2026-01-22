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

declare var module;
declare var sails;
declare var _;
import { Observable } from 'rxjs';
declare var RecordsService, DashboardService, BrandingService, TranslationService;
import { default as util } from 'util';
import { default as stream } from 'stream';
const pipeline = util.promisify(stream.pipeline);
/**
 * Package that contains all Controllers.
 */
import { BrandingModel } from '../model';
import { Controllers as controllers } from '../CoreController';

export module Controllers {
  /**
   * Responsible for all things related to exporting anything
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Export extends controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
        'index',
        'downloadRecs'
    ];

    /**
     * *************************************************************************************************
     * **************************************** Add custom methods **************************************
     * *************************************************************************************************
     */
    public index(req, res) {
      return this.sendView(req, res, 'export/index');
    }

    public async downloadRecs(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const format = req.param('format');
      const recType = req.param('recType');
      const before = _.isEmpty(req.query.before) ? null : req.query.before;
      const after = _.isEmpty(req.query.after) ? null : req.query.after;
      const filename = `${TranslationService.t(`${recType}-title`)} - Exported Records.${format}`;
      if (format == 'csv' || format == 'json') {
        res.set('Content-Type', `text/${format}`);
        sails.log.verbose("filename "+filename);
        res.attachment(filename);
        await pipeline(
          RecordsService.exportAllPlans(req.user.username, req.user.roles, brand, format, before, after, recType),
          res
        );
      } else {
        return res.send(500, 'Unsupported export format');
      }
    }
    /**
     * *************************************************************************************************
     * **************************************** Override magic methods **********************************
     * *************************************************************************************************
     */
  }
}
