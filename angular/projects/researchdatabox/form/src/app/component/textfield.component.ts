import { Component, Input } from '@angular/core';
import { FormControl } from '@angular/forms';
import { FormFieldBaseComponent, FormFieldModel, FormComponentDefinition } from "@researchdatabox/portal-ng-common";
import { get as _get } from 'lodash-es';

export class TextFieldModel extends FormFieldModel<string> {  
}

@Component({
    selector: 'redbox-textfield',
    template: `
      <input type='text' [formControl]="formControl" />
  `,
    standalone: false
})
export class TextFieldComponent extends FormFieldBaseComponent<string> {
  /**
     * The model associated with this component.
     * 
     * @type {FieldModel<any>}
     * @memberof FieldComponent
     */
  @Input() public override model?: TextFieldModel;
  
}