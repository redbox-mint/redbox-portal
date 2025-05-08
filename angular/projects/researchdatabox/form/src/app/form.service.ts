// Copyright (c) 2023 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import { Injectable, Inject } from '@angular/core';
import { isEmpty as _isEmpty, get as _get, toLower as _toLower, merge as _merge, isUndefined as _isUndefined, filter as _filter, forOwn as _forOwn } from 'lodash-es';
import { FormComponentClassMap, FormFieldModelClassMap, StaticComponentClassMap, StaticModelClassMap } from './static-comp-field.dictionary';
import { FormConfig, FormFieldModel, LoggerService, FormFieldModelConfig, FormFieldBaseComponent, FormFieldCompMapEntry, FormValidatorDefinition} from '@researchdatabox/portal-ng-common';
import { PortalNgFormCustomService } from '@researchdatabox/portal-ng-form-custom';
import {
  FormValidatorConfig,
  FormValidatorInstance,
  FormValidatorOptions
} from "../../../portal-ng-common/src/lib/form/config.model";
/**
 *
 * FormService
 * - retrieves form configuration
 * 
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 * 
 */
@Injectable(
  {
    providedIn: 'root'
  }
)
export class FormService {
  protected compClassMap:FormComponentClassMap = {};
  protected modelClassMap:FormFieldModelClassMap = {};

  constructor(
    @Inject(PortalNgFormCustomService) private customModuleFormCmpResolverService: PortalNgFormCustomService,
    @Inject(LoggerService) private loggerService: LoggerService,
    ) {
    // start with the static version, will dynamically merge any custom components later
    _merge(this.modelClassMap, StaticModelClassMap);
    _merge(this.compClassMap, StaticComponentClassMap);
    this.loggerService.debug(`FormService: Static component classes:`, this.compClassMap);
    this.loggerService.debug(`FormService: Static model classes:`, this.modelClassMap);
  }
  /** 
   * 
   * Download and consequently loads the form config.
   * 
   * Fields can use:
   * - components that are included in this app module
   * - components 
   * 
   * Returns:
   *  array of form fields containing the corresponding component information, ready for rendering.
   */
  public async getFormComponents(oid: string, recordType: string, editMode: boolean, formName: string, modulePaths:string[]): Promise<any> {
    const formJson: FormConfig = {
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      // validatorDefinitions is the combination of redbox core validator definitions and
      // the validator definitions from the client hook form config.
      validatorDefinitions: sharedValidatorDefinitions,
      validators: [],
      componentDefinitions: [
        {
          name: 'text_1_event',
          model: { 
            name: 'text_1_for_the_form',
            class: 'TextFieldModel',
            config: {
              value: 'hello world!',
              defaultValue: 'hello world!',
              validators: [
                { name: 'required' },
              ]
            }
          },
          component: {
            class: 'TextFieldComponent'
          }
        },
        {
          name: 'text_2',
          layout: {
            class: 'DefaultLayoutComponent',
            config: {
              label: 'TextField with default wrapper defined',
              helpText: 'This is a help text',
            }
          },
          model: { 
            class: 'TextFieldModel',
            config: {
              value: 'hello world 2!',
              validators: [
                { name: 'pattern', options: {pattern: /prefix.*/} },
                { name: 'minLength', message:"@validation-error-custom-text_2", options: {minLength: 3}},
              ]
            }
          },
          component: {
            class: 'TextFieldComponent'
          }
        },
        // {
        //   module: 'custom',
        //   component: {
        //     class: 'FormCustomComponent',
        //   },
        //   model: {
        //     class: 'FormCustomFieldModel',
        //     config: {
        //       name: 'project_name',
        //       label: 'Project Name',
        //       type: 'text',
        //       value: 'hello world!'
        //     }
        //   }
        // }
      ] 
    } as FormConfig;
    // const formConfig = (formJson as FormConfig);
    // Resove the field and component pairs
    const components = await this.resolveFormComponentClasses(formJson);
    // Instantiate the field classes, note these are optional, i.e. components may not have a form bound value
    this.createFormFieldModelInstances(components, formJson);
    return { components: components, formConfig: formJson };
  }

  public appendFormFieldType(additionalTypes: FormComponentClassMap) {
    _merge(this.compClassMap, additionalTypes);
  }

