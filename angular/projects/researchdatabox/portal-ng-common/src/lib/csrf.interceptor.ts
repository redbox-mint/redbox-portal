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
import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpContextToken } from '@angular/common/http';
import { get as _get, isEmpty as _isEmpty, set as _set, clone as _clone } from 'lodash-es';


export const RB_HTTP_INTERCEPTOR_AUTH_CSRF = new HttpContextToken(() => '');
export const RB_HTTP_INTERCEPTOR_SKIP_JSON_CONTENT_TYPE = new HttpContextToken(() => false);
/**
 * Interceptor for CSRF, etc.
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 */

 @Injectable()
 export class CsrfInterceptor implements HttpInterceptor {
  private headers: any;
  constructor() {
    this.headers = {
      'X-Source': 'jsclient',
      'Content-Type': 'application/json;charset=utf-8'
    };
  }

  intercept(req: HttpRequest<any>, next: HttpHandler) {
    const headers = _clone(this.headers);
    const csrfToken = req.context.get(RB_HTTP_INTERCEPTOR_AUTH_CSRF);
    const skipJsonContentType = req.context.get(RB_HTTP_INTERCEPTOR_SKIP_JSON_CONTENT_TYPE);
    
    if (!_isEmpty(csrfToken) && _isEmpty(_get(this.headers, 'X-CSRF-Token'))) {
      _set(headers, 'X-CSRF-Token', csrfToken);
    }
    
    // For FormData uploads, don't set the JSON content-type
    if (skipJsonContentType || req.body instanceof FormData) {
      delete headers['Content-Type'];
    }
    
    const authReq = req.clone({
      setHeaders: headers
    });

    // send cloned request with header to the next handler.
    return next.handle(authReq);
  }
 }