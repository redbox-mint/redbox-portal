import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { I18NextPipe } from '@researchdatabox/portal-ng-common';
import type { NamedQueryJson } from '@researchdatabox/sails-ng-common';

let nextId = 0;
/** Explicit JSON preserves omitted, null, false, zero and empty strings. Raw invalid edits stay local. */
@Component({
  selector: 'nq-graphql-json',
  imports: [CommonModule, FormsModule, I18NextPipe],
  template: `<label class="rb-ws-label" [for]="id">{{ label }}</label>
    <textarea
      [id]="id"
      class="form-control font-monospace"
      rows="2"
      [ngModel]="text"
      (ngModelChange)="change($event)"
      [attr.aria-invalid]="invalid"
      [attr.aria-describedby]="invalid ? id + '-error' : null"
    ></textarea>
    <p *ngIf="invalid" [id]="id + '-error'" class="text-danger" role="alert">
      {{ (path ? 'named-query-graphql-path-invalid' : 'named-query-invalid-json') | i18next }}
    </p>
    <button
      *ngIf="optional"
      type="button"
      class="btn btn-sm btn-outline-secondary mt-1"
      (click)="unset()"
      [attr.aria-label]="('named-query-unset-value' | i18next) + ': ' + label"
    >
      {{ 'named-query-unset-value' | i18next }}
    </button>`,
})
export class GraphqlJsonInputComponent implements OnChanges {
  readonly id = `nq-graphql-json-${++nextId}`;
  @Input() value: unknown;
  @Input() label = '';
  @Input() path = false;
  @Input() optional = false;
  @Output() valueChange = new EventEmitter<NamedQueryJson | undefined>();
  @Output() validityChange = new EventEmitter<boolean>();
  text = '';
  invalid = false;
  private emitted: NamedQueryJson | undefined;
  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['value'] || (this.value === this.emitted && !changes['value'].firstChange)) return;
    this.text = this.value === undefined ? '' : JSON.stringify(this.value);
    const wasInvalid = this.invalid;
    this.invalid = false;
    if (wasInvalid) this.validityChange.emit(true);
  }
  change(text: string): void {
    this.text = text;
    try {
      const parsed: NamedQueryJson | undefined = text === '' && this.optional ? undefined : JSON.parse(text);
      if (!this.jsonValue(parsed, 0)) throw new Error();
      if (
        this.path &&
        parsed !== undefined &&
        (!Array.isArray(parsed) || parsed.some(part => typeof part !== 'string'))
      )
        throw new Error();
      this.invalid = false;
      this.validityChange.emit(true);
      this.emitted = parsed;
      this.valueChange.emit(parsed);
    } catch {
      this.invalid = true;
      this.validityChange.emit(false);
    }
  }
  private jsonValue(value: unknown, depth: number): boolean {
    if (depth > 24) return false;
    if (typeof value === 'number') return Number.isFinite(value);
    if (value && typeof value === 'object')
      return Object.values(value).every(child => this.jsonValue(child, depth + 1));
    return true;
  }
  unset(): void {
    this.change('');
  }
}