  protected async resolveFormComponentClasses(formConfig: FormConfig): Promise<FormFieldCompMapEntry[]> {
    const fieldArr = [];
    this.loggerService.debug('Resolving form component types...', formConfig);
    const components = formConfig.componentDefinitions || [];
    for (let componentConfig of components) {
      let modelClass: typeof FormFieldModel | undefined = undefined;
      let componentClass: typeof FormFieldBaseComponent | undefined = undefined;
      let layoutClass: typeof FormFieldBaseComponent | undefined = undefined;
      const modelClassName:string = componentConfig.model?.class || '';
      let componentClassName:string = componentConfig.component?.class || '';
      let layoutClassName:string = componentConfig.layout?.class || '';
      if (_isEmpty(modelClassName)) {
        this.loggerService.error(`Model class name is empty for component: ${JSON.stringify(componentConfig)}`);
        continue;
      }
      if (!_isEmpty(componentConfig.module)) {
        // TODO:
        // 1. for statically imported (e.g. modules) class doesn't have to be resolved here
        // 2. deal with genuine lazy-loading enabled components
        if (componentConfig.module == 'custom') {
          try {
            // try the static version first
            modelClass = this.modelClassMap[modelClassName];
            if (_isUndefined(modelClass) && !_isEmpty(componentClassName)) {
              // resolve the field class
              modelClass = await this.customModuleFormCmpResolverService.getFieldClass(modelClassName);
            }
            // try the static version first
            componentClass = this.compClassMap[componentClassName || modelClassName];
            if (_isUndefined(componentClass)) {
              // resolve the component class using the component class name and if unspecified, use the field class name
              componentClass = await this.getComponentClass(componentClassName || modelClassName, componentConfig.module);
              this.compClassMap[componentClassName || modelClassName] = componentClass;
            }
            if (!_isEmpty(layoutClassName)) {
              layoutClass = await this.getComponentClass(layoutClassName, componentConfig.module);
            }
          } catch (e) {
            this.loggerService.error(`Failed to resolve component: ${componentConfig.component}`);
          }
        }
      } else {
        // should be resolved already
        modelClass = this.modelClassMap[modelClassName];
        // if the compClass isn't explicitly defined, use the field class name, make sure a 'default' component is defined for each field 
        componentClass = this.compClassMap[componentClassName || modelClassName];

        if (!_isEmpty(layoutClassName)) {
          layoutClass = this.compClassMap[layoutClassName];
        }
      }
      if (modelClass) {
        if (componentClass) {
          fieldArr.push({
            modelClass: modelClass,
            componentClass: componentClass,
            compConfigJson: componentConfig,
            layoutClass: layoutClass,
          } as FormFieldCompMapEntry);
        } else {
          this.loggerService.error(`Component class with name: ${componentClassName} not found in class list. Check spelling and whether it is declared in the following list.`);
          this.loggerService.error(this.compClassMap);
        }
      } else {
        this.loggerService.error(`Model class with name: ${modelClassName} not found class list. Check spelling and whether it is declared in the following list.`);
        this.loggerService.error(this.modelClassMap);
      }
    }
    this.loggerService.debug('Resolved form component types:', fieldArr);
    return fieldArr;
  }

  public async getComponentClass(componentClassName: string, module?:string | null): Promise<typeof FormFieldBaseComponent | undefined> {
    if (_isEmpty(componentClassName)) {
      this.loggerService.error('Component class name is empty');
      throw new Error('Component class name is empty');
    }
    let componentClass = this.compClassMap[componentClassName];
    if (_isUndefined(componentClass) && !_isEmpty(module)) {
       await this.customModuleFormCmpResolverService.getComponentClass(componentClassName);
    }
    if (_isUndefined(componentClass)) {
      this.loggerService.error(`Component class with name: ${componentClassName} not found in class list. Check spelling and whether it is declared in the following list.`);
      this.loggerService.error(this.compClassMap);
      throw new Error(`Component class with name: ${componentClassName} not found in class list. Check`);
    }
    return componentClass
  }

