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

import { Http, Response, RequestOptions, Headers } from '@angular/http';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/interval';
import 'rxjs/add/observable/of';
import 'rxjs/add/operator/mergeMap';
import * as _ from "lodash";
import { Subject } from 'rxjs/Subject';
/**
 * Base class for all client-side services...
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
export class BaseService {
  protected http: any;
  protected config: any;
  protected configService: any;
  protected baseUrl:string;
  protected brandingAndPortalUrl:string;
  protected options: any;
  protected static __config: any;
  protected initSubject: any;

  constructor (http: any , configService: any) {
    this.http = http;
    this.configService = configService;
    this.initSubject = new Subject();
    this.configService.getConfig((config:any) => {
      this.config = config;
      this.baseUrl = this.config.baseUrl;
      this.brandingAndPortalUrl = `${this.baseUrl}/${this.config.branding}/${this.config.portal}`;
      this.options = this.getOptionsClient();
      this.emitInit();
    });
  }

  public get getBrandingAndPortalUrl() {
    return this.brandingAndPortalUrl;
  }

  public get getBaseUrl() {
    return this.baseUrl;
  }

  public waitForInit(handler: any) {
    const subs = this.initSubject.subscribe(handler);
    this.emitInit();
    return subs;
  }

  protected emitInit() {
    if (this.config) {
      this.initSubject.next('');
    }
  }

  getConfig() {
    return this.config;
  }

  protected extractData(res: Response, parentField: any = null) {
    let body = res.json();
    if (parentField) {
        return body[parentField] || {};
    } else {
        return body || {};
    }
  }

  protected getOptions(headersObj: any) {
    let headers = new Headers(headersObj);
    return new RequestOptions({ headers: headers });
  }

  protected getOptionsClient(headersObj: any = {}) {
    headersObj['X-Source'] = 'jsclient';
    headersObj['Content-Type'] = 'application/json;charset=utf-8';
    return this.getOptions(headersObj);
  }
}
