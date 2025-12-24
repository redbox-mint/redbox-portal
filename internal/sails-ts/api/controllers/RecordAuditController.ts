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


/**
 * Package that contains all Controllers.
 */
import { Controllers as controllers} from '@researchdatabox/redbox-core-types';
import moment from '../shims/momentShim';
import { orderBy } from 'lodash';

export module Controllers {
  /**
   * Responsible for all things related to the Dashboard
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class Reports extends controllers.Core.Controller {


    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
        'render'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }

    public render(req, res) {
      let oid = req.param('oid');
      let params = { 'oid': oid, 'dateFrom': null, 'dateTo': null };
      RecordsService.getRecordAudit(params).then(records => {
        let orderedRecords = orderBy(records, ['updatedAt'], ['desc']);
        req.options.locals["records"] = orderedRecords;
  req.options.locals["moment"] = moment;
        return this.sendView(req, res, 'record/viewAudit');
      });
    }



    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.Reports().exports();
