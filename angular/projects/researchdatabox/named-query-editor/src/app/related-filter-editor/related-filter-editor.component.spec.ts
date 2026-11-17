import { QueryAssistanceModule } from '../query-assistance.module';
import {
  TranslationService as AssistanceTranslationService,
  FieldTreeComponent,
  SchemaTargetSelectorComponent,
} from '@researchdatabox/portal-ng-common';
import { of } from 'rxjs';
import type { RelatedRecordFilterDefinition } from '@researchdatabox/sails-ng-common';
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
      providers: [
        {
          provide: AssistanceTranslationService,
          useValue: { t: (v: string) => v, isInitializing: () => false, translationChanges$: of(undefined) },
        },
      ],
      imports: [QueryAssistanceModule, FieldTreeComponent, SchemaTargetSelectorComponent, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(RelatedFilterEditorComponent);
    component = fixture.componentInstance;
  });

  it('rebuilds filters on input change', () => {
    component.relatedRecordFilters = [
      { collectionName: 'c1', mongoQuery: { a: 1 }, localField: 'l', foreignField: 'f' },
    ];
    component.ngOnChanges({
      relatedRecordFilters: {
        currentValue: component.relatedRecordFilters,
        previousValue: undefined,
        firstChange: true,
        isFirstChange: () => true,
      },
    });
    expect(component.filters.length).toBe(1);
    expect(component.filters[0].collectionName).toBe('c1');
  });

  it('preserves relation-based filters without legacy collection or join fields when editing their query', () => {
    const relationFilter: RelatedRecordFilterDefinition = {
      rootRecordType: 'rdmp', relationId: 'projects', mongoQuery: { status: 'active' },
    };
    component.relatedRecordFilters = [relationFilter];
    component.ngOnChanges({ relatedRecordFilters: {
      currentValue: component.relatedRecordFilters, previousValue: undefined,
      firstChange: true, isFirstChange: () => true,
    } });
    let emitted: RelatedRecordFilterDefinition[] | undefined;
    component.relatedRecordFiltersChange.subscribe(value => { emitted = value; });
    fixture.detectChanges();
    component.onMongoQueryJsonChange(component.filters[0], '{"status":"complete"}');
    expect(emitted).toEqual([{ ...relationFilter, mongoQuery: { status: 'complete' } }]);
    expect(Object.hasOwn(emitted![0], 'collectionName')).toBeFalse();
    expect(Object.hasOwn(emitted![0], 'localField')).toBeFalse();
    expect(Object.hasOwn(emitted![0], 'foreignField')).toBeFalse();
    component.addFilter();
    expect(emitted?.[0]).toEqual({ ...relationFilter, mongoQuery: { status: 'complete' } });
  });

  it('ignores change if same reference as last emitted', () => {
    const filters = [{ collectionName: 'c1', mongoQuery: {}, localField: 'l', foreignField: 'f' }];
    component.relatedRecordFilters = filters;
    component.ngOnChanges({
      relatedRecordFilters: {
        currentValue: filters,
        previousValue: undefined,
        firstChange: true,
        isFirstChange: () => true,
      },
    });
    (component as any).lastEmitted = filters;
    const before = component.filters.length;
    component.ngOnChanges({
      relatedRecordFilters: {
        currentValue: filters,
        previousValue: filters,
        firstChange: false,
        isFirstChange: () => false,
      },
    });
    expect(component.filters.length).toBe(before);
  });

  it('toggles expand', () => {
    const filter = {
      id: 1,
      collectionName: 'c',
      mongoQuery: {},
      mongoQueryJson: '{}',
      localField: 'l',
      foreignField: 'f',
    };
    component.toggleExpand(filter);
    expect(component.expandedId).toBe(1);
    component.toggleExpand(filter);
    expect(component.expandedId).toBeNull();
  });

  it('adds a filter', () => {
    let emitted: any | undefined;
    component.relatedRecordFiltersChange.subscribe(v => (emitted = v));

    component.addFilter();
    expect(component.filters.length).toBe(1);
    expect(emitted).toBeDefined();
    expect(emitted!.length).toBe(1);
  });

  it('removes a filter', () => {
    component.relatedRecordFilters = [{ collectionName: 'c1', mongoQuery: {}, localField: 'l', foreignField: 'f' }];
    component.ngOnChanges({
      relatedRecordFilters: {
        currentValue: component.relatedRecordFilters,
        previousValue: undefined,
        firstChange: true,
        isFirstChange: () => true,
      },
    });

    let emitted: any | undefined;
    component.relatedRecordFiltersChange.subscribe(v => (emitted = v));

    component.expandedId = component.filters[0].id;
    component.removeFilter(component.filters[0]);

    expect(component.filters.length).toBe(0);
    expect(component.expandedId).toBeNull();
    expect(emitted).toBeUndefined();
  });

  it('updates field and emits', () => {
    component.relatedRecordFilters = [{ collectionName: 'c1', mongoQuery: {}, localField: 'l', foreignField: 'f' }];
    component.ngOnChanges({
      relatedRecordFilters: {
        currentValue: component.relatedRecordFilters,
        previousValue: undefined,
        firstChange: true,
        isFirstChange: () => true,
      },
    });

    let emitted: any | undefined;
    component.relatedRecordFiltersChange.subscribe(v => (emitted = v));

    component.onFieldChange(component.filters[0], 'collectionName', 'new');
    expect(emitted).toBeDefined();
    expect(emitted![0].collectionName).toBe('new');
  });

  it('parses valid mongoQuery JSON and emits', () => {
    component.relatedRecordFilters = [{ collectionName: 'c1', mongoQuery: {}, localField: 'l', foreignField: 'f' }];
    component.ngOnChanges({
      relatedRecordFilters: {
        currentValue: component.relatedRecordFilters,
        previousValue: undefined,
        firstChange: true,
        isFirstChange: () => true,
      },
    });

    let emitted: any | undefined;
    component.relatedRecordFiltersChange.subscribe(v => (emitted = v));

    component.onMongoQueryJsonChange(component.filters[0], '{"status":"active"}');
    expect(emitted).toBeDefined();
    expect(emitted![0].mongoQuery).toEqual({ status: 'active' });
  });

  it('does not emit on invalid mongoQuery JSON', () => {
    component.relatedRecordFilters = [{ collectionName: 'c1', mongoQuery: {}, localField: 'l', foreignField: 'f' }];
    component.ngOnChanges({
      relatedRecordFilters: {
        currentValue: component.relatedRecordFilters,
        previousValue: undefined,
        firstChange: true,
        isFirstChange: () => true,
      },
    });

    let emitted = false;
    component.relatedRecordFiltersChange.subscribe(() => (emitted = true));

    component.onMongoQueryJsonChange(component.filters[0], 'not json');
    expect(emitted).toBeFalse();
  });

  it('does not emit on array JSON for mongoQuery', () => {
    component.relatedRecordFilters = [{ collectionName: 'c1', mongoQuery: {}, localField: 'l', foreignField: 'f' }];
    component.ngOnChanges({
      relatedRecordFilters: {
        currentValue: component.relatedRecordFilters,
        previousValue: undefined,
        firstChange: true,
        isFirstChange: () => true,
      },
    });

    let emitted = false;
    component.relatedRecordFiltersChange.subscribe(() => (emitted = true));

    component.onMongoQueryJsonChange(component.filters[0], '[1,2,3]');
    expect(emitted).toBeFalse();
  });

  it('emits undefined when all filters removed', () => {
    component.relatedRecordFilters = [{ collectionName: 'c1', mongoQuery: {}, localField: 'l', foreignField: 'f' }];
    component.ngOnChanges({
      relatedRecordFilters: {
        currentValue: component.relatedRecordFilters,
        previousValue: undefined,
        firstChange: true,
        isFirstChange: () => true,
      },
    });

    let emitted: any | undefined;
    component.relatedRecordFiltersChange.subscribe(v => (emitted = v));

    component.removeFilter(component.filters[0]);
    expect(emitted).toBeUndefined();
  });

  it('trackById returns filter id', () => {
    expect(
      component.trackById(0, {
        id: 7,
        collectionName: 'c',
        mongoQuery: {},
        mongoQueryJson: '{}',
        localField: 'l',
        foreignField: 'f',
      })
    ).toBe(7);
  });
  it('provides button disclosures with separate removal and uniquely labelled fields', () => {
    component.relatedRecordFilters = [{ collectionName: 'one', localField: 'a', foreignField: 'b', mongoQuery: {} }, { collectionName: 'two', localField: 'c', foreignField: 'd', mongoQuery: {} }];
    component.ngOnChanges({ relatedRecordFilters: { currentValue: component.relatedRecordFilters, previousValue: undefined, firstChange: true, isFirstChange: () => true } });
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('button[aria-expanded]') as NodeListOf<HTMLButtonElement>;
    expect(buttons.length).toBe(2);
    expect(buttons[0].getAttribute('aria-expanded')).toBe('false');
    buttons[0].click();
    fixture.detectChanges();
    expect(buttons[0].getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('#' + buttons[0].getAttribute('aria-controls'))).not.toBeNull();
    const controls = Array.from(fixture.nativeElement.querySelectorAll('input,select,textarea')) as HTMLInputElement[];
    expect(new Set(controls.map(control => control.id)).size).toBe(controls.length);
    for (const control of controls) {
      expect(control.id).toBeTruthy();
      expect(control.labels?.length).toBeGreaterThan(0);
    }
  });

});
