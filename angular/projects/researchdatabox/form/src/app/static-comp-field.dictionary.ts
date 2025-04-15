import { FieldModel, FieldComponent } from "@researchdatabox/portal-ng-common";
import { TextFieldModel, TextFieldComponent } from "./component/textfield.component";

export interface FieldCompMapEntry {
  fieldClass?: FieldModel;
  componentClass?: FieldComponent;
  json: any,
  field?: FieldModel;
  component?: FieldComponent;
  wrapperClass?: string;
}

/** Field related */
export interface FieldClassMap {
  [index: string]: any;
}

export const StaticFieldClassMap: FieldClassMap = {
  'TextFieldModel': TextFieldModel
};

/** Component related */
export interface ComponentClassMap {
  [index: string]: any;
}
export const StaticComponentClassMap: ComponentClassMap = {
  
  'TextField': TextFieldComponent, // the default, to make the 
  'TextFieldComponent': TextFieldComponent
};