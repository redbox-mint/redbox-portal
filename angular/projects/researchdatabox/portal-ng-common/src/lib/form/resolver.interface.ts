import { FieldComponent } from "./base.component";
import { FieldModel } from "./base.model";

export interface FormComponentResolver {
  getComponentClass(componentName: string): Promise<typeof FieldComponent>;
}

export interface FormFieldResolver {
  getFieldClass(fieldName: string): Promise<FieldModel>;
}
