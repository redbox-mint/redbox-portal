import {FormFieldModel, ModifyOptions} from './base.model';
import { FormControl } from '@angular/forms';
import {
  Directive, HostBinding, ViewChild, signal, inject, TemplateRef,
  ViewContainerRef, ComponentRef, AfterViewInit, effect,
  EffectRef, Injector, ApplicationRef
} from '@angular/core';
import { LoggerService } from '../logger.service';
import {  isEmpty as _isEmpty, get as _get } from 'lodash-es';
import { UtilityService } from "../utility.service";
import {
  FormComponentDefinitionFrame,
  FormFieldComponentStatus,
  LineagePaths,
  JSONataQuerySourceProperty,
  FormExpressionsConfigOutline,
  FormFieldComponentOrLayoutDefinition,
} from '@researchdatabox/sails-ng-common';

export interface FormFieldFocusRequestOptions {
  scroll?: boolean;
  scrollOptions?: ScrollIntoViewOptions;
}

/**
 * Base class for form components. Data binding to a form field is optional.
 *
 * Notes:
 *  - No 'field' property to enforce type safety, i.e. avoid `any`
 *
 */
@Directive()
export class FormFieldBaseComponent<ValueType> implements AfterViewInit {
  protected logName: string = "FormFieldBaseComponent";
  public name: string | null = '';
  public className: string = '';
  public model?: FormFieldModel<ValueType>;
  public componentDefinition?: FormFieldComponentOrLayoutDefinition;
  public formFieldCompMapEntry?: FormFieldCompMapEntry;
  public hostBindingCssClasses?: string;
  // The status of the component
  public status = signal<FormFieldComponentStatus>(FormFieldComponentStatus.INIT);

  @ViewChild('beforeContainer', { read: ViewContainerRef, static: false }) protected beforeContainer!: ViewContainerRef;
  @ViewChild('afterContainer', { read: ViewContainerRef, static: false }) protected afterContainer?: ViewContainerRef | null;

  public expressions: any = {};

  protected utilityService = inject(UtilityService);
  protected loggerService: LoggerService = inject(LoggerService);
  private readonly viewReadyInjector: Injector = inject(Injector);

  /**
   * For obtaining a reference to the FormComponent instance.
   * @private
   */
  private readonly appRef = inject(ApplicationRef);
  /**
   * Cache the reference to the FormComponent instance.
   * @private
   */
  private formComponentFromAppRef: any;

  /**
   * This method is called to initialize the component with the provided configuration.
   *
   * The framework expects the method to prepare the component for rendering, and at minimum, should prepare:
   *
   * - Any external/remote data sources
   * - The model responsible for the data binding
   * - Any static or dynamic styling or layout information, including CSS classes
   * - Any event handlers
   *
   * For more advanced use cases, override method to define the component init behavior. Just don't forget to call 'super.setComponentReady()' or change the status manually, when the component is ready.
   *
   * @param formFieldCompMapEntry
   */
  async initComponent(formFieldCompMapEntry: FormFieldCompMapEntry | null | undefined): Promise<void> {
    if (!formFieldCompMapEntry) {
      throw new Error(`${this.logName}: cannot initialise component because formFieldCompMapEntry was invalid.`);
    }
    try {
      // Create a method that children can override to set their own properties
      this.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
      await this.initData();
      await this.initLayout();
      await this.initEventHandlers();
      // Create a method that children can override to prepare their state.
      await this.setComponentReady();
    } catch (error) {
      this.loggerService.error(`${this.logName}: initialise component failed for '${name}':`, error);
      this.status.set(FormFieldComponentStatus.ERROR);
    }
  }

