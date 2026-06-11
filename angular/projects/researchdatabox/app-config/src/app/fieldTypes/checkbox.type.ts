import { Component } from '@angular/core';
import { FieldType, FieldTypeConfig } from '@ngx-formly/core';

@Component({
  selector: 'formly-app-config-checkbox-type',
  template: `
    <div class="app-config-checkbox form-group">
      <label [attr.for]="id" class="app-config-checkbox-label">
        <input
          type="checkbox"
          [id]="id"
          [formControl]="formControl"
          [formlyAttributes]="field">
        <span>{{ props.label || field.key }}</span>
        @if (props.required) {
          <span class="app-config-checkbox-required">*</span>
        }
      </label>

      @if (props.description) {
        <p class="help-block">{{ props.description }}</p>
      }
      @if (showError && formControl.errors) {
        <div class="alert alert-danger" role="alert">
          <formly-validation-message [field]="field"></formly-validation-message>
        </div>
      }
    </div>
  `,
  standalone: false
})
export class CheckboxTypeComponent extends FieldType<FieldTypeConfig> {}
