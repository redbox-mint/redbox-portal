import { Component, Input } from '@angular/core';
import {
  FormFieldBaseComponent,
  FormFieldCompMapEntry,
  FormFieldModel,
  ModifyOptions
} from "@researchdatabox/portal-ng-common";
import {
  SimpleInputComponentName,
  SimpleInputFieldComponentConfig,
  SimpleInputModelName
} from '@researchdatabox/sails-ng-common';
import { isUndefined as _isUndefined, isEmpty as _isEmpty } from 'lodash-es';

export class SimpleInputModel extends FormFieldModel<string> {
  protected override logName = SimpleInputModelName;

  /**
   * Set this model to be disabled or enabled.
   *
   * Component 'disabled' must be set as well,
   * because the Angular formControl manages the HTML element disabled property.
   *
   * Use component.setDisabled instead of this method.
   *
   * @param disabled Set the disabled status.
   * @param opts The modify options.
   */
  public override setDisabled(disabled: boolean, opts?: ModifyOptions): void {
    super.setDisabled(disabled, opts)
  }
}

/**
 * The Simple Input Component.
 * Used for inputs of type text, email, hidden, number, password, search, tel, url.
 * Other input types have dedicated components.
 */
@Component({
    selector: 'redbox-simpleinput',
    template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <input [type]="inputType" [formControl]="formControl"
            class="form-control"
            [class.is-valid]="showValidState"
            [class.is-invalid]="!isValid"
            [readonly]="isReadonly"
            [title]="tooltip | i18next"
            [placeholder]="placeholder | i18next" />
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
    `,
    standalone: false
})
export class SimpleInputComponent extends FormFieldBaseComponent<string> {
  protected override logName = SimpleInputComponentName;
  public tooltip:string = '';
  public inputType:string = 'text';
  public placeholder: string | undefined = '';

  /**
   * The model associated with this component.
   */
  @Input() public override model?: SimpleInputModel;

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
    this.placeholder = cfg.placeholder || defaultConfig.placeholder;
  }

  override get isDisabled(): boolean {
    return super.isDisabled || this.model?.isDisabled || false;
  }

  override setDisabled(disabled: boolean, opts?: ModifyOptions) {
    super.setDisabled(disabled);
    this.model?.setDisabled(disabled, {emitEvent: false, onlySelf: true});
  }
}