  protected setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry) {
    if (!formFieldCompMapEntry) {
      throw new Error(`${this.logName}: cannot set component properties because formFieldCompMapEntry was invalid.`);
    }
    this.formFieldCompMapEntry = formFieldCompMapEntry;

    const name = this.formFieldConfigName();
    this.loggerService.debug(`${this.logName}: Initialise component for '${name}'.`, this.formFieldCompMapEntry);
    this.className = name;

    this.formFieldCompMapEntry.component = this;
    // TODO: use type narrowing instead of type assertion.
    this.model = this.formFieldCompMapEntry?.model as FormFieldModel<ValueType>;
    this.componentDefinition = this.formFieldCompMapEntry.compConfigJson?.component;
    this.expressions = this.formFieldCompMapEntry.compConfigJson?.expressions;
    if (this.formFieldCompMapEntry.compConfigJson?.name) {
      this.name = this.formFieldCompMapEntry.compConfigJson.name;
    }
  }

  ngAfterViewInit() {
    this.loggerService.debug(`${this.logName}: View has initialised`, this.formFieldCompMapEntry);
    const s = this.status();
    // Gating the status update in case the component has been set to something else beforehand.
    if (s === FormFieldComponentStatus.INIT) {
      this.status.set(FormFieldComponentStatus.INIT_VIEW_READY);
    }
  }

  public viewInitialised(): boolean {
    return this.status() === FormFieldComponentStatus.INIT_VIEW_READY || this.status() === FormFieldComponentStatus.READY;
  }

  public getBooleanProperty(name: string, defaultValue: boolean): boolean {
    return _get(this.componentDefinition?.config, name, defaultValue);
  }

  public getStringProperty(name: string): string {
    return _get(this.componentDefinition?.config, name, '');
  }

  get isVisible(): boolean {
    return this.componentDefinition?.config?.visible ?? true;
  }

  get isReadonly(): boolean {
    return this.componentDefinition?.config?.readonly ?? false;
  }

  /**
   * Get whether this component is disabled or not.
   *
   * NOTE: Do not use isDisabled for HTML elements that are associated with an angular formControl (e.g. [disabled]="isDisabled").
   *       The formControl sets the disabled state on the HTML element DOM.
   */
  get isDisabled(): boolean {
    return this.componentDefinition?.config?.disabled ?? false;
  }

  /**
   * Set this component to be disabled or enabled.
   * @param disabled True for disabled, false for enabled.
   * @param opts The modify options.
   */
  public setDisabled(disabled: boolean, opts?: ModifyOptions) {
    const current = this.isDisabled;
    try {
      this.model?.setDisabled(disabled, opts);
      if (this.componentDefinition?.config) {
        this.componentDefinition.config.disabled = disabled;
      }
    } catch (error) {
      if (this.componentDefinition?.config) {
        this.componentDefinition.config.disabled = current;
      }
      this.loggerService.error(
        `Could not set model disabled state with value ${disabled} and opts ${opts}.`, error);
    }
  }

  get label(): string {
    return this.componentDefinition?.config?.label ?? '';
  }

  /**
   * Get the FormComponent from the ApplicationRef components array.
   * @protected
   */
  protected get formComponent(): any {
    if (this.formComponentFromAppRef === undefined) {
      const components = this.appRef?.components;
      if (!components || components.length < 1) {
        throw new Error(`ApplicationRef contained no components, so cannot get FormComponent: ${components}.`);
      }

      const formComponent = components[0];
      if (!formComponent?.instance?.appName?.startsWith('Form::')) {
        throw new Error(`First component in ApplicationRef does not appear to be the FormComponent: ${formComponent}.`);
      }

      this.formComponentFromAppRef = formComponent;
    }
    const result = this.formComponentFromAppRef?.instance;
    return result;
  }

  /**
   * Retrieve or compute any data needed for the component.
   */
  protected async initData() {
  }
  /**
   * Prepare any layout-specific information, including CSS classes.
   */
  protected async initLayout() {
    this.initHostBindingCssClasses();
  }
  /**
   * Prepare the event handlers for this component.
   */
  protected async initEventHandlers() {
  }
  /**
  * Prepare the CSS classes for the host element.
  */
  protected initHostBindingCssClasses() {
    // If the component definition has default CSS classes, use them.
    if (this.componentDefinition?.config?.hostCssClasses !== undefined) {
      if (typeof this.componentDefinition.config.hostCssClasses === 'string') {
        // this.hostBindingCssClasses = { [this.componentDefinition.config.hostCssClasses]: true };
        this.hostBindingCssClasses = this.componentDefinition.config.hostCssClasses;
      }
    } else {
      if (this.componentDefinition?.config?.defaultComponentCssClasses) {
        if (typeof this.componentDefinition.config?.defaultComponentCssClasses === 'string') {
          // this.hostBindingCssClasses = { [this.componentDefinition.config?.defaultComponentCssClasses]: true };
          this.hostBindingCssClasses = this.componentDefinition.config?.defaultComponentCssClasses;
        } else {
          // Assuming it's already in the desired { [key: string]: boolean } format
          // this.hostBindingCssClasses = this.config.defaultComponentCssClasses;
        }
      } else {
        this.hostBindingCssClasses = undefined; // No default classes provided
        // this.hostBindingCssClasses = {}; // Initialize as empty object if no default classes
      }
    }
  }

  /**
   * The FormControl instance for this field.
   */
  get formControl(): FormControl<ValueType> {
    const control = this.model?.formControl;
    if (!control) {
      // Return a dummy control or throw, depending on desired behavior
      throw new Error(`${this.logName}: could not get form control from model for '${this.formFieldConfigName()}'.`);
    }
    // TODO: use type narrowing instead of type assertion.
    return control as FormControl<ValueType>;
  }

  get isRequired(): boolean {
    return this.model?.validators?.some(v => v?.class === 'required') ?? false;
  }

  get isValid(): boolean {
    return Object.keys(this.formControl?.errors ?? {}).length === 0;
  }

  get showValidIndicator(): boolean {
    return this.getBooleanProperty('showValidIndicator', false);
  }

  get showValidState(): boolean {
    return this.showValidIndicator && this.isValid;
  }

  // Use @HostBinding to bind to the host element's class attribute
  // This getter returns an object similar to what you'd pass to [ngClass]
  @HostBinding('class') public get hostClasses() {
    return this.hostBindingCssClasses;
  }

  /**
   * Get the template reference for the specified template name.
   *
   * @param templateName - The name of the template to retrieve.
   * @returns The TemplateRef instance or null if not found.
   */
  getTemplateRef(templateName: string): TemplateRef<any> | null {
    return this.formFieldCompMapEntry?.componentTemplateRefMap?.[templateName] ?? null;
  }
  /**
   * Convenience method to check if a template reference exists for the specified template name.
   */
  hasTemplateRef(templateName: string): boolean {
    return !_isEmpty(this.getTemplateRef(templateName));
  }

  /**
   * Set the component status to READY.
   */
  protected async setComponentReady() {
    this.loggerService.debug(`${this.logName}: At setComponentReady for component '${this.formFieldConfigName()}'`, this.formFieldCompMapEntry);
    this.status.set(FormFieldComponentStatus.READY);
  }

  isStatusReady(): boolean {
    return this.status() === FormFieldComponentStatus.READY;
  }

  protected untilViewIsInitialised(): Promise<void> {
    if (this.viewInitialised()) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      let effectRef: EffectRef | undefined;
      const timeout = setTimeout(() => {
        effectRef?.destroy();
        reject('Timeout waiting for untilViewIsInitialised');
      }, 2000);

      effectRef = effect(() => {
        if (this.viewInitialised()) {
          clearTimeout(timeout);
          effectRef?.destroy();
          resolve();
        }
      }, { injector: this.viewReadyInjector });
    });
  }

  /**
   * Get the child form field components.
   */
  public get formFieldBaseComponents(): FormFieldBaseComponent<unknown>[] {
    return [];
  }

  /**
   * Get the child form field component map entries.
   */
  public get formFieldCompMapEntries(): FormFieldCompMapEntry[] {
    return [];
  }

  public formFieldConfigName(defaultName?: string) {
    return this.utilityService.formFieldConfigName(this.formFieldCompMapEntry, defaultName);
  }

  public requestFocus(options: FormFieldFocusRequestOptions = {}): boolean {
    const target = this.getFocusTargetElement();
    if (!target) {
      return false;
    }

    const shouldScroll = options.scroll ?? true;
    if (shouldScroll && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView(options.scrollOptions ?? {
        behavior: 'smooth',
        block: 'center'
      });
    }

    if (typeof target.focus === 'function') {
      target.focus({ preventScroll: true });
      return true;
    }
    return false;
  }

  protected getFocusTargetElement(): HTMLElement | null {
    const nativeElement =
      this.formFieldCompMapEntry?.componentRef?.location?.nativeElement ??
      this.formFieldCompMapEntry?.layoutRef?.location?.nativeElement;

    if (!(nativeElement instanceof HTMLElement)) {
      return null;
    }

    const focusable = nativeElement.querySelector(
      'input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),a[href]:not([disabled]),[tabindex]:not([tabindex="-1"])'
    );
    return focusable instanceof HTMLElement ? focusable : nativeElement;
  }
}

