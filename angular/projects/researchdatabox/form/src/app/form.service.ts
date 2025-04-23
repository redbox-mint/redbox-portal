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
import { isEmpty as _isEmpty, toLower as _toLower, merge as _merge, isUndefined as _isUndefined } from 'lodash-es';
import { FormComponentClassMap, FormFieldClassMap, StaticComponentClassMap, StaticFieldClassMap, FormFieldCompMapEntry } from './static-comp-field.dictionary';
import { FormConfig, FormFieldModel, LoggerService, FormFieldModelConfig, FormComponentConfig } from '@researchdatabox/portal-ng-common';
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
  protected fieldClassMap:FormFieldClassMap = {};

  constructor(
    @Inject(PortalNgFormCustomService) private customModuleFormCmpResolverService: PortalNgFormCustomService,
    @Inject(LoggerService) private loggerService: LoggerService,
    ) {
    // start with the static version
    _merge(this.fieldClassMap, StaticFieldClassMap);
    _merge(this.compClassMap, StaticComponentClassMap);
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
  public async get(oid: string, recordType: string, editMode: boolean, formName: string, modulePaths:string[]): Promise<any> {
    const formJson: FormConfig = {
      fields: [
        {
          model: {
            class: 'TextFieldModel',
            value: 'hello world!'
          },
          component: {
            class: 'TextFieldComponent',
            name: 'project_name'
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
    const fields = await this.resolveFormFieldClasses(formJson);
    // Instantiate the field classes
    this.createFormFieldModelInstances(fields);
    // Wire the events

    return fields;
  }

  public appendFormFieldType(additionalTypes: FormComponentClassMap) {
    _merge(this.compClassMap, additionalTypes);
  }

  protected async resolveFormFieldClasses(formConfig: FormConfig): Promise<FormFieldCompMapEntry[]> {
    const fieldArr = [];
    console.log('Resolving form field types...');
    console.log(formConfig);
    const formFields = formConfig.fields || [];
    for (let componentConfig of formFields) {
      let fieldClass: any;
      let componentClass: any;
      const fieldClassName:string = componentConfig.model?.class || '';
      let componentClassName:string = componentConfig.component?.class || '';
      if (_isEmpty(fieldClassName)) {
        this.loggerService.error(`Field class name is empty for component: ${JSON.stringify(componentConfig)}`);
        continue;
      }
      if (!_isEmpty(componentConfig.module)) {
        // TODO:
        // 1. for statically imported (e.g. modules) class doesn't have to be resolved here
        // 2. deal with genuine lazy-loading enabled components
        if (componentConfig.module == 'custom') {
          try {
            // try the static version first
            fieldClass = this.fieldClassMap[fieldClassName];
            if (_isUndefined(fieldClass) && !_isEmpty(componentClassName)) {
              // resolve the field class
              fieldClass = await this.customModuleFormCmpResolverService.getFieldClass(componentClassName);
            }
            // try the static version first
            componentClass = this.compClassMap[componentClassName || fieldClassName];
            if (_isUndefined(componentClass)) {
              // resolve the component class using the component class name and if unspecified, use the field class name
              componentClass = await this.customModuleFormCmpResolverService.getComponentClass(componentClassName || fieldClassName);
              this.compClassMap[componentClassName || fieldClassName] = typeof componentClass;
            }
          } catch (e) {
            this.loggerService.error(`Failed to resolve component: ${componentConfig.component}`);
          }
        }
      } else {
        // should be resolved already
        fieldClass = this.fieldClassMap[fieldClassName];
        // if the compClass isn't explicitly defined, use the field class name, make sure a 'default' component is defined for each field 
        componentClass = this.compClassMap[componentClassName || fieldClassName];
      }
      if (!_isUndefined(fieldClass)) {
        // TODO: handle missing field types
        if (!_isEmpty(componentClass)) {
          fieldArr.push({
            fieldClass: fieldClass,
            compClass: componentClass,
            json: componentConfig,
          } as FormFieldCompMapEntry);
        } else {
          console.error(`Component class with name: ${componentClassName} not found field class list. Check spelling and whether it is declared in the following list.`);
          console.error(this.compClassMap);
        }
      } else {
        console.error(`Field class with name: ${fieldClassName} not found field class list. Check spelling and whether it is declared in the following list.`);
        console.error(this.fieldClassMap);
      }
    }
    console.log('Resolved form field types:');
    console.log(fieldArr);
    return fieldArr;
  }
  
  protected createFormFieldModelInstances(fields:FormFieldCompMapEntry[]): FormFieldCompMapEntry[] {
    for (let fieldEntry of fields) {
      if (fieldEntry.fieldClass) {
        const field = new (fieldEntry.fieldClass as any) (fieldEntry.json as FormFieldModelConfig) as FormFieldModel;
        fieldEntry.field = field;
      } else {
        console.error(`Field class with name: ${fieldEntry.fieldClass} not found field class list. Check spelling and whether it is declared in the following list.`);
        console.error(this.fieldClassMap);
      }
    }
    return fields;
  }
}

