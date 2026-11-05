import { ColumnDetailComponent } from './column-detail.component';
import { ColumnEditorComponent } from './column-editor.component';
import { FieldPickerComponent } from '../field-picker/field-picker.component';
import { TranslationService } from '@researchdatabox/portal-ng-common';

describe('Dashboard columns and field chooser', () => {
  const translator = { t: (key: string) => key } as TranslationService;
  it('reorders complete column objects, retaining templates and extra settings', () => {
    const editor = new ColumnEditorComponent(translator);
    const title = { title: 'Title', variable: 'metadata.title', template: '{{metadata.title}}', extension: { untouched: true } };
    const actions = { title: 'Actions', variable: '', template: '<a>Open</a>' };
    editor.columns = [title, actions];
    const changed = jasmine.createSpy('changed');
    editor.columnsChange.subscribe(changed);
    editor.moveColumn(1, -1);
    expect(editor.columns).toEqual([actions, title]);
    expect(editor.columns[1]).toBe(title);
    expect(changed).toHaveBeenCalledWith([actions, title]);
    editor.moveColumn(0, -1);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('does not delete a column when confirmation is cancelled', () => {
    const editor = new ColumnEditorComponent(translator);
    editor.columns = [{ title: 'Title', variable: 'metadata.title', template: '' }];
    spyOn(window, 'confirm').and.returnValue(false);
    editor.removeColumn(0, new Event('click'));
    expect(editor.columns.length).toBe(1);
  });

  it('allows keyboard selection from the field catalogue and retains manual paths', () => {
    const picker = new FieldPickerComponent();
    picker.catalogue = { status: 'complete', recordType: 'rdmp', openPrefixes: [], fields: [
      { path: 'metadata.title', label: 'Title', type: 'string', repeated: false, source: 'schema' },
      { path: 'metadata.person', label: 'Person', type: 'object', repeated: false, source: 'schema' }
    ] };
    picker.filter = 'scalar';
    picker.onChange('title');
    picker.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    picker.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(picker.value).toBe('metadata.title');
    expect(picker.open).toBeFalse();
    picker.onChange('metadata.extension');
    expect(picker.value).toBe('metadata.extension');
    expect(picker.unknown).toBeTrue();
  });

  it('clears a column sort using the supported absent value', () => {
    const detail = new ColumnDetailComponent();
    detail.column = { title: 'Title', variable: 'metadata.title', template: '', initialSort: 'desc' };
    detail.setInitialSort('');
    expect(detail.column.initialSort).toBeUndefined();
  });
});
