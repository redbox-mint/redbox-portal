import { Component, OnDestroy } from '@angular/core';
import { FieldType } from '@ngx-formly/core';

/** Escape hatch for schema values explicitly allowing arbitrary JSON, without coercing their types. */
@Component({
  selector: 'app-config-json', standalone: false,
  template: `<label [for]="id">{{ props.label || ('admin-config-dictionary-value' | i18next) }}</label>
    <textarea class="form-control" [id]="id" [value]="text" [disabled]="props.disabled" [attr.aria-invalid]="invalid || showError" [attr.aria-describedby]="invalid || showError ? id + '-error' : null" (input)="update($any($event.target).value)" rows="3"></textarea>
    @if (invalid || showError) { <div [id]="id + '-error'" class="invalid-feedback d-block" role="alert">@if (invalid) { {{ 'admin-config-json-invalid' | i18next }} } @else { <formly-validation-message [field]="field"></formly-validation-message> }</div> }`
})
export class JsonTypeComponent extends FieldType implements OnDestroy {
  ngOnDestroy(): void { this.options?.formState?.invalidJsonDrafts?.delete(this.field); }
  draft?: string;
  invalid = false;
  get text(): string { return this.draft ?? JSON.stringify(this.formControl.value, null, 2) ?? ''; }
  update(text: string): void {
    this.draft = text;
    this.formControl.markAsDirty();
    try {
      const value = JSON.parse(text);
      this.invalid = false;
      this.options?.formState?.invalidJsonDrafts?.delete(this.field);
      this.formControl.setValue(value);
    } catch {
      this.invalid = true;
      this.options?.formState?.invalidJsonDrafts?.add(this.field);
      this.formControl.setErrors({ ...this.formControl.errors, json: true });
    }
  }
}
