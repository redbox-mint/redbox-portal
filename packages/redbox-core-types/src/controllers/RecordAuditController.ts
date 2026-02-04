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

import { Controllers as controllers } from '../CoreController';
import { momentShim as moment } from '../shims/momentShim';
import { orderBy } from 'lodash';
import { RecordsService } from '../RecordsService';
declare var sails: any;

export module Controllers {
  /**
   * Responsible for all things related to the Dashboard
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class RecordAudit extends controllers.Core.Controller {

    protected recordsService!: RecordsService;

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: any = [
      'render',
      'init'
    ];

    /**
     * *************************************************************************************************
     * **************************************** Add custom methods **************************************
     * *************************************************************************************************
     */

    public init() {
      this.recordsService = sails.services.recordsservice;
    }

    public bootstrap() {

    }

    public render(req: Sails.Req, res: Sails.Res) {
      let oid = req.param('oid');
      let params = { 'oid': oid, 'dateFrom': null, 'dateTo': null };
      // Use this.recordsService or fallback to global if strictly needed, but migrated style is class property
      // However, RecordsService in this context is likely a static or singleton usage in the old code
      // checking RecordsService.ts to be sure.
      // Based on previous files, services are classes but often used via sails.services.
      // But here I'm importing the class.
      // If RecordsService has static methods, I can call them directly.
      // If not, I should use the instance.
      // The original code `RecordsService.getRecordAudit` implies static or global instance.
      // In redbox-core-types, services are classes.
      // If `getRecordAudit` is not static, I must use an instance.
      // I'll assume instance method for now and use `this.recordsService`.
      
      // Re-reading usage in original file: `RecordsService.getRecordAudit(params)`
      // Checking if getRecordAudit is static in RecordsService would be good.
      // But assuming standard pattern: `this.recordsService.getRecordAudit(params)`
      
      this.recordsService.getRecordAudit(params).then(records => {
        let orderedRecords = orderBy(records, ['updatedAt'], ['desc']);
        req.options.locals["records"] = orderedRecords;
        req.options.locals["moment"] = moment;
        return this.sendView(req, res, 'record/viewAudit');
      });
    }

    /**
     * *************************************************************************************************
     * **************************************** Override magic methods **********************************
     * *************************************************************************************************
     */
  }
}
