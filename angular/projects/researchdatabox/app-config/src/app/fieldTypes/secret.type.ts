import { Component } from '@angular/core';
import { FieldType, FieldTypeConfig } from '@ngx-formly/core';

@Component({
  selector: 'app-config-secret',
  standalone: false,
  template: `
    <div class="mb-3">
      <label [for]="id">{{ props.label }}</label>
      <input class="form-control" type="password" autocomplete="new-password" [id]="id" [formControl]="formControl" [formlyAttributes]="field" [class.is-invalid]="showError" [attr.aria-describedby]="id + '-hint'">
      <p class="rb-admin-hint" [id]="id + '-hint'">{{ 'admin-config-secret-hint' | i18next }}</p>
      @if (showError) { <div class="invalid-feedback d-block"><formly-validation-message [field]="field"></formly-validation-message></div> }
    </div>
  `
})
export class SecretTypeComponent extends FieldType<FieldTypeConfig> {}
