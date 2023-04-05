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

import { Injectable, Inject} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject, firstValueFrom } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { get as _get, isEmpty as _isEmpty, isUndefined as _isUndefined } from 'lodash-es';
import { APP_BASE_HREF } from '@angular/common';
import { Service } from './service.interface';
/**
 * Loads Global client-side configuration.
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
 @Injectable({
  providedIn: 'platform'
})
export class ConfigService implements Service {
  protected config: any;
  protected initSubject: any;
  public csrfToken: any;
  public configUrl: string = '';
  public csrfTokenUrl: string = '';

  constructor (@Inject(HttpClient) protected http: any, @Inject(APP_BASE_HREF) public rootContext: string) {
    this.initSubject = new Subject();
    if (_isEmpty(this.rootContext)) {
      this.rootContext = ""
    }
    this.configUrl = `${this.rootContext}/dynamic/apiClientConfig?v=${new Date().getTime()}`;
    this.csrfTokenUrl = `${this.rootContext}/csrfToken`;
    // start the async init of this service
    this.initConfig();
  }

  /**
   * Returns the configuration block.
   * 
   */
  public async getConfig(): Promise<any> {
    if (this.config) {
      return this.config;
    }
    return firstValueFrom(this.getInitSubject());
  }

  emitConfig(): void {
    if (this.config) {
      this.config.rootContext = this.rootContext;
      this.getInitSubject().next(this.config);
    }
  }

  initConfig(): void {
    this.http.get(this.csrfTokenUrl)
    .pipe(
      mergeMap((csrfRes:any) => {
        this.csrfToken = _get(csrfRes, '_csrf');
        return this.http.get(this.configUrl);
      })
    ).subscribe((config:any) => {
      this.config = config;
      this.config['csrfToken'] = this.csrfToken;
      this.config['rootContext'] = this.rootContext;
      this.emitConfig();
    });
  }

  public getInitSubject(): Subject<any> {
    return this.initSubject;
  }

  public async waitForInit(): Promise<any> {
    return this.getConfig();
  }

  public isInitializing():boolean {
    return _isUndefined(this.config) || _isEmpty(this.config);
  }

  /**
   * Static method for returning an app-specific config. Making it static removes the need to wait for the config block to be present.
   * @param config 
   * @param appName 
   * @returns Application-specific configuration or undefined (failing fast and avoids accidentally returning a top-level property, if further processing is done)
   */
  public static _getAppConfig(config: any, appName: string) {
    return _get(config, `app.${appName}`);
  }

  /**
   * Static convenience method for getting an app-specific property from the config with fallback support, intentionally static so there is no need to 'await'.
   * 
   * @param config 
   * @param appName 
   * @param propertyPath 
   * @param defaultVal 
   * @returns 
   */
  public static _getAppConfigProperty(config: any, appName:string, propertyPath:string, defaultVal: any): any {
    return _get(ConfigService._getAppConfig(config, appName), propertyPath, defaultVal);
  }
}
