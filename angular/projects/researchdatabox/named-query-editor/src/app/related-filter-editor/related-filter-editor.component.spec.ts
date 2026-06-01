import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RelatedFilterEditorComponent } from './related-filter-editor.component';

@Pipe({ name: 'i18next', standalone: false })
class I18NextPipeStub implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('RelatedFilterEditorComponent', () => {
  let fixture: ComponentFixture<RelatedFilterEditorComponent>;
  let component: RelatedFilterEditorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RelatedFilterEditorComponent, I18NextPipeStub],
      imports: [FormsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(RelatedFilterEditorComponent);
    component = fixture.componentInstance;
  });

  it('rebuilds filters on input change', () => {
    component.relatedRecordFilters = [
      { collectionName: 'c1', mongoQuery: { a: 1 }, localField: 'l', foreignField: 'f' }
    ];
    component.ngOnChanges({ relatedRecordFilters: { currentValue: component.relatedRecordFilters, previousValue: undefined, firstChange: true, isFirstChange: () => true } });
    expect(component.filters.length).toBe(1);
    expect(component.filters[0].collectionName).toBe('c1');
  });

  it('ignores change if same reference as last emitted', () => {
    const filters = [{ collectionName: 'c1', mongoQuery: {}, localField: 'l', foreignField: 'f' }];
    component.relatedRecordFilters = filters;
    component.ngOnChanges({ relatedRecordFilters: { currentValue: filters, previousValue: undefined, firstChange: true, isFirstChange: () => true } });
    (component as any).lastEmitted = filters;
    const before = component.filters.length;
    component.ngOnChanges({ relatedRecordFilters: { currentValue: filters, previousValue: filters, firstChange: false, isFirstChange: () => false } });
    expect(component.filters.length).toBe(before);
  });

  it('toggles expand', () => {
    const filter = { id: 1, collectionName: 'c', mongoQuery: {}, mongoQueryJson: '{}', localField: 'l', foreignField: 'f' };
    component.toggleExpand(filter);
    expect(component.expandedId).toBe(1);
    component.toggleExpand(filter);
    expect(component.expandedId).toBeNull();
  });

  it('adds a filter', () => {
    let emitted: any | undefined;
    component.relatedRecordFiltersChange.subscribe((v) => emitted = v);

    component.addFilter();
    expect(component.filters.length).toBe(1);
    expect(emitted).toBeDefined();
    expect(emitted!.length).toBe(1);
  });

  it('removes a filter', () => {
    component.relatedRecordFilters = [
      { collectionName: 'c1', mongoQuery: {}, localField: 'l', foreignField: 'f' }
    ];
    component.ngOnChanges({ relatedRecordFilters: { currentValue: component.relatedRecordFilters, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted: any | undefined;
    component.relatedRecordFiltersChange.subscribe((v) => emitted = v);

    component.expandedId = component.filters[0].id;
    component.removeFilter(component.filters[0]);

    expect(component.filters.length).toBe(0);
    expect(component.expandedId).toBeNull();
    expect(emitted).toBeUndefined();
  });

  it('updates field and emits', () => {
    component.relatedRecordFilters = [
      { collectionName: 'c1', mongoQuery: {}, localField: 'l', foreignField: 'f' }
    ];
    component.ngOnChanges({ relatedRecordFilters: { currentValue: component.relatedRecordFilters, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted: any | undefined;
    component.relatedRecordFiltersChange.subscribe((v) => emitted = v);

    component.onFieldChange(component.filters[0], 'collectionName', 'new');
    expect(emitted).toBeDefined();
    expect(emitted![0].collectionName).toBe('new');
  });

  it('parses valid mongoQuery JSON and emits', () => {
    component.relatedRecordFilters = [
      { collectionName: 'c1', mongoQuery: {}, localField: 'l', foreignField: 'f' }
    ];
    component.ngOnChanges({ relatedRecordFilters: { currentValue: component.relatedRecordFilters, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted: any | undefined;
    component.relatedRecordFiltersChange.subscribe((v) => emitted = v);

    component.onMongoQueryJsonChange(component.filters[0], '{"status":"active"}');
    expect(emitted).toBeDefined();
    expect(emitted![0].mongoQuery).toEqual({ status: 'active' });
  });

  it('does not emit on invalid mongoQuery JSON', () => {
    component.relatedRecordFilters = [
      { collectionName: 'c1', mongoQuery: {}, localField: 'l', foreignField: 'f' }
    ];
    component.ngOnChanges({ relatedRecordFilters: { currentValue: component.relatedRecordFilters, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted = false;
    component.relatedRecordFiltersChange.subscribe(() => emitted = true);

    component.onMongoQueryJsonChange(component.filters[0], 'not json');
    expect(emitted).toBeFalse();
  });

  it('does not emit on array JSON for mongoQuery', () => {
    component.relatedRecordFilters = [
      { collectionName: 'c1', mongoQuery: {}, localField: 'l', foreignField: 'f' }
    ];
    component.ngOnChanges({ relatedRecordFilters: { currentValue: component.relatedRecordFilters, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted = false;
    component.relatedRecordFiltersChange.subscribe(() => emitted = true);

    component.onMongoQueryJsonChange(component.filters[0], '[1,2,3]');
    expect(emitted).toBeFalse();
  });

  it('emits undefined when all filters removed', () => {
    component.relatedRecordFilters = [
      { collectionName: 'c1', mongoQuery: {}, localField: 'l', foreignField: 'f' }
    ];
    component.ngOnChanges({ relatedRecordFilters: { currentValue: component.relatedRecordFilters, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted: any | undefined;
    component.relatedRecordFiltersChange.subscribe((v) => emitted = v);

    component.removeFilter(component.filters[0]);
    expect(emitted).toBeUndefined();
  });

  it('trackById returns filter id', () => {
    expect(component.trackById(0, { id: 7, collectionName: 'c', mongoQuery: {}, mongoQueryJson: '{}', localField: 'l', foreignField: 'f' })).toBe(7);
  });
});
