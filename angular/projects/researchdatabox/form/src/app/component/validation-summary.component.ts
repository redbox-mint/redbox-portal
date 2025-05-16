import {Component, Inject, Injector, Input } from '@angular/core';
import {FormFieldBaseComponent, FormFieldModel, FormValidatorSummaryErrors} from "@researchdatabox/portal-ng-common";
import {FormService} from "../form.service";
import {FormComponent} from "../form.component";

export class ValidationSummaryFieldModel extends FormFieldModel<string> {
}

@Component({
  selector: 'redbox-validation-summary-field',
  template: `
    @let validationList = allValidationErrorsDisplay;
    <div class="alert alert-danger mt-1" role="alert" *ngIf="validationList.length > 0">
      <ul>
        @for (item of validationList; track item.name) {
          @if (item.errors.length > 0) {
            <li>
              name: {{ item.name }};
              message: {{ item.message }};
              parents: {{ item.parents }};
              errors:
              <ul>
                @for (error of item.errors; track error.name) {
                  <li>
                    message: {{ error.message }};
                    name: {{ error.name }};
                    params: {{ error.params | json }};
                  </li>
                }
              </ul>
            </li>
          }
        }
      </ul>
    </div>
    <div class="alert alert-info" role="alert" *ngIf="validationList.length === 0">
      The form is valid.
    </div>
  `,
  standalone: false
})
export class ValidationSummaryFieldComponent extends FormFieldBaseComponent<string> {

  /**
   * The model associated with this component.
   *
   * @type {FieldModel<any>}
   * @memberof FieldComponent
   */
  @Input() public override model?: ValidationSummaryFieldModel;

  constructor(
    @Inject(FormService) private formService: FormService,
    private _injector: Injector,
  ) {
    super();
  }

  get allValidationErrorsDisplay() : FormValidatorSummaryErrors[] {
    const formComponent = this._injector.get(FormComponent);
    formComponent.formDefMap?.formConfig.
    return this.formService.getFormValidatorSummaryErrors(null, formComponent?.form);
  }
}
