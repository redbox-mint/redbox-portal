import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { AutocompleteComponent } from './autocomplete.component';
import type { CompletionSource } from './template-completion';

/** Must match the line-height in the component styles. */
const LINE_HEIGHT_PX = 20;

/**
 * Monospace textarea with a scroll-synced line-number gutter and optional
 * highlighted lines. No editor dependency: the gutter and highlight layer are
 * presentational (aria-hidden) and the textarea stays a native, labelled form
 * control, so keyboard and assistive-technology behaviour is the browser's.
 */
@Component({
  selector: 'email-templates-code-editor',
  standalone: true,
  imports: [AutocompleteComponent],
  template: `
    <div class="et-code" [class.is-invalid]="invalid" [class.et-code-readonly]="readonly">
      <div class="et-code-gutter" aria-hidden="true">
        <div class="et-code-gutter-inner" [style.transform]="'translateY(' + -scrollTop + 'px)'">
          @for (n of lineNumbers; track n) {
            <div
              class="et-code-ln"
              [class.et-code-ln-flag]="highlighted.has(n)"
              [class.et-code-ln-warning]="warned.has(n) && !highlighted.has(n)"
            >
              {{ n }}
            </div>
          }
        </div>
      </div>
      <div class="et-code-surface">
        <div class="et-code-marks" aria-hidden="true" [style.transform]="'translateY(' + -scrollTop + 'px)'">
          @for (n of warningMarks; track n) {
            <div class="et-code-mark et-code-mark-warning" [style.top.px]="(n - 1) * lineHeight"></div>
          }
          @for (n of highlightLines; track n) {
            <div class="et-code-mark" [style.top.px]="(n - 1) * lineHeight"></div>
          }
        </div>
        <textarea
          #area
          class="et-code-input"
          [id]="inputId"
          [rows]="rows"
          [value]="value"
          [readOnly]="readonly"
          [attr.aria-describedby]="describedBy || null"
          [attr.aria-invalid]="invalid ? 'true' : null"
          wrap="off"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          (blur)="blurred.emit()"
          (input)="onInput()"
          (scroll)="onScroll()"
        ></textarea>
        @if (completions) {
          <email-templates-autocomplete [target]="area" [source]="completions"></email-templates-autocomplete>
        }
      </div>
    </div>
  `,
  styleUrls: ['./code-editor.component.scss'],
})
export class CodeEditorComponent implements OnChanges {
  @Input() value = '';
  @Input() inputId = '';
  @Input() rows = 16;
  @Input() describedBy = '';
  @Input() invalid = false;
  @Input() readonly = false;
  /** One-based line numbers to flag as errors (for example, lines with diagnostics). */
  @Input() highlightLines: number[] = [];
  /** One-based line numbers with advisory warnings; an error on the same line wins. */
  @Input() warningLines: number[] = [];
  /** Enables Handlebars path suggestions while typing. */
  @Input() completions: CompletionSource | null = null;
  @Output() valueChange = new EventEmitter<string>();
  @Output() blurred = new EventEmitter<void>();

  @ViewChild('area', { static: true }) private area!: ElementRef<HTMLTextAreaElement>;

  readonly lineHeight = LINE_HEIGHT_PX;
  lineNumbers: number[] = [1];
  highlighted = new Set<number>();
  warned = new Set<number>();
  warningMarks: number[] = [];
  scrollTop = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value']) {
      this.updateLineNumbers(this.value ?? '');
    }
    if (changes['highlightLines']) {
      this.highlighted = new Set(this.highlightLines);
    }
    if (changes['highlightLines'] || changes['warningLines']) {
      this.warned = new Set(this.warningLines);
      this.warningMarks = this.warningLines.filter(n => !this.highlighted.has(n));
    }
  }

  onInput(): void {
    const value = this.area.nativeElement.value;
    this.updateLineNumbers(value);
    this.valueChange.emit(value);
  }

  onScroll(): void {
    this.scrollTop = this.area.nativeElement.scrollTop;
  }

  /** Move the caret to a one-based line and column and bring it into view. */
  focusPosition(line: number, column: number): void {
    const area = this.area.nativeElement;
    const lines = area.value.split('\n');
    const targetLine = Math.min(Math.max(line, 1), lines.length);
    let offset = 0;
    for (let i = 0; i < targetLine - 1; i++) {
      offset += lines[i].length + 1;
    }
    offset += Math.min(Math.max(column - 1, 0), lines[targetLine - 1].length);
    area.focus();
    area.setSelectionRange(offset, offset);
    const top = (targetLine - 1) * LINE_HEIGHT_PX;
    if (top < area.scrollTop || top > area.scrollTop + area.clientHeight - LINE_HEIGHT_PX * 2) {
      area.scrollTop = Math.max(0, top - area.clientHeight / 3);
    }
    this.onScroll();
  }

  /**
   * Insert text at the caret (replacing any selection) and emit the new value.
   * `select` is a range within `text` to leave selected, such as a placeholder.
   */
  insertAtCursor(text: string, select?: { start: number; end: number }): void {
    const area = this.area.nativeElement;
    if (this.readonly) {
      return;
    }
    area.focus();
    const at = area.selectionStart;
    area.setRangeText(text, at, area.selectionEnd, 'end');
    if (select) {
      area.setSelectionRange(at + select.start, at + select.end);
    }
    this.onInput();
  }

  /** Replace one source range (for example, a suggested field name) and emit the new value. */
  replaceRange(start: number, end: number, text: string): void {
    const area = this.area.nativeElement;
    if (this.readonly) {
      return;
    }
    area.focus();
    area.setRangeText(text, start, end, 'end');
    this.onInput();
  }

  private updateLineNumbers(value: string): void {
    let count = 1;
    for (let i = 0; i < value.length; i++) {
      if (value.charCodeAt(i) === 10) {
        count++;
      }
    }
    if (count !== this.lineNumbers.length) {
      this.lineNumbers = Array.from({ length: count }, (_, i) => i + 1);
    }
  }
}
