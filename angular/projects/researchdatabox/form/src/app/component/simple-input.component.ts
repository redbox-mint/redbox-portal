import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import {
  SimpleInputComponentName,
  SimpleInputFieldComponentConfig,
  SimpleInputModelName
} from '@researchdatabox/sails-ng-common';
import { isUndefined as _isUndefined, isEmpty as _isEmpty } from 'lodash-es';

export class SimpleInputModel extends FormFieldModel<string> {
  protected override logName = SimpleInputModelName;
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
            [required]="isRequired"
            [disabled]="isDisabled"
            [readonly]="isReadonly"
            [title]="tooltip" />
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
    `,
    standalone: false
})
export class SimpleInputComponent extends FormFieldBaseComponent<string> {
  protected override logName = SimpleInputComponentName;
  public tooltip:string = '';
  public inputType:string = 'text';

  /**
   * Override to set additional properties required by the wrapper component.
   *
   * @param formFieldCompMapEntry
   */
  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.tooltip = this.getStringProperty('tooltip');
    let simpleInputConfig = this.componentDefinition?.config as SimpleInputFieldComponentConfig;
    let defaultConfig = new SimpleInputFieldComponentConfig();
    const cfg = (_isUndefined(simpleInputConfig) || _isEmpty(simpleInputConfig)) ? defaultConfig : simpleInputConfig;
    this.inputType = cfg.type || defaultConfig.type;
  }

  /**
   * The model associated with this component.
   */
  @Input() public override model?: SimpleInputModel;


}
