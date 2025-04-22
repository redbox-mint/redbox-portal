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
import { ComponentClassMap, FieldClassMap, StaticComponentClassMap, StaticFieldClassMap, FieldCompMapEntry } from './static-comp-field.dictionary';
import { FieldModel, FieldComponent, LoggerService, FieldComponentConfig } from '@researchdatabox/portal-ng-common';
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
  protected compClassMap:ComponentClassMap = {};
  protected fieldClassMap:FieldClassMap = {};

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
    const formJson = {
      fields: [
        {
          class: 'TextFieldModel',
          compClass: 'TextFieldComponent',
          component: {
            name: 'project_name',
            label: 'Project Name',
            type: 'text',
            value: 'hello world!'
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
    };
    // Resove the field and component pairs
    const fields = await this.resolveFormFieldTypes(formJson);
    // Instantiate the field classes
    this.createFieldInstances(fields);
    // Wire the events

    return fields;
  }

  public appendFormFieldType(additionalTypes: ComponentClassMap) {
    _merge(this.compClassMap, additionalTypes);
  }

  protected async resolveFormFieldTypes(formJson: any): Promise<FieldCompMapEntry[]> {
    const fieldArr = [];
    console.log('Resolving form field types...');
    console.log(formJson);
    for (let field of formJson.fields) {
      let fieldClass: any;
      let componentClass: any;
      if (!_isEmpty(field.module)) {
        // TODO:
        // 1. for statically imported (e.g. modules) class doesn't have to be resolved here
        // 2. deal with genuine lazy-loading enabled components
        if (field.module == 'custom') {
          try {
            // try the static version first
            fieldClass = this.fieldClassMap[field.class];
            if (_isUndefined(fieldClass)) {
              // resolve the field class
              fieldClass = await this.customModuleFormCmpResolverService.getFieldClass(field.class);
            }
            // try the static version first
            componentClass = this.compClassMap[field.compClass || field.class];
            if (_isUndefined(componentClass)) {
              // resolve the component class
              componentClass = await this.customModuleFormCmpResolverService.getComponentClass(field.component);
              this.compClassMap[field.component] = typeof componentClass;
            }
          } catch (e) {
            this.loggerService.error(`Failed to resolve component: ${field.component}`);
          }
        }
      } else {
        // should be resolved already
        fieldClass = this.fieldClassMap[field.class];
        // if the compClass isn't explicitly defined, use the field class name, make sure a 'default' component is defined for each field 
        componentClass = this.compClassMap[field.compClass || field.class];
      }
      if (!_isUndefined(fieldClass)) {
        // TODO: handle missing field types
        if (!_isEmpty(componentClass)) {
          fieldArr.push({
            fieldClass: fieldClass,
            compClass: componentClass,
            json: field,
          } as FieldCompMapEntry);
        } else {
          console.error(`Component class with name: ${field.compClass} not found field class list. Check spelling and whether it is declared in the following list.`);
          console.error(this.compClassMap);
        }
      } else {
        console.error(`Field class with name: ${field.class} not found field class list. Check spelling and whether it is declared in the following list.`);
        console.error(this.fieldClassMap);
      }
    }
    console.log('Resolved form field types:');
    console.log(fieldArr);
    return fieldArr;
  }
  
  protected createFieldInstances(fields:FieldCompMapEntry[]): FieldCompMapEntry[] {
    for (let fieldEntry of fields) {
      if (fieldEntry.fieldClass) {
        const field = new (fieldEntry.fieldClass as any) (fieldEntry.json as FieldComponentConfig) as FieldModel;
        fieldEntry.field = field;
      } else {
        console.error(`Field class with name: ${fieldEntry.fieldClass} not found field class list. Check spelling and whether it is declared in the following list.`);
        console.error(this.fieldClassMap);
      }
    }
    return fields;
  }
}