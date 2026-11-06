import { Component } from '@angular/core';
import { FieldType, FieldTypeConfig } from '@ngx-formly/core';

@Component({
  selector: 'formly-app-config-checkbox-type',
  template: `
    <div class="app-config-checkbox form-check" [class.form-switch]="props['switch']">
      <label [attr.for]="id" class="app-config-checkbox-label">
        <input
          type="checkbox" class="form-check-input" [attr.role]="props['switch'] ? 'switch' : null"
          [id]="id"
          [attr.aria-label]="props['switch'] ? switchLabel : null"
          [formControl]="formControl"
          [formlyAttributes]="field">
        <span>{{ props['switch'] ? ((formControl.value ? 'admin-config-on' : 'admin-config-off') | i18next) : (props.label || field.key) }}</span>
        @if (props.required) {
          <span class="app-config-checkbox-required">*</span>
        }
      </label>

      @if (props.description && !props['switch']) {
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
export class CheckboxTypeComponent extends FieldType<FieldTypeConfig> {
  get switchLabel(): string {
    const positions: number[] = [];
    let parent = this.field.parent;
    while (parent) {
      for (const key of Array.isArray(parent.key) ? parent.key : [parent.key]) {
        if (key != null && /^\d+$/.test(String(key))) positions.unshift(Number(key) + 1);
      }
      parent = parent.parent;
    }
    // Array templates are decorated before Formly gives their rows concrete indices.
    return String(this.props['switchLabel'] || this.props.label || this.field.key)
      .replace(/\*/g, () => String(positions.shift() ?? '')).replace(/\s+/g, ' ').trim();
  }
}