/**
 * The complete metadata data structure describing a form field component, including the necessary constructors to create and init the component and model.
 *
 * @export
 * @interface FormFieldCompMapEntry
 */
export interface FormFieldCompMapEntry {
  name?: string;
  modelClass?: typeof FormFieldModel<unknown>;
  layoutClass?: typeof FormFieldBaseComponent<unknown>;
  componentClass?: typeof FormFieldBaseComponent<unknown>;
  compConfigJson: FormComponentDefinitionFrame;
  model?: FormFieldModel<unknown>;
  component?: FormFieldBaseComponent<unknown>;
  componentRef?: ComponentRef<FormFieldBaseComponent<unknown>>;
  layout?: FormFieldBaseComponent<unknown>;
  layoutRef?: ComponentRef<FormFieldBaseComponent<unknown>>;
  componentTemplateRefMap?: { [key: string]: TemplateRef<unknown> };
  // optional control map to support 'container' like components that don't have a model themselves
  formControlMap?: { [key: string]: FormControl };
  lineagePaths?: LineagePaths;
  expressions?: FormExpressionsConfigOutline[];
}


/** Specialised interface for querying. */
export interface JSONataClientQuerySourceProperty extends JSONataQuerySourceProperty {
  // Placeholder for additional client-specific properties can be added here in the future
}
