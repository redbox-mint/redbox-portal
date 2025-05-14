import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldModel } from "@researchdatabox/portal-ng-common";

export class TextFieldModel extends FormFieldModel<string> {
}

@Component({
    selector: 'redbox-textfield',
    template: `
      <ng-content ></ng-content>
      <input type='text' [formControl]="formControl" class="form-control"
             [class.is-valid]="isValid" [class.is-invalid]="!isValid"  [attr.required]="isRequired === true ? true : null" />
      <ng-content></ng-content>
  `,
    standalone: false
})
export class TextFieldComponent extends FormFieldBaseComponent<string> {
  /**
     * The model associated with this component.
     *
     * @memberof FormFieldBaseComponent
     */
  @Input() public override model?: TextFieldModel;
}
