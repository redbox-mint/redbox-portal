import { Component, ElementRef, Inject, ViewChild } from '@angular/core';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';
import { DateTime } from 'luxon';
import { BaseComponent, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import {
  HarvestRunApiService,
  HarvestRunDetail,
  HarvestRunChunkSummary,
  HarvestRunEvent,
  HarvestRunListQuery,
  HarvestRunSummary,
  ListApiResponse,
} from './harvest-run-api.service';

type EventFilters = { outcome: string; harvestId: string };

type StatusOption = {
  value: string;
  label: string;
};

@Component({
  selector: 'harvest-runs',
  templateUrl: './harvest-runs.component.html',
  styleUrls: ['./harvest-runs.component.scss'],
  standalone: false
})
export class HarvestRunsComponent extends BaseComponent {
  readonly runPageSize = 20;
  readonly eventPageSize = 20;
  readonly chunkPageSize = 20;
  readonly displayDateFormat = 'dd/MM/yyyy HH:mm';
  readonly statusOptions: StatusOption[] = [
    { value: '', label: 'All' },
    { value: 'running', label: 'Running' },
    { value: 'completed', label: 'Completed' },
    { value: 'completed_with_errors', label: 'Completed with errors' },
    { value: 'failed', label: 'Failed' },
  ];

  @ViewChild('recordSection') recordSection?: ElementRef<HTMLElement>;
  selectedChunk: HarvestRunChunkSummary | null = null;
  private appliedChunkId = '';
  readonly eventOutcomes = ['', 'failed', 'created', 'updated', 'deleted', 'unchanged'];
  eventFilters: EventFilters = { outcome: '', harvestId: '' };
  private appliedEventFilters: EventFilters = { outcome: '', harvestId: '' };
  loadingEvents = false;
  loadingChunks = false;
  chunkError = '';
  chunkResponse: ListApiResponse<HarvestRunChunkSummary> = this.emptyListResponse<HarvestRunChunkSummary>();
  private chunkRequestId = 0;
  private runRequestId = 0;
  private loadedRunPage = 0;
  private loadedChunkPage = 1;

  filters: HarvestRunListQuery = this.createEmptyFilters();
  listResponse: ListApiResponse<HarvestRunSummary> = this.emptyListResponse<HarvestRunSummary>();
  eventResponse: ListApiResponse<HarvestRunEvent> = this.emptyListResponse<HarvestRunEvent>();
  selectedRun: HarvestRunDetail | null = null;
  selectedRunId = '';
  loadingRuns = false;
  loadingDetail = false;
  listError = '';
  detailError = '';
  private detailRequestId = 0;
  // Pagination updates its bound page before emitting pageChanged.
  private loadedEventPage = 1;

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(HarvestRunApiService) private harvestRunApiService: HarvestRunApiService
  ) {
    super();
    this.initDependencies = [this.translationService, this.harvestRunApiService];
  }

  protected async initComponent(): Promise<void> {
    await this.loadRuns(1);
  }

  public async applyFilters(event?: Event): Promise<void> {
    event?.preventDefault();
    await this.loadRuns(1);
  }

  public async clearFilters(): Promise<void> {
    this.filters = this.createEmptyFilters();
    await this.loadRuns(1);
  }

  public async selectRun(runId: string): Promise<void> {
    const trimmedRunId = String(runId ?? '').trim();
    if (!trimmedRunId || (trimmedRunId === this.selectedRunId && (this.loadingDetail || this.selectedRun))) {
      return;
    }

    const requestId = ++this.detailRequestId;
    this.loadingDetail = true;
    this.detailError = '';
    this.selectedRunId = trimmedRunId;
    this.selectedRun = null;
    ++this.chunkRequestId;
    this.loadingChunks = false;
    this.chunkError = '';
    this.chunkResponse = this.emptyListResponse<HarvestRunChunkSummary>();
    this.loadingEvents = false;
    this.selectedChunk = null;
    this.appliedChunkId = '';
    this.eventFilters = { outcome: '', harvestId: '' };
    this.appliedEventFilters = { ...this.eventFilters };
    this.eventResponse = this.emptyListResponse<HarvestRunEvent>();

    try {
      const detail = await this.harvestRunApiService.getRun(trimmedRunId);
      if (requestId !== this.detailRequestId) {
        return;
      }
      this.selectedRun = detail;
      this.loadedChunkPage = 1;
      this.chunkResponse = {
        summary: { numFound: detail.chunksTotal, page: 1, start: 0 },
        records: detail.chunks
      };
      this.loadedEventPage = 1;
      this.eventResponse = {
        summary: { numFound: detail.eventsTotal, page: 1, start: 0 },
        records: detail.events
      };
    } catch (error) {
      if (requestId !== this.detailRequestId) {
        return;
      }
      this.detailError = this.getErrorMessage(error, 'harvest-runs-error');
      this.loggerService.error(this.detailError);
    } finally {
      if (requestId === this.detailRequestId) {
        this.loadingDetail = false;
      }
    }
  }

  public async onRunPageChanged(event: PageChangedEvent): Promise<void> {
    if (this.loadingRuns || event.page === this.loadedRunPage) {
      return;
    }
    await this.loadRuns(event.page);
  }

  public async onChunkPageChanged(event: PageChangedEvent): Promise<void> {
    if (!this.selectedRun || this.loadingChunks || event.page === this.loadedChunkPage) {
      return;
    }
    const requestId = ++this.chunkRequestId;
    this.loadingChunks = true;
    this.chunkError = '';
    try {
      const chunks = await this.harvestRunApiService.listRunChunks(this.selectedRunId, event.page, this.chunkPageSize);
      if (requestId !== this.chunkRequestId) {
        return;
      }
      this.chunkResponse = chunks;
      this.loadedChunkPage = event.page;
    } catch (error) {
      if (requestId !== this.chunkRequestId) {
        return;
      }
      this.chunkResponse.summary.page = this.loadedChunkPage;
      this.chunkError = this.getErrorMessage(error, 'harvest-runs-chunks-error');
      this.loggerService.error(this.chunkError);
    } finally {
      if (requestId === this.chunkRequestId) {
        this.loadingChunks = false;
      }
    }
  }

  public async applyEventFilters(event?: Event): Promise<void> {
    event?.preventDefault();
    if (!this.selectedRun || this.loadingEvents) {
      return;
    }
    const filters = { outcome: this.eventFilters.outcome, harvestId: this.eventFilters.harvestId.trim() };
    if (!this.detailError && filters.outcome === this.appliedEventFilters.outcome
      && filters.harvestId === this.appliedEventFilters.harvestId
      && (this.selectedChunk?.id ?? '') === this.appliedChunkId) {
      return;
    }
    this.appliedEventFilters = filters;
    this.appliedChunkId = this.selectedChunk?.id ?? '';
    this.eventResponse = this.emptyListResponse<HarvestRunEvent>();
    this.loadedEventPage = 0;
    await this.loadRunEvents(1);
  }

  public async viewChunkRecords(chunk: HarvestRunChunkSummary, failuresOnly = false): Promise<void> {
    if (!chunk.id || this.loadingEvents) {
      return;
    }
    this.selectedChunk = chunk;
    this.eventFilters = { outcome: failuresOnly ? 'failed' : '', harvestId: '' };
    await this.applyEventFilters();
    this.recordSection?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  public getChunkDuration(chunk: HarvestRunChunkSummary): string {
    const start = Date.parse(chunk.submittedAt ?? '');
    const end = Date.parse(chunk.completedAt ?? '');
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return '—';
    }
    const seconds = (end - start) / 1000;
    return seconds < 60 ? `${seconds.toFixed(1)} s` : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
  }

  public async clearEventFilters(): Promise<void> {
    this.selectedChunk = null;
    this.eventFilters = { outcome: '', harvestId: '' };
    await this.applyEventFilters();
  }

  public async onEventPageChanged(event: PageChangedEvent): Promise<void> {
    if (!this.selectedRun || this.loadingEvents || event.page === this.loadedEventPage) {
      return;
    }
    await this.loadRunEvents(event.page);
  }

  private async loadRunEvents(page: number): Promise<void> {
    const requestId = ++this.detailRequestId;
    this.loadingEvents = true;
    this.detailError = '';
    try {
      const events = await this.harvestRunApiService.listRunEvents(this.selectedRunId, {
        ...this.appliedEventFilters,
        ...(this.appliedChunkId ? { chunkId: this.appliedChunkId } : {}),
        page,
        pageSize: this.eventPageSize
      });
      if (requestId !== this.detailRequestId) {
        return;
      }
      this.eventResponse = events;
      this.loadedEventPage = page;
    } catch (error) {
      if (requestId !== this.detailRequestId) {
        return;
      }
      this.eventResponse.summary.page = Math.max(1, this.loadedEventPage);
      this.detailError = this.getErrorMessage(error, 'harvest-runs-error');
      this.loggerService.error(this.detailError);
    } finally {
      if (requestId === this.detailRequestId) {
        this.loadingEvents = false;
      }
    }
  }

  public formatDate(value?: string): string {
    const safeValue = String(value ?? '').trim();
    if (!safeValue) {
      return '';
    }

    const date = DateTime.fromISO(safeValue);
    return date.isValid ? date.toFormat(this.displayDateFormat) : safeValue;
  }

  public getStatusLabel(status?: string): string {
    const translationKey = this.getStatusTranslationKey(status);
    return translationKey ? this.translationService.t(translationKey) : String(status ?? '');
  }

  public getStatusVariant(status?: string): string {
    switch (String(status ?? '').trim()) {
      case 'completed':
        return 'success';
      case 'completed_with_errors':
        return 'warning';
      case 'failed':
        return 'danger';
      case 'aborted':
        return 'muted';
      case 'timed_out':
        return 'warning';
      case 'running':
        return 'info';
      default:
        return 'neutral';
    }
  }

  public getChunkVariant(status?: string): string {
    const value = String(status ?? '').trim();
    if (value === 'processed') {
      return 'success';
    }
    if (value === 'processing') {
      return 'info';
    }
    return 'danger';
  }

  public getOutcomeVariant(outcome?: string): string {
    switch (String(outcome ?? '').trim()) {
      case 'created':
        return 'success';
      case 'updated':
        return 'info';
      case 'deleted':
        return 'warning';
      case 'unchanged':
        return 'muted';
      case 'failed':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  public getEventMessage(event: HarvestRunEvent): string {
    return [event.errorCode, event.message, event.details].filter(Boolean).join(' ').trim();
  }

  public getRecordUrl(oid?: string): string {
    return `${this.harvestRunApiService.getBrandingAndPortalUrl()}/record/view/${encodeURIComponent(String(oid ?? '').trim())}`;
  }

  public hasCountMismatch(): boolean {
    if (!this.selectedRun) {
      return false;
    }

    const run = this.selectedRun.run;
    const counts = this.selectedRun.aggregateCounts;
    return (
      run.totalProcessed !== counts.totalProcessed
      || run.created !== counts.created
      || run.updated !== counts.updated
      || run.deleted !== counts.deleted
      || run.unchanged !== counts.unchanged
      || run.failed !== counts.failed
      || run.chunksProcessed !== counts.chunksProcessed
    );
  }

  public getSummaryCounts(): Array<{ labelKey: string; value: number; accent: string }> {
    const counts = this.selectedRun?.aggregateCounts;
    if (!counts) {
      return [];
    }

    return [
      { labelKey: 'harvest-runs-col-processed', value: counts.totalProcessed, accent: 'primary' },
      { labelKey: 'harvest-runs-col-created', value: counts.created, accent: 'success' },
      { labelKey: 'harvest-runs-col-updated', value: counts.updated, accent: 'info' },
      { labelKey: 'harvest-runs-col-deleted', value: counts.deleted, accent: 'warning' },
      { labelKey: 'harvest-runs-col-unchanged', value: counts.unchanged, accent: 'muted' },
      { labelKey: 'harvest-runs-col-failed', value: counts.failed, accent: 'danger' },
      { labelKey: 'harvest-runs-col-chunks-processed', value: counts.chunksProcessed, accent: 'neutral' },
      { labelKey: 'harvest-runs-col-duplicate-chunks', value: counts.duplicateChunks, accent: 'neutral' }
    ];
  }

  private async loadRuns(page: number): Promise<void> {
    const requestId = ++this.runRequestId;
    this.loadingRuns = true;
    this.listError = '';
    try {
      const response = await this.harvestRunApiService.listRuns({
        status: this.filters.status,
        recordType: this.filters.recordType,
        sourceName: this.filters.sourceName,
        dateFrom: this.filters.dateFrom,
        dateTo: this.filters.dateTo,
        page,
        pageSize: this.runPageSize
      });

      if (requestId !== this.runRequestId) {
        return;
      }
      this.listResponse = response;
      this.loadedRunPage = page;

      const runIds = new Set(this.listResponse.records.map(run => String(run.id ?? '').trim()).filter(Boolean));
      if (this.selectedRunId && !runIds.has(this.selectedRunId)) {
        ++this.detailRequestId;
        this.loadingDetail = false;
        this.loadingEvents = false;
        ++this.chunkRequestId;
        this.loadingChunks = false;
        this.chunkResponse = this.emptyListResponse<HarvestRunChunkSummary>();
        this.chunkError = '';
        this.detailError = '';
        this.selectedRunId = '';
        this.selectedRun = null;
        this.eventResponse = this.emptyListResponse<HarvestRunEvent>();
      }

      if (!this.selectedRunId && this.listResponse.records.length > 0) {
        const firstRunId = String(this.listResponse.records[0].id ?? '').trim();
        if (firstRunId) {
          await this.selectRun(firstRunId);
        }
      }
    } catch (error) {
      if (requestId !== this.runRequestId) {
        return;
      }
      this.listError = this.getErrorMessage(error, 'harvest-runs-error');
      this.listResponse.summary.page = this.loadedRunPage || 1;
      this.loggerService.error(this.listError);
    } finally {
      if (requestId === this.runRequestId) {
        this.loadingRuns = false;
      }
    }
  }

  private getStatusTranslationKey(status?: string): string {
    const normalizedStatus = String(status ?? '').trim().replaceAll('_', '-');
    return normalizedStatus ? `harvest-runs-status-${normalizedStatus}` : '';
  }

  private getErrorMessage(error: unknown, fallbackKey: string): string {
    if (error && typeof error === 'object') {
      const errorRecord = error as Record<string, unknown>;
      const nestedError = errorRecord['error'] as Record<string, unknown> | undefined;
      const detail = nestedError?.['detail'];
      const message = nestedError?.['message'] ?? errorRecord['message'];
      if (typeof detail === 'string' && detail.trim()) {
        return detail;
      }
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    return this.translationService.t(fallbackKey);
  }

  private createEmptyFilters(): HarvestRunListQuery {
    return {
      status: '',
      recordType: '',
      sourceName: '',
      dateFrom: '',
      dateTo: ''
    };
  }

  private emptyListResponse<T>(): ListApiResponse<T> {
    return {
      summary: {
        numFound: 0,
        page: 1,
        start: 0
      },
      records: []
    };
  }
}
