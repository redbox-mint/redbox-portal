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
import { isEmpty as _isEmpty, toLower as _toLower, merge as _merge, isUndefined as _isUndefined, filter as _filter, forOwn as _forOwn } from 'lodash-es';
import { FormComponentClassMap, FormFieldModelClassMap, StaticComponentClassMap, StaticModelClassMap, FormFieldCompMapEntry } from './static-comp-field.dictionary';
import { FormConfig, FormFieldModel, LoggerService, FormFieldModelConfig, FormFieldComponent } from '@researchdatabox/portal-ng-common';
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
  public async getFormComponents(oid: string, recordType: string, editMode: boolean, formName: string, modulePaths:string[]): Promise<any> {
    const formJson: FormConfig = {
      debugValue: true,
      components: [
        {
          name: 'text_1',
          model: { 
            class: 'TextFieldModel',
            value: 'hello world!'
          },
          component: {
            class: 'TextFieldComponent',
            label: 'TextField with wrapper:'
          }
        },
        // {
        //   class: 'FormCustomFieldModel',
        //   component: 'FormCustomComponent',
        //   module: 'custom',
        //   definition: {
        //     name: 'project_name',
        //     label: 'Project Name',
        //     type: 'text',
        //     value: 'hello world!'
        //   }
        // }
      ] 
    } as FormConfig;
    // const formConfig = (formJson as FormConfig);
    // Resove the field and component pairs
    const components = await this.resolveFormComponentClasses(formJson);
    // Instantiate the field classes, note these are optional, i.e. components may not have a form bound value
    this.createFormFieldModelInstances(components);
    return { components: components, formConfig: formJson };
  }

  public appendFormFieldType(additionalTypes: FormComponentClassMap) {
    _merge(this.compClassMap, additionalTypes);
  }

  protected async resolveFormComponentClasses(formConfig: FormConfig): Promise<FormFieldCompMapEntry[]> {
    const fieldArr = [];
    this.loggerService.debug('Resolving form component types...', formConfig);
    const components = formConfig.components || [];
    for (let componentConfig of components) {
      let modelClass: typeof FormFieldModel | undefined = undefined;
      let componentClass: typeof FormFieldComponent | undefined = undefined;
      const modelClassName:string = componentConfig.model?.class || '';
      let componentClassName:string = componentConfig.component?.class || '';
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
              modelClass = await this.customModuleFormCmpResolverService.getFieldClass(componentClassName);
            }
            // try the static version first
            componentClass = this.compClassMap[componentClassName || modelClassName];
            if (_isUndefined(componentClass)) {
              // resolve the component class using the component class name and if unspecified, use the field class name
              componentClass = await this.customModuleFormCmpResolverService.getComponentClass(componentClassName || modelClassName);
              this.compClassMap[componentClassName || modelClassName] = componentClass;
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
      }
      if (modelClass) {
        if (componentClass) {
          fieldArr.push({
            modelClass: modelClass,
            componentClass: componentClass,
            compConfigJson: componentConfig,
          } as FormFieldCompMapEntry);
        } else {
          console.error(`Component class with name: ${componentClassName} not found in class list. Check spelling and whether it is declared in the following list.`);
          console.error(this.compClassMap);
        }
      } else {
        console.error(`Model class with name: ${modelClassName} not found class list. Check spelling and whether it is declared in the following list.`);
        console.error(this.modelClassMap);
      }
    }
    this.loggerService.debug('Resolved form component types:', fieldArr);
    return fieldArr;
  }
  
  protected createFormFieldModelInstances(components:FormFieldCompMapEntry[]): FormFieldCompMapEntry[] {
    for (let compEntry of components) {
      if (compEntry.modelClass) {
        const model = new (compEntry.modelClass as any) (compEntry.compConfigJson.model as FormFieldModelConfig) as FormFieldModel;
        compEntry.model = model;
      } else {
        console.warn(`Model class with name: ${compEntry.modelClass} not found field class list. Check spelling and whether it is declared in the following list.`);
        console.error(this.modelClassMap);
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
}

