import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldModel } from "@researchdatabox/portal-ng-common";

export class TextFieldModel extends FormFieldModel<string> {  
}

@Component({
    selector: 'redbox-textfield',
    template: `
    <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
    <input type='text' [formControl]="formControl" />
    <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
  `,
    standalone: false
})
export class TextFieldComponent extends FormFieldBaseComponent<string> {
  protected override logName: string = "TextFieldComponent";
  /**
     * The model associated with this component.
     * 
     * @type {FieldModel<any>}
     * @memberof FieldComponent
     */
  @Input() public override model?: TextFieldModel;
  
}