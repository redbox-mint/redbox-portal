import { FormFieldComponentType } from "./form-field-base.component";
import { FormFieldModel } from "./base.model";

export interface FormComponentResolver {
  getComponentClass(componentName: string): Promise<FormFieldComponentType>;
}

export interface FormFieldResolver {
  getFieldClass(fieldName: string): Promise<typeof FormFieldModel<unknown>>;
}
