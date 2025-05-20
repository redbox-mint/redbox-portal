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
import { FormControl } from '@angular/forms';
import { isEmpty as _isEmpty, toLower as _toLower, merge as _merge, isUndefined as _isUndefined, filter as _filter, forOwn as _forOwn } from 'lodash-es';
import { FormComponentClassMap, FormFieldModelClassMap, StaticComponentClassMap, StaticModelClassMap } from './static-comp-field.dictionary';
import { FormConfig, FormFieldModel, LoggerService, FormFieldModelConfig, FormFieldBaseComponent, FormFieldCompMapEntry } from '@researchdatabox/portal-ng-common';
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
      componentDefinitions: [
        {
          name: 'text_1_event',
          model: { 
            name: 'text_1_for_the_form',
            class: 'TextFieldModel',
            config: {
              value: 'hello world!',
              defaultValue: 'hello world!'
            }
          },
          component: {
            class: 'TextFieldComponent',
            config: {
              disabled: false
            }
          },
          expressions: {
            'config.visible': {
              template: `<% if(_.isEmpty(data)) {
                            return false;
                          } else {
                            return true;
                          } %>`,
              data: 'model.formControl.value',
              target: {
                 name: 'text_2',
                 class: 'TextFieldComponent'
              }
            }
          }
        },
        {
          name: 'text_2',
          layout: {
            class: 'DefaultLayoutComponent',
            config: {
              label: 'TextField with default layout defined',
              helpText: 'This is a help text for field 2',
              helpTextVisibleOnInit: false,
              visible: true,
              tooltips: { 'fieldTT': 'field tooltip', 'labelTT': 'label tooltip', }
            }
          },
          model: { 
            class: 'TextFieldModel',
            config: {
              value: 'hello world 2!',
            }
          },
          component: {
            class: 'TextFieldComponent',
            config: {
              visible: true,
              disabled: false,
              readonly: false
            }
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
    // Resove the field and component pairs
    return this.createFormComponentsMap(formConfig);
  }

  public async createFormComponentsMap(formConfig: FormConfig): Promise<FormComponentsMap> {
    const components = await this.resolveFormComponentClasses(formConfig);
    // Instantiate the field classes, note these are optional, i.e. components may not have a form bound value
    this.createFormFieldModelInstances(components);
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
  
  protected createFormFieldModelInstances(components:FormFieldCompMapEntry[]): FormFieldCompMapEntry[] {
    for (let compEntry of components) {
      if (compEntry.modelClass) {
        const model = new (compEntry.modelClass as any) (compEntry.compConfigJson.model as FormFieldModelConfig) as FormFieldModel;
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