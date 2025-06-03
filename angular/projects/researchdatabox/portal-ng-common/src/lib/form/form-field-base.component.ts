import { FormFieldModel } from './base.model';
import { FormControl } from '@angular/forms';
import { FormFieldComponentDefinition, FormComponentLayoutDefinition } from './config.model';
import { Directive, HostBinding, signal, inject, TemplateRef } from '@angular/core'; // Import HostBinding
import { LoggerService } from '../logger.service';
import { FormFieldComponentStatus } from './status.model';
import { get as _get, isEmpty as _isEmpty } from 'lodash-es';
/**
 * Base class for form components. Data binding to a form field is optional.
 *
 * Notes:
 *  - No 'field' property to enforce type safety, i.e. avoid `any`
 *
 */
@Directive()
export abstract class FormFieldBaseComponent<ValueType = string | undefined> {
  public model?: FormFieldModel<ValueType> | null | undefined = null;
  public componentDefinition?: FormFieldComponentDefinition | FormComponentLayoutDefinition;
  public formFieldCompMapEntry?: FormFieldCompMapEntry | null | undefined = null;
  public hostBindingCssClasses: { [key: string]: boolean } | null | undefined = null;
// The status of the component
  public status = signal<FormFieldComponentStatus>(FormFieldComponentStatus.INIT);

  private loggerService: LoggerService = inject(LoggerService);
  /**
   * This method is called to initialize the component with the provided configuration.
   *
   * The framework expects the method to prepare the component for rendering, and at minimum, should prepare:
   *
   * - Any external/remote data sources
   * - The model responsible for the data binding
   * - Any static or dynamic styling or layout information, including CSS classes
   * - Any event handlers
   ** For more advanced use cases, override method to define the component init behavior. Just don't forget to call 'super.setComponentReady()' or change the status manually, when the component is ready.
   *
   * @param formFieldCompMapEntry
   */
  async initComponent(formFieldCompMapEntry: FormFieldCompMapEntry | null | undefined) {
    if (!formFieldCompMapEntry) {
      throw new Error("FieldComponent: formFieldCompMapEntry is null.");
    }
    try {
      // Create a method that children can override to set their own properties
      this.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
      await this.initData();
      await this.initLayout();
      await this.initEventHandlers();
      // Create a method that children to prepare their state.
      await this.setComponentReady();
    } catch (error) {
      this.loggerService.error("FieldComponent: initComponent failed", error);
      this.status.set(FormFieldComponentStatus.ERROR);
    }
  }

  protected setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry) {
    this.formFieldCompMapEntry = formFieldCompMapEntry;
    this.formFieldCompMapEntry.component = this as FormFieldBaseComponent;
    this.model = this.formFieldCompMapEntry?.model as FormFieldModel<ValueType> | null;
    this.componentDefinition = this.formFieldCompMapEntry.compConfigJson.component as FormFieldComponentDefinition | FormComponentLayoutDefinition;
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
    if (this.componentDefinition?.config?.defaultComponentCssClasses) {
      if (typeof this.componentDefinition.config?.defaultComponentCssClasses === 'string') {
      this.hostBindingCssClasses = { [this.componentDefinition.config?.defaultComponentCssClasses]: true };
      } else {
      // Assuming it's already in the desired { [key: string]: boolean } format
      // this.hostBindingCssClasses = this.config.defaultComponentCssClasses;
      }
    } else {
      this.hostBindingCssClasses = {}; // Initialize as empty object if no default classes
    }
  }

  /**
   * The FormControl instance for this field.
   */
  get formControl(): FormControl<ValueType> {
    const control = this.model?.formControl;
    if (!control) {
      console.error("FieldComponent formControl returned null for field:", this.model);
      // Return a dummy control or throw, depending on desired behavior
      throw new Error("FieldComponent: field.formModel is null.");
    }
    return control as FormControl<ValueType>;
  }

  get isRequired(): boolean {
    return this.model?.validators?.some(v => v?.name === 'required') ?? false;
  }

  get isValid(): boolean {
    return Object.keys(this.formControl?.errors ?? {}).length === 0;
  }

  // Use @HostBinding to bind to the host element's class attribute
  // This getter returns an object similar to what you'd pass to [ngClass]
  @HostBinding('class') get hostClasses() {
    return this.hostBindingCssClasses;
  }

  /**
   * Get the template reference for the specified template name.
   *
   * @param templateName - The name of the template to retrieve.
   * @returns The TemplateRef instance or null if not found.
   */
  getTemplateRef(templateName: string): TemplateRef<any> | null {
    return _get(this.formFieldCompMapEntry, `componentTemplateRefMap.${templateName}`, null);
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
    this.status.set(FormFieldComponentStatus.READY);
  }
}

/**
 * The complete metadata data structure describing a form field component, including the necessary constructors to create and init the component and model.
 *
 * @export
 * @interface FormFieldCompMapEntry
 */
export interface FormFieldCompMapEntry {
  modelClass?: typeof FormFieldModel | null;
  layoutClass?: typeof FormFieldBaseComponent | null;
  componentClass?: typeof FormFieldBaseComponent | null;
  compConfigJson: any,
  model?: FormFieldModel | null;
  component?: FormFieldBaseComponent | null;
  componentTemplateRefMap? : { [key: string]: TemplateRef<any> } | null | undefined;
}
