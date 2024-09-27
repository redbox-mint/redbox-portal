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

import {Component, Inject, ElementRef, ViewChild} from '@angular/core';
import {
  ConfigService,
  LoggerService,
  TranslationService,
  RecordService,
  BaseComponent,
  RecordSource
} from '@researchdatabox/portal-ng-common';
import { RecordPropViewMetaDto, ReportResultDto, RecordPageDto } from '@researchdatabox/sails-ng-common';
import { isEmpty as _isEmpty, set as _set, get as _get } from 'lodash-es';
import { ReportFilterDto } from "@researchdatabox/sails-ng-common/dist/report.model";
import { RecordResponseTable } from "../../../portal-ng-common/src/lib/dashboard-models";
import { ModalDirective } from "ngx-bootstrap/modal";
import * as _ from "lodash";

/**
 * Restore deleted records Component
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
  recordsPerPage: number = 10;
  paginationMaxSize: number = 10;
  currentPageNumber: number = 1;
  filters: ReportFilterDto[] = [];
  sort: string | undefined;

  // Filter values entered by user
  filterParams: any = {};

  // Record table properties
  tableHeaders: RecordPropViewMetaDto[] = null as any;
  optTemplateData: any = {};
  showActions = [
    // TODO: destroy might need a confirmation modal / popup?
    {name: 'restore', classes: 'btn-primary', label: 'action-restore'},
    {name: 'destroy', classes: 'btn-danger', label: 'action-destroy'},
  ]

  // Record list data
  deletedRecordsResult: ReportResultDto = null as any;

  // destroy record confirm modal
  currentDestroyRecordModalOid: string | undefined;
  isDestroyRecordModalShown: boolean = false;
  @ViewChild('destroyRecordModal') destroyRecordModal?: ModalDirective;

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

  /**
   * Get the data for the current page.
   * Used by RecordTableComponent.
   */
  public getCurrentPage() {
    return this.deletedRecordsResult;
  }

  /**
   * Load the data for the given page.
   * Used by RecordTableComponent.
   * @param pageNum Load the data for this page nnumber.
   */
  public async gotoPage(pageNum: number): Promise<RecordPageDto> {
    this.currentPageNumber = pageNum;
    this.initTracker.resultsReturned = false;
    this.deletedRecordsResult = await this.getDeletedRecords();
    this.initTracker.resultsReturned = true;
    return this.deletedRecordsResult;
  }

  /**
   * Apply the filters.
   * @param event The click event data.
   */
  public async filter(event?: any) {
    await this.gotoPage(1);
  }

  public async headerSortChanged(event: any, data: any) {
    this.sort = `${event.variable}:${event.sort === 'desc' ? '-1' : '1'}`;
    await this.gotoPage(1);
  }

  public async recordTableAction(event: any, data: any, actionName: string) {
    const oid = data.oid;
    if (actionName === 'restore') {
      const result = await this.recordService.restoreDeletedRecord(oid);
      this.loggerService.debug(`Record table action ${actionName} data ${JSON.stringify(data)} result ${JSON.stringify(result)}.`);
      await this.gotoPage(this.currentPageNumber);

    } else if (actionName === 'destroy') {
      this.currentDestroyRecordModalOid = oid;
      this.showDestroyRecordModal();

    } else {
      this.loggerService.error(`Unknown record table action name '${actionName}' data ${JSON.stringify(data)}.`);
      return;
    }
  }

  public showDestroyRecordModal(): void {
    this.isDestroyRecordModalShown = true;
    this.destroyRecordModal?.show();
  }

  public hideDestroyRecordModal(): void {
    if(!_.isUndefined(this.destroyRecordModal)) {
      this.destroyRecordModal.hide();
      this.currentDestroyRecordModalOid = undefined;
    }
  }

  public onDestroyRecordModalHidden(): void {
    this.isDestroyRecordModalShown = false;
  }

  public async confirmDestroyRecordModal(event: any){
    if(_.isUndefined(this.currentDestroyRecordModalOid)){
      this.loggerService.error("Record oid was not set so cannot destroy record.");
      return;
    }
    const oid = this.currentDestroyRecordModalOid;
    const result = await this.recordService.destroyDeletedRecord(oid);
    this.loggerService.debug(`Record table action destroy result ${JSON.stringify(result)}.`);
    this.currentDestroyRecordModalOid = undefined;
    await this.gotoPage(this.currentPageNumber);
  }

  protected async initComponent(): Promise<void> {
    this.sysConfig = await this.configService.getConfig();

    // Initialise settings from sys config
    this.recordsPerPage = this.getConfigProp('recordsPerPage', this.recordsPerPage);
    this.paginationMaxSize = this.getConfigProp('paginationMaxSize', this.paginationMaxSize);

    // Additional data required for the record-table component
    this.tableHeaders = [
      {
        label: "deleted-records-results-table-header-title",
        property: "title",
        template: "${ data.title }",
        hide: false,
        multivalue: false
      },
      {
        label: "deleted-records-results-table-header-created-date",
        property: "dateCreated",
        template: "${ DateTime.fromISO(data.dateCreated).toFormat('dd/MM/yyyy hh:mm a') }",
        hide: false,
        multivalue: false
      },
      {
        label: "deleted-records-results-table-header-modified-date",
        property: "dateModified",
        template: "${ DateTime.fromISO(data.dateModified).toFormat('dd/MM/yyyy hh:mm a') }",
        hide: false,
        multivalue: false
      },
      {
        label: "deleted-records-results-table-header-deleted-date",
        property: "dateDeleted",
        template: "${ DateTime.fromISO(data.dateDeleted).toFormat('dd/MM/yyyy hh:mm a') }",
        hide: false,
        multivalue: false
      },
    ];
    this.filters = [
      {
        paramName: "title",
        type: "text",
        message: "Filter by title",
        property: "title",
      },
      {
        paramName: "recordType",
        type: 'drop-down',
        message: "Filter by record type",
        property: 'All;RDMP;Data Record',
      },
    ];
    this.brandingAndPortalUrl = this.recordService.brandingAndPortalUrl;
    _set(this.optTemplateData, 'brandingAndPortalUrl', this.brandingAndPortalUrl);

    // Load the first page of records
    this.gotoPage(1);
    this.loggerService.debug(`'${this.appName}' ready!`);
  }

  private async getDeletedRecords(): Promise<ReportResultDto> {
    const params = this.getParams();
    const paramText: string = _get(params, 'title', '')?.toString().trim();
    const paramRecordType: string = _get(params, 'recordType', '');

    const recordTypeMap: { [key: string]: string } = {
      'All': '',
      'RDMP': 'rdmp',
      'Data Record': 'dataRecord',
    };

    const recordType = recordTypeMap[paramRecordType];
    const filterString = paramText || '';
    const filterMode = 'regex';

    const workflowState = '';
    const packageType = undefined;
    const filterFields = undefined;

    const records: RecordResponseTable = await this.recordService.getDeletedRecords(
      recordType, workflowState, this.currentPageNumber, packageType, this.sort, filterFields, filterString, filterMode);

    return {
      recordsPerPage: this.recordsPerPage,
      records: records.items,
      total: records.totalItems,
      pageNum: this.currentPageNumber,
    };
  }

  private getParams() {
    var params: any = {};
    for (let filter of this.filters) {
      let paramValue = this.filterParams[filter.paramName];
      if (!_isEmpty(paramValue)) {
        params[filter.paramName] = paramValue;
      }
    }
    return params;
  }

  private getConfigProp(name: string, defaultValue: any) {
    return ConfigService._getAppConfigProperty(this.sysConfig, this.appName, name, defaultValue);
  }
}
