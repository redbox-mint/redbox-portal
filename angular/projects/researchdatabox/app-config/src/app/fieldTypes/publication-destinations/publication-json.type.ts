import { ChangeDetectionStrategy, Component, OnInit, OnDestroy } from '@angular/core';
import { ValidatorFn } from '@angular/forms';
import { FieldType, FieldTypeConfig } from '@ngx-formly/core';

@Component({
  selector: 'formly-publication-json',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3">
      <label [for]="id" class="form-label">{{ props.label }}</label>
      <p class="text-muted">{{ '@publication-config-json-help' | i18next }}</p>
      <textarea
        [id]="id"
        class="form-control font-monospace"
        rows="6"
        [value]="text"
        [attr.aria-invalid]="invalid"
        (input)="onInput($event)"
      ></textarea>
      @if (invalid) {
        <p class="text-danger" role="alert">{{ '@publication-config-json-error' | i18next }}</p>
      }
    </div>
  `,
})
export class PublicationJsonTypeComponent extends FieldType<FieldTypeConfig> implements OnInit, OnDestroy {
  text = '';
  invalid = false;
  private readonly validateJson: ValidatorFn = () => (this.invalid ? { publicationJson: true } : null);
  ngOnInit(): void {
    this.text = JSON.stringify(this.formControl.value ?? {}, null, 2);
    this.formControl.addValidators(this.validateJson);
  }
  ngOnDestroy(): void {
    this.formControl.removeValidators(this.validateJson);
    this.formControl.updateValueAndValidity({ emitEvent: false });
  }
  onInput(event: Event): void {
    if (event.target instanceof HTMLTextAreaElement) this.update(event.target.value);
  }
  update(text: string): void {
    this.text = text;
    try {
      const value: unknown = JSON.parse(text);
      if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
      this.invalid = false;
      this.formControl.setValue(value);
    } catch {
      this.invalid = true;
      this.formControl.updateValueAndValidity();
    }
    this.formControl.markAsDirty();
    this.formControl.markAsTouched();
  }
}
