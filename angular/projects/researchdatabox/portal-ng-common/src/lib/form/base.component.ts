import { FormFieldModel } from './base.model';
import { FormControl } from '@angular/forms';
import { FormComponentConfig } from './config.model';
/**
 * Base class for form components. Data binding to a form field is optional.
 * 
 * Notes:
 *  - No 'field' property to enforce type safety, i.e. avoid `any`
 * 
 */
export abstract class FormFieldComponent<ValueType = string | undefined> {
  public model?: FormFieldModel<ValueType> | null;
  public config?: FormComponentConfig | null;
  
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
}