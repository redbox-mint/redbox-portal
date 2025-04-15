import { Component, Input } from '@angular/core';
import { FormControl } from '@angular/forms';
import { FieldComponent, FieldModel, FieldComponentConfig } from "@researchdatabox/portal-ng-common";

export class TextFieldModel extends FieldModel<string> {  
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
export class TextFieldComponent extends FieldComponent<string> {
  /**
     * The field model associated with this component.
     * 
     * @type {FieldModel<any>}
     * @memberof FieldComponent
     */
  @Input() public override field?: TextFieldModel;
  public override config?: FieldComponentConfig<string>;
  
}