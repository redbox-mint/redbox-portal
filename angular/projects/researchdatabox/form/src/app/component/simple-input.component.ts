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

/**
 * The Simple Input Component.
 * 
 * Notes:
 * - The disabled property binding in the template has been removed to allow form control state management (still unimplemented). This also applies to other components recently edited.
 * 
 * TODO: Implement and/or integrate form control state management for the disabled state and review the removal of the `[disabled]` binding (and related changes in similar components).
 */
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
    this.inputType = cfg.type || defaultConfig.type || 'text';
  }

  /**
   * The model associated with this component.
   */
  @Input() public override model?: SimpleInputModel;


}
