import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldModel } from "@researchdatabox/portal-ng-common";

export class TextFieldModel extends FormFieldModel<string> {
}

@Component({
    selector: 'redbox-textfield',
    template: `
    <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
    <input type='text' [formControl]="formControl"
           class="form-control"
           [class.is-valid]="isValid"
           [class.is-invalid]="!isValid"
           [attr.required]="isRequired === true ? true : null"
           [hidden]="!isVisible"
           [attr.disabled]="isDisabled ? 'true' : null"
           [attr.readonly]="isReadonly ? 'true' : null"
           [attr.title]="tooltips ? tooltips['fieldTT'] : ''" />

    <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
  `,
    standalone: false
})
export class TextFieldComponent extends FormFieldBaseComponent<string> {
  protected override logName: string = "TextFieldComponent";
  /**
   * The model associated with this component.
   */
  @Input() public override model?: TextFieldModel;

  public override initChildConfig(): void {
    this.initConfig();
    this.loggerService.info('TextFieldComponent isVisible '+this.isVisible);
    this.expressionStateChanged = false;
  }

}
