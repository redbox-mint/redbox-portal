import { Component } from '@angular/core';
import { FormBaseComponent, ModelBase } from "@researchdatabox/portal-ng-common";

export class TextField extends ModelBase<string> {
  type: string = 'text'
  constructor(initJson: any) {
    super(initJson);
    
  }
}

@Component({
    selector: 'textfield',
    template: `
  <span>Text Label</span>
  <input type='text' value='hello!' />
  `,
    standalone: false
})
export class TextFieldComponent extends FormBaseComponent {

}