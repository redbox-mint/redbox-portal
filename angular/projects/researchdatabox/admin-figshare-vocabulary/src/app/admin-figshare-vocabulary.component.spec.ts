import { LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import { ApplicationRef, ChangeDetectorRef, Injector, NgZone, runInInjectionContext } from '@angular/core';
import { AdminFigshareVocabularyComponent } from './admin-figshare-vocabulary.component';
import { FigshareVocabularyApiService } from './services/figshare-vocabulary-api.service';

describe('AdminFigshareVocabularyComponent', () => {
  let component: AdminFigshareVocabularyComponent;
  let api: jasmine.SpyObj<FigshareVocabularyApiService>;

  beforeEach(() => {
    const injector = Injector.create({
      providers: [
        { provide: ChangeDetectorRef, useValue: jasmine.createSpyObj<ChangeDetectorRef>('ChangeDetectorRef', ['detectChanges']) },
        { provide: NgZone, useValue: jasmine.createSpyObj<NgZone>('NgZone', ['run']) },
        { provide: ApplicationRef, useValue: jasmine.createSpyObj<ApplicationRef>('ApplicationRef', ['tick']) }
      ]
    });
    const logger = jasmine.createSpyObj<LoggerService>('LoggerService', ['error']);
    const translations = jasmine.createSpyObj<TranslationService>('TranslationService', ['waitForInit', 't']);
    translations.t.and.callFake(
      (
        key: string | string[],
        defaultValueOrOptions?: string | Parameters<TranslationService['t']>[2],
        _options?: Parameters<TranslationService['t']>[2]
      ) => (typeof defaultValueOrOptions === 'string' ? defaultValueOrOptions : key)
    );
    api = jasmine.createSpyObj<FigshareVocabularyApiService>('FigshareVocabularyApiService', [
      'waitForInit',
      'listSources',
      'listCrosswalks',
      'listSyncRuns',
      'listLocalVocabularies',
      'discoverTaxonomies'
    ]);
    component = runInInjectionContext(
      injector,
      () => new AdminFigshareVocabularyComponent(logger, translations, api)
    );
  });

  it('summarises sources, approved crosswalks, and historical warnings', () => {
    component.sourceTotal = 3;
    component.sources = [
      {
        id: 'source-1',
        displayName: 'Taxonomy',
        scope: 'public',
        taxonomyId: '1',
        vocabularyId: 'vocabulary-1',
        vocabularyName: 'Taxonomy',
        lastSyncedAt: null,
        archived: false,
        mirroredCount: 10,
        historicalCount: 2,
        crosswalkCount: 1
      }
    ];
    component.crosswalks = [
      {
        id: 'crosswalk-1',
        name: 'Approved',
        status: 'approved',
        workingRevision: 1,
        approvedRevision: 1,
        localVocabularyId: 'local-1',
        localVocabularyName: 'Local',
        figshareSourceId: 'source-1',
        figshareSourceName: 'Taxonomy',
        scope: 'public',
        taxonomyId: '1',
        approvedMappingCount: 5,
        workingMappingCount: 5,
        historicalTargetCount: 0
      },
      {
        id: 'crosswalk-2',
        name: 'Draft',
        status: 'draft',
        workingRevision: 1,
        approvedRevision: null,
        localVocabularyId: 'local-1',
        localVocabularyName: 'Local',
        figshareSourceId: 'source-1',
        figshareSourceName: 'Taxonomy',
        scope: 'public',
        taxonomyId: '1',
        approvedMappingCount: 0,
        workingMappingCount: 2,
        historicalTargetCount: 0
      }
    ];

    expect(component.totalSources).toBe(3);
    expect(component.approvedCrosswalkCount).toBe(1);
    expect(component.syncWarningCount).toBe(2);
  });

  it('starts an import after loading editable local vocabularies', async () => {
    api.listLocalVocabularies.and.resolveTo([
      { id: 'local-1', name: 'Local taxonomy', slug: 'local-taxonomy', source: 'local' }
    ]);

    await component.startImport();

    expect(component.view).toBe('import');
    expect(component.localVocabularies).toHaveSize(1);
    expect(component.wizardError).toBe('');
  });

  it('returns to sources and clears wizard errors when import is cancelled', () => {
    component.view = 'import';
    component.wizardError = 'Unable to discover taxonomies';

    component.cancelImport();

    expect(component.view).toBe('sources');
    expect(component.wizardError).toBe('');
  });

  it('explains when ReDBox cannot be reached without exposing transport details', async () => {
    api.listLocalVocabularies.and.rejectWith({
      status: 0,
      message: 'Http failure response for http://internal-host/api/vocabulary: 0 Unknown Error'
    });

    await component.startImport();

    expect(component.wizardError).toBe(
      'ReDBox could not be reached. Check your connection, refresh the page, and try again.'
    );
    expect(component.wizardError).not.toContain('internal-host');
    expect(component.wizardError).not.toContain('Http failure response');
  });

  it('directs administrators to Figshare settings when catalogue access is unavailable', async () => {
    api.discoverTaxonomies.and.rejectWith({
      status: 502,
      error: { errors: [{ title: 'Figshare unavailable', detail: 'Figshare is not configured for this brand' }] }
    });

    await component.discoverTaxonomies('public');

    expect(component.wizardError).toBe(
      'ReDBox could not connect to Figshare. Go to Admin → Navigation → Figshare publishing configuration, check the settings for this brand, then try again.'
    );
    expect(component.wizardError).not.toContain('502');
  });

  it('renders stored timestamps in the shared admin display format', () => {
    expect(component.formatDate('2026-07-28T05:17:04.771Z')).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    expect(component.formatDate(null)).toBe('');
    expect(component.formatDate('not-a-date')).toBe('not-a-date');
  });

  it('maps catalogue scopes onto translation keys rather than showing the raw value', () => {
    expect(component.scopeLabelKey('account')).toBe('figshare-vocab-scope-account');
    expect(component.scopeLabelKey('public')).toBe('figshare-vocab-scope-public');
  });

  it('saves an added target against the working revision and reloads the page', async () => {
    component.activeCrosswalk = { id: 'crosswalk-1', workingRevision: 2 } as any;
    (api as any).saveMappings = jasmine.createSpy('saveMappings')
      .and.resolveTo({ id: 'crosswalk-1', workingRevision: 3 } as any);
    (api as any).listMappings = jasmine.createSpy('listMappings').and.resolveTo({ records: [], total: 0 });
    component.crosswalkError = 'a previous failure';

    await component.onMappingAdded({ op: 'add', localEntryId: 'entry-1', figshareCategoryId: 'cat-9' });

    expect((api as any).saveMappings).toHaveBeenCalledWith('crosswalk-1', {
      revision: 2,
      changes: [{ op: 'add', localEntryId: 'entry-1', figshareCategoryId: 'cat-9' }]
    });
    // The first edit of an approved crosswalk forks a revision server-side.
    expect(component.activeCrosswalk?.workingRevision).toBe(3);
    expect(component.crosswalkMessage).toBe('Target added to the working revision.');
    expect(component.crosswalkError).toBe('');
    expect(component.crosswalkSaving).toBeFalse();
    expect((api as any).listMappings).toHaveBeenCalled();
  });

  it('surfaces a save failure without clearing the working revision', async () => {
    component.activeCrosswalk = { id: 'crosswalk-1', workingRevision: 2 } as any;
    (api as any).saveMappings = jasmine.createSpy('saveMappings').and.rejectWith({ status: 409 });

    await component.onMappingAdded({ op: 'add', localEntryId: 'entry-1', figshareCategoryId: 'cat-9' });

    expect(component.crosswalkError).toBe('The request could not be completed. Please try again.');
    expect(component.crosswalkMessage).toBe('');
    expect(component.activeCrosswalk?.workingRevision).toBe(2);
  });

  it('clears a stale banner and marks the row busy while a clone runs', async () => {
    const source = { id: 'source-1', displayName: 'Taxonomy' } as any;
    let busyDuringCall = '';
    (api as any).cloneSource = jasmine.createSpy('cloneSource').and.callFake(async () => {
      busyDuringCall = component.busySourceId;
      return { localVocabularyId: 'local-1', crosswalkId: 'crosswalk-1', entries: 12 };
    });
    api.listCrosswalks.and.resolveTo({ data: [], total: 0 } as any);
    component.error = 'a previous failure';

    await component.cloneSource(source);

    expect(busyDuringCall).toBe('source-1');
    expect(component.busySourceId).toBe('');
    expect(component.error).toBe('');
    expect(component.message).toContain('Editable clone created');
  });
});
