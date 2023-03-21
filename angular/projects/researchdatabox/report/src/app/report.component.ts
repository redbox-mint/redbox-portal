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
import { ConfigService, LoggerService, TranslationService, ReportService, BaseComponent, RecordPage } from '@researchdatabox/redbox-portal-core';
import { RecordSource, RecordPropViewMeta, Report, ReportResult } from '@researchdatabox/redbox-portal-core';
import { isEmpty as _isEmpty, set as _set, map as _map } from 'lodash-es';
/**
 * Report Component
 * 
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo B</a>
 */
@Component({
  selector: 'report',
  templateUrl: './report.component.html'
})
export class ReportComponent extends BaseComponent implements RecordSource {
  datePickerPlaceHolder: string = '';
  datePickerOpts: any;
  filterParams: any = {};
  initTracker: any = { reportLoaded: false, resultsReturned: false };
  report: Report = null as any;
  reportResult: ReportResult = null as any;
  tableHeaders: RecordPropViewMeta[] = null as any;
  appName:string = 'report';
  optTemplateData:any = {};
  reportName: string = '';
  reportParams: any = {};
  recordsPerPage: number = 10;

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

  async getPage(pageNum: number, params: any): Promise<RecordPage> {
    this.initTracker.resultsReturned = false;
    this.reportResult =  await this.reportService.getReportResult(this.reportName, pageNum, params, this.recordsPerPage);
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
    this.report = await this.reportService.getReportConfig(this.reportName);
    this.tableHeaders = this.report.columns;
    this.initTracker.reportLoaded = true;
    this.loggerService.debug(`'${this.appName}' ready!`); 
  }

  public filter(event?: any): void {
    
  }

  public getDownloadCSVUrl() {
    return '';
  }
}
