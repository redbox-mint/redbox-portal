import { APP_BASE_HREF } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { LoggerService, RedboxPortalCoreModule, TranslationService, getStubTranslationService } from '@researchdatabox/portal-ng-common';
import { HarvestRunApiService } from './harvest-run-api.service';
import { HarvestRunsComponent } from './harvest-runs.component';

describe('HarvestRunsComponent', () => {
  let fixture: ComponentFixture<HarvestRunsComponent>;
  let component: HarvestRunsComponent;
  let apiService: jasmine.SpyObj<HarvestRunApiService>;

  beforeEach(async () => {
    apiService = jasmine.createSpyObj<HarvestRunApiService>('HarvestRunApiService', ['waitForInit', 'listRuns', 'getRun', 'listRunEvents', 'getBrandingAndPortalUrl']);
    apiService.waitForInit.and.resolveTo(apiService);
    apiService.getBrandingAndPortalUrl.and.returnValue('base/default/rdmp');
    apiService.listRuns.and.resolveTo({
      summary: { numFound: 1, page: 1, start: 0 },
      records: [{ id: 'run-1', sourceRunId: 'run-a', sourceName: 'source-a', recordType: 'rdmp', status: 'running', totalProcessed: 2, created: 1, updated: 1, deleted: 0, unchanged: 0, failed: 0, chunksProcessed: 1, duplicateChunks: 0 }]
    });
    apiService.getRun.and.resolveTo({
      run: { id: 'run-1', sourceRunId: 'run-a', sourceName: 'source-a', recordType: 'rdmp', status: 'running', totalProcessed: 2, created: 1, updated: 1, deleted: 0, unchanged: 0, failed: 0, chunksProcessed: 1, duplicateChunks: 0 },
      chunks: [{ id: 'chunk-1', contentHash: 'hash-1', status: 'processed', recordCount: 2, totalProcessed: 2, created: 1, updated: 1, deleted: 0, unchanged: 0, failed: 0, duplicate: false, submittedAt: '2026-05-25T10:00:00Z' }],
      events: [],
      aggregateCounts: { totalProcessed: 2, created: 1, updated: 1, deleted: 0, unchanged: 0, failed: 0, chunksProcessed: 1, duplicateChunks: 0 }
    });
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
            'harvest-runs-status-running': 'Running'
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

    expect(apiService.listRuns).toHaveBeenCalled();
    expect(apiService.getRun).toHaveBeenCalledWith('run-1');
    expect(apiService.listRunEvents).toHaveBeenCalledWith('run-1', { page: 1, pageSize: 20 });
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
});
