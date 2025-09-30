import { SimpleInputModel, SimpleInputComponent } from "./component/simple-input.component";
import { RepeatableComponent, RepeatableComponentModel, RepeatableElementLayoutComponent } from "./component/repeatable.component";
import {DefaultLayoutComponent} from "./component/default-layout.component";
import { each as _each, map as _map, endsWith as _endsWith } from 'lodash-es';
import {ValidationSummaryFieldComponent, ValidationSummaryFieldModel} from "./component/validation-summary.component";
import {GroupFieldModel, GroupFieldComponent } from "./component/group.component";
import { ContentComponent } from "./component/content.component";
import { TabComponent, TabComponentLayout } from "./component/tab.component";
import { SaveButtonComponent } from "./component/save-button.component";
import { TextAreaComponent, TextAreaModel } from "./component/text-area.component";
import { DropdownInputComponent, DropdownInputModel } from "./component/dropdown-input.component";
import { CheckboxInputComponent, CheckboxInputModel } from "./component/checkbox-input.component";
import { RadioInputComponent, RadioInputModel } from "./component/radio-input.component";
import { DateInputComponent, DateInputModel } from "./component/date-input.component";

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
  'SimpleInput': {
    model: SimpleInputModel,
    component: SimpleInputComponent
  },
  'ContentComponent': {
    component: ContentComponent
  },
  'TextArea': {
    model: TextAreaModel,
    component: TextAreaComponent
  },
  'DropdownInput': {
    model: DropdownInputModel,
    component: DropdownInputComponent
  },
  'CheckboxInput': {
    model: CheckboxInputModel,
    component: CheckboxInputComponent
  },
  'RadioInput': {
    model: RadioInputModel,
    component: RadioInputComponent
  },
  'DateInput': {
    model: DateInputModel,
    component: DateInputComponent
  },
  'DefaultLayoutComponent': {
    component: DefaultLayoutComponent
  },
  'RepeatableElementLayoutComponent': {
    component: RepeatableElementLayoutComponent
  },
  'RepeatableComponent': {
    model: RepeatableComponentModel,
    component: RepeatableComponent
  },
  'ValidationSummaryField': {
    model: ValidationSummaryFieldModel,
    component: ValidationSummaryFieldComponent,
  },
  'GroupField': {
    model: GroupFieldModel,
    component: GroupFieldComponent
  },
  'TabComponent': {
    component: TabComponent
  },
  'TabComponentLayout': {
    component: TabComponentLayout
  },
  'SaveButtonComponent': {
    component: SaveButtonComponent
  }
};

const modelKeyName = function (key: string): string {
  return `${key}${_endsWith(key, 'Model') ? '' : 'Model'}`;
}
const componentKeyName = function (key: string): string {
  return `${key}${_endsWith(key, 'Component') ? '' : 'Component'}`;
}

// The following maps are used to detach the component from the model
export const StaticModelClassMap: FormFieldModelClassMap = {};
_each(StaticModelCompClassMap, (value:any, key:any) => {
  if (value.model) {
    StaticModelClassMap[key] = value.model;
    StaticModelClassMap[modelKeyName(key)] = value.model;
    // add an entry for the model name to make it easier to find the corresponding component's model
    if (value.component) {
      StaticModelClassMap[componentKeyName(key)] = value.model;
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
    StaticComponentClassMap[key] = value.component;
    StaticComponentClassMap[componentKeyName(key)] = value.component;
    // add an entry for the component name to make it easier to find the corresponding model's component
    if (value.model) {
      StaticComponentClassMap[modelKeyName(key)] = value.component;
    }
  }
});
