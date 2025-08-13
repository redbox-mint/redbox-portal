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
import { Subject, firstValueFrom, map } from 'rxjs';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { get as _get, isEmpty as _isEmpty, isUndefined as _isUndefined, set as _set } from 'lodash-es';

import { Service } from './service.interface';
import { HttpClientService } from './httpClient.service';

import { I18NEXT_SERVICE, ITranslationService, defaultInterpolationFormat, I18NextModule } from 'angular-i18next';
import HttpApi from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';
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
export class TranslationService extends HttpClientService implements Service {
  protected override config: any;
  protected subjects: any;
  protected translatorReady: boolean = false;
  public loadPath: string = '';
  public ts: any;
  protected i18NextOpts: any;
  private requestOptions: any = null as any;
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
      lookupCookie: 'lng',
      // cache user language on
      caches: ['cookie'],
      // optional expire and domain for set cookie
      cookieMinutes: 10080, // 7 days
      // cookieDomain: I18NEXT_LANG_COOKIE_DOMAIN
    }
  };
  
  constructor (
    @Inject(HttpClient) protected override http: HttpClient,
    @Inject(APP_BASE_HREF) public override rootContext: string,
    @Inject(I18NEXT_SERVICE) private i18NextService: ITranslationService,
    @Inject(UtilityService) protected override utilService: UtilityService,
    @Inject(ConfigService) protected override configService: ConfigService,
    @Inject(LoggerService) private loggerService: LoggerService
    ) {
    super(http, rootContext, utilService, configService);
    this.subjects = {};
    this.subjects['init'] = new Subject<any>();
    this.ts = new Date().getTime();
    // default loadPath
    this.loadPath = `${this.rootContext}/default/rdmp/locales/{{lng}}/{{ns}}.json`;
  }

  async initTranslator(): Promise<any> {
    await super.waitForInit();
    this.config = this.getConfig();
    // enable CSRF for admin calls and prepare default request options
    this.requestOptions = this.reqOptsJsonBodyOnly;
    this.enableCsrfHeader();
    // attach context for interceptor
    (this.requestOptions as any).context = this["httpContext"];
    this.loadPath = `${this.rootContext}/${this.config.branding}/${this.config.portal}/locales/{{lng}}/{{ns}}.json`;
    if (!_isEmpty(_get(this.config, 'i18NextOpts'))) {
      this.i18NextOpts = _get(this.config, 'i18NextOpts');
      if (_isUndefined(_get(this.i18NextOpts, 'backend.loadPath'))) {
        _set(this.i18NextOpts, 'backend.loadPath', this.loadPath);
      }
      if (_isUndefined(_get(this.i18NextOpts, 'interpolation'))) {
        _set(this.i18NextOpts, 'interpolation', this.i18NextOptsDefault.interpolation);
      }
    } else {
      // default value...
      this.loggerService.info(`Language service using default config`);
      this.i18NextOpts = this.i18NextOptsDefault;
      _set(this.i18NextOpts, 'backend.loadPath', this.loadPath);
    }
    this.loggerService.log(`Using language loadpath: ${this.loadPath}`);
    try {
    	await this.i18NextService
	              .use(HttpApi)
                .use(LanguageDetector)
	              .init(this.i18NextOpts);
      this.loggerService.info(`Language service ready`);
	    this.translatorReady = true;
	    this.translatorLoaded();
    } catch (error) {
      this.loggerService.error(`Failed to initialise language service:`) ;
      this.loggerService.error(JSON.stringify(error));
      throw error;
    }
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

  public override getInitSubject(): Subject<any> {
    return this.subjects['init'];
  } 

  override async waitForInit(): Promise<any> {
    if (this.translatorReady) {
      return this;
    } 
    if (_isUndefined(this.i18NextOpts)) {
      this.initTranslator();
    }
    return firstValueFrom(this.getInitSubject());
  }

  public override isInitializing(): boolean {
    return !this.translatorReady;
  }

  public override getConfig(appName?:string) {
    return this.config;
  }

  // ===== Admin translation API (Angular app) =====
  /** List i18n entries for the current branding */
  public async listEntries(locale: string, namespace = 'translation', keyPrefix?: string): Promise<Array<{ key: string; value: any; description?: string; category?: string }>> {
    await this.waitForInit();
    const params = new URLSearchParams({ locale, namespace });
    if (keyPrefix) params.set('keyPrefix', keyPrefix);
    const url = `${this.brandingAndPortalUrl}/app/i18n/entries?${params.toString()}`;
    const req$ = this.http.get(url, this.requestOptions).pipe(map((res: any) => Array.isArray(res) ? res : []));
    return firstValueFrom(req$);
  }

  /** Create/update a single entry for the current branding */
  public async setEntry(locale: string, namespace: string, key: string, body: { value: any; category?: string; description?: string }): Promise<any> {
    await this.waitForInit();
    const url = `${this.brandingAndPortalUrl}/app/i18n/entries/${encodeURIComponent(locale)}/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`;
    const req$ = this.http.post(url, body, this.requestOptions).pipe(map(res => res));
    return firstValueFrom(req$);
  }

  /** List supported languages for current branding */
  public async listLanguages(): Promise<string[]> {
    await this.waitForInit();
    const url = `${this.brandingAndPortalUrl}/locales`;
    const req$ = this.http.get(url, this.requestOptions).pipe(map((res: any) => Array.isArray(res) ? res : []));
    return firstValueFrom(req$);
  }
}
