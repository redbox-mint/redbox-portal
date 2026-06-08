import { Component, Inject } from '@angular/core';
import { PageChangedEvent } from 'ngx-bootstrap/pagination';
import { DateTime } from 'luxon';
import { BaseComponent, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import {
  HarvestRunAggregateCounts,
  HarvestRunApiService,
  HarvestRunDetail,
  HarvestRunEvent,
  HarvestRunListQuery,
  HarvestRunSummary,
  ListApiResponse,
} from './harvest-run-api.service';

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
  readonly displayDateFormat = 'dd/MM/yyyy HH:mm';
  readonly statusOptions: StatusOption[] = [
    { value: '', label: 'All' },
    { value: 'running', label: 'Running' },
    { value: 'completed', label: 'Completed' },
    { value: 'completed_with_errors', label: 'Completed with errors' },
    { value: 'failed', label: 'Failed' },
  ];

  filters: HarvestRunListQuery = this.createEmptyFilters();
  listResponse: ListApiResponse<HarvestRunSummary> = this.emptyListResponse<HarvestRunSummary>();
  eventResponse: ListApiResponse<HarvestRunEvent> = this.emptyListResponse<HarvestRunEvent>();
  selectedRun: HarvestRunDetail | null = null;
  selectedRunId = '';
  loadingRuns = false;
  loadingDetail = false;
  listError = '';
  detailError = '';

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
    if (!trimmedRunId) {
      return;
    }

    this.loadingDetail = true;
    this.detailError = '';
    this.selectedRunId = trimmedRunId;

    try {
      const [detail, events] = await Promise.all([
        this.harvestRunApiService.getRun(trimmedRunId),
        this.harvestRunApiService.listRunEvents(trimmedRunId, { page: 1, pageSize: this.eventPageSize })
      ]);
      this.selectedRun = detail;
      this.eventResponse = events;
    } catch (error) {
      this.selectedRun = null;
      this.eventResponse = this.emptyListResponse<HarvestRunEvent>();
      this.detailError = this.getErrorMessage(error, 'harvest-runs-error');
      this.loggerService.error(this.detailError);
    } finally {
      this.loadingDetail = false;
    }
  }

  public async onRunPageChanged(event: PageChangedEvent): Promise<void> {
    await this.loadRuns(event.page);
  }

  public async onEventPageChanged(event: PageChangedEvent): Promise<void> {
    if (!this.selectedRunId) {
      return;
    }

    this.loadingDetail = true;
    this.detailError = '';
    try {
      this.eventResponse = await this.harvestRunApiService.listRunEvents(this.selectedRunId, {
        page: event.page,
        pageSize: this.eventPageSize
      });
    } catch (error) {
      this.detailError = this.getErrorMessage(error, 'harvest-runs-error');
      this.loggerService.error(this.detailError);
    } finally {
      this.loadingDetail = false;
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
    return [event.message, event.details].filter(Boolean).join(' ').trim();
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
    this.loadingRuns = true;
    this.listError = '';
    try {
      this.listResponse = await this.harvestRunApiService.listRuns({
        status: this.filters.status,
        recordType: this.filters.recordType,
        sourceName: this.filters.sourceName,
        dateFrom: this.filters.dateFrom,
        dateTo: this.filters.dateTo,
        page,
        pageSize: this.runPageSize
      });

      const runIds = new Set(this.listResponse.records.map(run => String(run.id ?? '').trim()).filter(Boolean));
      if (this.selectedRunId && !runIds.has(this.selectedRunId)) {
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
      this.listError = this.getErrorMessage(error, 'harvest-runs-error');
      this.listResponse = this.emptyListResponse<HarvestRunSummary>();
      this.loggerService.error(this.listError);
    } finally {
      this.loadingRuns = false;
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
