import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import { TextAreaFormFieldComponentConfig } from '@researchdatabox/sails-ng-common';
import { isUndefined as _isUndefined, isEmpty as _isEmpty } from 'lodash-es';

export class TextAreaModel extends FormFieldModel<string> {
}

@Component({
  selector: 'redbox-textarea',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <textarea [formControl]="formControl"
        class="form-control"
        [class.is-valid]="isValid"
        [class.is-invalid]="!isValid"
        [required]="isRequired"
        [disabled]="isDisabled"
        [readonly]="isReadonly"
        [title]="tooltip"
        [rows]="rows"
        [cols]="cols"
        [placeholder]="placeholder"></textarea>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  standalone: false
})
export class TextAreaComponent extends FormFieldBaseComponent<string> {
  protected override logName: string = "TextAreaComponent";
  public tooltip:string = '';
  public rows: number | undefined = undefined;
  public cols: number | undefined = undefined;
  public placeholder: string | undefined = '';

  /**
   * Override to set additional properties required by the wrapper component.
   *
   * @param formFieldCompMapEntry
   */
  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.tooltip = this.getStringProperty('tooltip');
    let textareaConfig = this.componentDefinition?.config as TextAreaFormFieldComponentConfig;
    let defaultConfig = new TextAreaFormFieldComponentConfig();
    const cfg = (_isUndefined(textareaConfig) || _isEmpty(textareaConfig)) ? defaultConfig : textareaConfig;
    this.rows = cfg.rows || defaultConfig.rows;
    this.cols = cfg.cols || defaultConfig.cols;
    this.placeholder = cfg.placeholder || defaultConfig.placeholder;
  }

  /**
   * The model associated with this component.
   */
  @Input() public override model?: TextAreaModel;
}
