import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldModel } from "@researchdatabox/portal-ng-common";
import { get as _get, set as _set, isUndefined as _isUndefined, cloneDeep as _cloneDeep} from 'lodash-es';

export class TextFieldModel extends FormFieldModel<string> {  
}

@Component({
    selector: 'redbox-textfield',
    template: `
      @if (isVisible) {
        <input type='text' [formControl]="formControl" [attr.disabled]="isDisabled ? 'true' : null" [attr.readonly]="isReadonly ? 'true' : null" />
      }
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
  
  protected override initChildConfig(): void {
    this.initConfig();
    this.loggerService.info('TextFieldComponent isVisible '+this.isVisible);
  }

}
