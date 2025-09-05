import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import { TextareaComponentConfig } from '@researchdatabox/sails-ng-common/dist/src/config/component/textarea.model';
import { get as _get, isUndefined as _isUndefined, isEmpty as _isEmpty } from 'lodash-es';

export class TextareaModel extends FormFieldModel<string> {
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
        [attr.required]="isRequired === true ? true : null"
        [attr.disabled]="isDisabled ? 'true' : null"
        [attr.readonly]="isReadonly ? 'true' : null"
        [attr.title]="tooltip ? tooltip : tooltipPlaceholder"
        [attr.rows]="rows"
        [attr.cols]="cols"
        [attr.placeholder]="placeholder"></textarea>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  standalone: false
})
export class TextareaComponent extends FormFieldBaseComponent<string> {
  protected override logName: string = "TextareaComponent";
  public tooltip:string = '';
  public tooltipPlaceholder:string = 'placeholder';
  private defaultConfig = new TextareaComponentConfig();
  public rows:number = this.defaultConfig.rows;
  public cols:number = this.defaultConfig.cols;
  public placeholder: string | undefined = this.defaultConfig.placeholder;

  /**
   * Override to set additional properties required by the wrapper component.
   *
   * @param formFieldCompMapEntry
   */
  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.tooltip = this.getTooltip();
    this.tooltipPlaceholder = '';
    let textareaConfig = this.componentDefinition?.config as TextareaComponentConfig;
    if(!_isUndefined(textareaConfig) && _isEmpty(textareaConfig)) {
      this.rows = textareaConfig.rows;
      this.cols = textareaConfig.cols;
      this.placeholder = textareaConfig.placeholder;
    }
  }
  
  /**
   * The model associated with this component.
   */
  @Input() public override model?: TextareaModel;
}
