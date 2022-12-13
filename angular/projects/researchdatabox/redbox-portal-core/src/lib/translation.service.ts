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

import { Injectable, Inject } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { APP_BASE_HREF } from '@angular/common';
import * as _ from "lodash";

import { Service } from './service.interface';

import { I18NEXT_SERVICE, ITranslationService, defaultInterpolationFormat, I18NextModule } from 'angular-i18next';
import HttpApi from 'i18next-http-backend';
import { ConfigService } from './config.service';
import { UtilityService } from './utility.service';
import { LoggerService  } from './logger.service';
/**
 * Translation related functions. Uses i18next library to support translation source for both frontend and backend.
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 * 
 */
@Injectable()
export class TranslationService implements Service {
  protected config: any;
  protected subjects: any;
  protected translatorReady: boolean = false;
  public loadPath: string = '';
  public ts: any;
  protected i18NextOpts: any;
  protected i18NextOptsDefault = {
    load: 'languageOnly',
    supportedLngs: ['en'],
    fallbackLng: 'en',
    debug: true,
    returnEmptyString: false,
    ns: [
      'translation'
    ],
    interpolation: {
      format: I18NextModule.interpolationFormat(defaultInterpolationFormat)
    },
    // lang detection plugin options
    detection: {
      // order and from where user language should be detected
      order: ['cookie'],
      // keys or params to lookup language from
      lookupCookie: 'lang',
      // cache user language on
      caches: ['cookie'],
      // optional expire and domain for set cookie
      cookieMinutes: 10080, // 7 days
      // cookieDomain: I18NEXT_LANG_COOKIE_DOMAIN
    }
  };
  /*
  TODO: When type issue is resolved:
 Error: export 'ITranslationService' (imported as 'ITranslationService') was not found in 'angular-i18next' (possible exports: I18NEXT_ERROR_HANDLING_STRATEGY, I18NEXT_NAMESPACE, I18NEXT_NAMESPACE_RESOLVER, I18NEXT_SCOPE, I18NEXT_SERVICE, I18NextCapPipe, I18NextEagerPipe, I18NextFormatPipe, I18NextModule, I18NextPipe, I18NextService, I18NextTitle, NativeErrorHandlingStrategy, StrictErrorHandlingStrategy, defaultInterpolationFormat, i18nextNamespaceResolverFactory, resolver)
 
  into 

  `@Inject(I18NEXT_SERVICE) private i18NextService: ITranslationService `
  */ 
  constructor (
    @Inject(APP_BASE_HREF) public rootContext: string, 
    @Inject(I18NEXT_SERVICE) private i18NextService: any,
    @Inject(UtilityService) private utilService: UtilityService,
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(LoggerService) private loggerService: LoggerService
    ) {
    this.subjects = {};
    this.subjects['init'] = new Subject<any>();
    this.ts = new Date().getTime();
    // default loadPath
    this.loadPath = `${this.rootContext}/locales/{{lng}}/{{ns}}.json`;
  }

  async initTranslator(): Promise<any> {
    await this.utilService.waitForDependencies([this.configService]);
    this.config = this.configService.getConfig();
    if (!_.isEmpty(_.get(this.config, 'i18NextOpts'))) {
      this.i18NextOpts = _.get(this.config, 'i18NextOpts');
      if (_.isUndefined(_.get(this.i18NextOpts, 'backend.loadPath'))) {
        _.set(this.i18NextOpts, 'backend.loadPath', this.loadPath);
      }
      if (_.isUndefined(_.get(this.i18NextOpts, 'interpolation'))) {
        _.set(this.i18NextOpts, 'interpolation', this.i18NextOptsDefault.interpolation);
      }
    } else {
      // default value...
      this.i18NextOpts = this.i18NextOptsDefault;
      _.set(this.i18NextOpts, 'backend.loadPath', this.loadPath);
    }
    this.loggerService.log(`Using language loadpath: ${this.loadPath}`);
    await this.i18NextService
              .use(HttpApi)
              .init(this.i18NextOpts);

    this.translatorReady = true;
    this.translatorLoaded();
    return this;
  }

  translatorLoaded() {
    if (this.translatorReady) {
      this.subjects['init'].next(this);
    }
  }

  t(key: string) {
    return this.i18NextService.t(key);
  }

  public getInitSubject(): Subject<any> {
    return this.subjects['init'];
  } 

  async waitForInit(): Promise<any> {
    if (this.translatorReady) {
      return this;
    } 
    if (_.isUndefined(this.i18NextOpts)) {
      this.initTranslator();
    }
    return firstValueFrom(this.getInitSubject());
  }

  public isInitializing(): boolean {
    return this.translatorReady;
  }

  public getConfig(appName?:string) {
    return this.config;
  }
}
