import { JsonPipe } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18NextPipe } from '../i18next.pipe';

@Component({
  selector: 'rb-named-query-preview',
  imports: [FormsModule, I18NextPipe, JsonPipe],
  styleUrls: ['./named-query-sections.scss'],
  template: ` <section class="card" aria-labelledby="nq-preview-title" [attr.aria-busy]="busy">
    <header class="card-header">
      <h3 [attr.aria-level]="headingLevel" id="nq-preview-title">{{ 'nq-section-preview' | i18next }}</h3>
    </header>
    <div class="card-body">
      <p class="rb-admin-hint">{{ 'nq-section-preview-help' | i18next }}</p>
      @for (parameter of parameters; track parameter.name) {
        <label class="rb-admin-field mb-3"
          >{{ parameter.label }}
          <input
            class="form-control"
            [ngModel]="values[parameter.name] || ''"
            (ngModelChange)="valueChange.emit({ name: parameter.name, value: $event })"
            [disabled]="busy"
          />
        </label>
      }
      <button
        type="button"
        class="btn btn-outline-secondary"
        [disabled]="disabled"
        [attr.aria-disabled]="disabled || busy"
        [class.disabled]="busy"
        (click)="!busy && !disabled && run.emit()"
      >
        {{ 'nq-section-run-preview' | i18next }}
      </button>
      <div class="mt-3" role="status" aria-live="polite">
        @if (busy) {
          <p>{{ 'nq-section-preview-running' | i18next }}</p>
        }
        @if (error) {
          <p class="text-danger">{{ error }}</p>
        }
        @if (result !== null) {
          <pre class="nq-preview-json">{{ result | json }}</pre>
        }
        @if (valid) {
          <p>{{ 'nq-section-ready' | i18next }}</p>
        }
      </div>
    </div>
  </section>`,
})
export class NamedQueryPreviewSectionComponent {
  /** Page editors use level 2; publishing panels retain level 3. */
  @Input() headingLevel: 2 | 3 = 3;
  @Input() parameters: { name: string; label: string }[] = [];
  @Input() values: Record<string, string> = {};
  @Input() result: unknown = null;
  @Input() busy = false;
  @Input() disabled = false;
  @Input() valid = false;
  @Input() error = '';
  @Output() valueChange = new EventEmitter<{ name: string; value: string }>();
  @Output() run = new EventEmitter<void>();
}
