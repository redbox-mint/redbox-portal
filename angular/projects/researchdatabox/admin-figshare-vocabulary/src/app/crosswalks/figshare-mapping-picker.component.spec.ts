import { DestroyRef, Injector, runInInjectionContext } from '@angular/core';
import { LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import { FigshareMappingPickerComponent } from './figshare-mapping-picker.component';
import {
  FigshareCrosswalkLocalEntry,
  FigshareSourceCategory,
  FigshareVocabularyApiService
} from '../services/figshare-vocabulary-api.service';

describe('FigshareMappingPickerComponent', () => {
  let component: FigshareMappingPickerComponent;
  let api: jasmine.SpyObj<FigshareVocabularyApiService>;

  const categories: FigshareSourceCategory[] = [
    {
      id: 'cat-1',
      sourceId: '3001',
      categoryId: 23815,
      title: 'Agricultural biotechnology',
      selectable: true,
      historical: false
    },
    {
      id: 'cat-2',
      sourceId: '300199',
      categoryId: 23848,
      title: 'Agricultural biotechnology not elsewhere classified',
      selectable: true,
      historical: false
    }
  ];

  const localEntries: FigshareCrosswalkLocalEntry[] = [
    { id: 'entry-1', label: 'Agricultural biotechnology', value: '3001', historical: false, targetCount: 1 },
    { id: 'entry-2', label: 'Agricultural hydrology', value: '300201', historical: false, targetCount: 0 }
  ];

  function build(localTerm: FigshareMappingPickerComponent['localTerm'] = null): FigshareMappingPickerComponent {
    const injector = Injector.create({
      providers: [{ provide: DestroyRef, useValue: { onDestroy: () => () => undefined } }]
    });
    const logger = jasmine.createSpyObj<LoggerService>('LoggerService', ['error']);
    const translations = jasmine.createSpyObj<TranslationService>('TranslationService', ['t']);
    translations.t.and.callFake((key: string | string[], defaultValue?: unknown) =>
      typeof defaultValue === 'string' ? defaultValue : String(key));
    const picker = runInInjectionContext(
      injector,
      () => new FigshareMappingPickerComponent(logger, translations, api)
    );
    picker.crosswalkId = 'crosswalk-1';
    picker.sourceId = 'source-1';
    picker.revision = 2;
    picker.localTerm = localTerm;
    return picker;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<FigshareVocabularyApiService>('FigshareVocabularyApiService', [
      'listSourceCategories',
      'listCrosswalkLocalEntries',
      'listMappings'
    ]);
    api.listSourceCategories.and.resolveTo({ records: categories, total: 2 });
    api.listCrosswalkLocalEntries.and.resolveTo({ records: localEntries, total: 2 });
    api.listMappings.and.resolveTo({
      records: [
        {
          id: 'mapping-1',
          revision: 2,
          status: 'approved',
          matchType: 'exact-code',
          localEntryId: 'entry-1',
          localLabel: 'Agricultural biotechnology',
          localValue: '3001',
          figshareCategoryId: 'cat-1',
          figshareSourceId: '3001',
          figshareCategoryNumber: 23815,
          historical: false,
          approvedAt: null,
          approvedBy: null
        },
        {
          id: 'mapping-2',
          revision: 2,
          status: 'approved',
          matchType: 'exact-code',
          localEntryId: 'entry-9',
          localLabel: 'Another term that also matched the search',
          localValue: '3001x',
          figshareCategoryId: 'cat-2',
          figshareSourceId: '300199',
          figshareCategoryNumber: 23848,
          historical: false,
          approvedAt: null,
          approvedBy: null
        }
      ],
      total: 2
    });
  });

  it('loads targets and local terms when no local term is fixed', async () => {
    component = build();

    await component.ngOnInit();

    expect(component.categories).toHaveSize(2);
    expect(component.localEntries).toHaveSize(2);
    expect(component.canConfirm).toBeFalse();
  });

  it('skips the local term search and loads current targets when opened from a row', async () => {
    component = build({ id: 'entry-1', label: 'Agricultural biotechnology', value: '3001' });

    await component.ngOnInit();

    expect(api.listCrosswalkLocalEntries).not.toHaveBeenCalled();
    expect(component.resolvedLocalEntryId).toBe('entry-1');
    expect(component.localTermLabel).toBe('3001 — Agricultural biotechnology');
  });

  /** The mapping search matches other terms too, so the page must be filtered back down. */
  it('shows only the chosen term’s targets as already mapped', async () => {
    component = build({ id: 'entry-1', label: 'Agricultural biotechnology', value: '3001' });

    await component.ngOnInit();

    expect(component.currentTargets).toEqual([{ id: 'cat-1', label: '3001 (23815)' }]);
    expect(component.isAlreadyMapped(categories[0])).toBeTrue();
    expect(component.isAlreadyMapped(categories[1])).toBeFalse();
  });

  it('requests only unmapped terms when the filter is on', async () => {
    component = build();
    await component.ngOnInit();

    await component.toggleUnmappedOnly(true);

    expect(api.listCrosswalkLocalEntries).toHaveBeenCalledWith('crosswalk-1', jasmine.objectContaining({
      mapped: 'unmapped',
      revision: 2
    }));
  });

  it('keeps historical targets out of the list until they are requested', async () => {
    component = build();
    await component.ngOnInit();

    expect(api.listSourceCategories).toHaveBeenCalledWith('source-1', jasmine.objectContaining({
      includeHistorical: false
    }));

    await component.toggleIncludeHistorical(true);

    expect(api.listSourceCategories).toHaveBeenCalledWith('source-1', jasmine.objectContaining({
      includeHistorical: true
    }));
  });

  it('emits the chosen edge once both sides are selected', async () => {
    component = build();
    await component.ngOnInit();
    const emitted: unknown[] = [];
    component.confirmed.subscribe((selection) => emitted.push(selection));

    await component.selectLocalEntry(localEntries[1]);
    component.selectCategory(categories[1]);

    expect(component.canConfirm).toBeTrue();
    component.confirm();

    expect(emitted).toEqual([{
      localEntryId: 'entry-2',
      localLabel: '300201 — Agricultural hydrology',
      figshareCategoryId: 'cat-2',
      targetLabel: '300199 (23848)'
    }]);
  });

  it('drops a target selection when the local term is changed', async () => {
    component = build();
    await component.ngOnInit();
    await component.selectLocalEntry(localEntries[0]);
    component.selectCategory(categories[1]);

    component.clearLocalEntry();

    expect(component.selectedCategoryId).toBe('');
    expect(component.currentTargets).toEqual([]);
    expect(component.canConfirm).toBeFalse();
  });

  /** Both lists load in parallel, so the successful one must not clear the other's error. */
  it('reports a readable message when the categories cannot be loaded', async () => {
    api.listSourceCategories.and.rejectWith({ status: 500 });
    component = build();

    await component.ngOnInit();

    expect(component.targetErrorMessage).toBe('The Figshare categories could not be loaded.');
    expect(component.localErrorMessage).toBe('');
    expect(component.localEntries).toHaveSize(2);
    expect(component.categoriesLoading).toBeFalse();
  });
});
