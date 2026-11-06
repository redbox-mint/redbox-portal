import { Component } from '@angular/core';
import { FieldType, FormlyFieldConfig } from '@ngx-formly/core';

@Component({
  selector: 'formly-object-type',
  standalone: false,
  template: `
    @if (props['root']) {
      <ng-container *ngTemplateOutlet="body"></ng-container>
    } @else if (props['flat']) {
      <div class="rb-admin-form-grid"><ng-container *ngTemplateOutlet="body"></ng-container></div>
    } @else {
      <section class="app-config-subsection">
        <div class="app-config-subsection-header"><h3>{{ props.label || field.key }}</h3>
          @if (enabledField; as enabled) { <formly-field [field]="enabled"></formly-field> }
        </div>
        @if (props.description) { <p class="rb-admin-hint">{{ props.description }}</p> }
        <div [class.app-config-settings-off]="enabledField?.formControl?.value === false">@if (enabledField?.formControl?.value === false) { <p class="rb-admin-hint">{{ 'admin-config-off-kept' | i18next }}</p> }<div class="rb-admin-form-grid"><ng-container *ngTemplateOutlet="body"></ng-container></div></div>
      </section>
    }
    <ng-template #body>
      @if (showError && formControl.errors) {
        <div class="alert alert-danger" role="alert"><formly-validation-message [field]="field"></formly-validation-message></div>
      }
      @if (!field.fieldGroup?.length && !props['root']) { <p class="rb-admin-hint app-config-empty-section">{{ 'admin-config-no-editable-settings' | i18next }}</p> }
      @for (child of field.fieldGroup; track child) {
        @if (!child.props?.['pageEnabled'] && !child.props?.['headerEnabled']) { <formly-field [field]="child"></formly-field> }
      }
    </ng-template>
  `
})
export class ObjectTypeComponent extends FieldType {
  get enabledField(): FormlyFieldConfig | undefined {
    return this.field.fieldGroup?.find(child => child.props?.['headerEnabled']);
  }
}
