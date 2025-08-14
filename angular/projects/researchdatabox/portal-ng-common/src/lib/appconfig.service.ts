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

import { map, firstValueFrom } from 'rxjs';
import { Inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { APP_BASE_HREF } from '@angular/common';

import { ConfigService } from './config.service';
import { UtilityService } from './utility.service';
import { HttpClientService } from './httpClient.service';
import { LoggerService } from './logger.service';
import { merge as _merge } from 'lodash-es';

export interface AppConfig {
  schema: object;
  model: object;
  fieldOrder:string[];
}


/**
 * User-centric functions. 
 * 
 * Note: functions will be ported over as these are consumed by the apps/
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 * 
 */
@Injectable()
export class AppConfigService extends HttpClientService {

  private requestOptions:any = null as any;
  
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
    this.requestOptions = this.reqOptsJsonBodyOnly;
    this.enableCsrfHeader();
    _merge(this.requestOptions, {context: this.httpContext});
    return this;
  }

  

  public async getAppConfigForm(appConfigId:string): Promise<AppConfig> {
    let url = `${this.brandingAndPortalUrl}/appconfig/form/${appConfigId}`;
    const req = this.http.get<AppConfig>(url, {responseType: 'json', observe: 'body', context: this.httpContext});
    req.pipe(
      map((data:any) => {
        return data as AppConfig;
      })
    );
    let result = await firstValueFrom(req);
    return result;
  } 

  public async saveAppConfig(appConfigId:string, model:any): Promise<AppConfig> {
    let url = `${this.brandingAndPortalUrl}/appconfig/form/${appConfigId}`;
    const req = this.http.post<AppConfig>(url, model, {responseType: 'json', observe: 'body', context: this.httpContext});
    req.pipe(
      map((data:any) => {
        return data as AppConfig;
      })
    );
    let result = await firstValueFrom(req);
    return result;
  } 

  
}