import { SimpleInputModel, SimpleInputComponent } from "./component/textfield.component";
import { RepeatableComponent, RepeatableComponentModel, RepeatableElementLayoutComponent } from "./component/repeatable.component";
import {DefaultLayoutComponent} from "./component/default-layout.component";
import { each as _each, map as _map, endsWith as _endsWith } from 'lodash-es';
import {ValidationSummaryFieldComponent, ValidationSummaryFieldModel} from "./component/validation-summary.component";
import {GroupFieldModel, GroupFieldComponent } from "./component/groupfield.component";
import { TabComponent } from "./component/tab.component";
import { ContentComponent } from "./component/textblock.component";
import { SaveButtonComponent } from "./component/save-button.component";

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
  'SimpleInputComponent': {
    model: SimpleInputModel,
    component: SimpleInputComponent
  },
  'ContentComponent': {
    component: ContentComponent
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
  'SaveButtonComponent': {
    component: SaveButtonComponent
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