  protected createFormFieldModelInstances(components:FormFieldCompMapEntry[], formConfig: FormConfig): FormFieldCompMapEntry[] {
    const validatorDefinitions = formConfig.validatorDefinitions;
    for (let compEntry of components) {
      if (compEntry.modelClass) {
        const modelConfig = compEntry.compConfigJson.model as FormFieldModelConfig;
        const validatorConfig = modelConfig?.config?.validators ?? [];
        const validators = this.createFormValidatorInstances(validatorDefinitions, validatorConfig);
        const model = new (compEntry.modelClass as any) (modelConfig, validators) as FormFieldModel;
        compEntry.model = model;
      } else {
        this.loggerService.warn(`Model class with name: ${compEntry.modelClass} not found field class list. Check spelling and whether it is declared in the following list.`);
        this.loggerService.error(this.modelClassMap);
      }
    }
    return components;
  }

  public groupComponentsByName(components:FormFieldCompMapEntry[]): any {
    const groupMap: any = {};
    const groupWithFormControl: any = {};
    for (let compEntry of components) {
      const fieldName:string = compEntry.compConfigJson.name;
      if (_isEmpty(fieldName)) {
        this.loggerService.info(`Field name is empty for component: ${JSON.stringify(compEntry)}. If you need this component to be part of the form or participate in events, please provide a name.`);
        continue;
      }
      groupMap[fieldName] = compEntry;
      if (compEntry.model) {
        const model = compEntry.model;
        const formControl = model.getFormGroupEntry();
        if (formControl && fieldName) {
          groupWithFormControl[fieldName] = formControl;
        }
      }
    }
    return { completeGroupMap: groupMap, withFormControl: groupWithFormControl };
  }

  public createFormValidatorInstances(
    definition: FormValidatorDefinition[] | null | undefined,
    config: FormValidatorConfig[] | null | undefined
  ): FormValidatorInstance[] {
    const defMap = new Map<string, FormValidatorDefinition>();
    for (const definitionItem of (definition ?? [])) {
      const name = definitionItem.name;
      const message = definitionItem.message;
      if (defMap.has(name)) {
        const messages = [message, defMap.get(name)?.message];
        throw new Error(`Duplicate validator name '${name}' - the validator names must be unique. ` +
          `To help you find the duplicates, these are the messages of the duplicates: '${messages.join(', ')}'.`);
      }
      defMap.set(name, definitionItem);
    }

    const result: FormValidatorInstance[] = [];
    for (const validatorConfigItem of (config ?? [])) {
      const name = validatorConfigItem.name;
      const def = defMap.get(name);
      if (!def) {
        throw new Error(`No validator definition has name '${name}', ` +
          `the available validators are: '${Array.from(defMap.keys()).sort().join(', ')}'.`);
      }
      const message = validatorConfigItem.message ?? def.message;
      const item = def.create(validatorConfigItem.options ?? {});
      result.push({name: name, message: message, validator: item});
    }
    this.loggerService.info(`Built ${result.length} validators from ${defMap.size} definitions.`, {definition:definition, config:config});
    return result;
  }
}

// TODO: these validation definitions need to be on the server-side, and provided to the client-side from the server.
// There are two sets of validator definitions - 1) shared / common definitions in the core; 2) definitions specific to a client.
//    These two set of definitions need to be merged and provided by the server to the client.

function getValidatorDefinitionOption(options: FormValidatorOptions | null | undefined, key: string): any | null {
  const value = _get(options ?? {}, key, undefined);
  if (value === undefined) {
    throw new Error(`Must define '${key}' in validator definition.`);
  }
  return value;
}

