import { Component, Input } from '@angular/core';
import { FieldComponent, FieldModel, ComponentConfig } from "@researchdatabox/portal-ng-common";

export class TextFieldModel extends FieldModel<string> {  
  
}

@Component({
    selector: 'textfield',
    template: `
  <span>{{ field.config.label }}</span>
  <input type='text' [formControl]="field.formModel" />
  `,
    standalone: false
})
export class TextFieldComponent extends FieldComponent {
  /**
     * The field model associated with this component.
     * 
     * @type {FieldModel<any>}
     * @memberof FieldComponent
     */
  @Input() public field?: TextFieldModel;

  public override config?: ComponentConfig<string>;
  
}