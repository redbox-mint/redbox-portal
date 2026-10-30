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

import { Component, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { BsDatepickerConfig } from 'ngx-bootstrap/datepicker';
import { ConfigService, LoggerService, TranslationService, RecordService, BaseComponent } from '@researchdatabox/portal-ng-common';
import { ExportJobDto, ExportJobRequest, ExportJobStatus } from '@researchdatabox/sails-ng-common';
import { ExportService } from './export.service';

interface ExportFormatOption {
  name: string;
  id: string;
  checked?: string | boolean | null;
}

@Component({
  selector: 'export',
  templateUrl: './export.component.html',
  styleUrls: ['./export.component.scss'],
  standalone: false
})
export class ExportComponent extends BaseComponent {
  datePickerPlaceHolder = '';
  modBefore: Date | string | null | undefined = null;
  modAfter: Date | string | null | undefined = null;
  datePickerOpts: Partial<BsDatepickerConfig> = {};
  recTypeNames: string[] = [];
  record_type = '';
  exportFormatTypes: ExportFormatOption[] = [];
  export_format = 'csv';
  window: Pick<Window, 'open'> | null;
  jobs: ExportJobDto[] = [];
  createPending = false;
  deletePendingId: string | null = null;
  jobsLoading = false;
  submissionErrorKey = '';
  jobsErrorKey = '';
  deleteErrorKey = '';

  private static readonly statusTones: Record<ExportJobStatus, string> = {
    queued: 'secondary', running: 'info', ready: 'success', failed: 'danger', expired: 'secondary'
  };
  private readonly pollIntervalMs = 3000;
  private refreshPromise: Promise<void> | null = null;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private pollingBlocked = false;

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(RecordService) private recordService: RecordService,
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(ExportService) private exportService: ExportService,
    @Inject(DOCUMENT) document: Document
  ) {
    super();
    this.window = document.defaultView;
    this.initDependencies = [this.translationService, this.recordService, this.exportService];
  }

  protected override async initComponent(): Promise<void> {
    const sysConfig = await this.configService.getConfig();
    const appName = 'export';
    this.datePickerOpts = ConfigService._getAppConfigProperty(sysConfig, appName, 'datePickerOpts', {
      dateInputFormat: 'DD/MM/YYYY', containerClass: 'theme-dark-blue'
    });
    this.datePickerPlaceHolder = ConfigService._getAppConfigProperty(sysConfig, appName, 'datePickerPlaceHolder', 'dd/mm/yyyy');
    this.exportFormatTypes = ConfigService._getAppConfigProperty(sysConfig, appName, 'exportFormatTypes', [
      { name: 'CSV', id: 'csv', checked: 'true' }, { name: 'JSON', id: 'json', checked: null }
    ]);
    this.export_format = this.exportFormatTypes[0]?.id ?? 'csv';
    const typeConfs: { name: string }[] = await this.recordService.getAllTypes();
    this.recTypeNames = typeConfs.map(typeConf => typeConf.name);
    this.record_type = this.recTypeNames[0] ?? '';
    await this.refreshJobs();
    this.loggerService.debug('Export initialised');
  }

  async download(): Promise<void> {
    if (this.mutationPending || this.disposed) {
      return;
    }
    this.submissionErrorKey = '';
    const request = this.getSelectedRequest();
    if (!request) {
      return;
    }
    if (this.export_format === 'csv') {
      await this.prepareExport(request);
      return;
    }
    const query = new URLSearchParams({ before: request.before ?? '', after: request.after ?? '', recType: request.recType });
    const url = `${this.recordService.brandingAndPortalUrl}/export/record/download/${encodeURIComponent(this.export_format)}?${query}`;
    this.window?.open(url, '_blank');
  }

  async prepareAgain(job: ExportJobDto): Promise<void> {
    await this.prepareExport({
      format: 'csv',
      recType: job.recordType,
      ...(job.modifiedBefore ? { before: job.modifiedBefore } : {}),
      ...(job.modifiedAfter ? { after: job.modifiedAfter } : {})
    });
  }

  async refreshJobs(): Promise<void> {
    if (this.disposed || this.mutationPending) {
      return;
    }
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.clearRefreshTimer();
    this.jobsLoading = true;
    this.pollingBlocked = false;
    this.refreshPromise = this.loadJobs();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
      this.jobsLoading = false;
      this.scheduleRefresh();
    }
  }

  getDownloadUrl(job: ExportJobDto): string | null {
    return this.deletePendingId === job.id ? null : this.exportService.downloadUrl(job);
  }

  get mutationPending(): boolean {
    return this.createPending || this.deletePendingId !== null;
  }

  canDelete(job: ExportJobDto): boolean {
    const status = this.getStatus(job);
    return status === 'ready' || status === 'failed' || status === 'expired';
  }

  async deleteJob(job: ExportJobDto): Promise<void> {
    if (this.disposed || this.mutationPending || !this.canDelete(job)) {
      return;
    }
    this.deletePendingId = job.id;
    this.deleteErrorKey = '';
    this.clearRefreshTimer();
    try {
      // Drain an older list request before removing the export so it cannot restore the row.
      await this.refreshPromise;
      if (this.disposed) {
        return;
      }
      await this.exportService.remove(job.id);
      if (!this.disposed) {
        this.jobs = this.jobs.filter(existing => existing.id !== job.id);
        this.pollingBlocked = false;
      }
    } catch (error: unknown) {
      if (!this.disposed) {
        this.deleteErrorKey = this.isAccessError(error) ? 'export-session-error' : 'export-delete-error';
      }
    } finally {
      this.deletePendingId = null;
      this.scheduleRefresh();
    }
  }

  getStatus(job: ExportJobDto): ExportJobStatus {
    return job.status === 'ready' && job.expiresAt && Date.parse(job.expiresAt) <= Date.now() ? 'expired' : job.status;
  }

  hasActiveJobs(): boolean {
    return this.jobs.some(job => job.status === 'queued' || job.status === 'running');
  }

  getStatusBadgeClass(status: ExportJobStatus): string {
    const tone = ExportComponent.statusTones[status] ?? 'secondary';
    return `badge rounded-pill ex-badge bg-${tone}-subtle text-${tone}-emphasis border border-${tone}-subtle`;
  }

  formatSize(bytes: number | null): string {
    if (bytes === null || !Number.isFinite(bytes) || bytes < 0) {
      return '';
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }
    return `${unit === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
  }

  getRecordTypeNames(): string[] {
    return this.recTypeNames;
  }

  getExportFormatNames(): ExportFormatOption[] {
    return this.exportFormatTypes;
  }

  getSelectedFormatName(): string {
    return this.exportFormatTypes.find(format => format.id === this.export_format)?.name ?? this.export_format.toUpperCase();
  }

  setRecordType(recType: string, event?: Event): void {
    event?.preventDefault();
    this.record_type = recType;
  }

  setExportFormat(exportFormat: string): void {
    this.export_format = exportFormat;
  }

  override ngOnDestroy(): void {
    this.disposed = true;
    this.clearRefreshTimer();
    super.ngOnDestroy();
  }

  private async loadJobs(): Promise<void> {
    try {
      const jobs = await this.exportService.list();
      if (!this.disposed) {
        this.jobs = jobs;
        this.jobsErrorKey = '';
        this.deleteErrorKey = '';
      }
    } catch (error: unknown) {
      if (!this.disposed) {
        this.pollingBlocked = this.isAccessError(error);
        this.jobsErrorKey = this.pollingBlocked ? 'export-session-error' : 'export-load-error';
      }
    }
  }

  private async prepareExport(request: ExportJobRequest): Promise<void> {
    if (this.mutationPending || this.disposed) {
      return;
    }
    this.createPending = true;
    this.submissionErrorKey = '';
    this.clearRefreshTimer();
    try {
      // Finish any older read before inserting the accepted job into the visible list.
      await this.refreshPromise;
      if (this.disposed) {
        return;
      }
      const job = await this.exportService.create(request);
      if (!this.disposed) {
        this.jobs = [job, ...this.jobs.filter(existing => existing.id !== job.id)].slice(0, 20);
        this.pollingBlocked = false;
      }
    } catch (error: unknown) {
      if (!this.disposed) {
        this.submissionErrorKey = this.isAccessError(error) ? 'export-session-error' : 'export-submit-error';
      }
    } finally {
      this.createPending = false;
      this.scheduleRefresh();
    }
  }

  private getSelectedRequest(): ExportJobRequest | null {
    if (!this.record_type) {
      this.submissionErrorKey = 'export-select-record-type';
      return null;
    }
    const before = this.normalizedDate(this.modBefore, true);
    const after = this.normalizedDate(this.modAfter, false);
    if (before === undefined || after === undefined) {
      this.submissionErrorKey = 'export-invalid-date';
      return null;
    }
    if (before && after && before < after) {
      this.submissionErrorKey = 'export-invalid-range';
      return null;
    }
    return {
      format: 'csv',
      recType: this.record_type,
      ...(before ? { before: before.toISOString() } : {}),
      ...(after ? { after: after.toISOString() } : {})
    };
  }

  private normalizedDate(value: Date | string | null | undefined, endOfDay: boolean): Date | null | undefined {
    // bsDatepicker reports a cleared input as undefined.
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      return undefined;
    }
    const result = new Date(value.getTime());
    result.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    return result;
  }

  private scheduleRefresh(): void {
    this.clearRefreshTimer();
    if (this.disposed || this.mutationPending || this.pollingBlocked) {
      return;
    }
    let delay: number;
    if (this.hasActiveJobs()) {
      delay = this.pollIntervalMs;
    } else {
      const expiries = this.jobs.filter(job => job.status === 'ready' && job.expiresAt)
        .map(job => Date.parse(job.expiresAt!)).filter(Number.isFinite);
      if (!expiries.length) {
        return;
      }
      // Wake once at expiry so a long-open page removes its download link without continuous polling.
      const untilExpiry = Math.min(...expiries) - Date.now();
      delay = untilExpiry > 0 ? Math.min(untilExpiry + 1, 2147483647) : this.pollIntervalMs;
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this.requestRender();
      void this.refreshJobs();
    }, delay);
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer !== undefined) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  private isAccessError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'status' in error && (error.status === 401 || error.status === 403);
  }
}
