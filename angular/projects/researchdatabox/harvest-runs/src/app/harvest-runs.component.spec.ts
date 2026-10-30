import { APP_BASE_HREF } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { LoggerService, RedboxPortalCoreModule, TranslationService, getStubTranslationService } from '@researchdatabox/portal-ng-common';
import { HarvestRunApiService, HarvestRunDetail } from './harvest-run-api.service';
import { HarvestRunsComponent } from './harvest-runs.component';

describe('HarvestRunsComponent', () => {
  let fixture: ComponentFixture<HarvestRunsComponent>;
  let component: HarvestRunsComponent;
  let detail: HarvestRunDetail;
  let apiService: jasmine.SpyObj<HarvestRunApiService>;

  beforeEach(async () => {
    apiService = jasmine.createSpyObj<HarvestRunApiService>('HarvestRunApiService', ['waitForInit', 'listRuns', 'getRun', 'listRunEvents', 'listRunChunks', 'getBrandingAndPortalUrl']);
    apiService.waitForInit.and.resolveTo(apiService);
    apiService.getBrandingAndPortalUrl.and.returnValue('base/default/rdmp');
    apiService.listRuns.and.resolveTo({
      summary: { numFound: 1, page: 1, start: 0 },
      records: [{ id: 'run-1', sourceRunId: 'run-a', sourceName: 'source-a', recordType: 'rdmp', status: 'running', totalProcessed: 2, created: 1, updated: 1, deleted: 0, unchanged: 0, failed: 0, chunksProcessed: 1, duplicateChunks: 0 }]
    });
    detail = {
      run: { id: 'run-1', sourceRunId: 'run-a', sourceName: 'source-a', recordType: 'rdmp', status: 'running', totalProcessed: 2, created: 1, updated: 1, deleted: 0, unchanged: 0, failed: 0, chunksProcessed: 1, duplicateChunks: 0 },
      chunks: [{ id: 'chunk-1', contentHash: 'hash-1', status: 'processed', recordCount: 2, totalProcessed: 2, created: 1, updated: 1, deleted: 0, unchanged: 0, failed: 0, duplicate: false, submittedAt: '2026-05-25T10:00:00Z' }],
      chunksTotal: 1,
      events: [{ id: 'event-1', harvestId: 'harvest-1', oid: 'oid-1', operation: 'upsert', outcome: 'updated', status: true, message: 'Updated successfully', createdAt: '2026-05-25T10:01:00Z' }],
      eventsTotal: 42,
      aggregateCounts: { totalProcessed: 2, created: 1, updated: 1, deleted: 0, unchanged: 0, failed: 0, chunksProcessed: 1, duplicateChunks: 0 }
    };
    apiService.listRunChunks.and.resolveTo({ summary: { numFound: 42, page: 2, start: 20 }, records: detail.chunks });
    apiService.getRun.and.resolveTo(detail);
    apiService.listRunEvents.and.resolveTo({
      summary: { numFound: 1, page: 1, start: 0 },
      records: [{ id: 'event-1', harvestId: 'harvest-1', oid: 'oid-1', operation: 'upsert', outcome: 'updated', status: true, message: 'Updated successfully', createdAt: '2026-05-25T10:01:00Z' }]
    });

    await TestBed.configureTestingModule({
      declarations: [HarvestRunsComponent],
      imports: [FormsModule, RedboxPortalCoreModule],
      providers: [
        LoggerService,
        {
          provide: APP_BASE_HREF,
          useValue: 'base'
        },
        {
          provide: TranslationService,
          useValue: getStubTranslationService({
            'harvest-runs-history-expired': 'Some detailed history has expired. Summary counts cover the full run.',
            'harvest-runs-heading': 'Harvest runs',
            'harvest-runs-loading': 'Loading harvest runs',
            'harvest-runs-empty': 'No harvest runs found.',
            'harvest-runs-filter-apply': 'Apply filters',
            'harvest-runs-filter-clear': 'Clear filters',
            'harvest-runs-detail-summary': 'Summary',
            'harvest-runs-detail-chunks': 'Chunks',
            'harvest-runs-detail-events': 'Events',
            'harvest-runs-select-run': 'Select a harvest run to view its details.',
            'harvest-runs-col-processed': 'Processed',
            'harvest-runs-col-created': 'Created',
            'harvest-runs-col-updated': 'Updated',
            'harvest-runs-col-deleted': 'Deleted',
            'harvest-runs-col-failed': 'Failed',
            'harvest-runs-col-unchanged': 'Unchanged',
            'harvest-runs-col-chunks-processed': 'Chunks processed',
            'harvest-runs-col-duplicate-chunks': 'Duplicate chunks',
            'harvest-runs-status-running': 'Running',
            'harvest-runs-outcome-all': 'All outcomes',
            'harvest-runs-outcome-failed': 'Failed',
            'harvest-runs-filter-harvest-id': 'Harvest ID (exact match)',
            'harvest-runs-no-matching-events': 'No events match these filters.'
          })
        },
        {
          provide: HarvestRunApiService,
          useValue: apiService
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(HarvestRunsComponent);
    component = fixture.componentInstance;
  });

  it('loads runs and the initial selected run detail on init', async () => {
    fixture.autoDetectChanges(true);

    await component.waitForInit();
    await fixture.whenStable();

    expect(apiService.listRuns).toHaveBeenCalledTimes(1);
    expect(apiService.getRun).toHaveBeenCalledWith('run-1');
    expect(apiService.getRun).toHaveBeenCalledTimes(1);
    expect(apiService.listRunEvents).not.toHaveBeenCalled();
    expect(component.eventResponse.summary.numFound).toBe(42);
    expect(fixture.nativeElement.textContent).toContain('source-a');
    expect(fixture.nativeElement.textContent).toContain('harvest-1');
  });

  it('applies current filters when requested', async () => {
    fixture.autoDetectChanges(true);

    await component.waitForInit();
    await fixture.whenStable();

    apiService.listRuns.calls.reset();
    component.filters.status = 'failed';
    component.filters.recordType = 'dataRecord';
    component.filters.sourceName = 'source-b';

    await component.applyFilters();

    expect(apiService.listRuns).toHaveBeenCalledWith({
      status: 'failed',
      recordType: 'dataRecord',
      sourceName: 'source-b',
      dateFrom: '',
      dateTo: '',
      page: 1,
      pageSize: 20
    });
  });

  it('shows the empty state when no runs are returned', async () => {
    apiService.listRuns.and.resolveTo({ summary: { numFound: 0, page: 1, start: 0 }, records: [] });

    fixture.autoDetectChanges(true);

    await component.waitForInit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No harvest runs found.');
  });
  it('ignores repeated clicks on the selected run, including while it is loading', async () => {
    let resolveDetail!: (value: HarvestRunDetail) => void;
    apiService.getRun.and.returnValue(new Promise(resolve => { resolveDetail = resolve; }));
    const pending = component.selectRun('run-1');
    await component.selectRun('run-1');
    expect(apiService.getRun).toHaveBeenCalledTimes(1);
    resolveDetail(detail);
    await pending;
    await component.selectRun('run-1');
    expect(apiService.getRun).toHaveBeenCalledTimes(1);
  });

  it('allows retrying a failed selection', async () => {
    apiService.getRun.and.rejectWith(new Error('Unavailable'));
    await component.selectRun('run-1');
    apiService.getRun.and.resolveTo(detail);
    await component.selectRun('run-1');
    expect(component.selectedRun).toBe(detail);
    expect(component.detailError).toBe('');
    expect(apiService.getRun).toHaveBeenCalledTimes(2);
  });

  it('keeps the latest selection when an older detail request finishes last', async () => {
    let resolveOld!: (value: HarvestRunDetail) => void;
    apiService.getRun.and.returnValue(new Promise(resolve => { resolveOld = resolve; }));
    const pending = component.selectRun('run-1');
    const latest = { ...detail, run: { ...detail.run, id: 'run-2' } };
    apiService.getRun.and.resolveTo(latest);
    await component.selectRun('run-2');
    resolveOld(detail);
    await pending;
    expect(component.selectedRunId).toBe('run-2');
    expect(component.selectedRun).toBe(latest);
    expect(component.loadingDetail).toBeFalse();
  });

  it('requests events only when changing pages and suppresses repeated page events', async () => {
    await component.selectRun('run-1');
    await component.onEventPageChanged({ page: 1, itemsPerPage: 20 });
    expect(apiService.listRunEvents).not.toHaveBeenCalled();
    const pending = component.onEventPageChanged({ page: 2, itemsPerPage: 20 });
    await component.onEventPageChanged({ page: 2, itemsPerPage: 20 });
    await pending;
    await component.onEventPageChanged({ page: 2, itemsPerPage: 20 });
    expect(apiService.listRunEvents).toHaveBeenCalledOnceWith('run-1', { outcome: '', harvestId: '', page: 2, pageSize: 20 });
    expect(apiService.getRun).toHaveBeenCalledTimes(1);
  });

  it('discards events from a previous run when the selection changes', async () => {
    await component.selectRun('run-1');
    let resolveEvents!: (value: Awaited<ReturnType<HarvestRunApiService['listRunEvents']>>) => void;
    apiService.listRunEvents.and.returnValue(new Promise(resolve => { resolveEvents = resolve; }));
    const pending = component.onEventPageChanged({ page: 2, itemsPerPage: 20 });
    const latest = { ...detail, run: { ...detail.run, id: 'run-2' } };
    apiService.getRun.and.resolveTo(latest);
    await component.selectRun('run-2');
    resolveEvents({ summary: { numFound: 0, page: 2, start: 20 }, records: [] });
    await pending;
    expect(component.selectedRun).toBe(latest);
    expect(component.eventResponse.records).toEqual(latest.events);
    expect(component.eventResponse.summary.page).toBe(1);
  });

  it('does not refetch page 2 when the loading state recreates pagination', async () => {
    fixture.autoDetectChanges(true);
    await component.waitForInit();
    await fixture.whenStable();

    let resolveEvents!: (value: Awaited<ReturnType<HarvestRunApiService['listRunEvents']>>) => void;
    apiService.listRunEvents.and.returnValue(new Promise(resolve => { resolveEvents = resolve; }));
    const links: HTMLAnchorElement[] = Array.from(fixture.nativeElement.querySelectorAll('pagination a'));
    links.find(link => link.textContent?.trim() === '2')!.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('pagination')).toBeNull();

    resolveEvents({ summary: { numFound: 42, page: 2, start: 20 }, records: detail.events });
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('pagination .active').textContent.trim()).toBe('2');
    expect(apiService.listRunEvents).toHaveBeenCalledOnceWith('run-1', { outcome: '', harvestId: '', page: 2, pageSize: 20 });
  });

  it('filters failed events by exact harvest ID through the form', async () => {
    fixture.autoDetectChanges(true);
    await component.waitForInit();
    await fixture.whenStable();
    const outcome: HTMLSelectElement = fixture.nativeElement.querySelector('#harvest-events-outcome');
    outcome.value = 'failed';
    outcome.dispatchEvent(new Event('change'));
    const harvestId: HTMLInputElement = fixture.nativeElement.querySelector('#harvest-events-id');
    harvestId.value = '  source:id/123  ';
    harvestId.dispatchEvent(new Event('input'));
    apiService.listRunEvents.and.resolveTo({ summary: { numFound: 0, page: 1, start: 0 }, records: [] });
    harvestId.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(apiService.listRunEvents).toHaveBeenCalledOnceWith('run-1', {
      outcome: 'failed', harvestId: 'source:id/123', page: 1, pageSize: 20
    });
    expect(apiService.getRun).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('No events match these filters.');
    expect(fixture.nativeElement.querySelector('#harvest-events-id')).not.toBeNull();
  });

  it('retains applied event filters across pages without applying unsaved edits', async () => {
    await component.selectRun('run-1');
    component.eventFilters = { outcome: 'failed', harvestId: 'id-1' };
    await component.applyEventFilters();
    component.eventFilters.harvestId = 'unsaved';
    await component.onEventPageChanged({ page: 2, itemsPerPage: 20 });
    expect(apiService.listRunEvents.calls.mostRecent().args).toEqual(['run-1', {
      outcome: 'failed', harvestId: 'id-1', page: 2, pageSize: 20
    }]);
    await component.clearEventFilters();
    expect(apiService.listRunEvents.calls.mostRecent().args).toEqual(['run-1', {
      outcome: '', harvestId: '', page: 1, pageSize: 20
    }]);
    expect(apiService.getRun).toHaveBeenCalledTimes(1);
  });

  it('ignores unchanged filter submissions and retries failed filtered requests', async () => {
    await component.selectRun('run-1');
    await component.applyEventFilters();
    expect(apiService.listRunEvents).not.toHaveBeenCalled();
    component.eventFilters.outcome = 'failed';
    apiService.listRunEvents.and.rejectWith(new Error('Unavailable'));
    await component.applyEventFilters();
    expect(component.selectedRun).toBe(detail);
    expect(component.loadingEvents).toBeFalse();
    apiService.listRunEvents.and.resolveTo({ summary: { numFound: 0, page: 1, start: 0 }, records: [] });
    await component.applyEventFilters();
    expect(apiService.listRunEvents).toHaveBeenCalledTimes(2);
    expect(component.detailError).toBe('');
  });

  it('resets event filters when selecting another run', async () => {
    await component.selectRun('run-1');
    component.eventFilters = { outcome: 'failed', harvestId: 'id-1' };
    await component.applyEventFilters();
    await component.selectRun('run-2');
    expect(component.eventFilters).toEqual({ outcome: '', harvestId: '' });
    expect(component.eventResponse.records).toEqual(detail.events);
    expect(component.eventResponse.summary.numFound).toBe(42);
    expect(apiService.listRunEvents).toHaveBeenCalledTimes(1);
  });

  it('includes the specific failure code and details in the event message', () => {
    expect(component.getEventMessage({ ...detail.events[0], outcome: 'failed', status: false,
      errorCode: 'VALIDATION_ERROR', message: 'Record invalid', details: 'Title is required'
    })).toBe('VALIDATION_ERROR Record invalid Title is required');
  });

  it('loads the next chunk page without refetching detail and suppresses pagination recreation events', async () => {
    detail.chunksTotal = 1332;
    fixture.autoDetectChanges(true);
    await component.waitForInit();
    await fixture.whenStable();
    let resolveChunks!: (value: Awaited<ReturnType<HarvestRunApiService['listRunChunks']>>) => void;
    apiService.listRunChunks.and.returnValue(new Promise(resolve => { resolveChunks = resolve; }));
    const section: HTMLElement = fixture.nativeElement.querySelector('.hr-chunks');
    const links = Array.from(section.querySelectorAll('pagination a'));
    (links.find(link => link.textContent?.trim() === '2') as HTMLAnchorElement).click();
    fixture.detectChanges();
    expect(section.querySelector('pagination')).toBeNull();
    resolveChunks({ summary: { numFound: 1332, page: 2, start: 20 }, records: detail.chunks });
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(section.querySelector('pagination .active')?.textContent?.trim()).toBe('2');
    expect(apiService.listRunChunks).toHaveBeenCalledOnceWith('run-1', 2, 20);
    expect(apiService.getRun).toHaveBeenCalledTimes(1);
    expect(apiService.listRunEvents).not.toHaveBeenCalled();
    expect(section.querySelector('.hr-section__count')?.textContent?.trim()).toBe('1332');
  });

  it('keeps chunks from the latest selection when an older chunk page finishes', async () => {
    await component.selectRun('run-1');
    let resolveChunks!: (value: Awaited<ReturnType<HarvestRunApiService['listRunChunks']>>) => void;
    apiService.listRunChunks.and.returnValue(new Promise(resolve => { resolveChunks = resolve; }));
    const pending = component.onChunkPageChanged({ page: 2, itemsPerPage: 20 });
    await component.selectRun('run-2');
    resolveChunks({ summary: { numFound: 0, page: 2, start: 20 }, records: [] });
    await pending;
    expect(component.chunkResponse.records).toEqual(detail.chunks);
    expect(component.chunkResponse.summary.page).toBe(1);
    expect(component.loadingChunks).toBeFalse();
  });

  it('keeps the previous chunk page on failure and allows retrying', async () => {
    await component.selectRun('run-1');
    apiService.listRunChunks.and.rejectWith(new Error('Unavailable'));
    await component.onChunkPageChanged({ page: 2, itemsPerPage: 20 });
    expect(component.chunkResponse.records).toEqual(detail.chunks);
    expect(component.chunkResponse.summary.page).toBe(1);
    expect(component.loadingChunks).toBeFalse();
    apiService.listRunChunks.and.resolveTo({ summary: { numFound: 42, page: 2, start: 20 }, records: detail.chunks });
    await component.onChunkPageChanged({ page: 2, itemsPerPage: 20 });
    expect(apiService.listRunChunks).toHaveBeenCalledTimes(2);
    expect(component.chunkError).toBe('');
  });

  it('does not refetch a run page when loading recreates the pagination control', async () => {
    apiService.listRuns.and.resolveTo({ summary: { numFound: 42, page: 1, start: 0 }, records: [detail.run] });
    fixture.autoDetectChanges(true);
    await component.waitForInit();
    await fixture.whenStable();
    let resolveRuns!: (value: Awaited<ReturnType<HarvestRunApiService['listRuns']>>) => void;
    apiService.listRuns.and.returnValue(new Promise(resolve => { resolveRuns = resolve; }));
    const section: HTMLElement = fixture.nativeElement.querySelector('.hr-section');
    const links = Array.from(section.querySelectorAll('pagination a'));
    (links.find(link => link.textContent?.trim() === '2') as HTMLAnchorElement).click();
    fixture.detectChanges();
    expect(section.querySelector('pagination')).toBeNull();
    resolveRuns({ summary: { numFound: 42, page: 2, start: 20 }, records: [detail.run] });
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(section.querySelector('pagination .active')?.textContent?.trim()).toBe('2');
    expect(apiService.listRuns).toHaveBeenCalledTimes(2);
  });

  it('discards an older filtered run list when a newer request finishes first', async () => {
    let resolveRuns!: (value: Awaited<ReturnType<HarvestRunApiService['listRuns']>>) => void;
    apiService.listRuns.and.returnValue(new Promise(resolve => { resolveRuns = resolve; }));
    const pending = component.applyFilters();
    apiService.listRuns.and.resolveTo({ summary: { numFound: 0, page: 1, start: 0 }, records: [] });
    await component.clearFilters();
    resolveRuns({ summary: { numFound: 42, page: 1, start: 0 }, records: [detail.run] });
    await pending;
    expect(component.listResponse.records).toEqual([]);
    expect(apiService.getRun).not.toHaveBeenCalled();
  });

  it('keeps records first and chunks collapsed, with outcomes and chunk drill-down', async () => {
    fixture.autoDetectChanges(true);
    await component.waitForInit();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const chunks = el.querySelector('details.hr-chunks') as HTMLDetailsElement;
    expect(chunks.open).toBeFalse();
    expect(el.querySelector('#harvest-records')!.compareDocumentPosition(chunks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chunks.textContent).toContain('Created: 1');
    await component.viewChunkRecords(detail.chunks[0], true);
    expect(apiService.listRunEvents.calls.mostRecent().args).toEqual(['run-1', {
      outcome: 'failed', harvestId: '', chunkId: 'chunk-1', page: 1, pageSize: 20
    }]);
    await component.onEventPageChanged({page: 2, itemsPerPage: 20});
    expect(apiService.listRunEvents.calls.mostRecent().args[1]?.chunkId).toBe('chunk-1');
    await component.clearEventFilters();
    expect(apiService.listRunEvents.calls.mostRecent().args[1]?.chunkId).toBeUndefined();
    await component.viewChunkRecords(detail.chunks[0]);
    await component.selectRun('run-2');
    expect(component.selectedChunk).toBeNull();
  });

  it('does not invent a duration for unfinished or invalid chunk timestamps', () => {
    const chunk = detail.chunks[0];
    expect(component.getChunkDuration(chunk)).toBe('—');
    expect(component.getChunkDuration({...chunk, completedAt: '2026-05-25T10:00:01.500Z'})).toBe('1.5 s');
    expect(component.getChunkDuration({...chunk, completedAt: '2026-05-25T09:59:00Z'})).toBe('—');
  });

  it('discloses expired detail while keeping original summary counts', async () => {
    detail.run.historyRetention = {prunedAt: '2026-10-30T00:00:00Z', successfulDays: 90, failedDays: 365, complete: false};
    detail.events = [];
    detail.eventsTotal = 0;
    fixture.autoDetectChanges(true);
    await component.waitForInit();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Some detailed history has expired.');
    expect(component.getSummaryCounts()[0].value).toBe(2);
    expect(component.hasCountMismatch()).toBeFalse();
  });

  it('filters records by outcome from the summary tiles and tracks the active tile', async () => {
    await component.selectRun('run-1');
    expect(component.activeOutcome).toBe('');
    await component.viewChunkRecords(detail.chunks[0]);
    expect(component.activeOutcome).toBeNull();

    await component.filterByOutcome('failed');
    expect(apiService.listRunEvents.calls.mostRecent().args).toEqual(['run-1', {
      outcome: 'failed', harvestId: '', page: 1, pageSize: 20
    }]);
    expect(component.selectedChunk).toBeNull();
    expect(component.activeOutcome).toBe('failed');
    expect(component.getSummaryCounts().map(count => count.outcome))
      .toEqual(['', 'created', 'updated', 'unchanged', 'deleted', 'failed']);
  });

});
