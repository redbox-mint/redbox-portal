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

import { Component, Inject, ElementRef } from '@angular/core';
import { ConfigService, LoggerService, TranslationService, ReportService, BaseComponent } from '@researchdatabox/portal-ng-common';
import { RecordSource } from '@researchdatabox/portal-ng-common';
import {  RecordPropViewMetaDto, ReportDto, ReportResultDto, RecordPageDto } from '@researchdatabox/sails-ng-common';
import { isEmpty as _isEmpty, set as _set, map as _map } from 'lodash-es';
import { DateTime } from 'luxon';
/**
 * Report Component
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo B</a>
 */
@Component({
  selector: 'report',
  templateUrl: './report.component.html',
  styleUrls: ['./report.component.scss']
})
export class ReportComponent extends BaseComponent implements RecordSource {
  datePickerPlaceHolder: string = '';
  datePickerOpts: any;
  filterParams: any = {};
  initTracker: any = { reportLoaded: false, resultsReturned: false };
  report: ReportDto = null as any;
  reportResult: ReportResultDto = null as any;
  tableHeaders: RecordPropViewMetaDto[] = null as any;
  appName:string = 'report';
  optTemplateData:any = {};
  reportName: string = '';
  reportParams: any = {};
  recordsPerPage: number = 10;
  paginationMaxSize: number = 10;
  // See https://moment.github.io/luxon/docs/manual/zones.html#specifying-a-zone
  dateParamTz: string = 'utc';

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(ReportService) protected reportService: ReportService,
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(ElementRef) elementRef: ElementRef
  ) {
    super();
    this.initDependencies = [this.translationService, this.reportService];
    this.reportName = elementRef.nativeElement.getAttribute('reportName');
    this.loggerService.debug(`'${this.appName} - ${this.reportName}' waiting for deps to init...`);
  }

  getCurrentPage() {
    return this.reportResult;
  }

  async gotoPage(pageNum: number): Promise<RecordPageDto> {
    this.initTracker.resultsReturned = false;
    this.reportResult =  await this.reportService.getReportResult(this.reportName, pageNum, this.getParams(), this.recordsPerPage);
    this.initTracker.resultsReturned = true;
    return this.reportResult;
  }

  protected async initComponent(): Promise<void> {
    const sysConfig = await this.configService.getConfig();
    const defaultDatePickerOpts = { dateInputFormat: 'DD/MM/YYYY', containerClass: 'theme-dark-blue' };
    const defaultDatePickerPlaceHolder = 'dd/mm/yyyy';
    this.datePickerOpts = ConfigService._getAppConfigProperty(sysConfig, this.appName, 'datePickerOpts', defaultDatePickerOpts);
    this.datePickerPlaceHolder = ConfigService._getAppConfigProperty(sysConfig, this.appName, 'datePickerPlaceHolder', defaultDatePickerPlaceHolder);
    this.brandingAndPortalUrl = this.reportService.brandingAndPortalUrl;
    _set(this.optTemplateData, 'brandingAndPortalUrl', this.brandingAndPortalUrl);
    this.recordsPerPage = ConfigService._getAppConfigProperty(sysConfig, this.appName, 'recordsPerPage', this.recordsPerPage);
    this.dateParamTz = ConfigService._getAppConfigProperty(sysConfig, this.appName, 'dateParamTz', this.dateParamTz);
    this.paginationMaxSize = ConfigService._getAppConfigProperty(sysConfig, this.appName, 'paginationMaxSize', this.paginationMaxSize);
    this.report = await this.reportService.getReportConfig(this.reportName);
    this.tableHeaders = this.report.columns;
    this.initTracker.reportLoaded = true;
    this.gotoPage(1);
    this.loggerService.debug(`'${this.appName}' ready!`);
  }

  public async filter(event?: any) {
    await this.gotoPage(1);
  }

  public getDownloadCSVUrl() {
    let url = `${this.brandingAndPortalUrl}/admin/downloadReportCSV?name=${this.reportName}`;
    let params = this.getParams();
    for(var key in params) {
      url=url+'&'+key+"="+params[key];
    }
    return url;
  }

  public getLuxonDateFromJs(srcDate: Date, tz: string, mode: string) {
    if (mode == 'floor') {
      srcDate.setHours(0, 0, 0, 0);
    } else if (mode == 'ceil') {
      srcDate.setHours(23, 59, 59, 999);
    }
    return DateTime.fromJSDate(srcDate, {zone: tz});
  }

  public getParams() {
    var params:any = {};
    for(let filter of this.report.filter) {
      if (filter.type == 'date-range') {
        const fromDateJs = this.filterParams[filter.paramName + "_fromDate"];
        const toDateJs = this.filterParams[filter.paramName + "_toDate"];
        var fromDate = fromDateJs ? this.getLuxonDateFromJs(fromDateJs, this.dateParamTz, 'floor') : null;
        var toDate = toDateJs ? this.getLuxonDateFromJs(toDateJs, this.dateParamTz, 'ceil') : null;

        if (fromDate != null) {
          params[filter.paramName + "_fromDate"] = fromDate.toISO();
        }
        if (toDate != null) {
          params[filter.paramName + "_toDate"] = toDate.toISO();
        }
      } else {
        let paramValue = this.filterParams[filter.paramName];
        if(!_isEmpty(paramValue)) {
         params[filter.paramName] = paramValue;
        }
      }
    }
    return params;
  }

  public async recordTableAction(event: any, data: any, actionName: string) {
    console.log('recordTableAction', arguments);
  }

  public async headerSortChanged(event: any, data: any) {
    console.log('headerSortChanged', arguments);
  }
}
