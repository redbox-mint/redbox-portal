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
import { Inject, Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler } from '@angular/common/http';
import * as _ from "lodash";

import { ConfigService } from './config.service';


/**
 * Interceptor for Authentication, CSRF, etc.
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 */

 @Injectable()
 export class AuthInterceptor implements HttpInterceptor {

  constructor(@Inject(ConfigService) private configService: ConfigService) {

  }

  intercept(req: HttpRequest<any>, next: HttpHandler) {
    let headers = {
      'X-Source': 'jsclient',
      'Content-Type': 'application/json;charset=utf-8'
    };
    if (!this.configService.isInitializing()) {
      _.set(headers, 'X-CSRF-Token', this.configService.csrfToken);
    }
    const authReq = req.clone({
      setHeaders: headers
    });

    // send cloned request with header to the next handler.
    return next.handle(authReq);
  }
 }