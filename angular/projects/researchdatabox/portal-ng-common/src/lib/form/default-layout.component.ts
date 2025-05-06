import { FormFieldBaseComponent, FormFieldCompMapEntry } from './form-field-base.component';
import { FormComponentLayoutDefinition } from './config.model';
import { isEmpty as _isEmpty } from 'lodash-es';
import { Component } from '@angular/core';
/**
 * Default Form Component Layout
 * 
 * This component provides additional layout-specific functionality for form components. 
 * 
 * The default layout is the following, which based by the legacy form field layout:
 * 
 * <div>
 *   <label>
 *    Label
 *    <span>Required indicator</span>
 *    <button>Help Button</button>
 *  </label>
 *  <span>Help Text</span> 
 *  <ng-container>The component</ng-container>
 * </div>
 *
 * Other layouts can be defined, 
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Component({
  selector: 'redbox-form-default-component-layout',
  template: `
  <ng-container *ngIf="model && componentDefinition"> 
    <ng-container *ngIf="componentDefinition?.config?.label">
    <label>
      <span [innerHtml]="componentDefinition?.config?.label"></span>
      <span class="form-field-required-indicator" [innerHTML]="componentDefinition?.config?.labelRequiredStr"></span>
      <button type="button" class="btn btn-default" *ngIf="componentDefinition?.config?.helpText" (click)="toggleHelpTextVisibility()" [attr.aria-label]="'help' | i18next ">
      <span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span>
      </button>
    </label>
    <span class="help-block" *ngIf="helpTextVisible" [innerHtml]="componentDefinition?.config?.helpText"></span>
    </ng-container>
    <redbox-form-base-wrapper *ngIf="componentClass" [model]="model" [componentClass]="componentClass" [formFieldCompMapEntry]="formFieldCompMapEntry" ></redbox-form-base-wrapper>
  </ng-container>
  `,
  standalone: false,
  // Note: No need for host property here if using @HostBinding
})
export class DefaultLayoutComponent<ValueType> extends FormFieldBaseComponent<ValueType> {
  helpTextVisible: boolean = false;
  componentClass?: typeof FormFieldBaseComponent | null;
  public override componentDefinition?: FormComponentLayoutDefinition;

  override async initComponent(formFieldCompMapEntry: FormFieldCompMapEntry | null) {
    await super.initComponent(formFieldCompMapEntry);
    this.componentClass = formFieldCompMapEntry?.componentClass;
    this.componentDefinition = formFieldCompMapEntry?.compConfigJson?.layout as FormComponentLayoutDefinition;
    
  }

  toggleHelpTextVisibility() {
   this.helpTextVisible = !this.helpTextVisible;
  }
}