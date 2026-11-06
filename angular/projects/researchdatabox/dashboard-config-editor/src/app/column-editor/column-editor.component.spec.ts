import { ColumnDetailComponent } from './column-detail.component';
import { ColumnEditorComponent } from './column-editor.component';
import { FieldPickerComponent } from '../field-picker/field-picker.component';
import { AdminModalDirective } from '@researchdatabox/portal-ng-common';
import { NO_ERRORS_SCHEMA, Pipe } from '@angular/core';
import { TestBed, fakeAsync, flush } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { A11yModule } from '@angular/cdk/a11y';

@Pipe({ name: 'i18next', standalone: false })
class TestTranslationPipe { transform(key: string) { return key; } }

describe('Dashboard columns and field chooser', () => {
  it('reorders complete column objects, retaining templates and extra settings', () => {
    const editor = new ColumnEditorComponent();
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
    const editor = new ColumnEditorComponent();
    editor.columns = [{ title: 'Title', variable: 'metadata.title', template: '' }];
    editor.removeColumn(0, new Event('click'));
    expect(editor.pendingRemoval).toBe(editor.columns[0]);
    editor.pendingRemoval = null;
    editor.confirmRemoval();
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


describe('Dashboard column interaction accessibility', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ColumnEditorComponent, ColumnDetailComponent, FieldPickerComponent, TestTranslationPipe],
      imports: [FormsModule, A11yModule, AdminModalDirective],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
  });

  it('preserves complete field names and titles while allowing breaks only between path segments', () => {
    const fixture = TestBed.createComponent(ColumnEditorComponent);
    const path = 'metadata.contributor_ci.text_full_name';
    fixture.componentInstance.columns = [{ title: 'Name', variable: path, template: '' }];
    fixture.detectChanges();
    const code: HTMLElement = fixture.nativeElement.querySelector('.dc-columns-table code');
    expect(code.textContent).toBe(path);
    expect(code.title).toBe(path);
    expect(Array.from(code.querySelectorAll('wbr')).every(node => node.previousSibling?.textContent?.endsWith('.'))).toBeTrue();
    fixture.destroy();
  });

  it('reveals the controlled detail region and moves focus to its heading', () => {
    const fixture = TestBed.createComponent(ColumnEditorComponent);
    fixture.componentInstance.columns = [{ title: 'Title', variable: 'metadata.title', template: '' }];
    fixture.detectChanges();
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('.dc-column-edit');
    const region = document.getElementById(trigger.getAttribute('aria-controls')!);
    expect(region?.hidden).toBeTrue();
    const scroll = spyOn(HTMLElement.prototype, 'scrollIntoView');
    trigger.click();
    fixture.detectChanges();
    const heading = fixture.nativeElement.querySelector('h4[tabindex="-1"]');
    expect(region?.hidden).toBeFalse();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(heading);
    expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
  });

  it('starts confirmation on Cancel, restores focus on Escape, and deletes only on confirmation', fakeAsync(() => {
    const fixture = TestBed.createComponent(ColumnEditorComponent);
    const editor = fixture.componentInstance;
    const first = { title: 'First', variable: 'metadata.first', template: '' };
    const second = { title: 'Second', variable: 'metadata.second', template: '' };
    editor.columns = [first, second];
    fixture.detectChanges();
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-outline-danger');
    trigger.focus();
    trigger.click();
    fixture.detectChanges();
    flush();
    const dialog: HTMLElement = fixture.nativeElement.querySelector('[role="alertdialog"]');
    expect(dialog.contains(document.activeElement)).toBeTrue();
    expect(document.activeElement?.hasAttribute('cdkFocusInitial')).toBeTrue();
    expect(editor.columns).toEqual([first, second]);
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    flush();
    expect(editor.pendingRemoval).toBeNull();
    expect(document.activeElement).toBe(trigger);
    trigger.click();
    fixture.detectChanges();
    flush();
    fixture.nativeElement.querySelector('.rb-admin-danger-confirm').click();
    fixture.detectChanges();
    flush();
    expect(editor.columns).toEqual([second]);
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.dc-column-toolbar button'));
  }));
});
