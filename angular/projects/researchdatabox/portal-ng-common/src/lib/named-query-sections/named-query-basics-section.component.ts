import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18NextPipe } from '../i18next.pipe';

@Component({
  selector: 'rb-named-query-basics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, I18NextPipe],
  styleUrls: ['./named-query-sections.scss'],
  template: ` <section class="rb-admin-form-section" aria-labelledby="nq-basics-title">
    <header class="rb-admin-form-section-header">
      <h3 [attr.aria-level]="headingLevel" id="nq-basics-title">{{ 'nq-section-basics' | i18next }}</h3>
    </header>
    <div class="rb-admin-form-section-body rb-admin-form-grid">
      <label class="rb-admin-field"
        >{{ 'nq-section-name' | i18next }}
        <input
          class="form-control"
          [ngModel]="name"
          (ngModelChange)="nameChange.emit($event)"
          [disabled]="disabled || !isNew"
          maxlength="120"
          pattern="[A-Za-z0-9_-]+"
          required
          aria-describedby="nq-name-help"
        />
        <span id="nq-name-help" class="rb-admin-hint">{{ 'nq-section-name-help' | i18next }}</span>
      </label>
      <label class="rb-admin-field"
        >{{ 'nq-section-used-for' | i18next }}
        <select class="form-select" [ngModel]="use" (ngModelChange)="useChange.emit($event)" [disabled]="disabled">
          <option value="general">{{ 'nq-section-general' | i18next }}</option>
          <option value="lookup">{{ 'nq-section-form-lookup' | i18next }}</option>
        </select>
      </label>
      @if (showDescription) {
        <label class="rb-admin-field"
          >{{ 'named-query-graphql-description' | i18next }}
          <textarea
            class="form-control"
            rows="3"
            [ngModel]="description"
            (ngModelChange)="descriptionChange.emit($event)"
            [disabled]="disabled"
          ></textarea>
        </label>
      }
    </div>
  </section>`,
})
export class NamedQueryBasicsSectionComponent {
  /** Page editors use level 2; publishing panels retain level 3. */
  @Input() headingLevel: 2 | 3 = 3;
  @Input() name = '';
  @Input() showDescription = false;
  @Input() description = '';
  @Output() descriptionChange = new EventEmitter<string>();
  @Input() use: 'general' | 'lookup' = 'general';
  @Input() isNew = true;
  @Input() disabled = false;
  @Output() nameChange = new EventEmitter<string>();
  @Output() useChange = new EventEmitter<'general' | 'lookup'>();
}
