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

import { Component, Inject, ElementRef, ViewChild } from '@angular/core';
import { ConfigService, LoggerService, TranslationService, RecordService, BaseComponent, RecordSource, RecordResponseTable, RecordTableComponent } from '@researchdatabox/portal-ng-common';
import { RecordPropViewMetaDto, ReportResultDto, RecordPageDto, ReportFilterDto } from '@researchdatabox/sails-ng-common';
import { isEmpty as _isEmpty, set as _set, get as _get, isUndefined as _isUndefined } from 'lodash-es';
import { ModalDirective } from "ngx-bootstrap/modal";
import { DateTime } from 'luxon';

/**
 * Restore deleted records Component
 */
@Component({
    selector: 'deleted-records',
    templateUrl: './deleted-records.component.html',
    styleUrls: ['./deleted-records.component.scss'],
    standalone: false
})
export class DeletedRecordsComponent extends BaseComponent implements RecordSource {
  appName: string = 'deleted-records';
  private readonly deletedRecordDateFormat = 'dd/MM/yyyy hh:mm a';

  // Internal properties
  protected sysConfig: any;

  // State tracking
  private pageLoadPending = false;
  private pendingCriteria: { params: any; sort: string | undefined } | undefined;
  private appliedSort: string | undefined;
  @ViewChild(RecordTableComponent) private recordTable?: RecordTableComponent;
  initTracker: any = {resultsReturned: false};

