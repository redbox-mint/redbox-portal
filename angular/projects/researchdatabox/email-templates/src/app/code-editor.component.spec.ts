import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CodeEditorComponent } from './code-editor.component';

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
      (valueChange)="value = $event; changes = changes + 1"
    ></email-templates-code-editor>
  `,
})
class HostComponent {
  @ViewChild('editor') editor!: CodeEditorComponent;
  value = 'one\ntwo\nthree';
  lines: number[] = [];
  changes = 0;
}

describe('CodeEditorComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
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
});
