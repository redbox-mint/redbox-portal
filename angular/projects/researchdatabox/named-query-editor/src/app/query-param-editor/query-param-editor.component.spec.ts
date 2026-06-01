import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QueryParamEditorComponent } from './query-param-editor.component';

@Pipe({ name: 'i18next', standalone: false })
class I18NextPipeStub implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('QueryParamEditorComponent', () => {
  let fixture: ComponentFixture<QueryParamEditorComponent>;
  let component: QueryParamEditorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [QueryParamEditorComponent, I18NextPipeStub],
      imports: [FormsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(QueryParamEditorComponent);
    component = fixture.componentInstance;
  });

  it('rebuilds entries on input change', () => {
    component.queryParams = {
      p1: { type: 'string', path: 'a.b', whenUndefined: 'ignore' }
    };
    component.ngOnChanges({ queryParams: { currentValue: component.queryParams, previousValue: undefined, firstChange: true, isFirstChange: () => true } });
    expect(component.entries.length).toBe(1);
    expect(component.entries[0].key).toBe('p1');
  });

  it('ignores change if same reference as last emitted', () => {
    const params = { p1: { type: 'string', path: 'a', whenUndefined: 'ignore' } };
    component.queryParams = params;
    component.ngOnChanges({ queryParams: { currentValue: params, previousValue: undefined, firstChange: true, isFirstChange: () => true } });
    (component as any).lastEmitted = params;
    const before = component.entries.length;
    component.ngOnChanges({ queryParams: { currentValue: params, previousValue: params, firstChange: false, isFirstChange: () => false } });
    expect(component.entries.length).toBe(before);
  });

  it('toggles expand', () => {
    component.toggleExpand('p1');
    expect(component.expandedParam).toBe('p1');
    component.toggleExpand('p1');
    expect(component.expandedParam).toBeNull();
  });

  it('starts and cancels add', () => {
    component.startAdd();
    expect(component.addingNew).toBeTrue();
    component.cancelAdd();
    expect(component.addingNew).toBeFalse();
  });

  it('adds a new param', () => {
    let emitted: Record<string, any> | undefined;
    component.queryParamsChange.subscribe((v) => emitted = v);

    component.startAdd();
    component.newParam.key = 'p2';
    component.newParam.path = 'x.y';
    component.addParam();

    expect(emitted).toBeDefined();
    expect(emitted!['p2'].path).toBe('x.y');
    expect(component.addingNew).toBeFalse();
  });

  it('does not add param without key', () => {
    let emitted = false;
    component.queryParamsChange.subscribe(() => emitted = true);

    component.startAdd();
    component.newParam.key = '';
    component.addParam();

    expect(emitted).toBeFalse();
  });

  it('updates field and emits', () => {
    component.queryParams = { p1: { type: 'string', path: 'a', whenUndefined: 'ignore' } };
    component.ngOnChanges({ queryParams: { currentValue: component.queryParams, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted: Record<string, any> | undefined;
    component.queryParamsChange.subscribe((v) => emitted = v);

    const entry = component.entries[0];
    component.onFieldChange(entry, 'path', 'new.path');
    expect(emitted).toBeDefined();
    expect(emitted!['p1'].path).toBe('new.path');
  });

  it('removes a param', () => {
    component.queryParams = { p1: { type: 'string', path: 'a', whenUndefined: 'ignore' }, p2: { type: 'number', path: 'b', whenUndefined: 'ignore' } };
    component.ngOnChanges({ queryParams: { currentValue: component.queryParams, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    let emitted: Record<string, any> | undefined;
    component.queryParamsChange.subscribe((v) => emitted = v);

    component.expandedParam = 'p1';
    component.removeParam(component.entries[0]);

    expect(emitted).toBeDefined();
    expect('p1' in emitted!).toBeFalse();
    expect(component.expandedParam).toBeNull();
  });

  it('trackById returns entry id', () => {
    expect(component.trackById(0, { id: 5, key: 'k', type: 'string', path: '', whenUndefined: 'ignore' })).toBe(5);
  });

  it('ignores ngOnChanges when queryParams is not in changes', () => {
    component.queryParams = { p1: { type: 'string', path: 'a', whenUndefined: 'ignore' } };
    component.ngOnChanges({ someOtherInput: { currentValue: 'x', previousValue: undefined, firstChange: true, isFirstChange: () => true } } as any);
    expect(component.entries.length).toBe(0);
  });

  it('does not collapse expanded param when removing different param', () => {
    component.queryParams = { p1: { type: 'string', path: 'a', whenUndefined: 'ignore' }, p2: { type: 'number', path: 'b', whenUndefined: 'ignore' } };
    component.ngOnChanges({ queryParams: { currentValue: component.queryParams, previousValue: undefined, firstChange: true, isFirstChange: () => true } });

    component.expandedParam = 'p2';
    component.removeParam(component.entries[0]);
    expect(component.expandedParam).toBe('p2');
  });
});
