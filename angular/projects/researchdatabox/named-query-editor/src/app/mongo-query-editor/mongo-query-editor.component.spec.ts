import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MongoQueryEditorComponent } from './mongo-query-editor.component';

@Pipe({ name: 'i18next', standalone: false })
class I18NextPipeStub implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('MongoQueryEditorComponent', () => {
  let fixture: ComponentFixture<MongoQueryEditorComponent>;
  let component: MongoQueryEditorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MongoQueryEditorComponent, I18NextPipeStub],
      imports: [FormsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(MongoQueryEditorComponent);
    component = fixture.componentInstance;
  });

  it('rebuilds entries on input change', () => {
    component.mongoQuery = { status: 'active', count: 5 };
    component.ngOnChanges({ mongoQuery: { currentValue: component.mongoQuery, previousValue: undefined, firstChange: true, isFirstChange: () => true } });
    expect(component.entries.length).toBe(2);
  });

  it('ignores change if same reference as last emitted', () => {
    const query = { a: 1 };
    component.mongoQuery = query;
    component.ngOnChanges({ mongoQuery: { currentValue: query, previousValue: undefined, firstChange: true, isFirstChange: () => true } });
    (component as any).lastEmitted = query;
    const before = component.entries.length;
    component.ngOnChanges({ mongoQuery: { currentValue: query, previousValue: query, firstChange: false, isFirstChange: () => false } });
    expect(component.entries.length).toBe(before);
  });

  it('toggles raw JSON mode', () => {
    component.mongoQuery = { a: 1 };
    component.toggleRawJson();
    expect(component.useRawJson).toBeTrue();
    expect(component.rawJsonText).toContain('"a": 1');

    component.toggleRawJson();
    expect(component.useRawJson).toBeFalse();
  });

  it('applies valid raw JSON', () => {
    let emitted: Record<string, unknown> | undefined;
    component.mongoQueryChange.subscribe((v) => emitted = v);

    component.rawJsonText = '{"valid": true}';
    component.applyRawJson();

    expect(emitted).toEqual({ valid: true });
    expect(component.useRawJson).toBeFalse();
    expect(component.jsonError).toBeNull();
  });

  it('shows error for invalid raw JSON', () => {
    let emitted = false;
    component.mongoQueryChange.subscribe(() => emitted = true);

    component.rawJsonText = 'not json';
    component.applyRawJson();

    expect(emitted).toBeFalse();
    expect(component.jsonError).toContain('Invalid JSON');
  });

  it('shows error for non-object raw JSON', () => {
    let emitted = false;
    component.mongoQueryChange.subscribe(() => emitted = true);

    component.rawJsonText = '"string"';
    component.applyRawJson();

    expect(emitted).toBeFalse();
    expect(component.jsonError).toBe('Must be a valid JSON object');
  });

  it('adds an entry', () => {
    let emitted: Record<string, unknown> | undefined;
    component.mongoQueryChange.subscribe((v) => emitted = v);

    component.newPath = 'status';
    component.newType = 'string';
    component.newValue = 'active';
    component.addEntry();

    expect(emitted).toBeDefined();
    expect(emitted!['status']).toBe('active');
    expect(component.newPath).toBe('');
  });

  it('does not add entry without path', () => {
    let emitted = false;
    component.mongoQueryChange.subscribe(() => emitted = true);

    component.newPath = '';
    component.addEntry();
    expect(emitted).toBeFalse();
  });

  it('removes an entry', () => {
    component.mongoQuery = { a: 1, b: 2 };
    component.ngOnChanges({ mongoQuery: { currentValue: component.mongoQuery, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted: Record<string, unknown> | undefined;
    component.mongoQueryChange.subscribe((v) => emitted = v);

    component.removeEntry(component.entries[0]);
    expect(component.entries.length).toBe(1);
    expect('a' in emitted!).toBeFalse();
  });

  it('updates path and emits', () => {
    component.mongoQuery = { a: 1 };
    component.ngOnChanges({ mongoQuery: { currentValue: component.mongoQuery, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted: Record<string, unknown> | undefined;
    component.mongoQueryChange.subscribe((v) => emitted = v);

    component.onPathChange(component.entries[0], 'newPath');
    expect(emitted).toBeDefined();
    expect('newPath' in emitted!).toBeTrue();
  });

  it('does not emit if path unchanged', () => {
    component.mongoQuery = { a: 1 };
    component.ngOnChanges({ mongoQuery: { currentValue: component.mongoQuery, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted = false;
    component.mongoQueryChange.subscribe(() => emitted = true);

    component.onPathChange(component.entries[0], 'a');
    expect(emitted).toBeFalse();
  });

  it('updates type and emits', () => {
    component.mongoQuery = { a: '1' };
    component.ngOnChanges({ mongoQuery: { currentValue: component.mongoQuery, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted: Record<string, unknown> | undefined;
    component.mongoQueryChange.subscribe((v) => emitted = v);

    component.onTypeChange(component.entries[0], 'number');
    expect(emitted).toBeDefined();
    expect(emitted!['a']).toBe(1);
  });

  it('does not emit if type unchanged', () => {
    component.mongoQuery = { a: 1 };
    component.ngOnChanges({ mongoQuery: { currentValue: component.mongoQuery, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted = false;
    component.mongoQueryChange.subscribe(() => emitted = true);

    component.onTypeChange(component.entries[0], 'number');
    expect(emitted).toBeFalse();
  });

  it('updates value and emits', () => {
    component.mongoQuery = { a: 'old' };
    component.ngOnChanges({ mongoQuery: { currentValue: component.mongoQuery, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted: Record<string, unknown> | undefined;
    component.mongoQueryChange.subscribe((v) => emitted = v);

    component.onValueChange(component.entries[0], 'new');
    expect(emitted).toBeDefined();
    expect(emitted!['a']).toBe('new');
  });

  it('does not emit if value unchanged', () => {
    component.mongoQuery = { a: 'same' };
    component.ngOnChanges({ mongoQuery: { currentValue: component.mongoQuery, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted = false;
    component.mongoQueryChange.subscribe(() => emitted = true);

    component.onValueChange(component.entries[0], 'same');
    expect(emitted).toBeFalse();
  });

  it('detects types correctly', () => {
    expect(component['detectType'](null)).toBe('null');
    expect(component['detectType'](undefined)).toBe('null');
    expect(component['detectType']('str')).toBe('string');
    expect(component['detectType'](42)).toBe('number');
    expect(component['detectType'](true)).toBe('boolean');
    expect(component['detectType']([1, 2])).toBe('array');
    expect(component['detectType']({ a: 1 })).toBe('object');
  });

  it('serializes values correctly', () => {
    expect(component['serializeValue'](null)).toBe('null');
    expect(component['serializeValue']('hello')).toBe('hello');
    expect(component['serializeValue'](42)).toBe('42');
    expect(component['serializeValue'](true)).toBe('true');
    expect(component['serializeValue']([1])).toBe('[1]');
  });

  it('parses values correctly', () => {
    expect(component['parseValue']('null', '')).toBeNull();
    expect(component['parseValue']('number', '42')).toBe(42);
    expect(component['parseValue']('boolean', 'true')).toBeTrue();
    expect(component['parseValue']('boolean', 'false')).toBeFalse();
    expect(component['parseValue']('array', '[1,2]')).toEqual([1, 2]);
    expect(component['parseValue']('object', '{"a":1}')).toEqual({ a: 1 });
    expect(component['parseValue']('string', 'text')).toBe('text');
  });

  it('falls back for invalid JSON in parseValue', () => {
    expect(component['parseValue']('array', 'bad')).toEqual([]);
    expect(component['parseValue']('object', 'bad')).toEqual({});
  });

  it('filters out empty paths when emitting', () => {
    component.mongoQuery = { a: 1 };
    component.ngOnChanges({ mongoQuery: { currentValue: component.mongoQuery, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted: Record<string, unknown> | undefined;
    component.mongoQueryChange.subscribe((v) => emitted = v);

    component.entries[0].path = '';
    (component as any).emitFromEntries();
    expect(Object.keys(emitted!).length).toBe(0);
  });

  it('trackById returns entry id', () => {
    expect(component.trackById(0, { id: 4, path: 'p', type: 'string', value: 'v' })).toBe(4);
  });
});
