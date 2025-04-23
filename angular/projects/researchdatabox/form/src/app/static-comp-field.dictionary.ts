import { FormFieldModel, FormFieldComponent } from "@researchdatabox/portal-ng-common";
import { TextFieldModel, TextFieldComponent } from "./component/textfield.component";

export interface FormFieldCompMapEntry {
  fieldClass?: FormFieldModel;
  componentClass?: FormFieldComponent;
  json: any,
  field?: FormFieldModel;
  component?: FormFieldComponent;
  wrapperClass?: string;
}

/** Field related */
export interface FormFieldClassMap {
  [index: string]: any;
}

export const StaticFieldClassMap: FormFieldClassMap = {
  'TextFieldModel': TextFieldModel
};

/** Component related */
export interface FormComponentClassMap {
  [index: string]: any;
}
export const StaticComponentClassMap: FormComponentClassMap = {
  
  'TextField': TextFieldComponent, // the default, to make the 
  'TextFieldComponent': TextFieldComponent
};