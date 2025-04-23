import { FormFieldModel } from './base.model';
import { FormControl } from '@angular/forms';
import { FormFieldComponentConfig } from './config.model';
/**
 * Base class for form components. Data binding to a form field is optional.
 * 
 * Notes:
 *  - No 'field' property to enforce type safety, i.e. avoid `any`
 * 
 */
export abstract class FormFieldComponent<ValueType = string | undefined> {
  public field?: FormFieldModel<ValueType> | null;
  public config?: FormFieldComponentConfig<ValueType> | null;
  
  get formControl(): FormControl<ValueType> {
    if (!this.field) {
      throw new Error("FieldComponent: field input is null.");
    }
    const control = this.field.formModel;
    if (!control) {
      console.error("FieldComponent formControl returned null for field:", this.field);
      // Return a dummy control or throw, depending on desired behavior
      throw new Error("FieldComponent: field.formModel is null.");
    }
    return control as FormControl<ValueType>;
  }
}