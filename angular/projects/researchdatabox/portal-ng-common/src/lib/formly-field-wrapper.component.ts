import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FieldWrapper, FormlyModule } from '@ngx-formly/core';
import { I18NextPipe } from './i18next.pipe';

/** Bootstrap field layout with a persistent target for the types' error references. */
@Component({
  selector: 'rb-formly-field-wrapper',
  standalone: true,
  imports: [CommonModule, FormlyModule, I18NextPipe],
  styles: [':host { display: block; margin-bottom: 1rem; }'],
  template: `
    <ng-template #label>
      @if (props.label && props['hideLabel'] !== true) {
        <label [attr.for]="id" class="form-label">{{ props.label }}
          @if (props.required && props['hideRequiredMarker'] !== true) { <span aria-hidden="true">*</span> }
        </label>
      }
    </ng-template>
    <div [class.form-floating]="props['labelPosition'] === 'floating'" [class.has-error]="showError">
      @if (props['labelPosition'] !== 'floating') { <ng-container *ngTemplateOutlet="label"></ng-container> }
      <ng-template #fieldComponent></ng-template>
      @if (props['labelPosition'] === 'floating') { <ng-container *ngTemplateOutlet="label"></ng-container> }
      <div [id]="id + '-formly-validation-error'" class="invalid-feedback" [style.display]="showError ? 'block' : 'none'">
        @if (showError) { <formly-validation-message [field]="field" role="alert"></formly-validation-message> }
      </div>
      @if (props.description) { <small class="form-text text-muted">{{ props.description }}</small> }
      @if (props['connectionNeedsBaseUrl']?.()) {
        <p class="rb-admin-hint">{{ 'admin-config-connection-base-url-hint' | i18next }}</p>
      }
    </div>
  `
})
export class FormlyFieldWrapperComponent extends FieldWrapper {}
