import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import { TranslationStub } from './email-templates.testing';
import { FieldTreeComponent } from './field-tree.component';
import { fieldInsertion } from './field-tree';
import { flattenContextFields } from './schema-fields';
import { contextSchemaFixture } from './schema.fixture';

describe('FieldTreeComponent', () => {
  let fixture: ComponentFixture<FieldTreeComponent>;
  let component: FieldTreeComponent;
  let inserted: string[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FieldTreeComponent],
      providers: [{ provide: TranslationService, useClass: TranslationStub }],
    }).compileComponents();
    fixture = TestBed.createComponent(FieldTreeComponent);
    component = fixture.componentInstance;
    inserted = [];
    component.insert.subscribe(text => inserted.push(text));
    fixture.componentRef.setInput('idPrefix', 'et-fields');
    fixture.componentRef.setInput('translationPrefix', 'email-templates');
    fixture.componentRef.setInput('initialExpanded', ['record', 'record.metadata']);
    fixture.componentRef.setInput('aliasRoots', ['imports']);
    fixture.componentRef.setInput('insertion', fieldInsertion);
    fixture.componentRef.setInput('fields', flattenContextFields(contextSchemaFixture()));
    fixture.componentRef.setInput('roots', ['oid', 'record', 'scuEmail']);
    fixture.detectChanges();
  });

  const rows = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('.et-field'));
  const key = (r: HTMLElement) =>
    r
      .querySelector('.et-field-key')!
      .textContent!.trim()
      .replace(/\u200b/g, '');
  const row = (name: string) => rows().find(r => key(r) === name)!;
  const keys = () => rows().map(key);

  it('opens on the record fields and shows type, requiredness and title', () => {
    expect(keys()).toEqual([
      'oid',
      'record',
      'metadata',
      'title',
      'description',
      'authors',
      'keywords',
      'workflow',
      'portal',
      'scuEmail',
    ]);
    const title = row('title');
    expect(title.querySelector('.et-field-type')!.textContent).toContain('string');
    expect(title.querySelector('.et-field-req')!.textContent).toContain('email-templates-fields-required');
    expect(row('description').querySelector('.et-field-req')!.textContent).toContain('email-templates-fields-optional');
    expect(title.querySelector('.et-field-title')!.textContent).toContain('Title');
    expect(title.querySelector('.et-field-name')!.getAttribute('title')).toBe('Title — The record title');
    expect(row('scuEmail').querySelector('.et-field-req')).toBeNull();
  });

  it('expands and collapses objects from their name, with aria-expanded', () => {
    const metadata = row('metadata').querySelector('button')!;
    expect(metadata.getAttribute('aria-expanded')).toBe('true');
    metadata.click();
    fixture.detectChanges();
    expect(keys()).not.toContain('title');
    expect(row('metadata').querySelector('button')!.getAttribute('aria-expanded')).toBe('false');
    expect(inserted).toEqual([]);
  });

  it('inserts scalar paths and #each scaffolds, and expands lists separately', () => {
    (row('title').querySelector('.et-field-name') as HTMLButtonElement).click();
    (row('authors').querySelector('.et-field-name') as HTMLButtonElement).click();
    expect(inserted).toEqual([
      '{{record.metadata.title}}',
      '{{#each record.metadata.authors}}\n  {{this.name}}\n{{/each}}',
    ]);
    (row('authors').querySelector('.et-field-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(keys()).toContain('name');
    (row('name').querySelector('.et-field-name') as HTMLButtonElement).click();
    expect(inserted[2]).toBe('{{#each record.metadata.authors}}\n  {{this.name}}\n{{/each}}');
  });

  it('searches by path or title, reveals groups in place and clears with Escape', () => {
    const search = fixture.nativeElement.querySelector('#et-fields-search') as HTMLInputElement;
    search.value = 'zzz';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(keys()).toEqual([]);
    expect(fixture.nativeElement.querySelector('.et-fields-empty').textContent).toContain(
      'email-templates-fields-none'
    );
    search.value = 'workflow';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(keys()).toEqual(['record.workflow', 'record.workflow.stage', 'record.workflow.stageLabel']);
    expect(fixture.nativeElement.querySelector('.et-fields-count').textContent).toContain('count=3');
    (rows()[0].querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(search.value).toBe('');
    expect(keys()).toContain('stageLabel');
    search.value = 'oid';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    search.dispatchEvent(escape);
    fixture.detectChanges();
    expect(escape.defaultPrevented).toBeTrue();
    expect(component.query).toBe('');
  });

  it('shows no invented type or requiredness for name-only form-config fields', () => {
    fixture.componentRef.setInput('fields', [
      { path: 'record', type: 'object', required: false, isArray: false },
      { path: 'record.metadata', type: 'object', required: false, isArray: false },
      { path: 'record.metadata.text_1', type: 'unknown', title: 'Text one', required: false, isArray: false },
    ]);
    fixture.detectChanges();
    const text = row('text_1');
    expect(text.querySelector('.et-field-type')).toBeNull();
    expect(text.querySelector('.et-field-req')).toBeNull();
    (text.querySelector('.et-field-name') as HTMLButtonElement).click();
    expect(inserted).toEqual(['{{record.metadata.text_1}}']);
  });

  it('disables inserting while the editor is busy but still browses', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    const title = row('title').querySelector('.et-field-name') as HTMLButtonElement;
    expect(title.disabled).toBeTrue();
    (row('metadata').querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(keys()).not.toContain('title');
  });
});
