import { Component } from '@angular/core';
import { FieldType } from '@ngx-formly/core';

/** Escape hatch for schema values explicitly allowing arbitrary JSON, without coercing their types. */
@Component({
  selector: 'app-config-json', standalone: false,
  template: `<label [for]="id">{{ props.label || ('admin-config-dictionary-value' | i18next) }}</label>
    <textarea class="form-control" [id]="id" [value]="text" [disabled]="props.disabled" (input)="update($any($event.target).value)" rows="3"></textarea>
    @if (invalid) { <p class="invalid-feedback d-block" role="alert">{{ 'admin-config-json-invalid' | i18next }}</p> }`
})
export class JsonTypeComponent extends FieldType {
  draft?: string;
  invalid = false;
  get text(): string { return this.draft ?? JSON.stringify(this.formControl.value, null, 2) ?? ''; }
  update(text: string): void {
    this.draft = text;
    try {
      const value = JSON.parse(text);
      this.invalid = false; this.formControl.setValue(value); this.formControl.markAsDirty();
    } catch {
      this.invalid = true; this.formControl.setErrors({ json: true });
    }
  }
}
