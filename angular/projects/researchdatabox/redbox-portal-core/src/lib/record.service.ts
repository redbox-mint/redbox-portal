// Copyright (c) 2023 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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
import { APP_BASE_HREF } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from './config.service';
import { UtilityService } from './utility.service';
import { LoggerService } from './logger.service';
import { HttpClientService } from './httpClient.service';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Record Service
 * 
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 */
@Injectable()
export class RecordService extends HttpClientService {

  constructor( 
    @Inject(HttpClient) protected override http: HttpClient, 
    @Inject(APP_BASE_HREF) public override rootContext: string,
    @Inject(UtilityService) protected override utilService: UtilityService,
    @Inject(ConfigService) protected override configService: ConfigService,
    @Inject(LoggerService) private loggerService: LoggerService
  ) {
    super(http, rootContext, utilService, configService);
  }

  public override async waitForInit(): Promise<any> {
    await super.waitForInit();
    this.enableCsrfHeader();
    this.loggerService.debug('waitForInit RecordService');
    return this;
  }
  
  // protected getOptions(headersObj: any) {
  //   let headers = new Headers(headersObj);
  //   return new RequestOptions({ headers: headers });
  // }

  // protected getOptionsClient(headersObj: any = {}) {
  //   headersObj['X-Source'] = 'jsclient';
  //   headersObj['Content-Type'] = 'application/json;charset=utf-8';
  //   headersObj['X-CSRF-Token'] = this.config.csrfToken;

  //   return this.getOptions(headersObj);
  // }

  protected extractData(res: any, parentField: any = null) {
    let body = res;
    if (parentField) {
        console.log(body);
        return body[parentField] || {};
    } else {
        return body || {};
    }
  }

  async getWorkflowSteps(name: string) {
    let url = `${this.brandingAndPortalUrl}/record/wfSteps/${name}`;
    const result$ = this.http.get(url).pipe(map(res => res));
    let result = await firstValueFrom(result$);
    //console.log(result);
    return this.extractData(result, '0');
    // return this.http.get(`${this.brandingAndPortalUrl}/record/wfSteps/${name}`, this.getOptionsClient())
    // .toPromise()
    // .then((res:any) => this.extractData(res));
  }

}
