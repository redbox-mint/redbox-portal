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
});
