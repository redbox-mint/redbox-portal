import { TextFieldModel, TextFieldComponent } from "./component/textfield.component";
import { DefaultLayoutComponent } from "@researchdatabox/portal-ng-common";
import { each as _each, map as _map, endsWith as _endsWith } from 'lodash-es';
import {ValidationSummaryFieldComponent, ValidationSummaryFieldModel} from "./component/validation-summary.component";

/** Field related */
export interface FormFieldModelClassMap {
  [index: string]: any;
}

/**
 * For built-in components, add the mapping here
 *
 * Note that each model and component are optional
*/
export const StaticModelCompClassMap = {
  'TextField': {
    model: TextFieldModel,
    component: TextFieldComponent
  },
  'DefaultLayoutComponent': {
    component: DefaultLayoutComponent
  },
  'ValidationSummaryField': {
    model: ValidationSummaryFieldModel,
    component: ValidationSummaryFieldComponent,
  }
};


// The following maps are used to detach the component from the model
export const StaticModelClassMap: FormFieldModelClassMap = {};
_each(StaticModelCompClassMap, (value:any, key:any) => {
  if (value.model) {
    const modelKeyName = _endsWith(key, 'Model') ? key : key + 'Model';
    StaticModelClassMap[key] = value.model;
    StaticModelClassMap[modelKeyName] = value.model;
    // add an entry for the model name to make it easier to find the corresponding component's model
    if (value.component) {
      const componentKeyName = _endsWith(key, 'Component') ? key : key + 'Component';
      StaticModelClassMap[componentKeyName] = value.model;
    }
  }
});

/** Component related */
export interface FormComponentClassMap {
  [index: string]: any;
}

export const StaticComponentClassMap: FormComponentClassMap = {};

_each(StaticModelCompClassMap, (value:any, key:any) => {
  if (value.component) {
    const componentKeyName = _endsWith(key, 'Component') ? key : key + 'Component';
    StaticComponentClassMap[key] = value.component;
    StaticComponentClassMap[componentKeyName] = value.component;
    // add an entry for the component name to make it easier to find the corresponding model's component
    if (value.model) {
      const modelKeyName = _endsWith(key, 'Model') ? key : key + 'Model';
      StaticComponentClassMap[modelKeyName] = value.component;
    }
  }
});
