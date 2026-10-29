import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import { CodeEditorComponent } from './code-editor.component';
import { TranslationStub } from './email-templates.testing';
import type { CompletionSource } from './template-completion';

@Component({
  standalone: true,
  imports: [CodeEditorComponent],
  template: `
    <label for="body">Body</label>
    <email-templates-code-editor
      #editor
      inputId="body"
      [value]="value"
      [highlightLines]="lines"
      [warningLines]="warnings"
      [completions]="completions"
      (valueChange)="value = $event; changes = changes + 1"
    ></email-templates-code-editor>
  `,
})
class HostComponent {
  @ViewChild('editor') editor!: CodeEditorComponent;
  value = 'one\ntwo\nthree';
  lines: number[] = [];
  warnings: number[] = [];
  completions: CompletionSource | null = null;
  changes = 0;
}

describe('CodeEditorComponent', () => {
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

  const textarea = (): HTMLTextAreaElement => fixture.nativeElement.querySelector('textarea');
  const gutterNumbers = (): string[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.et-code-ln')).map((el: any) => el.textContent.trim());

  it('is a labelled native textarea with a hidden line-number gutter', () => {
    expect(textarea().id).toBe('body');
    expect(textarea().value).toBe('one\ntwo\nthree');
    expect(textarea().getAttribute('wrap')).toBe('off');
    expect(fixture.nativeElement.querySelector('.et-code-gutter').getAttribute('aria-hidden')).toBe('true');
    expect(gutterNumbers()).toEqual(['1', '2', '3']);
  });

  it('emits edits and grows the gutter', () => {
    textarea().value = 'one\ntwo\nthree\nfour';
    textarea().dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(host.value).toBe('one\ntwo\nthree\nfour');
    expect(gutterNumbers().length).toBe(4);
  });

  it('flags highlighted lines in the gutter and the highlight layer', () => {
    host.lines = [2];
    fixture.detectChanges();
    const flagged = fixture.nativeElement.querySelectorAll('.et-code-ln-flag');
    expect(flagged.length).toBe(1);
    expect(flagged[0].textContent.trim()).toBe('2');
    const mark = fixture.nativeElement.querySelector('.et-code-mark') as HTMLElement;
    expect(mark.style.top).toBe('20px');
  });

  it('keeps the gutter in step with textarea scrolling', () => {
    host.value = Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join('\n');
    fixture.detectChanges();
    textarea().scrollTop = 100;
    textarea().dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    const inner = fixture.nativeElement.querySelector('.et-code-gutter-inner') as HTMLElement;
    expect(inner.style.transform).toBe(`translateY(-${textarea().scrollTop}px)`);
  });

  it('moves the caret to a line and column', () => {
    host.editor.focusPosition(2, 3);
    expect(document.activeElement).toBe(textarea());
    expect(textarea().selectionStart).toBe('one\n'.length + 2);
  });

  it('inserts text at the caret and emits it', () => {
    textarea().setSelectionRange(3, 3);
    host.editor.insertAtCursor('{{oid}}');
    fixture.detectChanges();
    expect(host.value).toBe('one{{oid}}\ntwo\nthree');
    expect(host.changes).toBe(1);
  });

  it('selects a requested range of the inserted text, such as a placeholder', () => {
    textarea().setSelectionRange(4, 4);
    host.editor.insertAtCursor('{{#if YOUR_FIELD}}{{/if}}', { start: 6, end: 16 });
    fixture.detectChanges();
    expect(host.value).toBe('one\n{{#if YOUR_FIELD}}{{/if}}two\nthree');
    expect(textarea().value.slice(textarea().selectionStart, textarea().selectionEnd)).toBe('YOUR_FIELD');
  });

  it('marks warning lines distinctly from errors, letting an error on the same line win', () => {
    host.lines = [1];
    host.warnings = [1, 3];
    fixture.detectChanges();
    const warningMarks = fixture.nativeElement.querySelectorAll('.et-code-mark-warning');
    expect(warningMarks.length).toBe(1);
    expect((warningMarks[0] as HTMLElement).style.top).toBe('40px');
    expect(fixture.nativeElement.querySelectorAll('.et-code-mark:not(.et-code-mark-warning)').length).toBe(1);
    const warned = Array.from(fixture.nativeElement.querySelectorAll('.et-code-ln-warning')).map((el: any) =>
      el.textContent.trim()
    );
    expect(warned).toEqual(['3']);
  });

  it('replaces one range, leaving the caret after it, with a single change', () => {
    host.editor.replaceRange(4, 7, 'TWO');
    fixture.detectChanges();
    expect(host.value).toBe('one\nTWO\nthree');
    expect(textarea().selectionStart).toBe(7);
    expect(host.changes).toBe(1);
  });

  it('adds suggestions only when completions are supplied', () => {
    expect(fixture.nativeElement.querySelector('email-templates-autocomplete')).toBeNull();
    host.completions = { fields: [], roots: ['oid'], helpers: [] };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('email-templates-autocomplete')).not.toBeNull();
    expect(textarea().getAttribute('aria-autocomplete')).toBe('list');
  });
});
