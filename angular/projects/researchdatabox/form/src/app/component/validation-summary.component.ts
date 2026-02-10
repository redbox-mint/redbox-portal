import {Component, inject, Injector, Input} from '@angular/core';
import {FormFieldBaseComponent} from "@researchdatabox/portal-ng-common";
import {FormComponent} from "../form.component";
import {FormValidatorSummaryErrors, ValidationSummaryComponentName} from "@researchdatabox/sails-ng-common";


// TODO: use summary.lineagePaths to reveal the parent components and focus on the element on click/tap
@Component({
  selector: 'redbox-validation-summary-field',
  template: `
    @let validationList = allValidationErrorsDisplay;
    @if (validationList.length === 0) {
      <div class="alert alert-info" role="alert">
        The form is valid.
      </div>
    }
    @if (validationList.length > 0) {
      <div class="alert alert-danger mt-3" role="alert">
        <span>{{ '@dmpt-form-validation-fail-prefix' | i18next }}</span>
        @for (summary of validationList; track summary.id ?? summary.message ?? $index) {
          @if (summary.errors.length > 0) {
            @if (summary.id && summary.message) {
              <a [attr.data-validation-summary-id]="summary.id"
                 [attr.data-validation-summary-message]="summary.message"
                 [attr.href]="'#' + summary.id">{{ summary.message | i18next }}</a>:
            } @else if (summary.id && !summary.message) {
              <a [attr.data-validation-summary-id]="summary.id"
                 [attr.data-validation-summary-message]="summary.message"
                 [attr.href]="'#' + summary.id ">{{ summary.id }}</a>:
            } @else if (!summary.id && summary.message) {
              <span [attr.data-validation-summary-id]="summary.id"
                    [attr.data-validation-summary-message]="summary.message">{{ summary.message | i18next }}:
              </span>
            } @else {
              <span [attr.data-validation-summary-id]="summary.id"
                    [attr.data-validation-summary-message]="summary.message">
                {{ "@validator-label-default" | i18next }}:
              </span>
            }
            @for (error of summary.errors; track (error.class ?? 'err') + '-' + $index) {
              <span [attr.data-validation-error-class]="error.class"
                    [attr.data-validation-error-message]="error.message">
                {{ $index + 1 }}) {{ error.message | i18next: error.params }}
              </span>
            }
          }
        }
      </div>
    }
  `,
  standalone: false
})
export class ValidationSummaryFieldComponent extends FormFieldBaseComponent<string> {
  protected override logName = ValidationSummaryComponentName;

  /**
   * The model associated with this component.
   *
   * @type {FieldModel<any>}
   * @memberof FieldComponent
   */
  @Input() public override model?: never;

  private _injector = inject(Injector);

  get allValidationErrorsDisplay(): FormValidatorSummaryErrors[] {
    return this.getFormComponent?.getValidationErrors() ?? [];
  }

  private get getFormComponent(): FormComponent {
    return this._injector.get(FormComponent);
  }

}
