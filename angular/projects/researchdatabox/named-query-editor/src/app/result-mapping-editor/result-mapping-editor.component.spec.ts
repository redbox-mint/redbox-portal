import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ResultMappingEditorComponent } from './result-mapping-editor.component';

@Pipe({ name: 'i18next', standalone: false })
class I18NextPipeStub implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('ResultMappingEditorComponent', () => {
  let fixture: ComponentFixture<ResultMappingEditorComponent>;
  let component: ResultMappingEditorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ResultMappingEditorComponent, I18NextPipeStub],
      imports: [FormsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(ResultMappingEditorComponent);
    component = fixture.componentInstance;
  });

  it('rebuilds entries on input change', () => {
    component.resultObjectMapping = { a: 'b', c: 'd' };
    component.ngOnChanges({ resultObjectMapping: { currentValue: component.resultObjectMapping, previousValue: undefined, firstChange: true, isFirstChange: () => true } });
    expect(component.entries.length).toBe(2);
    expect(component.entries[0].key).toBe('a');
  });

  it('ignores change if same reference as last emitted', () => {
    const mapping = { a: 'b' };
    component.resultObjectMapping = mapping;
    component.ngOnChanges({ resultObjectMapping: { currentValue: mapping, previousValue: undefined, firstChange: true, isFirstChange: () => true } });
    (component as any).lastEmitted = mapping;
    const before = component.entries.length;
    component.ngOnChanges({ resultObjectMapping: { currentValue: mapping, previousValue: mapping, firstChange: false, isFirstChange: () => false } });
    expect(component.entries.length).toBe(before);
  });

  it('adds an entry', () => {
    let emitted: Record<string, string> | undefined;
    component.resultObjectMappingChange.subscribe((v) => emitted = v);

    component.newKey = 'key1';
    component.newValue = 'val1';
    component.addEntry();

    expect(emitted).toBeDefined();
    expect(emitted!['key1']).toBe('val1');
    expect(component.newKey).toBe('');
    expect(component.newValue).toBe('');
  });

  it('does not add entry without key', () => {
    let emitted = false;
    component.resultObjectMappingChange.subscribe(() => emitted = true);

    component.newKey = '';
    component.addEntry();
    expect(emitted).toBeFalse();
  });

  it('removes an entry', () => {
    component.resultObjectMapping = { a: 'b', c: 'd' };
    component.ngOnChanges({ resultObjectMapping: { currentValue: component.resultObjectMapping, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted: Record<string, string> | undefined;
    component.resultObjectMappingChange.subscribe((v) => emitted = v);

    component.removeEntry(component.entries[0]);
    expect(component.entries.length).toBe(1);
    expect(emitted).toBeDefined();
    expect('a' in emitted!).toBeFalse();
  });

  it('updates key and emits', () => {
    component.resultObjectMapping = { a: 'b' };
    component.ngOnChanges({ resultObjectMapping: { currentValue: component.resultObjectMapping, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted: Record<string, string> | undefined;
    component.resultObjectMappingChange.subscribe((v) => emitted = v);

    component.onKeyChange(component.entries[0], 'newKey');
    expect(emitted).toBeDefined();
    expect(emitted!['newKey']).toBe('b');
  });

  it('does not emit if key unchanged', () => {
    component.resultObjectMapping = { a: 'b' };
    component.ngOnChanges({ resultObjectMapping: { currentValue: component.resultObjectMapping, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted = false;
    component.resultObjectMappingChange.subscribe(() => emitted = true);

    component.onKeyChange(component.entries[0], 'a');
    expect(emitted).toBeFalse();
  });

  it('updates value and emits', () => {
    component.resultObjectMapping = { a: 'b' };
    component.ngOnChanges({ resultObjectMapping: { currentValue: component.resultObjectMapping, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted: Record<string, string> | undefined;
    component.resultObjectMappingChange.subscribe((v) => emitted = v);

    component.onValueChange(component.entries[0], 'newVal');
    expect(emitted).toBeDefined();
    expect(emitted!['a']).toBe('newVal');
  });

  it('does not emit if value unchanged', () => {
    component.resultObjectMapping = { a: 'b' };
    component.ngOnChanges({ resultObjectMapping: { currentValue: component.resultObjectMapping, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted = false;
    component.resultObjectMappingChange.subscribe(() => emitted = true);

    component.onValueChange(component.entries[0], 'b');
    expect(emitted).toBeFalse();
  });

  it('filters out empty keys when emitting', () => {
    component.resultObjectMapping = { a: 'b' };
    component.ngOnChanges({ resultObjectMapping: { currentValue: component.resultObjectMapping, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted: Record<string, string> | undefined;
    component.resultObjectMappingChange.subscribe((v) => emitted = v);

    component.entries[0].key = '';
    (component as any).emitFromEntries();
    expect(Object.keys(emitted!).length).toBe(0);
  });

  it('trackById returns entry id', () => {
    expect(component.trackById(0, { id: 2, key: 'k', value: 'v' })).toBe(2);
  });
});
