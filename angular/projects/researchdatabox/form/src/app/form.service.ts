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
import { FormControl , AbstractControl, FormGroup} from '@angular/forms';
import { isEmpty as _isEmpty, get as _get,  merge as _merge, isUndefined as _isUndefined } from 'lodash-es';
import { FormComponentClassMap, FormFieldModelClassMap, StaticComponentClassMap, StaticModelClassMap } from './static-comp-field.dictionary';
import {
  FormConfig,
  FormFieldModel,
  LoggerService,
  FormFieldModelConfig,
  FormFieldBaseComponent,
  FormFieldCompMapEntry,
  FormValidatorBlock,
  FormValidatorDefinition,
  FormValidatorFn,
  FormValidatorConfig,
  FormValidatorSummaryErrors,
  TranslationService,
  FormComponentDefinition,
} from '@researchdatabox/portal-ng-common';
import { PortalNgFormCustomService } from '@researchdatabox/portal-ng-form-custom';



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
    @Inject(TranslationService) private translationService: TranslationService,
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
  public async downloadFormComponents(oid: string, recordType: string, editMode: boolean, formName: string, modulePaths:string[]): Promise<FormComponentsMap> {
    const formConfig: FormConfig = {
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",

      // validatorDefinitions is the combination of redbox core validator definitions and
      // the validator definitions from the client hook form config.
      validatorDefinitions: sharedValidatorDefinitions,

      // TODO: a way to crate groups of validators
      // This is not implemented yet.
      // each group has a name, plus either which validators to 'exclude' or 'include', but not both.
      validatorProfiles: {
        // all: All validators (exclude none).
        all:{exclude:[]},
        // minimumSave: The minimum set of validators that must pass to be able to save (create or update).
        minimumSave: {include:['project_title']},
      },

      // Validators that operate on multiple fields.
      validators: [
        {name: 'different-values', config: {controlNames: ['text_1_event', 'text_2']}},
      ],

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
                { name: 'pattern', config: {pattern: /prefix.*/, description: "must start with prefix"} },
                { name: 'minLength', message:"@validator-error-custom-text_2", config: {minLength: 3}},
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
        {
          name: 'validation_summary_1',
          model: {name: 'validation_summary_2', class: 'ValidationSummaryFieldModel'},
          component: {class: "ValidationSummaryFieldComponent"}
        },
      ]
    } as FormConfig;
    // Resove the field and component pairs
    return this.createFormComponentsMap(formConfig);
  }

  public async createFormComponentsMap(formConfig: FormConfig): Promise<FormComponentsMap> {
    const components = await this.resolveFormComponentClasses(formConfig);
    // Instantiate the field classes, note these are optional, i.e. components may not have a form bound value
    this.createFormFieldModelInstances(components, formConfig);
    return new FormComponentsMap(components, formConfig);
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
            this.loggerService.error(`FormService failed to resolve component: ${componentClassName || modelClassName}`);
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
      componentClass = await this.customModuleFormCmpResolverService.getComponentClass(componentClassName);
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

  public groupComponentsByName(compMap: FormComponentsMap): FormComponentsMap {
    const groupMap: any = {};
    const groupWithFormControl: any = {};
    for (let compEntry of compMap.components) {
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
    compMap.completeGroupMap = groupMap;
    compMap.withFormControl = groupWithFormControl;
    return compMap;
  }

  public createFormValidatorInstances(
    definition: FormValidatorDefinition[] | null | undefined,
    config: FormValidatorBlock[] | null | undefined
  ): FormValidatorFn[] {
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

    const result: FormValidatorFn[] = [];
    for (const validatorConfigItem of (config ?? [])) {
      const name = validatorConfigItem.name;
      const def = defMap.get(name);
      if (!def) {
        throw new Error(`No validator definition has name '${name}', ` +
          `the available validators are: '${Array.from(defMap.keys()).sort().join(', ')}'.`);
      }
      const message = validatorConfigItem.message ?? def.message;
      const item = def.create({name: name, message: message, ...(validatorConfigItem.config ?? {})});
      result.push(item);
    }
    this.loggerService.info(`Built ${result.length} validators from ${defMap.size} definitions.`, {definition:definition, config:config});
    return result;
  }

  /**
   * Get the validation errors for the given control and all child controls.
   * @param componentDefs Gather the validation errors using these component definitions.
   * @param name The optional name of the control.
   * @param control The Angular control instance.
   * @param parents The names of the parent controls.
   * @param results The accumulated results.
   * @return An array of validation errors.
   */
  public getFormValidatorSummaryErrors(
    componentDefs: FormComponentDefinition[] | null | undefined,
    name: string | null | undefined = null,
    control: AbstractControl | null | undefined = null,
    parents: string[] | null = null,
    results: FormValidatorSummaryErrors[] | null = null,
  ): FormValidatorSummaryErrors[] {
    // Build a flattened array of control errors.
    // Include the names of the parent controls for each control.
    if (!parents) {
      parents = [];
    }
    if (!results) {
      results = [];
    }

    // control
    name = name || null;
    const componentDef = componentDefs
      ?.find(i => !!name && i?.name === name) ?? null;
    const {id, labelMessage} = this.componentIdLabel(componentDef);
    const errors = Object.entries(control?.errors ?? {})
        .map(([key, item]) => {
          return {
            name: key,
            message: item.message ?? null,
            params: {validatorName: key, ...item.params},
          }
        })
      ?? [];

    // Only add the result if there are errors.
    if (errors.length > 0) {
      results.push({id: id, message: labelMessage, errors: errors, parents: parents});
    }

    // child controls
    if ("controls" in (control ?? {})) {
      for (const [name, childControl] of Object.entries((control as FormGroup)?.controls ?? {})) {
        // Create a new array for the parents, so that the existing array of parent names is not modified.
        const newParents = !!name ? [...parents, name] : [...parents];
        this.getFormValidatorSummaryErrors(componentDefs, name, childControl, newParents, results);
      }
    }

    // output
    return results;
  }

  public getTopAncestorControl(control: AbstractControl | null | undefined) {
    let topLevel = control;
    while (topLevel?.parent) {
      topLevel = topLevel?.parent;
    }
    return topLevel;
  }

  /**
   * Get the component id and translatable label message.
   *
   * @param componentDef The component definition from the form config.
   */
  public componentIdLabel(componentDef: FormComponentDefinition | null): {
    id: string | null,
    labelMessage: string | null
  } {
    const idParts = ["form", "item", "id"];

    // id is built from the first of these that exists:
    // - componentDefinition.model.name
    // - componentDefinition.name
    const modelName = componentDef?.model?.name;
    const itemName = componentDef?.name;

    // construct the id so it is different to the model name
    const name = modelName || itemName || null;
    const id = name ? [...idParts, name.replaceAll('_', '-')].join('-') : null;

    // the label message comes from componentDefinition.layout.config.label
    const labelMessage = componentDef?.layout?.config?.label || null;

    // build the result
    return {id: id, labelMessage: labelMessage};
  }
}

// TODO: these validation definitions need to be on the server-side, and provided to the client-side from the server.
// There are two sets of validator definitions - 1) shared / common definitions in the core; 2) definitions specific to a client.
//    These two set of definitions need to be merged and provided by the server to the client.

function getValidatorDefinitionItem(config: FormValidatorConfig | null | undefined, key: string, defaultValue: any = undefined): any | null {
  const value = _get(config ?? {}, key, defaultValue);
  if (value === undefined) {
    throw new Error(`Must define '${key}' in validator definition config.`);
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
    create: (config) => {
      const optionNameKey = 'name';
      const optionNameValue = getValidatorDefinitionItem(config, optionNameKey, 'min');
      const optionMessageKey = 'message';
      const optionMessageValue = getValidatorDefinitionItem(config, optionMessageKey, '@validator-error-min');
      const optionMinKey = 'min';
      const optionMinValue = getValidatorDefinitionItem(config, optionMinKey);
      return (control) => {
        if (control.value == null || optionMinValue == null) {
          return null; // don't validate empty values to allow optional controls
        }
        const value = parseFloat(control.value);
        // Controls with NaN values after parsing should be treated as not having a
        // minimum, per the HTML forms spec: https://www.w3.org/TR/html5/forms.html#attr-input-min
        if (!isNaN(value) && value < optionMinValue) {
          return {
            [optionNameValue]: {
              [optionMessageKey]: optionMessageValue,
              params: {
                'requiredThreshold': optionMinValue,
                'actual': control.value,
              },
            },
          };
        }
        return null;
      };
    },
  },
  {
    name: "max",
    message: "@validator-error-max",
    create: (config) => {
      const optionNameKey = 'name';
      const optionNameValue = getValidatorDefinitionItem(config, optionNameKey, 'max');
      const optionMessageKey = 'message';
      const optionMessageValue = getValidatorDefinitionItem(config, optionMessageKey, "@validator-error-max");
      const optionMaxKey = 'max';
      const optionMaxValue = getValidatorDefinitionItem(config, optionMaxKey);
      return (control) => {
        if (control.value == null || optionMaxValue == null) {
          return null; // don't validate empty values to allow optional controls
        }
        const value = parseFloat(control.value);
        // Controls with NaN values after parsing should be treated as not having a
        // maximum, per the HTML forms spec: https://www.w3.org/TR/html5/forms.html#attr-input-max
        if (!isNaN(value) && value < optionMaxValue) {
          return {
            [optionNameValue]: {
              [optionMessageKey]: optionMessageValue,
              params: {
                'requiredThreshold': optionMaxValue,
                'actual': control.value,
              },
            },
          };
        }
        return null;
      };
    },
  },
  {
    name: "minLength",
    message: "@validator-error-min-length",
    create: (config) => {
      const optionNameKey = 'name';
      const optionNameValue = getValidatorDefinitionItem(config, optionNameKey, 'minLength');
      const optionMessageKey = 'message';
      const optionMessageValue = getValidatorDefinitionItem(config, optionMessageKey, "@validator-error-min-length");
      const optionMinLengthKey = 'minLength';
      const optionMinLengthValue = getValidatorDefinitionItem(config, optionMinLengthKey);
      return (control) => {
        const length = control.value?.length ?? lengthOrSize(control.value);
        if (length === null || length === 0) {
          // don't validate empty values to allow optional controls
          // don't validate values without `length` or `size` property
          return null;
        }

        return length < optionMinLengthValue
          ? {
            [optionNameValue]: {
              [optionMessageKey]: optionMessageValue,
              params: {
                'requiredLength': optionMinLengthValue,
                'actualLength': length,
              },
            },
          }
          : null;
      };
    }
  },
  {
    name: "maxLength",
    message: "@validator-error-max-length",
    create: (config) => {
      const optionNameKey = 'name';
      const optionNameValue = getValidatorDefinitionItem(config, optionNameKey, 'maxLength');
      const optionMessageKey = 'message';
      const optionMessageValue = getValidatorDefinitionItem(config, optionMessageKey, "@validator-error-max-length");
      const optionMaxLengthKey = 'maxLength';
      const optionMaxLengthValue = getValidatorDefinitionItem(config, optionMaxLengthKey);
      return (control) => {
        const length = control.value?.length ?? lengthOrSize(control.value);
        if (length !== null && length > optionMaxLengthValue) {
          return {
            [optionNameValue]: {
              [optionMessageKey]: optionMessageValue,
              params: {
                'requiredLength': optionMaxLengthValue,
                'actualLength': length,
              },
            },
          };
        }
        return null;
      };
    }
  },
  {
    name: "required",
    message: "@validator-error-required",
    create: (config) => {
      const optionNameKey = 'name';
      const optionNameValue = getValidatorDefinitionItem(config, optionNameKey, 'required');
      const optionMessageKey = 'message';
      const optionMessageValue = getValidatorDefinitionItem(config, optionMessageKey, "@validator-error-required");
      const optionRequiredKey = 'required';
      const optionRequiredValue = getValidatorDefinitionItem(config, optionRequiredKey, true);
      return (control) => {
        if (optionRequiredValue === true && (control.value == null || lengthOrSize(control.value) === 0)) {
          return {
            [optionNameValue]: {
              [optionMessageKey]: optionMessageValue,
              params: {
                'required': optionRequiredValue,
                'actual': control.value,
              },
            },
          };
        }
        return null;
      };
    }
  },
  {
    name: "requiredTrue",
    message: "@validator-error-required-true",
    create: (config) => {
      const optionNameKey = 'name';
      const optionNameValue = getValidatorDefinitionItem(config, optionNameKey, 'requiredTrue');
      const optionMessageKey = 'message';
      const optionMessageValue = getValidatorDefinitionItem(config, optionMessageKey, "@validator-error-required-true");
      const optionRequiredKey = 'requiredTrue';
      const optionRequiredValue = getValidatorDefinitionItem(config, optionRequiredKey, true);
      return (control) => {
        if (optionRequiredValue === true && control.value !== true) {
          return {
            [optionNameValue]: {
              [optionMessageKey]: optionMessageValue,
              params: {
                'required': optionRequiredValue,
                'actual': control.value,
              },
            },
          };
        }
        return null;
      };
    }
  },
  {
    name: "email",
    message: "@validator-error-email",
    create: (config) => {
      const optionNameKey = 'name';
      const optionNameValue = getValidatorDefinitionItem(config, optionNameKey, 'email');
      const optionMessageKey = 'message';
      const optionMessageValue = getValidatorDefinitionItem(config, optionMessageKey, "@validator-error-email");
      const optionPatternKey = 'pattern';
      const optionPatternValue = getValidatorDefinitionItem(config, optionPatternKey, EMAIL_REGEXP);
      return (control) => {
        if (control.value == null || lengthOrSize(control.value) === 0) {
          // don't validate empty values to allow optional controls
          return null;
        }
        if (!optionPatternValue.test(control.value)) {
          return {
            [optionNameValue]: {
              [optionMessageKey]: optionMessageValue,
              params: {
                'requiredPattern': optionPatternValue,
                'actual': control.value,
              },
            },
          };
        }
        return null;
      };
    }
  },
  {
    name: "pattern",
    message: "@validator-error-pattern",
    create: (config) => {
      const optionNameKey = 'name';
      const optionNameValue = getValidatorDefinitionItem(config, optionNameKey, 'pattern');
      const optionMessageKey = 'message';
      const optionMessageValue = getValidatorDefinitionItem(config, optionMessageKey, "@validator-error-pattern");
      const optionDescriptionKey = 'description';
      const optionDescriptionValue = getValidatorDefinitionItem(config, optionDescriptionKey);
      const optionPatternKey = 'pattern';
      const pattern = getValidatorDefinitionItem(config, optionPatternKey);
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
          : {
            [optionNameValue]: {
              [optionMessageKey]: optionMessageValue,
              params: {
                'requiredPattern': regexStr,
                'description': optionDescriptionValue,
                'actual': value,
              },
            },
          };
      };
    }
  },
  {
    name: "different-values",
    message: "@validator-error-different-values",
    create: (config) => {
      const optionNameKey = 'name';
      const optionNameValue = getValidatorDefinitionItem(config, optionNameKey, 'different-values');
      const optionMessageKey = 'message';
      const optionMessageValue = getValidatorDefinitionItem(config, optionMessageKey, "@validator-different-values");
      const optionControlNamesKey = 'controlNames';
      const optionControlNamesValue: string[] | null | undefined = getValidatorDefinitionItem(config, optionControlNamesKey);
      return (control) => {
        const controls = (optionControlNamesValue ?? [])?.map(n => control?.get(n)) ?? [];
        const values = new Set(controls?.map(c => c?.value) ?? []);
        return values.size === controls.length
          ? null
          : {
            [optionNameValue]: {
              [optionMessageKey]: optionMessageValue,
              params: {
                'controlNames': optionControlNamesValue,
                'controlCount': optionControlNamesValue?.length,
                'valueCount': values.size,
                'values': Array.from(values),
              },
            },
          };
      }
    }
  },
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

/**
 *  This client-side, Angular specific data model of the downloaded form configuration. This includes Angular's FormControl instances for binding UI components to the form.
 */
export class FormComponentsMap {
  components: FormFieldCompMapEntry[];
  formConfig: FormConfig;
  completeGroupMap: { [key: string]: FormFieldCompMapEntry } | undefined;
  withFormControl: { [key: string]: FormControl } | undefined;

  constructor(components: FormFieldCompMapEntry[], formConfig: FormConfig) {
    this.components = components;
    this.formConfig = formConfig;
    this.completeGroupMap = undefined;
    this.withFormControl = undefined;
  }
}