  // Record filter properties
  recordsPerPage: number = 10;
  paginationMaxSize: number = 10;
  currentPageNumber: number = 1;
  filters: ReportFilterDto[] = [
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
      property: '',
    },
  ];
  sort: string | undefined;
  dropDownProperties: { [key: string]: { title: string, value: string }[] } = {
    'recordType': [{title: 'All', value: ''}]
  };

  // Filter values entered by user
  filterParams: any = {};

  // Record table properties
  tableHeaders: RecordPropViewMetaDto[] = [
    {
      label: "deleted-records-results-table-header-title",
      property: "title",
      template: "",
      hide: false,
      multivalue: false
    },
    {
      label: "deleted-records-results-table-header-created-date",
      property: "dateCreatedDisplay",
      template: "",
      hide: false,
      multivalue: false
    },
    {
      label: "deleted-records-results-table-header-modified-date",
      property: "dateModifiedDisplay",
      template: "",
      hide: false,
      multivalue: false
    },
    {
      label: "deleted-records-results-table-header-deleted-date",
      property: "dateDeletedDisplay",
      template: "",
      hide: false,
      multivalue: false
    },
  ];
  optTemplateData: any = {};
  showActions = [
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
  public async gotoPage(pageNum: number, params = this.getParams(), sort = this.sort): Promise<RecordPageDto> {
    if (this.pageLoadPending) {
      return this.deletedRecordsResult;
    }
    this.pageLoadPending = true;
    this.initTracker.resultsReturned = false;
    this.loadError = '';
    try {
      this.deletedRecordsResult = await this.getDeletedRecords(pageNum, params, sort);
      this.currentPageNumber = this.deletedRecordsResult.pageNum;
      this.appliedSort = sort;
    } catch (error) {
      // Initial load failures must reach BaseComponent's bootstrap error subject.
      if (!this.isReady) {
        throw error;
      }
      this.showLoadError(error, () => this.gotoPage(pageNum, params, sort));
    } finally {
      this.pageLoadPending = false;
      this.initTracker.resultsReturned = true;
    }
    const pending = this.pendingCriteria;
    this.pendingCriteria = undefined;
    if (pending) {
      return this.gotoPage(1, pending.params, pending.sort);
    }
    this.restoreAppliedSort();
    return this.deletedRecordsResult;
  }

  private restoreAppliedSort(): void {
    this.sort = this.appliedSort;
    // Retained rows must retain their sort indicator after a failed read.
    this.recordTable?.headerSortItems?.forEach(header => {
      const [variable, direction] = this.appliedSort?.split(':') ?? [];
      header.sort = header.variable === variable ? (direction === '-1' ? 'desc' : 'asc') : '';
    });
  }

  /**
   * Apply the filters.
   * @param event The click event data.
   */
  public async filter(event?: any) {
    if (this.loadPending) {
      return;
    }
    const params = this.getParams();
    if (this.pageLoadPending) {
      this.pendingCriteria = { params, sort: this.sort };
      return;
    }
    await this.gotoPage(1, params);
  }

  public async headerSortChanged(event: any, data: any) {
    if (this.loadPending) {
      this.restoreAppliedSort();
      return;
    }
    this.sort = `${event.variable}:${event.sort === 'desc' ? '-1' : '1'}`;
    await this.filter();
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
    this.destroyRecordModal?.hide();
    this.currentDestroyRecordModalOid = undefined;
  }

  public onDestroyRecordModalHidden(): void {
    this.isDestroyRecordModalShown = false;
  }

  public async confirmDestroyRecordModal(event: any) {
    if (_isUndefined(this.currentDestroyRecordModalOid)) {
      this.loggerService.error("Record oid was not set so cannot destroy record.");
      return;
    }
    const oid = this.currentDestroyRecordModalOid;
    const result = await this.recordService.destroyDeletedRecord(oid);
    this.loggerService.debug(`Record table action destroy result ${JSON.stringify(result)}.`);

    this.destroyRecordModal?.hide();
    this.currentDestroyRecordModalOid = undefined;

    await this.gotoPage(this.currentPageNumber);
  }

  protected async initComponent(): Promise<void> {
    this.sysConfig = await this.configService.getConfig();

    // Initialise settings from sys config
    this.recordsPerPage = this.getConfigProp('recordsPerPage', this.recordsPerPage);
    this.paginationMaxSize = this.getConfigProp('paginationMaxSize', this.paginationMaxSize);

    // Additional data required for the record-table component
    this.brandingAndPortalUrl = this.recordService.brandingAndPortalUrl;
    _set(this.optTemplateData, 'brandingAndPortalUrl', this.brandingAndPortalUrl);

    // populate record types
    const recordTypes: {
      name: string;
      packageType: string;
      searchFilters: [];
      searchable: boolean
    }[] = await this.recordService.getAllTypes();
    this.dropDownProperties['recordType'] = [{title: 'All', value: ''}];
    recordTypes.forEach(recordType => {
      this.dropDownProperties['recordType'].push({
        title: recordType.name,
        value: recordType.name,
      });
    });

    // Load the first page of records
    await this.gotoPage(1);
    this.loggerService.debug(`'${this.appName}' ready!`);
  }

  private async getDeletedRecords(pageNum: number, params = this.getParams(), sort = this.sort): Promise<ReportResultDto> {
    const paramText: string = _get(params, 'title', '')?.toString().trim();
    const paramRecordType: string = _get(params, 'recordType', '');

    const recordType = paramRecordType;
    const filterString = paramText || '';
    const filterMode = 'regex';

    const workflowState = '';
    const packageType = undefined;
    const filterFields = 'title';

    const records: RecordResponseTable = await this.recordService.getDeletedRecords(
      recordType, workflowState, pageNum, packageType, sort, filterFields, filterString, filterMode);

    return {
      recordsPerPage: this.recordsPerPage,
      records: records.items.map(record => this.formatDeletedRecord(record)),
      total: records.totalItems,
      pageNum,
    };
  }

  private formatDeletedRecord(record: any) {
    return {
      ...record,
      dateCreatedDisplay: this.formatDeletedRecordDate(record.dateCreated),
      dateModifiedDisplay: this.formatDeletedRecordDate(record.dateModified),
      dateDeletedDisplay: this.formatDeletedRecordDate(record.dateDeleted),
    };
  }

  private formatDeletedRecordDate(value: string | undefined): string {
    if (_isEmpty(value)) {
      return '';
    }

    const safeValue = value ?? '';
    const date = DateTime.fromISO(safeValue);
    return date.isValid ? date.toFormat(this.deletedRecordDateFormat) : safeValue;
  }

  private getParams() {
    const params: any = {};
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
