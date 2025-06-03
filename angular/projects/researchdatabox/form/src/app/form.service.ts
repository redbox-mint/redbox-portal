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
  TranslationService,
  FormComponentDefinition,
} from '@researchdatabox/portal-ng-common';
import { PortalNgFormCustomService } from '@researchdatabox/portal-ng-form-custom';
import {
  FormValidatorSummaryErrors,
  ValidatorsSupport,
} from '@researchdatabox/sails-ng-common';
import {formValidatorsSharedDefinitions} from "./validators";



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
  protected validatorsSupport: ValidatorsSupport;

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

    this.validatorsSupport = new ValidatorsSupport();
  }

  public get getValidatorsSupport(){
    return this.validatorsSupport;
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
      validatorDefinitions: formValidatorsSharedDefinitions,

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
        const validators = this.getValidatorsSupport.createFormValidatorInstances(validatorDefinitions, validatorConfig);
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
