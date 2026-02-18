import { isUndefined as _isUndefined, isNull as _isNull, set as _set } from 'lodash-es';
import { Component, ViewContainerRef, ViewChild, TemplateRef, ComponentRef, inject } from '@angular/core';
import { FormBaseWrapperComponent } from './base-wrapper.component';
import {
  FieldLayoutDefinitionFrame,
  FormValidatorComponentErrors,
  FormFieldComponentStatus,
  DefaultLayoutName
} from "@researchdatabox/sails-ng-common";
import { FormFieldBaseComponent, FormFieldCompMapEntry } from "@researchdatabox/portal-ng-common";
import { FormService } from "../form.service";

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
  @if (componentDefinition) {
    <div class="rb-form-field-layout">
      @if (getStringProperty('label') && isVisible) {
        <label class="form-label rb-form-field-label">
          <span [innerHtml]="getStringProperty('label') | i18next" [title]="tooltip | i18next"></span>
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
          <span class="help-block" [innerHtml]="getStringProperty('helpText') | i18next"></span>
        }
      }
      <div class="rb-form-field-control">
        <ng-container #componentContainer  ></ng-container>
      </div>
    </div>
    <!-- instead of rendering the 'before' and 'after' templates around the componentContainer, we supply named templates so the component can render these as it sees fit -->
    <ng-template #beforeComponentTemplate>
    </ng-template>
    <ng-template #afterComponentTemplate>
      @if (isVisible) {
        @let componentValidationList = getFormValidatorComponentErrors;
        @if (componentValidationList.length > 0) {
          <div class="invalid-feedback">
            {{ 'form.invalidValue' | i18next }}
            @for (error of componentValidationList; track (error.class ?? 'err') + '-' + $index) {
              <span [attr.data-validation-error-class]="error.class"
                    [attr.data-validation-error-message]="error.message">
                {{ $index + 1 }}) {{ error.message | i18next: error.params }}
              </span>
            }
          </div>
        }
        <div class="valid-feedback">{{ 'form.fieldValid' | i18next }}</div>
      }
    </ng-template>
  }
  `,
  standalone: false,
  // Note: No need for host property here if using @HostBinding
})
export class DefaultLayoutComponent<ValueType> extends FormFieldBaseComponent<ValueType> {
  protected override logName: string = DefaultLayoutName;
  helpTextVisible: boolean = false;
  componentClass?: typeof FormFieldBaseComponent<ValueType>;
  public override componentDefinition?: FieldLayoutDefinitionFrame;

  @ViewChild('componentContainer', { read: ViewContainerRef, static: false }) componentContainer!: ViewContainerRef;
  // @ViewChild(FormBaseWrapperDirective, {static: true}) formFieldDirective!: FormBaseWrapperDirective;

  @ViewChild('beforeComponentTemplate', { read: TemplateRef, static: false })
  beforeComponentTemplate!: TemplateRef<any>;
  @ViewChild('afterComponentTemplate', { read: TemplateRef, static: false })
  afterComponentTemplate!: TemplateRef<any>;

  private formService = inject(FormService);

  // wrapperComponentRef!: ComponentRef<FormFieldBaseComponent<unknown>>;
  wrapperComponentRef!: ComponentRef<FormBaseWrapperComponent<ValueType>>;
  public helpTextVisibleOnInit: boolean = false;
  public labelRequiredStr: string = '';
  public tooltip: string = '';
  /**
   * Override to set additional properties required by the wrapper component.
   *
   * @param formFieldCompMapEntry
   */
  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.componentClass = formFieldCompMapEntry?.componentClass as typeof FormFieldBaseComponent<ValueType>;
    this.componentDefinition = formFieldCompMapEntry?.compConfigJson?.layout;
    this.tooltip = this.getStringProperty('tooltip');
    if (!_isUndefined(this.formFieldCompMapEntry) && !_isNull(this.formFieldCompMapEntry)) {
      this.formFieldCompMapEntry.layout = this as FormFieldBaseComponent<ValueType>;
    }

    if (_isUndefined(this.formFieldCompMapEntry?.compConfigJson?.layout?.name) && this.formFieldCompMapEntry) {
      const compConfigName = this.formFieldConfigName('default');
      _set(this.formFieldCompMapEntry, `compConfigJson.layout.name`, `${compConfigName}-layout`);
    }

    if (!_isUndefined(this.formFieldCompMapEntry?.compConfigJson?.layout?.name)) {
      this.name = this.formFieldCompMapEntry?.compConfigJson?.layout?.name;
    }

    if (this.helpTextVisibleOnInit) {
      this.setHelpTextVisibleOnInit();
    }
  }
  /**
   * Override what it takes to get the component to be 'ready'
   */
  protected override async setComponentReady(): Promise<void> {
    await this.untilViewIsInitialised();
    if (!this.componentContainer) {
      throw new Error(`${this.logName}: componentContainer is not defined. Cannot create the wrapper component for name ${JSON.stringify(this.name)} formFieldCompMapEntry ${JSON.stringify(this.formFieldCompMapEntry?.compConfigJson)}`);
    }
    if (!this.formFieldCompMapEntry) {
      throw new Error(`${this.logName}: formFieldCompMapEntry is not defined. Cannot create the wrapper component for name ${JSON.stringify(this.name)}.`);
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
    this.status.set(FormFieldComponentStatus.INIT_VIEW_READY);
  }

  public toggleHelpTextVisibility() {
    this.helpTextVisible = !this.helpTextVisible;
  }

  private setHelpTextVisibleOnInit() {
    this.helpTextVisible = true;
  }

  protected get getFormValidatorComponentErrors(): FormValidatorComponentErrors[] {
    return this.formService.getFormValidatorComponentErrors(this.model?.formControl);
  }

  protected get componentName() {
    return this.formFieldConfigName();
  }
}
