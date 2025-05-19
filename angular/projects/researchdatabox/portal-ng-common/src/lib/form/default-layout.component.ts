import { FormFieldBaseComponent, FormFieldCompMapEntry } from './form-field-base.component';
import {FormComponentLayoutDefinition, FormValidatorComponentErrors } from './config.model';
import { isEmpty as _isEmpty } from 'lodash-es';
import { Component, ViewChild, ViewContainerRef, TemplateRef, ComponentRef } from '@angular/core';
import { FormBaseWrapperComponent } from './base-wrapper.component';
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
  @if (model && componentDefinition) {
    @if (componentDefinition.config?.label) {
      <label class="form-label">
        <span [innerHtml]="componentDefinition?.config?.label"></span>
        <span
          *ngIf="isRequired"
          class="form-field-required-indicator"
          [innerHTML]="componentDefinition?.config?.labelRequiredStr"></span>
        @if (componentDefinition.config?.helpText) {
          <button type="button" class="btn btn-default" (click)="toggleHelpTextVisibility()" [attr.aria-label]="'help' | i18next ">
          <span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span>
          </button>
        }
      </label>
      @if (helpTextVisible) {
        <span class="help-block" [innerHtml]="componentDefinition?.config?.helpText"></span>
      }
    }
    <ng-container #componentContainer></ng-container>
    <!-- instead of rendering the 'before' and 'after' templates around the componentContainer,
    we supply named templates so the component can render these as it sees fit -->
    <ng-template #beforeComponentTemplate></ng-template>
    <ng-template #afterComponentTemplate>
      @let componentValidationList = getFormValidatorComponentErrors;
      @if (componentValidationList.length > 0) {
        <div class="invalid-feedback">
          Field validation errors:
          <ul>
            @for (error of componentValidationList; track error.name) {
              <li>{{ error.message ?? "(no message)" | i18next: error.params }}</li>
            }
          </ul>
        </div>
      }
      <div class="valid-feedback">The field is valid.</div>
    </ng-template>
  }
  `,
  standalone: false,
  // Note: No need for host property here if using @HostBinding
})
export class DefaultLayoutComponent<ValueType> extends FormFieldBaseComponent<ValueType> {
  helpTextVisible: boolean = false;
  componentClass?: typeof FormFieldBaseComponent | null;
  public override componentDefinition?: FormComponentLayoutDefinition;

  @ViewChild('componentContainer', { read: ViewContainerRef, static: false })
  componentContainer!: ViewContainerRef;

  @ViewChild('beforeComponentTemplate', { read: TemplateRef, static: false })
  beforeComponentTemplate!: TemplateRef<any>;
  @ViewChild('afterComponentTemplate', { read: TemplateRef, static: false })
  afterComponentTemplate!: TemplateRef<any>;

  wrapperComponentRef!: ComponentRef<FormBaseWrapperComponent<unknown>>;

  /**
   * Override to set additional properties required by the wrapper component.
   *
   * @param formFieldCompMapEntry
   */
  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.componentClass = formFieldCompMapEntry?.componentClass;
    this.componentDefinition = formFieldCompMapEntry?.compConfigJson?.layout as FormComponentLayoutDefinition;
}
  /**
   * Override what it takes to get the component to be 'ready'
   */
  protected override async setComponentReady(): Promise<void> {
    // Set all the bound properties to the component
    this.wrapperComponentRef = this.componentContainer.createComponent(FormBaseWrapperComponent);
    this.wrapperComponentRef.instance.componentClass = this.componentClass;
    this.wrapperComponentRef.instance.model = this.model;
    this.wrapperComponentRef.instance.formFieldCompMapEntry = this.formFieldCompMapEntry;
    if (this.formFieldCompMapEntry && this.beforeComponentTemplate && this.afterComponentTemplate) {
      this.formFieldCompMapEntry.componentTemplateRefMap = {
        before: this.beforeComponentTemplate,
        after: this.afterComponentTemplate
      };
    }
    this.wrapperComponentRef.changeDetectorRef.detectChanges();
    // finally set the status to 'READY'
    await super.setComponentReady();
  }

  toggleHelpTextVisibility() {
   this.helpTextVisible = !this.helpTextVisible;
  }

  protected get getFormValidatorComponentErrors(): FormValidatorComponentErrors[]{
    return Object.entries(this.model?.formControl?.errors ?? {}).map(([key, item]) => {
      return {
        name: key,
        message: item.message ?? null,
        params: {validatorName: key, ...item.params},
      };
    })
  }
}
