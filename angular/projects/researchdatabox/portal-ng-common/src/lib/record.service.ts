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

import { map, firstValueFrom } from 'rxjs';
import { Injectable, Inject } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from './config.service';
import { UtilityService } from './utility.service';
import { LoggerService } from './logger.service';
import { HttpClientService } from './httpClient.service';
import { merge as _merge } from 'lodash-es';

export interface RecordTypeConf {
  name: string;
}
/**
 * Record Service
 * 
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 */
@Injectable()
export class RecordService extends HttpClientService {
  private requestOptions:any = null as any;

  constructor( 
    @Inject(HttpClient) protected override http: HttpClient, 
    @Inject(APP_BASE_HREF) public override rootContext: string,
    @Inject(UtilityService) protected override utilService: UtilityService,
    @Inject(ConfigService) protected override configService: ConfigService,
    @Inject(LoggerService) private loggerService: LoggerService
  ) {
    super(http, rootContext, utilService, configService);
    this.requestOptions = {responseType: 'json', observe: 'body'};
  }

  public override async waitForInit(): Promise<any> {
    await super.waitForInit();
    this.enableCsrfHeader();
    _merge(this.requestOptions, {context: this.httpContext})
    return this;
  }

  async getAllTypes(): Promise<any> {
    const req = this.http.get(`${this.brandingAndPortalUrl}/record/type/`, this.requestOptions);
    req.pipe(
      map((data:any) => {
        return data as RecordTypeConf
      })
    );
    return firstValueFrom(req);
  }

}
