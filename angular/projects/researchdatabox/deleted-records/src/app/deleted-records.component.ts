// Copyright (c) 2024 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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
import {
  ConfigService,
  LoggerService,
  TranslationService,
  RecordService,
  BaseComponent,
  RecordSource
} from '@researchdatabox/portal-ng-common';
import {RecordPropViewMetaDto, ReportDto, ReportResultDto, RecordPageDto } from '@researchdatabox/sails-ng-common';
import { isEmpty as _isEmpty, set as _set, map as _map } from 'lodash-es';
import { DateTime } from 'luxon';
import {ReportFilterDto} from "@researchdatabox/sails-ng-common/dist/report.model";

/**
 * Restore Records Component
 */
@Component({
  selector: 'deleted-records',
  templateUrl: './deleted-records.component.html',
  styleUrls: ['./deleted-records.component.scss']
})
export class DeletedRecordsComponent extends BaseComponent implements RecordSource {
  appName: string = 'deleted-records';

  // Internal properties
  protected sysConfig: any;

  // State tracking
  initTracker: any = {resultsReturned: false};

  // Record filter properties
  datePickerOpts: any;
  datePickerPlaceHolder: string = '';
  recordsPerPage: number = 10;
  paginationMaxSize: number = 10;
  // See https://moment.github.io/luxon/docs/manual/zones.html#specifying-a-zone
  dateParamTz: string = 'utc';
  filters: ReportFilterDto[] | null;

  // Filter values entered by user
  filterParams: any = {};

  // Record list properties
  tableHeaders: RecordPropViewMetaDto[] = null as any;
  optTemplateData: any = {};

  // Record list data
  deletedRecordsResult: ReportResultDto = null as any;

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(RecordService) protected recordService: RecordService,
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(ElementRef) elementRef: ElementRef
  ) {
    super();
    this.initDependencies = [this.translationService, this.recordService];
    this.loggerService.debug(`'${this.appName}' waiting for deps to init...`);
  }

  getCurrentPage() {
    return this.deletedRecordsResult;
  }

  async gotoPage(pageNum: number): Promise<RecordPageDto> {
    this.initTracker.resultsReturned = false;
    this.deletedRecordsResult = await this.getDeletedRecords();
    this.initTracker.resultsReturned = true;
    return this.deletedRecordsResult;
  }

  protected async initComponent(): Promise<void> {
    this.sysConfig = await this.configService.getConfig();

    // Initialise settings from sys config
    this.datePickerOpts = this.getConfigProp('datePickerOpts', {
      dateInputFormat: 'DD/MM/YYYY',
      containerClass: 'theme-dark-blue'
    });
    this.datePickerPlaceHolder = this.getConfigProp('datePickerPlaceHolder', 'dd/mm/yyyy');
    this.recordsPerPage = this.getConfigProp('recordsPerPage', this.recordsPerPage);
    this.dateParamTz = this.getConfigProp('dateParamTz', this.dateParamTz);
    this.paginationMaxSize = this.getConfigProp('paginationMaxSize', this.paginationMaxSize);

    // Additional data required for the record-table component
    this.tableHeaders = [
      {
        label: "Id",
        property: "oid",
        hide: true,
        template: '',
        multivalue: false
      },
      {
        label: "Title",
        property: "title",
        template: "<a href='${ data.optTemplateData.brandingAndPortalUrl }/record/view/${ data.oid }'>${ data.title }</a>",
        // exportTemplate: "${data.title}"
        hide: false,
        multivalue: false
      },
      {
        label: "External URL",
        property: "reportExternalURL",
        template: "TODO",
        // exportTemplate: "${ data.optTemplateData.brandingAndPortalUrl }/record/view/${ data.oid }",
        hide: true,
        multivalue: false
      },
      {
        label: "Date Created",
        property: "dateCreated",
        template: "${ DateTime.fromISO(data.dateCreated).toFormat('dd/MM/yyyy hh:mm a') }",
        hide: false,
        multivalue: false
      },
      {
        label: "Created By",
        property: "createdBy",
        template: "TODO",
        hide: false,
        multivalue: false
      },
      {
        label: "Date Deleted",
        property: "dateDeleted",
        template: "${ DateTime.fromISO(data.dateDeleted).toFormat('dd/MM/yyyy hh:mm a') }",
        hide: false,
        multivalue: false
      },
      {
        label: "Deleted By",
        property: "deletedBy",
        template: "TODO",
        hide: false,
        multivalue: false
      },
    ];
    this.filters = [
      {
        paramName: "dateObjectModifiedRange",
        type: "date-range",
        message: "Filter by date modified",
        property: "",
      },
      {
        paramName: "dateObjectCreatedRange",
        type: "date-range",
        message: "Filter by date created",
        property: "",
      },
      {
        "paramName": "title",
        "type": "text",
        "property": "title",
        "message": "Filter by title"
      },
      {
        paramName: "recordType",
        type: 'dropdown',
        message: "Filter by record type",
        property: "",
      },
    ];
    this.brandingAndPortalUrl = this.recordService.brandingAndPortalUrl;
    _set(this.optTemplateData, 'brandingAndPortalUrl', this.brandingAndPortalUrl);

    // Load the first page of records
    this.gotoPage(1);
    this.loggerService.debug(`'${this.appName}' ready!`);
  }

  public async filter(event?: any) {
    await this.gotoPage(1);
  }

  public getDownloadCSVUrl() {
    let url = `${this.brandingAndPortalUrl}/admin/downloadReportCSV?name=${this.reportName}`;
    let params = this.getParams();
    for (var key in params) {
      url = url + '&' + key + "=" + params[key];
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

  private async getDeletedRecords() {
    const workflowState = '';
    const recordType = '';
    const pageNumber = '';
    const packageType = '';
    const sort = '';
    const filterFields = '';
    const filterString = '';
    const filterMode = '';
    const records = await this.recordService.getDeletedRecords(recordType, workflowState, pageNumber, packageType, sort, filterFields, filterString, filterMode);
  }

  private getParams() {
    var params: any = {};
    for (let filter of this.filters) {
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
        if (!_isEmpty(paramValue)) {
          params[filter.paramName] = paramValue;
        }
      }
    }
    return params;
  }

  private getConfigProp(name: string, defaultValue: any) {
    return ConfigService._getAppConfigProperty(this.sysConfig, this.appName, name, defaultValue);
  }
}
