// Copyright (c) 2023 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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
import { APIErrorResponse, BrandingModel } from '@researchdatabox/redbox-core-types';
declare var RecordsService, BrandingService, TranslationService;
import { default as util } from 'util';
import { default as stream } from 'stream';
const pipeline = util.promisify(stream.pipeline);
/**
 * Package that contains all Controllers.
 */
import { Controllers as controllers} from '@researchdatabox/redbox-core-types';
export module Controllers {
  /**
   * Responsible for exporting data
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Export extends controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
        'downloadRecs'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */
    public async downloadRecs(req, res) {
      try {
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
          return this.apiFail(req, res, 500, new APIErrorResponse('Unsupported export format'));
        }
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

module.exports = new Controllers.Export().exports();
