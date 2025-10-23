import {Component, inject, Injector, Input} from '@angular/core';
import {
  FormFieldBaseComponent,
  FormFieldModel,
} from "@researchdatabox/portal-ng-common";
import {FormComponent} from "../form.component";
import {FormValidatorSummaryErrors, ValidationSummaryComponentName} from "@researchdatabox/sails-ng-common";


// TODO: use item.parents to reveal the parent components on click
@Component({
  selector: 'redbox-validation-summary-field',
  template: `
    @let validationList = allValidationErrorsDisplay;
    @if (validationList.length > 0) {
      <div class="alert alert-danger mt-3" role="alert">
        <ul>
          @for (item of validationList; track item.id) {
            @if (item.errors.length > 0) {
              <li>
                @if (item.id && item.message) {
                  <a href="#{{ item.id }}">{{ item.message | i18next }}</a>
                } @else if (item.id && !item.message) {
                  <a href="#{{ item.id }}">{{ item.id }}</a>
                } @else if(!item.id && item.message) {
                  {{ item.message | i18next }}
                } @else {
                  {{ "@validator-label-default" | i18next }}
                }
                <ul>
                  @for (error of item.errors; track $index) {
                    <li>{{ error.message | i18next: error.params }}
                    </li>
                  }
                </ul>
              </li>
            }
          }
        </ul>
      </div>
    }
    @if (validationList.length === 0) {
      <div class="alert alert-info" role="alert">
        The form is valid.
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
    return  this.getFormComponent?.getValidationErrors() ?? [];
  }

  private get getFormComponent(): FormComponent {
    return this._injector.get(FormComponent);
  }

}
