import { blockHelperScaffold } from './helper-usage';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import { AutocompleteComponent } from './autocomplete.component';
import { TranslationStub } from './email-templates.testing';
import { flattenContextFields } from './schema-fields';
import { contextSchemaFixture } from './schema.fixture';
import { CompletionSource } from './template-completion';

@Component({
  standalone: true,
  imports: [AutocompleteComponent],
  template: `
    <textarea #area (input)="inputs = inputs + 1; value = area.value" [readOnly]="readonly"></textarea>
    <email-templates-autocomplete
      translationPrefix="email-templates"
      [target]="area"
      [source]="source"
    ></email-templates-autocomplete>
    <input #line (input)="lineValue = line.value" />
    <email-templates-autocomplete
      translationPrefix="email-templates"
      [target]="line"
      [source]="source"
    ></email-templates-autocomplete>
  `,
})
class HostComponent {
  source: CompletionSource = {
    fields: flattenContextFields(contextSchemaFixture()),
    roots: ['oid', 'portal', 'record'],
    helpers: ['each', 'if'],
    blockScaffold: blockHelperScaffold,
  };
  inputs = 0;
  value = '';
  lineValue = '';
  readonly = false;
}

describe('AutocompleteComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: TranslationService, useClass: TranslationStub }],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  const area = (): HTMLTextAreaElement => fixture.nativeElement.querySelector('textarea');
  const line = (): HTMLInputElement => fixture.nativeElement.querySelector('input');
  const listbox = (): HTMLElement | null => fixture.nativeElement.querySelector('[role="listbox"]');
  const options = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('[role="option"]'));
  const labels = () => options().map(o => o.querySelector('.et-ac-label')!.textContent!.trim());

  function type(control: HTMLTextAreaElement | HTMLInputElement, text: string, caret = text.length): void {
    control.focus();
    control.value = text;
    control.setSelectionRange(caret, caret);
    control.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function key(control: HTMLElement, name: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
    control.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  it('opens a listbox for {{ and a partial path, wired with aria-activedescendant and an announced count', () => {
    expect(area().getAttribute('aria-autocomplete')).toBe('list');
    type(area(), 'Dear {{record.metadata.t');
    expect(listbox()).not.toBeNull();
    expect(labels()).toEqual(['title', 'description', 'authors']);
    expect(area().getAttribute('aria-controls')).toBe(listbox()!.id);
    expect(area().getAttribute('aria-activedescendant')).toBe(options()[0].id);
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
      'email-templates-ac-count count=3'
    );
    expect(fixture.nativeElement.querySelector('.et-ac-context').textContent).toContain('record.metadata');
    expect(document.activeElement).toBe(area());
  });

  it('moves with Up/Down (wrapping) and inserts the active path at the caret with one input event on Enter', () => {
    type(area(), 'Dear {{record.metadata.t, thanks', 24);
    const before = host.inputs;
    expect(key(area(), 'ArrowDown').defaultPrevented).toBeTrue();
    expect(area().getAttribute('aria-activedescendant')).toBe(options()[1].id);
    key(area(), 'ArrowUp');
    key(area(), 'ArrowUp');
    expect(area().getAttribute('aria-activedescendant')).toBe(options()[2].id);
    key(area(), 'ArrowDown');
    expect(key(area(), 'Enter').defaultPrevented).toBeTrue();
    expect(host.value).toBe('Dear {{record.metadata.title}}, thanks');
    expect(area().selectionStart).toBe('Dear {{record.metadata.title}}'.length);
    expect(host.inputs).toBe(before + 1);
    expect(listbox()).toBeNull();
    expect(area().hasAttribute('aria-activedescendant')).toBeFalse();
  });

  it('accepts with Tab and drills into objects, keeping suggestions open', () => {
    type(area(), '{{rec');
    expect(key(area(), 'Tab').defaultPrevented).toBeTrue();
    expect(host.value).toBe('{{record.');
    expect(labels()).toEqual(['metadata', 'workflow']);
  });

  it('accepts a helper name inside an existing block without inserting a scaffold', () => {
    const text = '{{#if oid}}OK{{/if}}';
    type(area(), text, text.indexOf('if') + 2);
    const before = host.inputs;
    expect(labels()).toEqual(['if']);
    key(area(), 'Tab');
    expect(host.value).toBe(text);
    expect(area().selectionStart).toBe(text.indexOf('if') + 2);
    expect(host.inputs).toBe(before + 1);
  });

  it('inserts a new balanced block and selects its placeholder for replacement', () => {
    type(area(), 'Hello {{#ea');
    const before = host.inputs;
    key(area(), 'Tab');
    expect(host.value).toBe('Hello {{#each record.metadata.YOUR_ARRAY}}\n  {{this}}\n{{/each}}');
    expect(area().value.slice(area().selectionStart, area().selectionEnd)).toBe('YOUR_ARRAY');
    expect(host.inputs).toBe(before + 1);
    expect(listbox()).toBeNull();
  });

  it('replaces the entire triple opener when starting a block scaffold', () => {
    type(area(), '{{{if}}}', 5);
    key(area(), 'Tab');
    expect(host.value).toBe('{{#if record.metadata.YOUR_FIELD}}\n  {{record.metadata.YOUR_FIELD}}\n{{/if}}');
    expect(area().value.slice(area().selectionStart, area().selectionEnd)).toBe('YOUR_FIELD');
  });

  it('closes on Escape without changing text and stays closed while typing the same path', () => {
    type(area(), '{{record.');
    const escape = key(area(), 'Escape');
    expect(escape.defaultPrevented).toBeTrue();
    expect(listbox()).toBeNull();
    expect(host.value).toBe('{{record.');
    type(area(), '{{record.m');
    expect(listbox()).toBeNull();
    key(area(), ' ', { ctrlKey: true });
    expect(listbox()).not.toBeNull();
  });

  it('leaves keys alone when closed and never opens outside a mustache, on selections or read-only controls', () => {
    type(area(), 'plain text');
    expect(key(area(), 'Enter').defaultPrevented).toBeFalse();
    expect(listbox()).toBeNull();
    type(area(), '{{record.title}} done');
    expect(listbox()).toBeNull();
    area().value = '{{rec';
    area().setSelectionRange(2, 5);
    area().dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(listbox()).toBeNull();
    host.readonly = true;
    fixture.detectChanges();
    type(area(), '{{rec');
    expect(listbox()).toBeNull();
  });

  it('follows pointer movement, not content moving under a still pointer', () => {
    type(area(), '{{record.metadata.t');
    options()[2].dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(area().getAttribute('aria-activedescendant')).toBe(options()[0].id);
    options()[2].dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    fixture.detectChanges();
    expect(area().getAttribute('aria-activedescendant')).toBe(options()[2].id);
  });

  it('inserts on click without stealing focus, and closes on blur', () => {
    type(area(), '{{o');
    const option = options()[0];
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    option.dispatchEvent(down);
    expect(down.defaultPrevented).toBeTrue();
    option.click();
    fixture.detectChanges();
    expect(host.value).toBe('{{oid}}');
    type(area(), '{{o');
    area().dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(listbox()).toBeNull();
  });

  it('works on single-line inputs as a combobox', () => {
    expect(line().getAttribute('role')).toBe('combobox');
    expect(line().getAttribute('aria-expanded')).toBe('false');
    type(line(), 'Ready: {{record.metadata.ti');
    expect(line().getAttribute('aria-expanded')).toBe('true');
    key(line(), 'Enter');
    expect(host.lineValue).toBe('Ready: {{record.metadata.title}}');
    expect(host.value).toBe('');
  });

  it('anchors the popover at the start of the token being completed', () => {
    type(area(), '{{');
    const first = (fixture.nativeElement.querySelector('.et-ac') as HTMLElement).style.left;
    type(area(), '{{rec');
    expect((fixture.nativeElement.querySelector('.et-ac') as HTMLElement).style.left).toBe(first);
  });
});
