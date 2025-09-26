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
import { map, firstValueFrom } from 'rxjs';
import { isEmpty as _isEmpty } from 'lodash-es';
import { HttpClientService } from './httpClient.service';
import { ConfigService } from './config.service';
import { UtilityService } from './utility.service';
import { LoggerService } from './logger.service';
import { ReportDto, ReportResultDto } from '@researchdatabox/sails-ng-common';

/**
 * Report Service
 * 
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo B</a>
 */
@Injectable()
export class ReportService extends HttpClientService {
  constructor(
    @Inject(HttpClient) protected override http: HttpClient, 
    @Inject(APP_BASE_HREF) public override rootContext: string,
    @Inject(UtilityService) protected override utilService: UtilityService,
    @Inject(ConfigService) protected override configService: ConfigService,
    @Inject(LoggerService) private loggerService: LoggerService
  ) {
    super(http, rootContext, utilService, configService);
  }

  /**
   * Method to retrieve the report configuration. 
   * 
   * Note: this is currently using the `/admin` endpoint
   * 
   * @param name 
   */
  public async getReportConfig(name: string): Promise<any> {
    if (_isEmpty(name)) {
      this.loggerService.error(`getReportConfig() -> Parameter 'name' is empty!`);
      throw new Error('Report Config name is empty!');
    }
    const req = this.http.get(`${this.brandingAndPortalUrl}/admin/getReport?name=${name}`, this.reqOptsJsonBodyOnly);
    req.pipe(
      map((data:any) => {
        return data as ReportDto
      })
    );
    return firstValueFrom(req);
  }
  /**
   * Retrieves the ReportsResult page
   * 
   */
  public async getReportResult(name: string, pageNum:number, params:any, rows:number = 10): Promise<any> {
    if (_isEmpty(name)) {
      this.loggerService.error(`getReportResult() -> Parameter 'name' is empty!`);
      throw new Error('Report name is empty!');
    }
    let start = (pageNum-1) * rows;
    var url = `${this.brandingAndPortalUrl}/admin/getReportResults?name=${name}&start=${start}&rows=${rows}`;
    for(var key in params) {
      url=url+'&'+key+"="+params[key];
    }
    const req = this.http.get(url, this.reqOptsJsonBodyOnly);
    req.pipe(
      map((data:any) => {
        return data as ReportResultDto
      })
    );
    return await firstValueFrom(req);
  }

  public async getDynamicImportAdminReportTemplates(reportName: string){
    const path = ['dynamicAsset', 'adminReportTemplates', reportName?.toString()];
    const result = await this.utilService.getDynamicImport(this.brandingAndPortalUrl, path);
    return result;
  }
}
