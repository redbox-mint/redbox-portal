import { isUndefined as _isUndefined, isNull as _isNull, set as _set } from 'lodash-es';
import { Component, ViewContainerRef, ViewChild, TemplateRef, ComponentRef, inject } from '@angular/core';
import { FormBaseWrapperComponent } from './base-wrapper.component';
import {
  FieldLayoutDefinitionFrame,
  FormFieldComponentStatus,
  DefaultLayoutName
} from "@researchdatabox/sails-ng-common";
import { FormFieldBaseComponent, FormFieldCompMapEntry, TranslationService } from "@researchdatabox/portal-ng-common";

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
    <div class="rb-form-field-layout" [class.rb-checkbox-detail-layout]="formFieldCompMapEntry?.labelSuffix">
      @if ((getStringProperty('label') || hasHelpText) && isVisible) {
        <label class="form-label rb-form-field-label" [attr.for]="labelableControlId">
          @if (getStringProperty('label')) {
            <span [innerHtml]="getStringProperty('label') | i18next" [title]="tooltip | i18next" [ngClass]="labelCssClasses"></span>
          }
          @if (formFieldCompMapEntry?.labelSuffix; as suffix) {
            <span> — {{ suffix | i18next }}</span>
          }
          @if (isRequired) {
            <span
              class="form-field-required-indicator"
            [innerHTML]="getStringProperty('labelRequiredStr')"></span>
          }
          @if (hasHelpText && !formFieldCompMapEntry?.labelSuffix) {
            <ng-container *ngTemplateOutlet="helpButton" />
          }
        </label>
        @if (hasHelpText && helpTextVisible && !formFieldCompMapEntry?.labelSuffix) {
          <span class="help-block" [innerHtml]="getStringProperty('helpText') | i18next"></span>
        }
      }
      <div class="rb-form-field-control">
        <ng-container #componentContainer  ></ng-container>
      </div>
      @if (formFieldCompMapEntry?.labelSuffix && hasHelpText && isVisible) {
        <ng-container *ngTemplateOutlet="helpButton" />
        @if (helpTextVisible) {
          <span class="help-block rb-checkbox-detail-help" [innerHtml]="getStringProperty('helpText') | i18next"></span>
        }
      }
    </div>
    <ng-template #helpButton>
      <button type="button" class="btn btn-default" [class.rb-checkbox-detail-help-button]="formFieldCompMapEntry?.labelSuffix"
        (click)="toggleHelpTextVisibility()"
        [attr.aria-label]="'help' | i18next" [attr.aria-expanded]="helpTextVisible">
        <span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span>
      </button>
    </ng-template>
    <!-- instead of rendering the 'before' and 'after' templates around the componentContainer, we supply named templates so the component can render these as it sees fit -->
    <ng-template #beforeComponentTemplate>
    </ng-template>
    <ng-template #afterComponentTemplate>
      @if (isVisible && formComponent.editMode()) {
        <redbox-field-error-summary [errors]="visibleValidationErrors ?? []" [fieldName]="componentName"></redbox-field-error-summary>
      }
    </ng-template>
  }
  `,
  styles: [`
    .rb-form-field-layout.rb-checkbox-detail-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      column-gap: 0.5rem;
      row-gap: 0.35rem;
      margin-bottom: 0;
    }
    .rb-checkbox-detail-layout .form-label { grid-column: 1; grid-row: 1; }
    .rb-checkbox-detail-help-button { grid-column: 2; grid-row: 1; padding: 0.1rem 0.35rem; }
    .rb-checkbox-detail-layout .rb-form-field-control { grid-column: 1 / -1; grid-row: 2; min-width: 0; }
    .rb-checkbox-detail-help { grid-column: 1 / -1; grid-row: 3; }
  `],
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

  protected formService = inject(FormService);
  protected translationService = inject(TranslationService);

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

    this.helpTextVisibleOnInit = this.getBooleanProperty('helpTextVisibleOnInit', false);
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

  public get hasHelpText(): boolean {
    const key = this.getStringProperty('helpText');
    if (!key) {
      return false;
    }
    const translated = this.translationService.t(key);
    return typeof translated === 'string' && translated.length > 0;
  }

  private setHelpTextVisibleOnInit() {
    this.helpTextVisible = true;
  }

  protected get componentName() {
    return this.formFieldConfigName();
  }

  protected get labelCssClasses(): string {
    const classMap = this.componentDefinition?.config?.cssClassesMap;
    if (classMap && typeof classMap === 'object' && typeof (classMap as Record<string, unknown>)['label'] === 'string') {
      return (classMap as Record<string, string>)['label'];
    }
    return '';
  }
}
