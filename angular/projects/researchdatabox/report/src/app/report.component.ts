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

import { AdminDateService } from '@researchdatabox/portal-ng-common';
import { Component, Inject, ElementRef, inject } from '@angular/core';
import { ConfigService, LoggerService, TranslationService, ReportService, BaseComponent, HandlebarsTemplateService } from '@researchdatabox/portal-ng-common';
import { RecordSource } from '@researchdatabox/portal-ng-common';
import {  RecordPropViewMetaDto, ReportDto, ReportResultDto, RecordPageDto, ReportFilterDto } from '@researchdatabox/sails-ng-common';
import { isEmpty as _isEmpty, set as _set } from 'lodash-es';
import { DateTime } from 'luxon';
/**
 * Report Component
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo B</a>
 */
@Component({
    selector: 'report',
    templateUrl: './report.component.html',
    styleUrls: ['./report.component.scss'],
    standalone: false
})
export class ReportComponent extends BaseComponent implements RecordSource {
  readonly adminDates = inject(AdminDateService);
  datePickerPlaceHolder: string = '';
  datePickerOpts: any;
  filterParams: any = {};
  private pageLoadPending = false;
  private cursorHistory: Array<string | undefined> = [undefined];
  cursorIndex = 0;
  exporting = false;
  exportMessage = '';
  exportError = false;
  get graphqlReport(): boolean {
    return this.report?.querySource === 'graphql';
  }
  get rangeStart(): number {
    return this.reportResult?.records.length ? (this.reportResult.pagination?.start ?? 0) + 1 : 0;
  }
  get rangeEnd(): number {
    return (this.reportResult?.pagination?.start ?? 0) + (this.reportResult?.records.length ?? 0);
  }
  async cursorPage(direction: number): Promise<void> {
    const index = this.cursorIndex + direction;
    if (this.pageLoadPending || index < 0 || (direction > 0 && !this.reportResult.pagination?.hasNextPage)) return;
    const token = direction > 0 ? (this.reportResult.pagination!.nextCursor ?? undefined) : this.cursorHistory[index];
    const focused = document.activeElement;
    const pagerButton =
      focused instanceof HTMLButtonElement && focused.closest('.report-cursor-pager') ? focused : null;
    await this.gotoPage(1, { ...this.appliedFilterParams }, { index, token });
    if (pagerButton)
      setTimeout(() => {
        if (
          (document.activeElement !== document.body && document.activeElement !== pagerButton) ||
          !pagerButton.isConnected
        )
          return;
        const target = !pagerButton.disabled
          ? pagerButton
          : this.elementRef.nativeElement.querySelector('.report-cursor-pager button:not(:disabled)');
        target?.focus();
      }, 0);
  }
  async downloadCsv(): Promise<void> {
    const params = this.getParams();
    if (params === null || this.exporting) return;
    this.exporting = true;
    this.exportError = false;
    this.exportMessage = String(this.translationService.t('report-graphql-export-wait'));
    try {
      const blob = await this.reportService.downloadCSV(this.reportName, params);
      if (blob.type.includes('json')) throw { error: blob };
      const url = URL.createObjectURL(blob),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = this.reportName + '.csv';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.exportMessage = String(this.translationService.t('report-graphql-export-complete'));
    } catch (error: unknown) {
      let payload = (error as { error?: unknown }).error;
      if (payload instanceof Blob) {
        try {
          payload = JSON.parse(await payload.text());
        } catch {
          payload = undefined;
        }
      }
      const response = payload as
        | { data?: { message?: string }; message?: string; errors?: Array<{ code?: string }> }
        | undefined;
      const code = response?.errors?.[0]?.code ?? response?.data?.message ?? response?.message;
      const key = code ? 'report-graphql-error-' + code : 'report-request-failed';
      const message = String(this.translationService.t(key));
      this.exportMessage =
        message === key ? String(this.translationService.t('report-graphql-export-failed')) : message;
      this.exportError = true;
    } finally {
      this.exporting = false;
    }
  }

