import { FormFieldComponent, FormFieldCompMapEntry } from './base.component';
import { FormComponentLayoutConfig } from './config.model';
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
  <ng-container *ngIf="model && config"> 
    <ng-container *ngIf="config?.label">
    <label>
      <span [innerHtml]="config?.label"></span>
      <span class="form-field-required-indicator" [innerHTML]="config?.labelRequiredStr"></span>
      <button type="button" class="btn btn-default" *ngIf="config?.helpText" (click)="toggleHelpTextVisibility()" [attr.aria-label]="'help' | i18next ">
      <span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span>
      </button>
    </label>
    <span class="help-block" *ngIf="helpTextVisible" [innerHtml]="config?.helpText"></span>
    </ng-container>
    <redbox-form-base-wrapper *ngIf="componentClass" [model]="model" [componentClass]="componentClass" [formFieldCompMapEntry]="formFieldCompMapEntry" ></redbox-form-base-wrapper>
  </ng-container>
  `,
  standalone: false,
  // Note: No need for host property here if using @HostBinding
})
export class DefaultLayoutComponent<ValueType> extends FormFieldComponent<ValueType> {
  helpTextVisible: boolean = false;
  componentClass?: typeof FormFieldComponent | null;
  public override config?: FormComponentLayoutConfig;

  override async initComponent(formFieldCompMapEntry: FormFieldCompMapEntry | null) {
    await super.initComponent(formFieldCompMapEntry);
    this.componentClass = formFieldCompMapEntry?.componentClass;
    this.config = formFieldCompMapEntry?.compConfigJson?.layout as FormComponentLayoutConfig;
    
  }

  toggleHelpTextVisibility() {
   this.helpTextVisible = !this.helpTextVisible;
  }
}