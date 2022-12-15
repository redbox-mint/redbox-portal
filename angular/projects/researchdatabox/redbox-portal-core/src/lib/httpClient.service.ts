// Copyright (c) 2022 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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
import { Subject } from 'rxjs';
import { Inject } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { APP_BASE_HREF } from '@angular/common';
import * as _ from "lodash";

import { Service } from './service.interface';
import { ConfigService } from './config.service';
import { UtilityService } from './utility.service';
import { RB_HTTP_INTERCEPTOR_AUTH_CSRF } from './csrf.interceptor';


/**
 * Convenience base class for services that use HTTP client.
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 */

export class HttpClientService implements Service {
  protected initSubject: any;
  protected config: any;
  public baseUrl:string;
  public brandingAndPortalUrl:string;
  public baseUrlWithContext: string;
  protected httpContext: HttpContext = null as any;

  constructor( 
  @Inject(HttpClient) protected http: HttpClient, 
  @Inject(APP_BASE_HREF) public rootContext: string,
  @Inject(UtilityService) protected utilService: UtilityService,
  @Inject(ConfigService) protected configService: ConfigService
  ) {
    this.initSubject = new Subject();
    if (_.isEmpty(this.rootContext)) {
      this.rootContext = ""
    }
    this.baseUrl = "";
    this.brandingAndPortalUrl = "";
    this.baseUrlWithContext = "";
  }

  /**
   * Returns the config block 
   * 
   * @param appName 
   * @returns 
   */
  public getConfig() {
    return this.config;
  }

  public getInitSubject(): Subject<any> {
    return this.initSubject;
  }

  /**
   * Returns itself when all dependent services/components/data is/are available.
   * 
   * @returns itself
   */
  public async waitForInit(): Promise<any> {
    if (!this.isInitializing()) {
      return this;
    }
    await this.utilService.waitForDependencies([this.configService]);
    this.config = await this.configService.getConfig();
    this.baseUrl = this.config.baseUrl;
    this.brandingAndPortalUrl = `${this.baseUrl}${this.rootContext}/${this.config.branding}/${this.config.portal}`;0
    this.baseUrlWithContext = `${this.baseUrl}${this.rootContext}`;
    this.httpContext = new HttpContext();
    return this;
  }  
  /**
   * Default checks if we've loaded the config. Extensions can add more conditions as needed.
   * 
   * @returns true if service is ready
   */
  public isInitializing(): boolean {
    return _.isUndefined(this.config) || _.isEmpty(this.config);
  }
  /**
   * Call from extending class to enable CSRF in the header
   */
  protected enableCsrfHeader() {
    this.httpContext.set(RB_HTTP_INTERCEPTOR_AUTH_CSRF, this.config.csrfToken);
  }
}
