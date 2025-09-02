import { Component, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldModel } from "@researchdatabox/portal-ng-common";
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
        id="message" 
        name="message" 
        rows="4" 
        cols="50" 
        placeholder="Type your message here..."></textarea>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }
  `,
  standalone: false
})
export class TextareaComponent extends FormFieldBaseComponent<string> {
  protected override logName: string = "TextareaComponent";
  public tooltip:string = '';
  public tooltipPlaceholder:string = 'placeholder';

  
  /**
   * The model associated with this component.
   */
  @Input() public override model?: TextareaModel;
}
