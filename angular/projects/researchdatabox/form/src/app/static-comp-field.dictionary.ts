import { FieldModel, FieldComponent, FieldConfig, ComponentConfig } from "@researchdatabox/portal-ng-common";
import { TextFieldModel, TextFieldComponent } from "./component/textfield.component";

export interface FieldCompMapEntry {
  fieldClass?: typeof FieldModel;
  componentClass?: typeof FieldComponent;
  json: any,
  field?: FieldModel;
  component?: FieldComponent;
}

/** Field related */
export interface FieldClassMap {
  [index: string]: any;
}

export const StaticFieldClassMap: FieldClassMap = {
  'TextField': TextFieldModel
};

/** Component related */
export interface ComponentClassMap {
  [index: string]: any;
}
export const StaticComponentClassMap: ComponentClassMap = {
  'TextField': TextFieldComponent, // the default, to make the 
  'TextFieldComponent': TextFieldComponent
};