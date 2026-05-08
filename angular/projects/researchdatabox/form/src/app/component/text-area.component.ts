import { Component, Input } from '@angular/core';
import {
  FormFieldBaseComponent,
  FormFieldCompMapEntry,
  FormFieldModel,
  ModifyOptions
} from "@researchdatabox/portal-ng-common";
import {TextAreaComponentName, TextAreaFieldComponentConfig, TextAreaModelName} from '@researchdatabox/sails-ng-common';
import { isUndefined as _isUndefined, isEmpty as _isEmpty } from 'lodash-es';

export class TextAreaModel extends FormFieldModel<string> {
  protected override logName = TextAreaModelName;

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

@Component({
  selector: 'redbox-textarea',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <textarea [formControl]="formControl"
        class="form-control"
        [class.is-valid]="showValidState"
        [class.is-invalid]="!isValid"
        [readonly]="isReadonly"
        [title]="tooltip | i18next"
        [rows]="rows"
        [cols]="cols"
        [placeholder]="placeholder | i18next"></textarea>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  standalone: false
})
export class TextAreaComponent extends FormFieldBaseComponent<string> {
  protected override logName = TextAreaComponentName;
  public tooltip:string = '';
  public rows: number | undefined = undefined;
  public cols: number | undefined = undefined;
  public placeholder: string | undefined = '';

  /**
   * The model associated with this component.
   */
  @Input() public override model?: TextAreaModel;

  /**
   * Override to set additional properties required by the wrapper component.
   *
   * @param formFieldCompMapEntry
   */
  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.tooltip = this.getStringProperty('tooltip');
    let textareaConfig = this.componentDefinition?.config as TextAreaFieldComponentConfig;
    let defaultConfig = new TextAreaFieldComponentConfig();
    const cfg = (_isUndefined(textareaConfig) || _isEmpty(textareaConfig)) ? defaultConfig : textareaConfig;
    this.rows = cfg.rows || defaultConfig.rows;
    this.cols = cfg.cols || defaultConfig.cols;
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