const EMAIL_REGEXP = /^(?=.{1,254}$)(?=.{1,64}@)[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;


const sharedValidatorDefinitions: FormValidatorDefinition[] = [
  // Based on:
  // angular built-in validators: https://github.com/angular/angular/blob/5105fd6f05f01f04873ab1c87d64079fd8519ad4/packages/forms/src/validators.ts
  // formly schema: https://github.com/ngx-formly/ngx-formly/blob/a2f7901b6c0895aee63b4b5fe748fc5ec0ad5475/src/core/src/lib/models/fieldconfig.ts
  {
    name: "min",
    message: "@validator-error-min",
    create: (options) => {
      const optionName = 'min';
      const min = getValidatorDefinitionOption(options, optionName);
      return (control) => {
        if (control.value == null || min == null) {
          return null; // don't validate empty values to allow optional controls
        }
        const value = parseFloat(control.value);
        // Controls with NaN values after parsing should be treated as not having a
        // minimum, per the HTML forms spec: https://www.w3.org/TR/html5/forms.html#attr-input-min
        return !isNaN(value) && value < min ? {[optionName]: {[optionName]: min, 'actual': control.value}} : null;
      };
    },
  },
  {
    name: "max",
    message: "@validator-error-max",
    create: (options) => {
      const optionName = 'max';
      const max = getValidatorDefinitionOption(options, optionName);
      return (control) => {
        if (control.value == null || max == null) {
          return null; // don't validate empty values to allow optional controls
        }
        const value = parseFloat(control.value);
        // Controls with NaN values after parsing should be treated as not having a
        // maximum, per the HTML forms spec: https://www.w3.org/TR/html5/forms.html#attr-input-max
        return !isNaN(value) && value > max ? {[optionName]: {[optionName]: max, 'actual': control.value}} : null;
      };
    },
  },
  {
    name: "minLength",
    message: "@validator-error-min-length",
    create: (options) => {
      const optionName = 'minLength';
      const minLength = getValidatorDefinitionOption(options, optionName);
      return (control) => {
        const length = control.value?.length ?? lengthOrSize(control.value);
        if (length === null || length === 0) {
          // don't validate empty values to allow optional controls
          // don't validate values without `length` or `size` property
          return null;
        }

        return length < minLength
          ? {[optionName]: {'requiredLength': minLength, 'actualLength': length}}
          : null;
      };
    }
  },
  {
    name: "maxLength",
    message: "@validator-error-max-length",
    create: (options) => {
      const optionName = 'maxLength';
      const maxLength = getValidatorDefinitionOption(options, optionName);
      return (control) => {
        const length = control.value?.length ?? lengthOrSize(control.value);
        if (length !== null && length > maxLength) {
          return {[optionName]: {'requiredLength': maxLength, 'actualLength': length}};
        }
        return null;
      };
    }
  },
  {
    name: "required",
    message: "@validator-error-required",
    create: (options) => {
      return (control) => {
        const optionName = 'required';
        if (control.value == null || lengthOrSize(control.value) === 0) {
          return {[optionName]: true};
        }
        return null;
      };
    }
  },
  {
    name: "requiredTrue",
    message: "@validator-error-required-true",
    create: (options) => {
      return (control) => {
        const optionName = 'required';
        return control.value === true ? null : {[optionName]: true};
      };
    }
  },
  {
    name: "email",
    message: "@validator-error-email",
    create: (options) => {
      return (control) => {
        const optionName = 'email';
        if (control.value == null || lengthOrSize(control.value) === 0) {
          return null; // don't validate empty values to allow optional controls
        }
        return EMAIL_REGEXP.test(control.value) ? null : {[optionName]: true};
      };
    }
  },
  {
    name: "pattern",
    message: "@validator-error-pattern",
    create: (options) => {
      const optionName = 'pattern';
      const pattern = getValidatorDefinitionOption(options, optionName);
      if (!pattern) {
        throw new Error(`Pattern validator requires a valid regex '${pattern}'.`);
      }
      let regex: RegExp;
      let regexStr: string;
      if (typeof pattern === 'string') {
        regexStr = '';

        if (pattern.charAt(0) !== '^') regexStr += '^';

        regexStr += pattern;

        if (pattern.charAt(pattern.length - 1) !== '$') regexStr += '$';

        regex = new RegExp(regexStr);
      } else {
        regexStr = pattern.toString();
        regex = pattern;
      }
      return (control) => {
        if (control.value == null || lengthOrSize(control.value) === 0) {
          return null; // don't validate empty values to allow optional controls
        }
        const value: string = control.value;
        return regex.test(value)
          ? null
          : {'pattern': {'requiredPattern': regexStr, 'actualValue': value}};
      };
    }
  }
];

/**
 * Extract the length property in case it's an array or a string.
 * Extract the size property in case it's a set.
 * Return null else.
 * @param value Either an array, set or undefined.
 */
function lengthOrSize(value: any) {
  // non-strict comparison is intentional, to check for both `null` and `undefined` values
  if (value == null) {
    return null;
  } else if (Array.isArray(value) || typeof value === 'string') {
    return value.length;
  } else if (value instanceof Set) {
    return value.size;
  }

  return null;
}
