import { FormFieldBaseComponent } from "./form-field-base.component";
import { FormFieldModel } from "./base.model";

export interface FormComponentResolver {
  getComponentClass(componentName: string): Promise<typeof FormFieldBaseComponent<unknown>>;
}

export interface FormFieldResolver {
  getFieldClass(fieldName: string): Promise<typeof FormFieldModel<unknown>>;
}
