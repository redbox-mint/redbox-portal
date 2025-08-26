import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import { TextFormFieldComponentConfig } from '@researchdatabox/sails-ng-common';
import { get as _get, isUndefined as _isUndefined, isEmpty as _isEmpty } from 'lodash-es';

export class SimpleInputModel extends FormFieldModel<string> {
}

@Component({
    selector: 'redbox-textfield',
    template: `
    @if (getBooleanProperty('visible')) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <input [type]="inputType" [formControl]="formControl"
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
export class SimpleInputComponent extends FormFieldBaseComponent<string> {
  protected override logName: string = "SimpleInputComponent";
  public tooltip:string = '';
  public tooltipPlaceholder:string = 'placeholder';
  //get default value from TextFormFieldComponentConfig model class
  private defaultInputType:string = new TextFormFieldComponentConfig().type ?? 'text';
  public inputType:string = this.defaultInputType;

  /**
   * Override to set additional properties required by the wrapper component.
   *
   * @param formFieldCompMapEntry
   */
  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.tooltip = this.getTooltip();
    this.tooltipPlaceholder = '';

    if(!_isUndefined(this.componentDefinition?.config?.type) && !_isEmpty(this.componentDefinition?.config?.type)) {
      let simpleInputConfig:TextFormFieldComponentConfig = this.componentDefinition.config as TextFormFieldComponentConfig;
      this.inputType = _get(simpleInputConfig,'type',this.defaultInputType);
    }
  }

  /**
   * The model associated with this component.
   */
  @Input() public override model?: SimpleInputModel;


}
