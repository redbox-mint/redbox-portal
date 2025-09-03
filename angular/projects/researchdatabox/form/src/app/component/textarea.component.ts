import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import { TextareaComponentConfig } from '@researchdatabox/sails-ng-common/dist/src/config/component/textarea.model';
import { get as _get, isUndefined as _isUndefined, isEmpty as _isEmpty } from 'lodash-es';

export class TextareaModel extends FormFieldModel<string> {
}

@Component({
  selector: 'redbox-textarea',
  template: `
    @if (getBooleanProperty('visible')) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <textarea [formControl]="formControl"
        class="form-control"
        [class.is-valid]="isValid"
        [class.is-invalid]="!isValid"
        [attr.required]="isRequired === true ? true : null"
        [attr.disabled]="getBooleanProperty('disabled') ? 'true' : null"
        [attr.readonly]="getBooleanProperty('readonly') ? 'true' : null"
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
  private defaultRows:number = new TextareaComponentConfig().rows;
  private defaultCols:number = new TextareaComponentConfig().cols;
  private defaultPlaceholder:string = new TextareaComponentConfig().placeholder;
  public rows:number = this.defaultRows;
  public cols:number = this.defaultCols;
  public placeholder:string = this.defaultPlaceholder;

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
      let textareaConfig:TextareaComponentConfig = this.componentDefinition.config as TextareaComponentConfig;
      this.rows = _get(textareaConfig,'rows',this.defaultRows);
      this.cols = _get(textareaConfig,'cols',this.defaultCols);
      this.placeholder = _get(textareaConfig,'placeholder',this.defaultPlaceholder);
    }
  }
  
  /**
   * The model associated with this component.
   */
  @Input() public override model?: TextareaModel;
}
