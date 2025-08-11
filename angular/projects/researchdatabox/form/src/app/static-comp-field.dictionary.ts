import { FormBaseComponent } from "@researchdatabox/portal-ng-common";
import { TextField, TextFieldComponent } from "./component/textfield.component";

export interface ComponentFieldMapEntry {
  // TODO: remove any
  field?: any;
  component?: any;
  // END TODO
  componentPath?: string;
}

export interface ComponentFieldMap {
  [index: string]: FormBaseComponent;
}

export const StaticComponentFieldMap: ComponentFieldMap = {
  'TextField': TextFieldComponent
};