import { isEmpty as _isEmpty, isUndefined as _isUndefined, isNull as _isNull, set as _set, get as _get, cloneDeep as _cloneDeep} from 'lodash-es';
import { Component, ViewContainerRef, ViewChild, TemplateRef, ComponentRef, Type } from '@angular/core';
import { FormBaseWrapperComponent } from './base-wrapper.component';
import {FormFieldLayoutDefinition, FormValidatorComponentErrors} from "@researchdatabox/sails-ng-common";
import { FormFieldBaseComponent, FormFieldCompMapEntry } from "@researchdatabox/portal-ng-common";

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
    @if (getStringProperty('label')) {
      @if (getBooleanProperty('visible')) {
        <label class="form-label">
          <span [innerHtml]="getStringProperty('label')" [attr.title]="getTooltip()"></span>
          @if (isRequired) {
            <span
              class="form-field-required-indicator"
            [innerHTML]="getStringProperty('labelRequiredStr')"></span>
          }
          @if (getStringProperty('helpText')) {
            <button type="button" class="btn btn-default" (click)="toggleHelpTextVisibility()" [attr.aria-label]="'help' | i18next ">
              <span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span>
            </button>
          }
        </label>
        @if (helpTextVisible) {
          <span class="help-block" [innerHtml]="getStringProperty('helpText')"></span>
        }
        <br>
        }
      }
      <ng-container #componentContainer  ></ng-container>
      <!-- instead of rendering the 'before' and 'after' templates around the componentContainer, we supply named templates so the component can render these as it sees fit -->
      <ng-template #beforeComponentTemplate>
        @if (getBooleanProperty('visible')) {
          Before {{ componentName }}
          <br>
          }
        </ng-template>
        <ng-template #afterComponentTemplate>
          @if (getBooleanProperty('visible')) {
            After {{ componentName }}
            @let componentValidationList = getFormValidatorComponentErrors;
            @if (componentValidationList.length > 0) {
              <div class="invalid-feedback">
                Field validation errors:
                <ul>
                  @for (error of componentValidationList; track $index) {
                    <li>{{ error.message ?? "(no message)" | i18next: error.params }}</li>
                  }
                </ul>
              </div>
            }
            <div class="valid-feedback">The field is valid.</div>
            <br>
            }
          </ng-template>
        }
  `,
  standalone: false,
  // Note: No need for host property here if using @HostBinding
})
export class DefaultLayoutComponent<ValueType> extends FormFieldBaseComponent<ValueType> {
  protected override logName = "DefaultLayoutComponent";
  helpTextVisible: boolean = false;
  componentClass?: typeof FormFieldBaseComponent<ValueType>;
  public override componentDefinition?: FormFieldLayoutDefinition;

  @ViewChild('componentContainer', { read: ViewContainerRef, static: false }) componentContainer!: ViewContainerRef;
  // @ViewChild(FormBaseWrapperDirective, {static: true}) formFieldDirective!: FormBaseWrapperDirective;

  @ViewChild('beforeComponentTemplate', { read: TemplateRef, static: false })
  beforeComponentTemplate!: TemplateRef<any>;
  @ViewChild('afterComponentTemplate', { read: TemplateRef, static: false })
  afterComponentTemplate!: TemplateRef<any>;

  // wrapperComponentRef!: ComponentRef<FormFieldBaseComponent<unknown>>;
  wrapperComponentRef!: ComponentRef<FormBaseWrapperComponent<ValueType>>;
  public helpTextVisibleOnInit:boolean = false;
  public labelRequiredStr:string = '';
  /**
   * Override to set additional properties required by the wrapper component.
   *
   * @param formFieldCompMapEntry
   */
  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.componentClass = formFieldCompMapEntry?.componentClass as typeof FormFieldBaseComponent<ValueType>;
    this.componentDefinition = formFieldCompMapEntry?.compConfigJson?.layout;
    //normalise componentDefinition that is used to track property changes given these may not be present
    this.buildPropertyCache(true);
    if(!_isUndefined(this.formFieldCompMapEntry) && !_isNull(this.formFieldCompMapEntry)) {
      this.formFieldCompMapEntry.layout = this as FormFieldBaseComponent<ValueType>;
    }

    if (_isUndefined(this.formFieldCompMapEntry?.compConfigJson?.layout?.name) && this.formFieldCompMapEntry) {
      const compConfigName = this.formFieldConfigName('default');
      _set(this.formFieldCompMapEntry, `compConfigJson.layout.name`, `${compConfigName}-layout`);
    }

    if(!_isUndefined(this.formFieldCompMapEntry?.compConfigJson?.layout?.name)) {
      this.name = this.formFieldCompMapEntry?.compConfigJson?.layout?.name;
    }

    if(this.helpTextVisibleOnInit) {
      this.setHelpTextVisibleOnInit();
    }
  }
  /**
   * Override what it takes to get the component to be 'ready'
   */
  protected override async setComponentReady(): Promise<void> {
    await this.untilViewIsInitialised();
    if (!this.componentContainer) {
      throw new Error("DefaultLayoutComponent: componentContainer is not defined. Cannot create the wrapper component.");
    }
    if (!this.formFieldCompMapEntry) {
      throw new Error("DefaultLayoutComponent: formFieldCompMapEntry is not defined. Cannot create the wrapper component.");
    }
    if (this.formFieldCompMapEntry && (this.beforeComponentTemplate || this.afterComponentTemplate)) {
      this.formFieldCompMapEntry.componentTemplateRefMap = {
        before: this.beforeComponentTemplate,
        after: this.afterComponentTemplate
      };
    }
    // Using the wrapper will also set the component instance in the definition map properly
    this.wrapperComponentRef = this.componentContainer.createComponent(FormBaseWrapperComponent<ValueType>);
    const wrapperComponent = await this.wrapperComponentRef.instance.initWrapperComponent(this.formFieldCompMapEntry, true);
    if (wrapperComponent !== null) {
      this.formFieldCompMapEntry.component = wrapperComponent
    }
    // finally set the status to 'READY'
    await super.setComponentReady();
  }

  override ngAfterViewInit() {
    this.viewInitialised.set(true);
  }

  public toggleHelpTextVisibility() {
    this.helpTextVisible = !this.helpTextVisible;
  }

  private setHelpTextVisibleOnInit() {
    this.helpTextVisible = true;
  }

  protected get getFormValidatorComponentErrors(): FormValidatorComponentErrors[]{
    return Object.entries(this.model?.formControl?.errors ?? {}).map(([key, item]) => {
      return {
        name: key,
        message: item.message ?? null,
        params: {...item.params},
      };
    })
  }

  protected get componentName(){
    return this.formFieldConfigName();
  }
}
