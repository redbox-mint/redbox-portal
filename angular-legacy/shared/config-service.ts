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
import { Http, Response, RequestOptions, Headers } from '@angular/http';
import { Observable } from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';
import 'rxjs/add/observable/interval';
import 'rxjs/add/observable/of';
import 'rxjs/add/operator/mergeMap';
import * as _ from "lodash";

/**
 * Handles client-side global configuration
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Injectable()
export class ConfigService {
  protected config: any;
  protected subjects: any;
  public csrfToken: any;
  public rootContext:string = "/"
  constructor (@Inject(Http) protected http: any) {
    this.subjects = {};
    this.subjects['get'] = new Subject();
    let bootstrapElement:any = document.getElementsByTagName("angular-bootstrap")
    if(bootstrapElement.length > 0) {
     this.rootContext = $(bootstrapElement[0]).attr('rootContext');
    }
    this.initConfig();
  }

  getConfig(handler: any): any {
    const subs = this.subjects['get'].subscribe(handler);
    this.emitConfig();
    return subs;
  }

  emitConfig() {
    if (this.config) {
      this.config.rootContext = this.rootContext;
      this.subjects['get'].next(this.config);
    }
  }

  initConfig() {
    this.http.get(`${this.rootContext}/csrfToken`).mergeMap((csrfRes:any) => {
      this.csrfToken = csrfRes.json()['_csrf'];
      return this.http.get(`${this.rootContext}/dynamic/apiClientConfig?v=${new Date().getTime()}`);
    })
    .subscribe((res:any) => {
      this.config = this.extractData(res);
      this.config['csrfToken'] = this.csrfToken;
      console.log(`ConfigService, initialized. `);
      this.emitConfig();
    });
  }

  protected extractData(res: Response, parentField: any = null) {
    let body = res.json();
    if (parentField) {
        return body[parentField] || {};
    } else {
        return body || {};
    }
  }
}
