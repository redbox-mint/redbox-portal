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

import {Inject, Injectable, WritableSignal} from '@angular/core';
import {FormControl, FormGroup} from '@angular/forms';
import {isEmpty as _isEmpty, isUndefined as _isUndefined, merge as _merge, get as _get} from 'lodash-es';
import {
  FormComponentDefinition,
  FormConfig,
  FormFieldBaseComponent,
  FormFieldCompMapEntry, FormFieldComponentStatus,
  FormFieldModel,
  FormFieldModelConfig, FormStatus,
  LoggerService,
  UtilityService
} from '@researchdatabox/portal-ng-common';
import {PortalNgFormCustomService} from '@researchdatabox/portal-ng-form-custom';
import {
  FormComponentClassMap,
  FormFieldModelClassMap,
  StaticComponentClassMap,
  StaticModelClassMap
} from './static-comp-field.dictionary';

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
  protected logName = "FormService";
  protected compClassMap:FormComponentClassMap = {};
  protected modelClassMap:FormFieldModelClassMap = {};

  constructor(
    @Inject(PortalNgFormCustomService) private customModuleFormCmpResolverService: PortalNgFormCustomService,
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(UtilityService) private utilityService: UtilityService,
    ) {
    // start with the static version, will dynamically merge any custom components later
    _merge(this.modelClassMap, StaticModelClassMap);
    _merge(this.compClassMap, StaticComponentClassMap);
    this.loggerService.debug(`${this.logName}: Static component classes:`, this.compClassMap);
    this.loggerService.debug(`${this.logName}: Static model classes:`, this.modelClassMap);
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
            }
          },
          component: {
            class: 'TextFieldComponent'
          }
        },
        {
          // first group component
          name: 'group_1_component',
          layout: {
            class: 'DefaultLayoutComponent',
            config: {
              label: 'GroupField label',
              helpText: 'GroupField help',
            }
          },
          model: {
            name: 'group_1_model',
            class: 'GroupFieldModel',
            config: {
              defaultValue: {},
            }
          },
          component: {
            class: 'GroupFieldComponent',
            config: {
              componentDefinitions: [
                {
                  name: 'text_3',
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
                      value: 'hello world 3!',
                    }
                  },
                  component: {
                    class: 'TextFieldComponent'
                  }
                },
                {
                  name: 'text_4',
                  model: {
                    class: 'TextFieldModel',
                    config: {
                      value: 'hello world 4!',
                      defaultValue: 'hello world 4!'
                    }
                  },
                  component: {
                    class: 'TextFieldComponent'
                  }
                },
                {
                  // second group component, nested in first group component
                  name: 'group_2_component',
                  layout: {
                    class: 'DefaultLayoutComponent',
                    config: {
                      label: 'GroupField 2 label',
                      helpText: 'GroupField 2 help',
                    }
                  },
                  model: {
                    name: 'group_2_model',
                    class: 'GroupFieldModel',
                    config: {
                      defaultValue: {},
                    }
                  },
                  component: {
                    class: 'GroupFieldComponent',
                    config: {
                      componentDefinitions: [
                        {
                          name: 'text_5',
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
                              value: 'hello world 5!',
                            }
                          },
                          component: {
                            class: 'TextFieldComponent'
                          }
                        }
                      ]
                    }
                  }
                }
              ]
            }
          }
        }
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

  /**
   * Create form components from the form component definition configuration.
   *
   * @param formConfig The form configuration.
   * @returns The config and the components built from the config.
   */
  public async createFormComponentsMap(formConfig: FormConfig): Promise<FormComponentsMap> {
    const components = await this.resolveFormComponentClasses(formConfig?.componentDefinitions);
    // Instantiate the field classes, note these are optional, i.e. components may not have a form bound value
    this.createFormFieldModelInstances(components);
    return new FormComponentsMap(components, formConfig);
  }

  public appendFormFieldType(additionalTypes: FormComponentClassMap) {
    _merge(this.compClassMap, additionalTypes);
  }

  /**
   * Builds an array of form component details by using the config to find the component details.
   * @param componentDefinitions The config for the components.
   */
  public async resolveFormComponentClasses(componentDefinitions:  FormComponentDefinition[] | null | undefined): Promise<FormFieldCompMapEntry[]> {
    const fieldArr = [];
    this.loggerService.debug(`${this.logName}: resolving ${componentDefinitions?.length ?? 0} component definitions ${this.utilityService.getNames(componentDefinitions)}`);
    const components = componentDefinitions || [];
    for (let componentConfig of components) {
      let modelClass: typeof FormFieldModel | undefined = undefined;
      let componentClass: typeof FormFieldBaseComponent | undefined = undefined;
      let layoutClass: typeof FormFieldBaseComponent | undefined = undefined;
      const modelClassName:string = componentConfig.model?.class || '';
      let componentClassName:string = componentConfig.component?.class || '';
      let layoutClassName:string = componentConfig.layout?.class || '';
      if (_isEmpty(modelClassName)) {
        this.loggerService.error(`${this.logName}: model class name is empty for component.`, componentConfig);
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
            this.loggerService.error(`${this.logName}: failed to resolve component.`,{componentClassName: componentClassName, modelClassName: modelClassName});
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
          this.logNotAvailable(componentClassName, "component class", this.compClassMap);
        }
      } else {
        this.logNotAvailable(modelClassName, "model class", this.modelClassMap);
      }
    }
    this.loggerService.debug(`${this.logName}: resolved form component types:`, fieldArr);
    return fieldArr;
  }

  /**
   * Get a component class from the class name.
   * @param componentClassName The name of the component class.
   * @param module
   */
  public async getComponentClass(componentClassName: string, module?:string | null): Promise<typeof FormFieldBaseComponent | undefined> {
    if (_isEmpty(componentClassName)) {
      throw new Error(`${this.logName}: cannot get component class because the class name is empty.`);
    }
    this.loggerService.debug(`${this.logName}: get component class for name '${componentClassName}'.`);

    let componentClass = this.compClassMap[componentClassName];
    if (_isUndefined(componentClass) && !_isEmpty(module)) {
      componentClass = await this.customModuleFormCmpResolverService.getComponentClass(componentClassName);
    }
    if (_isUndefined(componentClass)) {
      this.logNotAvailable(componentClassName, "component class", this.compClassMap);
      throw new Error(`${this.logName}: cannot get component class with name '${componentClassName}' because it was not found in class list.`);
    }
    return componentClass
  }

  public createFormFieldModelInstances(components:FormFieldCompMapEntry[]): FormFieldCompMapEntry[] {
    this.loggerService.debug(`${this.logName}: create form field model instances from ${components?.length ?? 0} components ${this.utilityService.getNames(components)}.`);
    for (let compEntry of components) {
      if (compEntry.modelClass) {
        const model = new (compEntry.modelClass as any) (compEntry.compConfigJson.model as FormFieldModelConfig) as FormFieldModel;
        compEntry.model = model;
      } else {
        this.logNotAvailable(compEntry.modelClass ?? "(unknown)", "model class", this.modelClassMap);
      }
    }
    return components;
  }



  /**
   * Create maps so the component and control can be accessed using the component name.
   * @param compMap
   */
  public groupComponentsByName(compMap: FormComponentsMap): FormComponentsMap {
    this.loggerService.debug(`${this.logName}: group components by name`, compMap);
    const groupMap: any = {};
    const groupWithFormControl: any = {};
    for (let compEntry of compMap.components) {
      const fieldName:string = compEntry.compConfigJson.name;
      if (_isEmpty(fieldName)) {
        this.loggerService.info(`Field name is empty for component. If you need this component to be part of the form or participate in events, please provide a name.`, compEntry);
        continue;
      }
      if (groupMap[fieldName]) {
        throw new Error(`${this.logName}: Field name '${fieldName}' is already used. Names must be unique, please change the names to be unique. ` +
          `The components are: ${JSON.stringify([groupMap[fieldName], compEntry])}`);
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
   * Create the form group based on the form definition map.
   * @param formDefMap The form components map.
   */
  public createFormGroup(formDefMap: FormComponentsMap): {
    form: FormGroup,
    components: FormFieldCompMapEntry[]
  } | undefined {
    this.loggerService.debug(`${this.logName}: create form group`, formDefMap);
    if (formDefMap && formDefMap.formConfig) {
      const components = formDefMap.components;
      // set up the form group
      const formGroupMap = this.groupComponentsByName(formDefMap);
      this.loggerService.debug(`${this.logName}: form group map`, formGroupMap);
      // create the form group
      if (!_isEmpty(formGroupMap.withFormControl)) {
        return {form: new FormGroup(formGroupMap.withFormControl), components: components};
      } else {
        const msg = `No form controls found in the form definition. Form will not be rendered.`;
        this.loggerService.warn(`${this.logName}: ${msg}`);
        throw new Error(msg);
      }
    }
    return undefined;
  }

  /**
   * Notification hook for when components are ready.
   */
  public triggerComponentReady(
    name: string,
    formDefMap: FormComponentsMap | undefined,
    componentsLoaded: WritableSignal<boolean>,
    status: WritableSignal<FormStatus>
  ): void {
    if (formDefMap && formDefMap.components && !componentsLoaded()) {
      // Set the overall loaded flag to true if all components are loaded
      const componentsCount = formDefMap.components?.length ?? 0;
      const componentsReady = formDefMap.components.filter(componentDef =>
        componentDef.component && componentDef.component.status() === FormFieldComponentStatus.READY
      );
      const componentsNotReady = formDefMap.components.filter(componentDef =>
        !componentDef.component || componentDef.component.status() !== FormFieldComponentStatus.READY
      );
      componentsLoaded.set(componentsReady.length === componentsCount);

      const readyMsg = `Waiting for ${componentsNotReady.length} components to be ready ${this.utilityService.getNames(componentsNotReady)}. ` +
          `${componentsReady.length} components are ready ${this.utilityService.getNames(componentsReady)}`
      if (componentsLoaded()) {
        status.set(FormStatus.READY);
        this.loggerService.debug(`${this.logName}: All components for ${name} are ready. Form is ready to be used. ${readyMsg}`);
      } else{
        this.loggerService.debug(`${this.logName}: Waiting for components for ${name} to be ready. ${readyMsg}`);
      }
    }
  }

  private logNotAvailable(name: string, itemType: string, availableItems: { [index: string]: any }): void {
    this.loggerService.error(`${this.logName}: ${itemType} with name '${name}' not found in list. ` +
      `Check the spelling and whether it is declared in the following list.`, availableItems);
  }
}

/**
 *  This client-side, Angular specific data model of the downloaded form configuration.
 *  This includes Angular's FormControl instances for binding UI components to the form.
 */
export class FormComponentsMap {
  /**
   * The form component details create from the form configuration.
   */
  components: FormFieldCompMapEntry[];
  /**
   * The form configuration from the server.
   */
  formConfig: FormConfig;
  completeGroupMap: { [key: string]: FormFieldCompMapEntry } | undefined;
  /**
   * Mapping of name to angular FormControl. Used to create angular form.
   */
  withFormControl: { [key: string]: FormControl } | undefined;

  constructor(components: FormFieldCompMapEntry[], formConfig: FormConfig) {
    this.components = components;
    this.formConfig = formConfig;
    this.completeGroupMap = undefined;
    this.withFormControl = undefined;
  }
}
