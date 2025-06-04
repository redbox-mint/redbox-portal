import { FormFieldBaseComponent, FormFieldCompMapEntry } from './form-field-base.component';
import { FormComponentLayoutDefinition } from './config.model';
import { isEmpty as _isEmpty, set as _set, get as _get, keys as _keys } from 'lodash-es';
import { Component, ViewChild, ViewContainerRef, TemplateRef, ComponentRef, AfterViewInit } from '@angular/core';
import { FormBaseWrapperComponent } from './base-wrapper.component';
import { FormValidatorComponentErrors } from "@researchdatabox/sails-ng-common";

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
  @if (isVisible && model && componentDefinition) {
    @if (componentDefinition.config?.label) {
      <label class="form-label" [attr.title]="tooltips ? tooltips['labelTT'] : ''">
        <span [innerHtml]="componentDefinition?.config?.label"></span>
        <span
          *ngIf="isRequired"
          class="form-field-required-indicator"
          [innerHTML]="componentDefinition?.config?.labelRequiredStr"></span>
        @if (componentDefinition.config?.helpText) {
          <button type="button" class="btn btn-default" (click)="toggleHelpTextVisibility(name)" [attr.aria-label]="'help' | i18next ">
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
    <ng-template #beforeComponentTemplate>
      Before {{ componentName }}
    </ng-template>
    <ng-template #afterComponentTemplate>
      After {{ componentName }}
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
export class DefaultLayoutComponent<ValueType> extends FormFieldBaseComponent<ValueType> implements AfterViewInit {
  protected override logName = "DefaultLayoutComponent";
  helpTextVisible: boolean = false;  
  labelRequiredStr: string = '';
  helpTextVisibleOnInit: boolean = false;
  public clickedBy: string = '';
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
    if(this.formFieldCompMapEntry != null && this.formFieldCompMapEntry != undefined) {
      this.formFieldCompMapEntry.layout = this as FormFieldBaseComponent;
    }
  }
  /**
   * Override what it takes to get the component to be 'ready'
   */
  protected override async setComponentReady(): Promise<void> {
    // Set all the bound properties to the component
    this.wrapperComponentRef = this.componentContainer.createComponent(FormBaseWrapperComponent);
    this.wrapperComponentRef.instance.model = this.model;
    this.wrapperComponentRef.instance.componentClass = this.componentClass;
    this.wrapperComponentRef.instance.formFieldCompMapEntry = this.formFieldCompMapEntry;
    this.wrapperComponentRef.instance.defaultComponentConfig = {
      defaultComponentCssClasses: this.formFieldCompMapEntry?.compConfigJson?.component?.config?.defaultComponentCssClasses
    }
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
  
  override ngAfterViewInit() {
    
    //Layout component overrides Component componentDefinition and hence it's needed to normalise componentDefinition that 
    //is used to track property changes given these may not be present in the Layout componentDefinition
    _set(this.componentDefinition as object,'config.visible',this.componentDefinition?.config?.visible ?? true);
    _set(this.componentDefinition as object,'config.disabled',this.componentDefinition?.config?.disabled ?? false);
    _set(this.componentDefinition as object,'config.readonly',this.componentDefinition?.config?.readonly ?? false);
    _set(this.componentDefinition as object,'config.autofocus',this.componentDefinition?.config?.autofocus ?? false);
    _set(this.componentDefinition as object,'config.helpTextVisible',this.componentDefinition?.config?.helpTextVisible ?? false);

    this.initChildConfig();
  }

  public toggleHelpTextVisibility(clickedBy:string = '') {
    this.helpTextVisible = !this.helpTextVisible;
    this.clickedBy = clickedBy;
  }

  private setHelpTextVisibleOnInit() {
    this.helpTextVisible = true;
  }

  //Layout specific config values that need to be applied after generic/base component config has been applied 
  public override initChildConfig(): void {

    this.isVisible = this.componentDefinition?.config?.visible ?? true;
    this.isDisabled = this.componentDefinition?.config?.disabled ?? false;
    this.isReadonly = this.componentDefinition?.config?.readonly ?? false;
    this.needsAutofocus = this.componentDefinition?.config?.autofocus ?? false;
    this.label = this.componentDefinition?.config?.label ?? '';
    this.labelRequiredStr = this.componentDefinition?.config?.labelRequiredStr ?? '';
    this.tooltips = this.componentDefinition?.config?.tooltips ?? null;
    this.helpTextVisible = this.componentDefinition?.config?.helpTextVisible ?? false;
    
    //Add required layout specific variables to the local state cache
    this.componentDefinitionCache = {
      visible: this.componentDefinition?.config?.visible,
      disabled: this.componentDefinition?.config?.disabled,
      readonly: this.componentDefinition?.config?.readonly,
      autofocus: this.componentDefinition?.config?.autofocus,
      label: this.componentDefinition?.config?.label,
      tooltips: this.componentDefinition?.config?.tooltips,
      labelRequiredStr: this.componentDefinition?.config?.labelRequiredStr,
      helpTextVisible: this.componentDefinition?.config?.helpTextVisible
    }

    if(this.helpTextVisibleOnInit) {
      this.setHelpTextVisibleOnInit();
    }
    
    this.expressionStateChanged = false;
    this.clickedBy = '';
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

  protected get componentName(){
    return this.utilityService.getNameClass(this.formFieldCompMapEntry);
  }
}
