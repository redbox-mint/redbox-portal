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
import * as i18next from 'i18next';
import * as Backend from 'i18next-sync-fs-backend';
declare var sails: Sails;

export module Services {
  /**
   * Translation services...
   *
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Translation extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      't'
    ];
    /** Warning this is synch... */
    public bootstrap() {
      i18next
      .use(Backend)
      .init({
        preload: ['en'],
        debug: true,
        lng: 'en',
        fallbackLng: 'en',
        initImmediate: false,
        backend: {
          loadPath: `${sails.config.appPath}/assets/locales/{{lng}}/{{ns}}.json`
        }
      });
    }

    public t(key) {
      return i18next.t(key);
    }
  }
}

  module.exports = new Services.Translation().exports();
