import { FormFieldComponent } from "./base.component";
import { FormFieldModel } from "./base.model";

export interface FormComponentResolver {
  getComponentClass(componentName: string): Promise<typeof FormFieldComponent>;
}

export interface FormFieldResolver {
  getFieldClass(fieldName: string): Promise<typeof FormFieldModel>;
}
