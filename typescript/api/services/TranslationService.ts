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
import {Services as services}   from '@researchdatabox/redbox-core-types';
import { Sails, Model } from "sails";
import * as i18next from "i18next"
import Backend from 'i18next-fs-backend';

declare var _;
declare var sails: Sails;

export module Services {
  /**
   * Translation services...
   *
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Translation extends services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      't',
      'reloadResources',
      'tInter'
    ];
    protected tMethods = {};
    /** Warning this is synch... */
    public async bootstrap() {
      sails.log.debug("TranslationService initialising...")
      sails.log.debug("#####################");
      sails.log.debug(Backend);
      sails.log.debug("#####################");

      let initConfig = _.merge(sails.config.i18n.next.init, {
        backend: {
          loadPath: `${sails.config.appPath}/assets/locales/{{lng}}/{{ns}}.json`
        }
      });

      //@ts-ignore
      await i18next.use(Backend).init(initConfig);
      sails.log.debug("**************************");
      sails.log.debug(`i18next initialised, default: '${initConfig.lng}', supported: ${initConfig.supportedLngs} `);
      sails.log.debug("**************************");
    }

    public t(key, context = undefined, langCode:string = 'en') {
      return i18next.getFixedT(langCode)(key, context);
    }

    public tInter(key, context = null, langCode:string = 'en') {
      return this.t(key, context, langCode);
    }

    public reloadResources() {
      //@ts-ignore
      i18next.reloadResources();
    }
  }
}
module.exports = new Services.Translation().exports();
