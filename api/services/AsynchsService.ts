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

declare var sails: Sails;
declare var AsynchProgress: Model;
import moment from 'moment-es6';

export module Services {
  /**
   * Asynch related functions...
   *
   * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
   */
  export class Asynchs extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'start',
      'update',
      'finish'
    ];

    public start(brandId, processName, username) {
      return super.getObservable(AsynchProgress.create({name: processName, started_by: username, branding: brandId, status:'starting'}));
    }

    public update(criteria, progressObj) {
      return super.getObservable(AsynchProgress.update(criteria, progressObj));
    }

    public finish(progressId, progressObj=null) {
      if (progressObj) {
          progressObj.date_completed = moment().format('YYYY-MM-DD HH:mm:ss');
      } else {
          progressObj = {date_completed: moment().format('YYYY-MM-DD HH:mm:ss')};
      }
      progressObj.status = 'finished';
      return super.getObservable(AsynchProgress.update({id:progressId}, progressObj));
    }

  }

}

module.exports = new Services.Asynchs().exports();
