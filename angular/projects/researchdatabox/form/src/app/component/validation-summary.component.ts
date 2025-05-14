import {Component, Inject, Injector, Input, ViewContainerRef} from '@angular/core';
import {FormFieldBaseComponent, FormFieldModel} from "@researchdatabox/portal-ng-common";
import {FormService} from "../form.service";
import {FormComponent} from "../form.component";

export class ValidationSummaryFieldModel extends FormFieldModel<string> {
}

// <ul class="nav nav-underline">
//   @for (validationItem of allValidationErrorsDisplay; track validationItem.name) {
//   <li class="nav-item">
//   <a class="nav-link" href="#{{ validationItem.name }}">{{ validationItem.name }}</a>
//   </li>
// }
// </ul>

@Component({
  selector: 'redbox-validation-summary-field',
  template: `
    <div class="alert alert-danger" role="alert" *ngIf="allValidationErrorsDisplay.length > 0">
      {{ allValidationErrorsDisplay | json }}
    </div>
    <div class="alert alert-info" role="alert" *ngIf="allValidationErrorsDisplay.length === 0">
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
    private _injector: Injector
  ) {
    super();
  }

  get allValidationErrorsDisplay() {
    const formComponent = this._injector.get(FormComponent);
    const componentErrors = formComponent.components
      .map(c => {return {name:c.layoutClass?., errors: c.component?.formControl?.errors}});

    // const control = this.formService.getTopAncestorControl(this.formControl);
    // const errors = this.formService.getFormValidatorControlErrors(null, control);
    // const results = [];
    // for (const error of errors) {
    //   if (Object.keys(error.errors ?? {}).length > 0) {
    //     results.push({name: error.name, errors: error.errors});
    //   }
    // }
    // return results;
    return componentErrors;
  }
}
