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
import { ConfigService, LoggerService, TranslationService, RecordService, BaseComponent, RecordSource, RecordResponseTable, RecordActionResult } from '@researchdatabox/portal-ng-common';
import { RecordPropViewMetaDto, ReportResultDto, RecordPageDto, ReportFilterDto } from '@researchdatabox/sails-ng-common';
import { isEmpty as _isEmpty, set as _set, get as _get, isUndefined as _isUndefined } from 'lodash-es';
import { ModalDirective } from "ngx-bootstrap/modal";
import { DateTime } from 'luxon';
import { HttpErrorResponse } from '@angular/common/http';

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

  actionPending = false;
  actionMessage = '';
  actionRefreshError = '';
  actionNeedsRefresh = false;
  private retryRestoreOid?: string;

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
    if (this.actionPending || this.actionNeedsRefresh || this.isDestroyRecordModalShown) {
      return;
    }
    this.actionMessage = '';
    this.actionRefreshError = '';
    this.retryRestoreOid = undefined;
    if (actionName === 'restore') {
      await this.mutateDeletedRecord('restore', data.oid);
    } else if (actionName === 'destroy') {
      this.currentDestroyRecordModalOid = data.oid;
      this.showDestroyRecordModal();
    } else {
      this.loggerService.error(`Unknown record table action name '${actionName}'.`);
    }
  }

  public showDestroyRecordModal(): void {
    this.isDestroyRecordModalShown = true;
    this.destroyRecordModal?.show();
  }

  public hideDestroyRecordModal(): void {
    if (this.actionPending) {
      return;
    }
    this.closeDestroyRecordModal();
  }

  private closeDestroyRecordModal(): void {
    this.destroyRecordModal?.hide();
    this.currentDestroyRecordModalOid = undefined;
    this.isDestroyRecordModalShown = false;
  }

  public onDestroyRecordModalHidden(): void {
    this.isDestroyRecordModalShown = false;
  }

  public async confirmDestroyRecordModal(event: any) {
    if (!_isUndefined(this.currentDestroyRecordModalOid)) {
      await this.mutateDeletedRecord('destroy', this.currentDestroyRecordModalOid);
    }
  }

  public get canRetryRestore(): boolean {
    return !!this.retryRestoreOid && !this.actionNeedsRefresh;
  }

  public async retryRestore(): Promise<void> {
    if (this.retryRestoreOid) {
      await this.mutateDeletedRecord('restore', this.retryRestoreOid);
    }
  }

  private async mutateDeletedRecord(action: 'restore' | 'destroy', oid: string): Promise<void> {
    if (this.actionPending || this.actionNeedsRefresh) {
      return;
    }
    this.actionPending = true;
    this.actionMessage = '';
    this.actionRefreshError = '';
    this.retryRestoreOid = undefined;
    const label = action === 'restore' ? 'Restore' : 'Destroy';
    try {
      let result: RecordActionResult;
      try {
        result = action === 'restore'
          ? await this.recordService.restoreDeletedRecord(oid)
          : await this.recordService.destroyDeletedRecord(oid);
      } catch (error) {
        // Auth/CSRF policies reject before mutation. Server/transport failures
        // can happen after a write; never interpret them as a rollback.
        if (error instanceof HttpErrorResponse && [400, 401, 403].includes(error.status)) {
          this.actionMessage = `${label} was refused for record ${oid}. Check the request and your permissions, and sign in again or refresh the page before retrying.`;
          this.retryRestoreOid = action === 'restore' ? oid : undefined;
        } else {
          this.unknownActionOutcome(label, oid);
        }
        return;
      }

      // Only an explicit result can certify success. A missing/malformed body
      // is uncertain even when the HTTP request itself completed.
      if (result?.success !== true) {
        if (result?.success === false) {
          this.actionMessage = `${label} was unsuccessful for record ${oid}. ${typeof result.message === 'string' ? result.message : ''} Check the record state and resolve the problem before retrying.`;
          this.retryRestoreOid = action === 'restore' ? oid : undefined;
        } else {
          this.unknownActionOutcome(label, oid);
        }
        return;
      }

      if (action === 'destroy') {
        this.closeDestroyRecordModal();
      }
      // Mutation succeeded. Refresh failure must not offer another mutation.
      this.actionNeedsRefresh = true;
      this.actionMessage = `${label} succeeded for record ${oid}.`;
      await this.refreshAfterAction();
    } finally {
      this.actionPending = false;
    }
  }

  private unknownActionOutcome(label: string, oid: string): void {
    this.actionNeedsRefresh = true;
    this.actionMessage = `${label} outcome is unknown for record ${oid}. The action may have completed. Refresh the list and verify the record state before choosing another action.`;
  }

  public async refreshActionList(): Promise<void> {
    if (this.actionPending || !this.actionNeedsRefresh) {
      return;
    }
    this.actionPending = true;
    try {
      await this.refreshAfterAction();
    } finally {
      this.actionPending = false;
    }
  }

  private async refreshAfterAction(): Promise<void> {
    try {
      await this.gotoPage(this.currentPageNumber);
      this.actionNeedsRefresh = false;
      this.closeDestroyRecordModal();
      this.actionRefreshError = '';
      this.actionMessage += ' List refreshed. Verify the record state before choosing another action.';
    } catch (error) {
      // Preserve the successful/unknown mutation message across refresh retries.
      this.actionRefreshError = 'Unable to refresh the list. Refresh the list before choosing another action.';
    } finally {
      this.initTracker.resultsReturned = true;
    }
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

  private async getDeletedRecords(): Promise<ReportResultDto> {
    const params = this.getParams();
    const paramText: string = _get(params, 'title', '')?.toString().trim();
    const paramRecordType: string = _get(params, 'recordType', '');

    const recordType = paramRecordType;
    const filterString = paramText || '';
    const filterMode = 'regex';

    const workflowState = '';
    const packageType = undefined;
    const filterFields = 'title';

    const records: RecordResponseTable = await this.recordService.getDeletedRecords(
      recordType, workflowState, this.currentPageNumber, packageType, this.sort, filterFields, filterString, filterMode);

    return {
      recordsPerPage: this.recordsPerPage,
      records: records.items.map(record => this.formatDeletedRecord(record)),
      total: records.totalItems,
      pageNum: this.currentPageNumber,
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
