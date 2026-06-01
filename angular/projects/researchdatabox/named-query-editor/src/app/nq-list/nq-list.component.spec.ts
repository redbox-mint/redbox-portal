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
      imports: [FormsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(NqListComponent);
    component = fixture.componentInstance;
  });

  it('emits selected and deleted actions', () => {
    let selectedName = '';
    let deletedName = '';
    component.selected.subscribe((name: string) => selectedName = name);
    component.deleted.subscribe((name: string) => deletedName = name);

    component.open('q1');
    component.remove('q2');

    expect(selectedName).toBe('q1');
    expect(deletedName).toBe('q2');
  });

  it('does not emit when name is undefined', () => {
    let selectedName = '';
    let deletedName = '';
    component.selected.subscribe((name: string) => selectedName = name);
    component.deleted.subscribe((name: string) => deletedName = name);

    component.open(undefined);
    component.remove(undefined);

    expect(selectedName).toBe('');
    expect(deletedName).toBe('');
  });

  it('emits query changes with debounce', fakeAsync(() => {
    let query: NamedQueryListQueryState | undefined;
    component.queryChanged.subscribe((value) => query = value);

    component.onSearchTermChanged('search');
    expect(component.searchTerm).toBe('search');
    expect(query).toBeUndefined();

    tick(250);
    expect(query).toEqual({ searchTerm: 'search' });
  }));

  it('clears debounce timer on destroy', fakeAsync(() => {
    component.onSearchTermChanged('test');
    expect((component as any).searchDebounceTimer).toBeTruthy();

    component.ngOnDestroy();
    expect((component as any).searchDebounceTimer).toBeNull();
  }));

  it('reflects query input changes', () => {
    component.query = { searchTerm: 'hello' };
    component.ngOnChanges({ query: { currentValue: component.query, previousValue: undefined, firstChange: true, isFirstChange: () => true } });
    expect(component.searchTerm).toBe('hello');
  });

  it('computes paramCount', () => {
    const q: NamedQueryDefinition = {
      name: 'q', collectionName: 'c', mongoQuery: {}, queryParams: { a: { type: 'string', path: 'p', whenUndefined: 'ignore' } }, resultObjectMapping: {}
    };
    expect(component.paramCount(q)).toBe(1);
    expect(component.paramCount({ ...q, queryParams: undefined } as any)).toBe(0);
  });

  it('computes filterCount', () => {
    const q: NamedQueryDefinition = {
      name: 'q', collectionName: 'c', mongoQuery: {}, queryParams: {}, resultObjectMapping: {},
      relatedRecordFilters: [{ collectionName: 'c', mongoQuery: {}, localField: 'l', foreignField: 'f' }]
    };
    expect(component.filterCount(q)).toBe(1);
    expect(component.filterCount({ ...q, relatedRecordFilters: undefined })).toBe(0);
  });

  it('computes mappingCount', () => {
    const q: NamedQueryDefinition = {
      name: 'q', collectionName: 'c', mongoQuery: {}, queryParams: {}, resultObjectMapping: { a: 'b' }
    };
    expect(component.mappingCount(q)).toBe(1);
    expect(component.mappingCount({ ...q, resultObjectMapping: undefined } as any)).toBe(0);
  });

  it('trackByName returns name or fallback', () => {
    const q: NamedQueryDefinition = { name: 'q1', collectionName: 'c', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} };
    expect(component.trackByName(0, q)).toBe('q1');
    expect(component.trackByName(0, { ...q, name: undefined })).toBe('named-query-0');
  });
});
