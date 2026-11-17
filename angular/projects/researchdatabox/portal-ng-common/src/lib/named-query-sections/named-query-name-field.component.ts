import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18NextPipe } from '../i18next.pipe';
import { suggestNamedQueryName, validateNamedQueryName } from './named-query-name';

/** Shared by database, GraphQL and explorer publication forms. */
@Component({
  selector: 'rb-named-query-name',
  imports: [FormsModule, I18NextPipe],
  template: `
    <label [for]="id" class="form-label">{{ 'named-query-name' | i18next }}</label>
    <input
      #field
      [id]="id"
      data-named-query-name
      class="form-control"
      type="text"
      required
      [ngModel]="name"
      (ngModelChange)="change($event)"
      (blur)="touched = true"
      [readonly]="!isNew"
      [disabled]="disabled"
      [class.is-invalid]="!!error"
      [attr.aria-invalid]="error ? 'true' : null"
      [attr.aria-describedby]="id + '-help' + (error ? ' ' + id + '-error' : '')"
    />
    <div [id]="id + '-help'" class="form-text">{{ 'nq-section-name-help' | i18next }}</div>
    @if (error) {
      <div [id]="id + '-error'" class="invalid-feedback" aria-live="polite">{{ error | i18next }}</div>
      @if (name && suggestion !== name) {
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm mt-2"
          [disabled]="disabled"
          (click)="applySuggestion()"
        >
          {{ 'named-query-name-use-suggestion' | i18next: { suggestion: suggestion } }}
        </button>
      }
    }
  `,
})
export class NamedQueryNameFieldComponent {
  @Input() id = 'nq-name';
  @Input() name = '';
  @Input() isNew = true;
  @Input() disabled = false;
  @Input() attempted = false;
  @Output() nameChange = new EventEmitter<string>();
  @ViewChild('field') field?: ElementRef<HTMLInputElement>;
  touched = false;
  get error(): string | null {
    return this.isNew && (this.name || this.touched || this.attempted) ? validateNamedQueryName(this.name) : null;
  }
  get suggestion(): string {
    return suggestNamedQueryName(this.name);
  }
  change(name: string): void {
    this.name = name;
    this.touched = true;
    this.nameChange.emit(name);
  }
  applySuggestion(): void {
    this.change(this.suggestion);
    this.focus();
  }
  focus(): void {
    this.field?.nativeElement.focus();
  }
}
