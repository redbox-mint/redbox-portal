import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SortEditorComponent } from './sort-editor.component';

@Pipe({ name: 'i18next', standalone: false })
class I18NextPipeStub implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('SortEditorComponent', () => {
  let fixture: ComponentFixture<SortEditorComponent>;
  let component: SortEditorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SortEditorComponent, I18NextPipeStub],
      imports: [FormsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(SortEditorComponent);
    component = fixture.componentInstance;
  });

  it('rebuilds entries on input change', () => {
    component.sort = [{ field1: 'ASC' }, { field2: 'DESC' }] as any;
    component.ngOnChanges({ sort: { currentValue: component.sort, previousValue: undefined, firstChange: true, isFirstChange: () => true } });
    expect(component.entries.length).toBe(2);
    expect(component.entries[0].field).toBe('field1');
    expect(component.entries[0].direction).toBe('ASC');
  });

  it('ignores change if same reference as last emitted', () => {
    const sort = [{ field1: 'ASC' }] as any;
    component.sort = sort;
    component.ngOnChanges({ sort: { currentValue: sort, previousValue: undefined, firstChange: true, isFirstChange: () => true } });
    (component as any).lastEmitted = sort;
    const before = component.entries.length;
    component.ngOnChanges({ sort: { currentValue: sort, previousValue: sort, firstChange: false, isFirstChange: () => false } });
    expect(component.entries.length).toBe(before);
  });

  it('adds an entry', () => {
    let emitted: any | undefined;
    component.sortChange.subscribe((v) => emitted = v);

    component.newField = 'created';
    component.newDirection = 'DESC';
    component.addEntry();

    expect(component.entries.length).toBe(1);
    expect(emitted).toBeDefined();
    expect(emitted![0]).toEqual({ created: 'DESC' });
    expect(component.newField).toBe('');
  });

  it('does not add entry without field', () => {
    let emitted = false;
    component.sortChange.subscribe(() => emitted = true);

    component.newField = '';
    component.addEntry();

    expect(emitted).toBeFalse();
  });

  it('removes an entry', () => {
    component.sort = [{ field1: 'ASC' }] as any;
    component.ngOnChanges({ sort: { currentValue: component.sort, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted: any | undefined;
    component.sortChange.subscribe((v) => emitted = v);

    component.removeEntry(component.entries[0]);
    expect(component.entries.length).toBe(0);
    expect(emitted).toBeUndefined();
  });

  it('updates field and emits', () => {
    component.sort = [{ field1: 'ASC' }] as any;
    component.ngOnChanges({ sort: { currentValue: component.sort, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted: any | undefined;
    component.sortChange.subscribe((v) => emitted = v);

    component.onFieldChange(component.entries[0], 'updated');
    expect(emitted).toBeDefined();
    expect(emitted![0]).toEqual({ updated: 'ASC' });
  });

  it('does not emit if field unchanged', () => {
    component.sort = [{ field1: 'ASC' }] as any;
    component.ngOnChanges({ sort: { currentValue: component.sort, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted = false;
    component.sortChange.subscribe(() => emitted = true);

    component.onFieldChange(component.entries[0], 'field1');
    expect(emitted).toBeFalse();
  });

  it('updates direction and emits', () => {
    component.sort = [{ field1: 'ASC' }] as any;
    component.ngOnChanges({ sort: { currentValue: component.sort, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted: any | undefined;
    component.sortChange.subscribe((v) => emitted = v);

    component.onDirectionChange(component.entries[0], 'DESC');
    expect(emitted).toBeDefined();
    expect(emitted![0]).toEqual({ field1: 'DESC' });
  });

  it('does not emit if direction unchanged', () => {
    component.sort = [{ field1: 'ASC' }] as any;
    component.ngOnChanges({ sort: { currentValue: component.sort, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted = false;
    component.sortChange.subscribe(() => emitted = true);

    component.onDirectionChange(component.entries[0], 'ASC');
    expect(emitted).toBeFalse();
  });

  it('filters out empty fields when emitting', () => {
    component.sort = [{ field1: 'ASC' }] as any;
    component.ngOnChanges({ sort: { currentValue: component.sort, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted: any | undefined;
    component.sortChange.subscribe((v) => emitted = v);

    component.entries[0].field = '';
    (component as any).emitFromEntries();
    expect(emitted).toBeUndefined();
  });

  it('trackById returns entry id', () => {
    expect(component.trackById(0, { id: 3, field: 'f', direction: 'ASC' })).toBe(3);
  });
});
