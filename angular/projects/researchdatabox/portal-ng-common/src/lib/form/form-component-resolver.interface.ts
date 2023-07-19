import { FormBaseComponent } from "./form-base.component";

export interface FormComponentResolver {
  getComponentClass(componentName: string): FormBaseComponent;
}