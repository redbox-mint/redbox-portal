import { Component, Input } from '@angular/core';
import { FormControl } from '@angular/forms';
import { FormFieldComponent, FormFieldModel, FormFieldComponentConfig } from "@researchdatabox/portal-ng-common";

export class TextFieldModel extends FormFieldModel<string> {  
 public override formModel: FormControl<string | null> = new FormControl<string | null>(''); 
 
}

@Component({
    selector: 'textfield',
    template: `
      <span>Texfield 1</span>
      <input type='text' [formControl]="formControl" />
  `,
    standalone: false
})
export class TextFieldComponent extends FormFieldComponent<string> {
  /**
     * The field model associated with this component.
     * 
     * @type {FieldModel<any>}
     * @memberof FieldComponent
     */
  @Input() public override field?: TextFieldModel;
  public override config?: FormFieldComponentConfig<string>;
  
}