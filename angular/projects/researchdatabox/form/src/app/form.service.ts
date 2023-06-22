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
import { isEmpty as _isEmpty, toLower as _toLower, merge as _merge } from 'lodash-es';
import { ComponentFieldMap, StaticComponentFieldMap } from './static-comp-field.dictionary';
import { LoggerService } from '@researchdatabox/portal-ng-common';
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
  protected formFieldTypeMap:ComponentFieldMap = {};

  constructor(
    @Inject(PortalNgFormCustomService) private customModuleFormCmpResolverService: PortalNgFormCustomService,
    @Inject(LoggerService) private loggerService: LoggerService,
    ) {
    // start with the static version
    _merge(this.formFieldTypeMap, StaticComponentFieldMap);
    
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
          class: 'TextField',
          definition: {
            name: 'project_name',
            label: 'Project Name',
            type: 'text',
            value: 'hello world!'
          }
        },
        {
          class: 'TextField',
          definition: {
            name: 'project_name',
            label: 'Project Name',
            type: 'text',
            value: 'hello world!'
          }
        },
        {
          class: 'WorkspaceField',
          component: 'FormCustomComponent',
          module: 'custom',
          definition: {
            name: 'project_name',
            label: 'Project Name',
            type: 'text',
            value: 'hello world!'
          }
        }
      ]
    };
    return await this.resolveFormFieldTypes(formJson);
  }

  public appendFormFieldType(additionalTypes: ComponentFieldMap) {
    _merge(this.formFieldTypeMap, additionalTypes);
  }

  protected async resolveFormFieldTypes(formJson: any) {
    const fieldArr = [];
    for (let field of formJson.fields) {
      let componentInfo = null;
      if (!_isEmpty(field.module)) {
        // TODO:
        // 1. for statically imported (e.g. modules) class doesn't have to be resolved here
        // 2. deal with genuine lazy-loading enabled components
        if (field.module == 'custom') {
          try {
            componentInfo = await this.customModuleFormCmpResolverService.getComponentClass(field.component);
            console.log(componentInfo);
            this.formFieldTypeMap[field.component] = componentInfo;
          } catch (e) {
            this.loggerService.error(`Failed to resolve component: ${field.component}`);
          }
        }
      } else {
        // should be resolved already
        componentInfo = this.formFieldTypeMap[field.class];
      }
      // TODO: handle missing field types
      if (!_isEmpty(componentInfo)) {
        fieldArr.push({
          componentInfo: componentInfo,
          data: field
        });
      }
    }
    return fieldArr;
  }
}