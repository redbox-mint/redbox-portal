import {Component, Inject, Injector, Input} from '@angular/core';
import {
  FormFieldBaseComponent,
  FormFieldModel,
} from "@researchdatabox/portal-ng-common";
import {FormService} from "../form.service";
import {FormComponent} from "../form.component";
import { FormValidatorSummaryErrors } from "@researchdatabox/sails-ng-common";

export class ValidationSummaryFieldModel extends FormFieldModel<string> {
}

@Component({
  selector: 'redbox-validation-summary-field',
  template: `
    @let validationList = allValidationErrorsDisplay;
    <div class="alert alert-danger mt-3" role="alert" *ngIf="validationList.length > 0">
      <ul>
        @for (item of validationList; track item.id) {
          @if (item.errors.length > 0) {
            <li>
              @if (item.id) {
                <a href="#{{ item.id }}">{{ item.message ?? "(no label)" | i18next }}</a>
              } @else {
                {{ item.message ?? "(no label)" | i18next }}
              }
              <ul>
                @for (error of item.errors; track error.name) {
                  <li>{{ error.message ?? "(no message)" | i18next: error.params }}
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
    <ng-container *ngIf="isDebug">
      <h3>Live Validation Value</h3>
      <pre [innerHtml]="validationList | json"></pre>
    </ng-container>
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

  override get isDebug(): boolean {
    const formComponent = this.getFormComponent;
    return formComponent?.formDefMap?.formConfig?.debugValue ?? false;
  }

  get allValidationErrorsDisplay(): FormValidatorSummaryErrors[] {
    const formComponent = this.getFormComponent;
    const componentDefs = formComponent?.formDefMap?.formConfig.componentDefinitions;
    return this.formService.getFormValidatorSummaryErrors(componentDefs, null, formComponent?.form);
  }

  private get getFormComponent(): FormComponent {
    return this._injector.get(FormComponent);
  }

  public override initChildConfig(): void {
  }
}