  private pendingFilter: { params: any } | undefined;
  initTracker: any = { reportLoaded: false, resultsReturned: false };
  report: ReportDto = null as any;
  appliedFilterParams: Record<string, string> = {};
  private sortState: { variable: string; sort: string } | null = null;
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
  dateParamTzByFilter: Record<string, Record<string, string>> = {};
  // Branding and portal for template loading
  branding: string = '';
  portal: string = '';

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(ReportService) protected reportService: ReportService,
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(HandlebarsTemplateService) private handlebarsTemplateService: HandlebarsTemplateService,
    @Inject(ElementRef) private readonly elementRef: ElementRef
  ) {
    super();
    this.initDependencies = [this.translationService, this.reportService, this.handlebarsTemplateService];
    this.reportName = elementRef.nativeElement.getAttribute('reportName');
    this.loggerService.debug(`'${this.appName} - ${this.reportName}' waiting for deps to init...`);
  }

  getCurrentPage() {
    return this.reportResult;
  }

  async gotoPage(pageNum: number, params = this.getParams(), cursorRequest?: {index:number;token?:string}): Promise<RecordPageDto> {
    if (params === null || this.pageLoadPending) {
      return this.reportResult;
    }
    this.pageLoadPending = true;
    this.initTracker.resultsReturned = false;
    this.loadError = '';
    try {
      const result = this.graphqlReport
        ? await this.reportService.getReportCursorPage(this.reportName,params,25,cursorRequest?.token)
        : await this.reportService.getReportResult(this.reportName, pageNum, this.withSort(params), this.recordsPerPage);
      if (!this.pendingFilter) {
        this.reportResult = result;
        if (this.graphqlReport) {
          this.cursorIndex = cursorRequest?.index ?? 0;
          if (!cursorRequest) this.cursorHistory = [undefined];
          this.cursorHistory[this.cursorIndex] = cursorRequest?.token;
        }
        this.appliedFilterParams = { ...params };
      }
    } catch (error) {
      // Initial load failures must reach BaseComponent's bootstrap error subject.
      if (!this.isReady) {
        throw error;
      }
      if (!this.pendingFilter) {
        this.showLoadError(error, () => this.gotoPage(pageNum, params, cursorRequest));

      }
    } finally {
      this.pageLoadPending = false;
      this.initTracker.resultsReturned = true;
    }
    // A submitted filter supersedes earlier submissions, even if the active read failed.
    const pending = this.pendingFilter;
    this.pendingFilter = undefined;
    if (pending) {
      return this.gotoPage(1, pending.params);
    }
    return this.reportResult;
  }

  protected override showLoadError(error: unknown, retry: () => Promise<unknown>): void {
    super.showLoadError(error, retry);
    const response = error as { error?: { message?: string; data?: { message?: string }; errors?: Array<{code?: string}> } };
    const code = response.error?.errors?.[0]?.code ?? response.error?.data?.message ?? response.error?.message;
    if (!code) return;
    const key = 'report-graphql-error-' + code;
    const text = String(this.translationService.t(key));
    if (text !== key) this.loadError = text;
  }

  protected async initComponent(): Promise<void> {
    const sysConfig = await this.configService.getConfig();
    const defaultDatePickerOpts = { dateInputFormat: 'DD/MM/YYYY', containerClass: 'theme-dark-blue' };
    const defaultDatePickerPlaceHolder = 'dd/mm/yyyy';
    this.datePickerOpts = ConfigService._getAppConfigProperty(sysConfig, this.appName, 'datePickerOpts', defaultDatePickerOpts);
    this.datePickerOpts = { ...this.datePickerOpts, dateInputFormat: this.adminDates.pickerFormat };
    this.datePickerPlaceHolder = this.adminDates.placeholder;
    this.brandingAndPortalUrl = this.reportService.brandingAndPortalUrl;
    _set(this.optTemplateData, 'brandingAndPortalUrl', this.brandingAndPortalUrl);
    this.recordsPerPage = ConfigService._getAppConfigProperty(sysConfig, this.appName, 'recordsPerPage', this.recordsPerPage);
    this.dateParamTz = ConfigService._getAppConfigProperty(sysConfig, this.appName, 'dateParamTz', this.dateParamTz);
    this.dateParamTzByFilter = ConfigService._getAppConfigProperty(sysConfig, this.appName, 'dateParamTzByFilter', this.dateParamTzByFilter);
    this.paginationMaxSize = ConfigService._getAppConfigProperty(sysConfig, this.appName, 'paginationMaxSize', this.paginationMaxSize);

    // Extract branding and portal from the URL for template loading
    this.branding = sysConfig.branding || '';
    this.portal = sysConfig.portal || '';

    // Load pre-compiled Handlebars templates for this report
    try {
      await this.handlebarsTemplateService.loadReportTemplates(this.branding, this.portal, this.reportName);
      this.loggerService.debug(`'${this.appName}': Loaded templates for report '${this.reportName}'`);
    } catch (error) {
      this.loggerService.error(`'${this.appName}': Failed to load templates for report '${this.reportName}':`, error);
    }

    this.report = await this.reportService.getReportConfig(this.reportName);
    this.tableHeaders = this.report.columns;
    this.initTracker.reportLoaded = true;
    await this.gotoPage(1);
    this.loggerService.debug(`'${this.appName}' ready!`);
  }

  public async filter(event?: any) {
    if (this.loadPending) {
      return;
    }
    const params = this.getParams();
    if (this.pageLoadPending) {
      this.pendingFilter = { params };
      return;
    }
    await this.gotoPage(1, params);
  }

  public getDownloadCSVUrl() {
    const params = this.getParams();
    if (params === null) {
      return null;
    }
    const query = new URLSearchParams({ name: this.reportName });
    for (const [key, value] of Object.entries(this.withSort(params))) {
      query.set(key, value);
    }
    return `${this.brandingAndPortalUrl}/admin/downloadReportCSV?${query}`;
  }

  public getLuxonDateFromJs(srcDate: Date, tz: string, mode: string) {
    const date = new Date(srcDate.getTime());
    if (mode == 'floor') {
      date.setHours(0, 0, 0, 0);
    } else if (mode == 'ceil') {
      date.setHours(23, 59, 59, 999);
    }
    return DateTime.fromJSDate(date, {zone: tz});
  }

  private getDateRangeBound(srcDate: Date, filter: ReportFilterDto, mode: 'floor' | 'ceil') {
    const zone = this.dateParamTzByFilter[this.reportName]?.[filter.paramName];
    if (!zone) {
      return this.getLuxonDateFromJs(srcDate, this.dateParamTz, mode);
    }
    // Datepickers represent a selected calendar day with browser-local fields.
    // Build that day in the configured zone, then serialize UTC for query comparisons.
    const date = DateTime.fromObject({
      year: srcDate.getFullYear(), month: srcDate.getMonth() + 1, day: srcDate.getDate(),
    }, { zone });
    return (mode === 'floor' ? date.startOf('day') : date.endOf('day')).toUTC();
  }

  public get dateRangeError(): string | null {
    for (const filter of this.report?.filter ?? []) {
      if (filter.type !== 'date-range') {
        continue;
      }
      const from = this.filterParams[filter.paramName + '_fromDate'];
      const to = this.filterParams[filter.paramName + '_toDate'];
      const hasBound = (value: unknown) => value !== null && value !== undefined && value !== '';
      if ([from, to].some(value => hasBound(value) &&
        (!(value instanceof Date) || !Number.isFinite(value.getTime())))) {
        return this.translationService.t('report-filter-invalid-date',
          '{{filter}}: enter valid dates in dd/mm/yyyy format before filtering or downloading.',
          { filter: this.translationService.t(filter.message) });
      }
      const fromBound = hasBound(from) ? this.getDateRangeBound(from, filter, 'floor') : null;
      const toBound = hasBound(to) ? this.getDateRangeBound(to, filter, 'ceil') : null;
      if ((fromBound && !fromBound.isValid) || (toBound && !toBound.isValid)) {
        return this.translationService.t('report-filter-invalid-timezone',
          '{{filter}}: the date filter time zone is not configured correctly. Contact your administrator before filtering or downloading.',
          { filter: this.translationService.t(filter.message) });
      }
      if (fromBound && toBound && fromBound.toMillis() > toBound.toMillis()) {
        return this.translationService.t('report-filter-reversed-date-range',
          '{{filter}}: the From date must be on or before the To date before filtering or downloading.',
          { filter: this.translationService.t(filter.message) });
      }
    }
    return null;
  }

  public getParams() {
    if (this.dateRangeError) {
      return null;
    }
    var params:any = {};
    for(let filter of this.report?.filter ?? []) {
      if (filter.type == 'date-range') {
        const fromDateJs = this.filterParams[filter.paramName + "_fromDate"];
        const toDateJs = this.filterParams[filter.paramName + "_toDate"];
        var fromDate = fromDateJs ? this.getDateRangeBound(fromDateJs, filter, 'floor') : null;
        var toDate = toDateJs ? this.getDateRangeBound(toDateJs, filter, 'ceil') : null;

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

  public filterLabel(filter: ReportFilterDto, bound?: string): string {
    const message = String(filter.message || '');
    const defaults: Record<string, string> = {
      'Filter by title': 'title',
      'Filter by date modified': 'modified',
      'Filter by date created': 'created'
    };
    const standard = defaults[message];
    if (standard === 'title' && filter.type === 'text') return this.translationService.t('admin-report-title-contains', 'Title contains');
    if (standard && bound && filter.type === 'date-range') {
      const direction = bound === 'fromDate' ? 'from' : 'to';
      return this.translationService.t(`admin-report-${standard}-${direction}`);
    }
    const label = this.translationService.t(message);
    return bound ? `${label} ${this.translationService.t(bound === 'fromDate' ? 'report-filter-date-from' : 'report-filter-date-to')}` : label;
  }

  public get activeFilters(): { key: string; label: string; value: string }[] {
    return Object.entries(this.appliedFilterParams).map(([key, value]) => {
      const filter = this.report.filter.find(item => key === item.paramName ||
        (item.type === 'date-range' && [item.paramName + '_fromDate', item.paramName + '_toDate'].includes(key)));
      let label = filter ? this.filterLabel(filter, filter.type === 'date-range' ? (key.endsWith('_fromDate') ? 'fromDate' : 'toDate') : undefined) : key;
      let display = value;
      if (filter?.type === 'date-range') {
        // Use the same configured calendar format as the datepicker, preserving the selected day.
        const zone = this.dateParamTzByFilter[this.reportName]?.[filter.paramName];
        display = this.adminDates.format(value, true, zone || 'local');
      }
      return { key, label, value: display };
    });
  }

  get hasFilters(): boolean {
    return this.activeFilters.length > 0 || Object.values(this.filterParams).some(value => value != null && String(value).trim() !== '');
  }

  public async clearFilters(): Promise<void> {
    this.filterParams = {};
    await this.filter();
  }

  public async removeFilter(key: string): Promise<void> {
    // Chips represent the applied query. Restore it before removing one so unfinished edits aren't submitted.
    this.filterParams = {};
    for (const chip of this.activeFilters) {
      const filter = this.report.filter.find(item => item.type === 'date-range' &&
        [item.paramName + '_fromDate', item.paramName + '_toDate'].includes(chip.key));
      if (filter) {
        const zone = this.dateParamTzByFilter[this.reportName]?.[filter.paramName];
        const date = DateTime.fromISO(this.appliedFilterParams[chip.key], { zone: zone || 'local' });
        this.filterParams[chip.key] = new Date(date.year, date.month - 1, date.day);
      } else {
        this.filterParams[chip.key] = this.appliedFilterParams[chip.key];
      }
    }
    delete this.filterParams[key];
    await this.filter();
  }

  public async recordTableAction(event: any, data: any, actionName: string) { }

  private withSort(params: Record<string, string>): Record<string, string> {
    return this.sortState ? { ...params, sortField: this.sortState.variable, sortDirection: this.sortState.sort } : params;
  }

  public async headerSortChanged(event: { variable: string; sort: string }, data: any) {
    if (!this.report.columns.some(column => column.property === event.variable && column.sortable === true) ||
      !['asc', 'desc'].includes(event.sort)) return;
    this.sortState = event;
    // Sorting preserves applied filters, including while another page request is in flight.
    const params = { ...this.appliedFilterParams };
    if (this.pageLoadPending) {
      this.pendingFilter = { params };
      return;
    }
    await this.gotoPage(1, params);
  }
}
