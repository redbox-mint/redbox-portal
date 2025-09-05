import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import { SimpleInputComponentConfig } from '@researchdatabox/sails-ng-common';
import { get as _get, isUndefined as _isUndefined, isEmpty as _isEmpty } from 'lodash-es';

export class SimpleInputModel extends FormFieldModel<string> {
}

@Component({
    selector: 'redbox-simpleinput',
    template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <input [type]="inputType" [formControl]="formControl"
            class="form-control"
            [class.is-valid]="isValid"
            [class.is-invalid]="!isValid"
            [attr.required]="isRequired === true ? true : null"
            [attr.disabled]="isDisabled ? 'true' : null"
            [attr.readonly]="isReadonly ? 'true' : null"
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
  private defaultConfig = new SimpleInputComponentConfig();
  public inputType:string = 'text';

  /**
   * Override to set additional properties required by the wrapper component.
   *
   * @param formFieldCompMapEntry
   */
  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.tooltip = this.getTooltip();
    this.tooltipPlaceholder = '';
    let simpleInputConfig = this.componentDefinition?.config as SimpleInputComponentConfig;
    if(!_isUndefined(simpleInputConfig) && !_isEmpty(simpleInputConfig)) {
      this.inputType = simpleInputConfig.type ?? this.defaultConfig.type;
    }
  }

  /**
   * The model associated with this component.
   */
  @Input() public override model?: SimpleInputModel;


}
