import { TranslationService } from '@researchdatabox/portal-ng-common';
import { AdminCountPipe } from '@researchdatabox/portal-ng-common';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NqListComponent, NamedQueryListQueryState } from './nq-list.component';
import { NamedQueryDefinition } from '../named-query-api.service';

@Pipe({ name: 'i18next', standalone: false })
class I18NextPipeStub implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('NqListComponent', () => {
  let fixture: ComponentFixture<NqListComponent>;
  let component: NqListComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NqListComponent, I18NextPipeStub],
      imports: [AdminCountPipe, FormsModule],
      providers: [{ provide: TranslationService, useValue: { t: (key: string) => key } }],
    }).compileComponents();

    fixture = TestBed.createComponent(NqListComponent);
    component = fixture.componentInstance;
  });

  it('opens the editor with a native list-name button', () => {
    component.queries = [
      { name: 'q1', collectionName: 'record', resultObjectMapping: {}, mongoQuery: {}, queryParams: {} },
    ];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rb-admin-list-name').type).toBe('button');
    const selected = spyOn(component.selected, 'emit');
    fixture.nativeElement.querySelector('.rb-admin-list-name').click();
    expect(selected).toHaveBeenCalledWith('q1');
  });

  it('emits selected and deleted actions', () => {
    let selectedName = '';
    let deletedName = '';
    component.selected.subscribe((name: string) => (selectedName = name));
    component.deleted.subscribe((name: string) => (deletedName = name));

    component.open('q1');
    component.remove('q2');

    expect(selectedName).toBe('q1');
    expect(deletedName).toBe('q2');
  });

  it('does not emit when name is undefined', () => {
    let selectedName = '';
    let deletedName = '';
    component.selected.subscribe((name: string) => (selectedName = name));
    component.deleted.subscribe((name: string) => (deletedName = name));

    component.open(undefined);
    component.remove(undefined);

    expect(selectedName).toBe('');
    expect(deletedName).toBe('');
  });

  it('emits query changes with debounce', fakeAsync(() => {
    let query: NamedQueryListQueryState | undefined;
    component.queryChanged.subscribe(value => (query = value));

    component.onSearchTermChanged('search');
    expect(component.searchTerm).toBe('search');
    expect(query).toBeUndefined();

    tick(250);
    expect(query).toEqual({ searchTerm: 'search' });
  }));

  it('keeps collection when searching and uses the latest text when switching collection', fakeAsync(() => {
    component.query = { searchTerm: '', collection: 'record' };
    const emit = spyOn(component.queryChanged, 'emit');
    component.onSearchTermChanged('alpha');
    tick(250);
    expect(emit).toHaveBeenCalledWith({ searchTerm: 'alpha', collection: 'record' });
    component.onSearchTermChanged('beta');
    component.setCollection('user');
    tick(250);
    expect(emit.calls.count()).toBe(2);
    expect(emit).toHaveBeenCalledWith({ searchTerm: 'beta', collection: 'user' });
  }));

  it('clears debounce timer on destroy', fakeAsync(() => {
    component.onSearchTermChanged('test');
    expect((component as any).searchDebounceTimer).toBeTruthy();

    component.ngOnDestroy();
    expect((component as any).searchDebounceTimer).toBeNull();
  }));

  it('reflects query input changes', () => {
    component.query = { searchTerm: 'hello' };
    component.ngOnChanges({
      query: { currentValue: component.query, previousValue: undefined, firstChange: true, isFirstChange: () => true },
    });
    expect(component.searchTerm).toBe('hello');
  });

  it('computes paramCount', () => {
    const q: NamedQueryDefinition = {
      name: 'q',
      collectionName: 'c',
      mongoQuery: {},
      queryParams: { a: { type: 'string', path: 'p', whenUndefined: 'ignore' } },
      resultObjectMapping: {},
    };
    expect(component.paramCount(q)).toBe(1);
    expect(component.paramCount({ ...q, queryParams: undefined } as any)).toBe(0);
  });

  it('computes filterCount', () => {
    const q: NamedQueryDefinition = {
      name: 'q',
      collectionName: 'c',
      mongoQuery: {},
      queryParams: {},
      resultObjectMapping: {},
      relatedRecordFilters: [{ collectionName: 'c', mongoQuery: {}, localField: 'l', foreignField: 'f' }],
    };
    expect(component.filterCount(q)).toBe(1);
    expect(component.filterCount({ ...q, relatedRecordFilters: undefined })).toBe(0);
  });

  it('computes mappingCount', () => {
    const q: NamedQueryDefinition = {
      name: 'q',
      collectionName: 'c',
      mongoQuery: {},
      queryParams: {},
      resultObjectMapping: { a: 'b' },
    };
    expect(component.mappingCount(q)).toBe(1);
    expect(component.mappingCount({ ...q, resultObjectMapping: undefined } as any)).toBe(0);
  });

  it('trackByName returns name or fallback', () => {
    const q: NamedQueryDefinition = {
      name: 'q1',
      collectionName: 'c',
      mongoQuery: {},
      queryParams: {},
      resultObjectMapping: {},
    };
    expect(component.trackByName(0, q)).toBe('q1');
    expect(component.trackByName(0, { ...q, name: undefined })).toBe('named-query-0');
  });
  it('renders linked consumers and a muted empty state in Used by', () => {
    component.brandingAndPortalUrl = '/brand/portal';
    const query = { name: 'q1', collectionName: 'record', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} };
    component.queries = [
      { ...query, usedBy: [{ type: 'report', name: 'Report title', path: '/admin/report/report' }] },
      { ...query, name: 'q2', usedBy: [] },
    ];
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('thead')?.textContent).toContain('named-query-used-by');
    expect(element.querySelector('a[href="/brand/portal/admin/report/report"]')?.textContent).toContain('Report title');
    expect(element.querySelector('tbody .nq-not-used')?.textContent).toContain('named-query-not-used');
  });

  it('renders Built from links, stale and missing warnings, and handwritten or database origins', () => {
    component.brandingAndPortalUrl = '/brand/portal';
    const graphql = { source: 'graphql' as const, graphql: { document: '{ health }', variables: {}, resultPath: [] } };
    const linked = {
      id: 'a'.repeat(24), name: 'Research plans', revision: 3, publishedRevision: 2, mode: 'visual' as const,
      missing: false, changedSincePublished: true, recordType: 'rdmp', recordTypeLabel: null, updatedAt: null, updatedBy: null,
    };
    component.queries = [
      { ...graphql, name: 'linked', sourceSavedQuery: linked },
      { ...graphql, name: 'missing', sourceSavedQuery: { ...linked, missing: true, name: null, changedSincePublished: false } },
      { ...graphql, name: 'handwritten' },
      { name: 'database', collectionName: 'user', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} },
    ];
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLTableRowElement>;
    expect(rows[0].cells[2].querySelector('a')!.getAttribute('href')).toBe('/brand/portal/admin/data-grids#grid=' + linked.id);
    expect(rows[0].cells[2].textContent).toContain('Research plans');
    expect(rows[0].cells[2].textContent).toContain('nq-ux-source-changed');
    expect(rows[1].cells[2].querySelector('a')).toBeNull();
    expect(rows[1].cells[2].textContent).toContain('nq-ux-source-missing');
    expect(rows[2].cells[2].textContent).toContain('nq-ux-written-by-hand');
    expect(rows[3].cells[2].textContent).toContain('nq-ux-database-source');
    expect(rows[3].cells[3].textContent).toContain('admin-query-collection-user');
  });

  it('counts only caller bindings and configured mappings on GraphQL queries', () => {
    component.queries = [{
      name: 'graphql', source: 'graphql', graphql: {
        document: 'query Q($term:String){ health }', resultPath: [], mappings: { title: ['title'] },
        variables: { term: { ownership: 'consumer', parameter: 'search', inputType: 'String', required: false },
          type: { ownership: 'fixed', value: 'rdmp' }, skipped: { ownership: 'omitted' } },
      },
    }, { name: 'bare', source: 'graphql', graphql: { document: '{ health }', variables: {}, resultPath: [] } }];
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLTableRowElement>;
    expect(rows[0].cells[4].textContent!.trim()).toBe('1');
    expect(rows[0].cells[5].textContent!.trim()).toBe('1');
    expect(rows[1].cells[4].textContent!.trim()).toBe('—');
    expect(rows[1].cells[5].textContent!.trim()).toBe('—');
  });

  it('debounces consecutive searches and clears both filters from the empty state', fakeAsync(() => {
    component.query = { searchTerm: 'old', collection: 'record' };
    component.searchTerm = 'old';
    const emit = spyOn(component.queryChanged, 'emit');
    component.onSearchTermChanged('first');
    component.onSearchTermChanged('latest');
    tick(250);
    expect(emit).toHaveBeenCalledOnceWith({ searchTerm: 'latest', collection: 'record' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rb-admin-empty h3').textContent).toContain('admin-no-filter-results');
    fixture.nativeElement.querySelector('.rb-admin-empty button').click();
    expect(emit.calls.mostRecent().args).toEqual([{ searchTerm: '', collection: '' }]);
    expect(component.searchTerm).toBe('');
  }));
});
