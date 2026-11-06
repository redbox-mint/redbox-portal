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

import { AdminDateService } from '@researchdatabox/portal-ng-common';
import { Component, Inject, ElementRef, ViewChild, inject } from '@angular/core';
import { ConfigService, LoggerService, TranslationService, RecordService, BaseComponent, RecordSource, RecordResponseTable, RecordActionResult, RecordTableComponent } from '@researchdatabox/portal-ng-common';
import { RecordPropViewMetaDto, ReportResultDto, RecordPageDto, ReportFilterDto } from '@researchdatabox/sails-ng-common';
import { isEmpty as _isEmpty, set as _set, get as _get, isUndefined as _isUndefined } from 'lodash-es';
import { HttpErrorResponse } from '@angular/common/http';

interface DeletedRecordTableHeader extends RecordPropViewMetaDto {
  sortProperty: string;
}

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
  readonly adminDates = inject(AdminDateService);
  appName: string = 'deleted-records';

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
    { paramName: 'deletedWithin', type: 'drop-down', message: 'admin-deleted-within', property: '' },
    { paramName: 'deletedBy', type: 'text', message: 'admin-deleted-by', property: '' },
  ];
  sort: string | undefined;
  dropDownProperties: { [key: string]: { title: string, value: string }[] } = {
    'deletedWithin': [{ title: 'admin-deleted-any-time', value: '' }, { title: 'admin-deleted-last-7', value: '7' }, { title: 'admin-deleted-last-30', value: '30' }],
    'recordType': [{title: 'admin-all-record-types', value: ''}]
  };

  // Filter values entered by user
  filterParams: any = { title: '', recordType: '', deletedWithin: '', deletedBy: '' };

  // Record table properties
  tableHeaders: DeletedRecordTableHeader[] = [
    {
      label: "deleted-records-results-table-header-title",
      property: "title",
      sortProperty: "deletedRecordMetadata.metadata.title",
      template: "",
      hide: false,
      multivalue: false
    },
    { label: 'export-record-type', property: 'recordType', sortProperty: '', template: '', hide: false, multivalue: false, sortable: false },
    {
      label: "admin-deleted-created",
      property: "dateCreatedDisplay",
      sortProperty: "deletedRecordMetadata.dateCreated",
      template: "",
      hide: false,
      multivalue: false
    },
    {
      label: "admin-deleted-modified",
      property: "dateModifiedDisplay",
      sortProperty: "deletedRecordMetadata.lastSaveDate",
      template: "",
      hide: false,
      multivalue: false
    },
    {
      label: "admin-deleted-deleted",
      property: "dateDeletedDisplay",
      sortProperty: "dateDeleted",
      template: "",
      hide: false,
      multivalue: false
    },
    { label: 'admin-deleted-by', property: 'deletedBy', sortProperty: '', template: '', hide: false, multivalue: false, sortable: false },
  ];
  optTemplateData: any = {};
  showActions = [
    {name: 'restore', classes: 'btn-outline-secondary', label: 'action-restore'},
    {name: 'destroy', classes: 'btn-danger', label: 'action-destroy'},
  ]

  // Record list data
  deletedRecordsResult: ReportResultDto = null as any;

  selectedRecords = new Map<string, { oid: string; revision: number }>();
  bulkDestroy = false;
  bulkResults: { oid: string; status: string; reason: string }[] = [];
  get selectionDisabled(): boolean {
    return this.actionPending || this.actionNeedsRefresh || this.pageLoadPending || this.loadPending || this.isDestroyRecordModalShown;
  }
  get allSelected(): boolean {
    return !!this.deletedRecordsResult?.records.length && this.deletedRecordsResult.records.every((row: any) => this.selectedRecords.has(row.oid));
  }
  toggleRecord(row: any, checked: boolean): void {
    if (this.selectionDisabled) return;
    if (checked && this.selectedRecords.size < 100) this.selectedRecords.set(row.oid, { oid: row.oid, revision: row.revision });
    else this.selectedRecords.delete(row.oid);
  }
  togglePage(checked: boolean): void {
    if (this.selectionDisabled) return;
    this.selectedRecords.clear();
    if (checked) this.deletedRecordsResult.records.slice(0, 100).forEach((row: any) => this.toggleRecord(row, true));
  }
  showBulkDestroy(): void {
    if (this.selectionDisabled || !this.selectedRecords.size) return;
    this.actionMessage = '';
    this.bulkDestroy = true;
    this.showDestroyRecordModal();
  }
  async runBulk(action: 'restore' | 'destroy'): Promise<void> {
    if (this.actionPending || this.actionNeedsRefresh || this.pageLoadPending || this.loadPending || !this.selectedRecords.size) return;
    this.actionPending = true;
    this.bulkResults = [];
    this.actionMessage = '';
    this.actionRefreshError = '';
    this.retryRestoreOid = undefined;
    try {
      const response = await this.recordService.bulkDeletedRecords(action, Array.from(this.selectedRecords.values()));
      this.bulkResults = response.results;
      const succeeded = this.bulkResults.filter(item => item.status === 'succeeded').length;
      const failed = this.bulkResults.length - succeeded;
      this.actionMessage = this.translationService.t('admin-deleted-bulk-result', { succeeded, failed });
      this.actionNeedsRefresh = true;
      this.closeDestroyRecordModal();
      await this.refreshAfterAction();
    } catch {
      this.actionNeedsRefresh = true;
      this.actionMessage = this.translationService.t('admin-deleted-bulk-unknown');
      this.closeDestroyRecordModal();
    } finally {
      this.actionPending = false;
    }
  }

  actionPending = false;
  actionMessage = '';
  actionRefreshError = '';
  actionNeedsRefresh = false;
  private retryRestoreOid?: string;
  private retryRestoreRevision?: number;

  // destroy record confirm modal
  currentDestroyRecordModalOid: string | undefined;
  currentDestroyRecordModalRevision: number | undefined;
  isDestroyRecordModalShown: boolean = false;
  private modalTrigger: HTMLElement | null = null;

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(RecordService) protected recordService: RecordService,
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(ElementRef) private elementRef: ElementRef
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
    if (this.pageLoadPending || this.actionPending) {
      return this.deletedRecordsResult;
    }
    try {
      await this.loadPage(pageNum, params, sort);
    } catch (error) {
      // Initial load failures must reach BaseComponent's bootstrap error subject.
      if (!this.isReady) {
        throw error;
      }
      if (!this.pendingCriteria) this.showLoadError(error, () => this.gotoPage(pageNum, params, sort));
    }
    const pending = this.pendingCriteria;
    this.pendingCriteria = undefined;
    if (pending) {
      return this.gotoPage(1, pending.params, pending.sort);
    }
    this.restoreAppliedSort();
    return this.deletedRecordsResult;
  }

  // Only resolves after a fresh read. Navigation's retained-page fallback and
  // queued criteria must never certify a successful post-mutation refresh.
  private async loadPage(pageNum: number, params = this.getParams(), sort = this.sort, recoverLastPage = false): Promise<RecordPageDto> {
    if (this.pageLoadPending) {
      throw new Error('A page read is already pending.');
    }
    this.pageLoadPending = true;
    this.initTracker.resultsReturned = false;
    this.loadError = '';
    try {
      let result = await this.getDeletedRecords(pageNum, params, sort);
      if (recoverLastPage && result.records.length === 0) {
        const lastPage = Math.max(1, Math.ceil(result.total / this.recordsPerPage));
        if (pageNum > lastPage) {
          // One bounded fallback, committed atomically with the initial read.
          // A failure leaves the retained rows and mutation refresh lock intact.
          result = await this.getDeletedRecords(lastPage, params, sort);
          if (lastPage > Math.max(1, Math.ceil(result.total / this.recordsPerPage))) {
            throw new Error('The last page changed again. Refresh the list again.');
          }
        }
      }
      if (this.pendingCriteria) return this.deletedRecordsResult;
      this.selectedRecords.clear();
      this.deletedRecordsResult = result;
      this.currentPageNumber = this.deletedRecordsResult.pageNum;
      this.appliedSort = sort;
      return this.deletedRecordsResult;
    } finally {
      this.pageLoadPending = false;
      this.initTracker.resultsReturned = true;
    }
  }

  private restoreAppliedSort(): void {
    this.sort = this.appliedSort;
    // Retained rows must retain their sort indicator after a failed read.
    this.recordTable?.headerSortItems?.forEach(header => {
      const [variable, direction] = this.appliedSort?.split(':') ?? [];
      const sortProperty = this.tableHeaders.find(column => column.property === header.variable)?.sortProperty ?? header.variable;
      header.sort = sortProperty === variable ? (direction === '-1' ? 'desc' : 'asc') : '';
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
    if (this.actionPending) {
      return;
    }
    const params = this.getParams();
    if (this.pageLoadPending) {
      this.pendingCriteria = { params, sort: this.sort };
      return;
    }
    await this.gotoPage(1, params);
  }

  get hasFilters(): boolean {
    return Object.values(this.filterParams).some(value => String(value ?? '').trim().length > 0);
  }

  public async clearFilters(): Promise<void> {
    this.filterParams = { title: '', recordType: '', deletedWithin: '', deletedBy: '' };
    await this.filter();
  }

  public async headerSortChanged(event: any, data: DeletedRecordTableHeader) {
    if (this.loadPending || this.actionPending) {
      this.restoreAppliedSort();
      return;
    }
    this.sort = `${data.sortProperty}:${event.sort === 'desc' ? '-1' : '1'}`;
    await this.filter();
  }

  public async recordTableAction(event: any, data: any, actionName: string) {
    if (this.actionPending || this.actionNeedsRefresh || this.pageLoadPending || this.loadPending || this.isDestroyRecordModalShown) {
      return;
    }
    this.actionMessage = '';
    this.bulkResults = [];
    this.actionRefreshError = '';
    this.retryRestoreOid = undefined;
    if (actionName === 'restore') {
      this.retryRestoreRevision = data.revision;
      await this.mutateDeletedRecord('restore', data.oid, data.revision);
    } else if (actionName === 'destroy') {
      this.currentDestroyRecordModalOid = data.oid;
      this.currentDestroyRecordModalRevision = data.revision;
      this.showDestroyRecordModal();
    } else {
      this.loggerService.error(`Unknown record table action name '${actionName}'.`);
    }
  }

  public showDestroyRecordModal(): void {
    const trigger = document.activeElement as HTMLElement;
    this.modalTrigger = trigger?.closest('details')?.querySelector('summary') ?? trigger;
    this.isDestroyRecordModalShown = true;
  }

  public hideDestroyRecordModal(): void {
    if (this.actionPending) {
      return;
    }
    this.closeDestroyRecordModal();
  }

  private closeDestroyRecordModal(): void {
    this.bulkDestroy = false;
    this.currentDestroyRecordModalOid = undefined;
    this.currentDestroyRecordModalRevision = undefined;
    this.isDestroyRecordModalShown = false;
    const trigger = this.modalTrigger;
    this.modalTrigger = null;
    setTimeout(() => {
      const target = trigger?.isConnected ? trigger : this.elementRef.nativeElement.querySelector('form button[type="submit"]');
      target?.focus();
    }, 0);
  }

  public async confirmDestroyRecordModal(event: any) {
    if (this.bulkDestroy) return this.runBulk('destroy');
    if (!_isUndefined(this.currentDestroyRecordModalOid)) {
      await this.mutateDeletedRecord('destroy', this.currentDestroyRecordModalOid, this.currentDestroyRecordModalRevision);
    }
  }

  public get canRetryRestore(): boolean {
    return !!this.retryRestoreOid && !this.actionNeedsRefresh;
  }

  public async retryRestore(): Promise<void> {
    if (this.retryRestoreOid) {
      await this.mutateDeletedRecord('restore', this.retryRestoreOid, this.retryRestoreRevision);
    }
  }

  private async mutateDeletedRecord(action: 'restore' | 'destroy', oid: string, revision?: number): Promise<void> {
    if (this.actionPending || this.actionNeedsRefresh || this.pageLoadPending || this.loadPending) {
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
          ? await this.recordService.restoreDeletedRecord(oid, revision ?? {})
          : await this.recordService.destroyDeletedRecord(oid, revision ?? {});
      } catch (error) {
        // Auth/CSRF policies reject before mutation. Server/transport failures
        // can happen after a write; never interpret them as a rollback.
        if (error instanceof HttpErrorResponse && [400, 401, 403].includes(error.status)) {
          this.actionMessage = `${label} was refused for record ${oid}. Check the request and your permissions, and sign in again or refresh the page before retrying.`;
          this.retryRestoreOid = action === 'restore' ? oid : undefined;
        } else {
          this.unknownActionOutcome(label, oid, this.actionErrorDiagnostic(error));
        }
        return;
      }

      // Only an explicit result can certify success. A missing/malformed body
      // is uncertain even when the HTTP request itself completed.
      if (result?.outcome === 'unknown' || result?.concurrencyOutcome === 'unknown') {
        this.unknownActionOutcome(label, oid, result.message);
        return;
      }
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

  private unknownActionOutcome(label: string, oid: string, diagnostic = ''): void {
    this.actionNeedsRefresh = true;
    this.actionMessage = `${label} outcome is unknown for record ${oid}. The action may have completed. Refresh the list and verify the record state before choosing another action.`;
    if (diagnostic) {
      this.actionMessage += ` Server reported: ${diagnostic}`;
    }
  }

  private actionErrorDiagnostic(error: unknown): string {
    if (!(error instanceof HttpErrorResponse) || error.status < 500) {
      return '';
    }
    // CoreController.handleV1Response builds APIErrorResponse {message, details}
    // from displayErrors. Do not serialize arbitrary errors, HTML response bodies,
    // nested objects or raw exception messages. The template interpolates text.
    const body = error.error;
    if (!body || typeof body !== 'object' || Array.isArray(body)
        || typeof body.message !== 'string' || typeof body.details !== 'string') {
      return '';
    }
    const message = body.message.slice(0, 500).trim();
    const details = body.details.slice(0, 500).trim();
    const generic = /^(an error (has occurred|occurred)|internal server error)[.!]?$/i;
    return [generic.test(message) ? '' : message, details].filter(Boolean).join(': ');
  }

  public async refreshActionList(): Promise<void> {
    if (this.actionPending || this.pageLoadPending || this.loadPending || !this.actionNeedsRefresh) {
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
      await this.loadPage(this.currentPageNumber, this.getParams(), this.sort, true);
      this.actionNeedsRefresh = false;
      this.closeDestroyRecordModal();
      this.actionRefreshError = '';
      this.actionMessage += ' ' + this.translationService.t('admin-deleted-list-refreshed');
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
    this.dropDownProperties['recordType'] = [{title: 'admin-all-record-types', value: ''}];
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
      recordType, workflowState, pageNum, packageType, sort, filterFields, filterString, filterMode, this.recordsPerPage, _get(params, 'deletedWithin', ''), _get(params, 'deletedBy', ''));

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
    return this.adminDates.format(safeValue);
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
