import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";

export class TextFieldModel extends FormFieldModel<string> {
}

@Component({
    selector: 'redbox-textfield',
    template: `
    @if (getBooleanProperty('visible')) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <input type='text' [formControl]="formControl"
            class="form-control"
            [class.is-valid]="isValid"
            [class.is-invalid]="!isValid"
            [attr.required]="isRequired === true ? true : null"
            [attr.disabled]="getBooleanProperty('disabled') ? 'true' : null"
            [attr.readonly]="getBooleanProperty('readonly') ? 'true' : null"
            [attr.title]="tooltip ? tooltip : tooltipPlaceholder" />
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
    standalone: false
})
export class TextFieldComponent extends FormFieldBaseComponent<string> {
  protected override logName: string = "TextFieldComponent";
  public tooltip = '';
  public tooltipPlaceholder = 'placeholder';

  /**
     * Override to set additional properties required by the wrapper component.
     *
     * @param formFieldCompMapEntry
     */
    protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
      super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
      this.tooltip = this.getTooltip();
      this.tooltipPlaceholder = '';
    }

  /**
   * The model associated with this component.
   */
  @Input() public override model?: TextFieldModel;


}
