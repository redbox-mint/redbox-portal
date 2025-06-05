import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldModel, FormComponentDefinition } from "@researchdatabox/portal-ng-common";
import { get as _get } from 'lodash-es';

export class TextFieldModel extends FormFieldModel<string> {  
}

@Component({
    selector: 'redbox-textfield',
    template: `
    <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
    <input type='text' [formControl]="formControl" />
    <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    <ng-container>
      <pre>Text Status: {{ status() }}</pre>
    </ng-container>
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