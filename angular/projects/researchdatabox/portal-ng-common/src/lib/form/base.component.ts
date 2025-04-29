import { FormFieldModel } from './base.model';
import { FormControl } from '@angular/forms';
import { FormComponentBaseConfigBlock, FormFieldComponentConfig, FormComponentLayoutConfig } from './config.model';
import { Directive, HostBinding } from '@angular/core'; // Import HostBinding
/**
 * Base class for form components. Data binding to a form field is optional.
 * 
 * Notes:
 *  - No 'field' property to enforce type safety, i.e. avoid `any`
 * 
 */
@Directive()
export abstract class FormFieldComponent<ValueType = string | undefined> {
  public model?: FormFieldModel<ValueType> | null | undefined = null;
  public componentConfig?: FormFieldComponentConfig | FormComponentLayoutConfig;
  public formFieldCompMapEntry?: FormFieldCompMapEntry | null | undefined = null;
  public hostBindingCssClasses: { [key: string]: boolean } | null | undefined = null;
  

  async initComponent(formFieldCompMapEntry: FormFieldCompMapEntry | null | undefined) {
    if (!formFieldCompMapEntry) {
      throw new Error("FieldComponent: formFieldCompMapEntry is null.");
    }
    this.formFieldCompMapEntry = formFieldCompMapEntry;
    // this.config = componentConfig;
    this.model = this.formFieldCompMapEntry.model as FormFieldModel<ValueType> | null;
    this.componentConfig = this.formFieldCompMapEntry.compConfigJson.component as FormFieldComponentConfig | FormComponentLayoutConfig;
    this.initHostBindingCssClasses();
  }

  protected initHostBindingCssClasses() {
    if (this.componentConfig?.config?.defaultComponentCssClasses) {
      if (typeof this.componentConfig.config?.defaultComponentCssClasses === 'string') {
      this.hostBindingCssClasses = { [this.componentConfig.config?.defaultComponentCssClasses]: true };
      } else {
      // Assuming it's already in the desired { [key: string]: boolean } format
      // this.hostBindingCssClasses = this.config.defaultComponentCssClasses;
      }
    } else {
      this.hostBindingCssClasses = {}; // Initialize as empty object if no default classes
    }
  }
  
  get formControl(): FormControl<ValueType> {
    if (!this.model) {
      throw new Error("FieldComponent: field input is null.");
    }
    const control = this.model.formControl;
    if (!control) {
      console.error("FieldComponent formControl returned null for field:", this.model);
      // Return a dummy control or throw, depending on desired behavior
      throw new Error("FieldComponent: field.formModel is null.");
    }
    return control as FormControl<ValueType>;
  }



  // Use @HostBinding to bind to the host element's class attribute
  // This getter returns an object similar to what you'd pass to [ngClass]
  @HostBinding('class') get hostClasses() {
    return this.hostBindingCssClasses;
  }
}

export interface FormFieldCompMapEntry {
  modelClass?: typeof FormFieldModel | null;
  layoutClass?: typeof FormFieldComponent | null;
  componentClass?: typeof FormFieldComponent | null;
  compConfigJson: any,
  model?: FormFieldModel | null;
  component?: FormFieldComponent | null;
}