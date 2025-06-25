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

import { Injectable, Inject, WritableSignal, inject } from '@angular/core';
import { FormControl , AbstractControl, FormGroup} from '@angular/forms';
import { isEmpty as _isEmpty, get as _get,  merge as _merge, isUndefined as _isUndefined } from 'lodash-es';
import { FormComponentClassMap, FormFieldModelClassMap, StaticComponentClassMap, StaticModelClassMap } from './static-comp-field.dictionary';
import {
  FormFieldModel,
  LoggerService,
  FormFieldBaseComponent,
  FormFieldCompMapEntry,
  TranslationService,
  UtilityService,
  HttpClientService,
  ConfigService,
  FormFieldModelValueType,
} from '@researchdatabox/portal-ng-common';
import { PortalNgFormCustomService } from '@researchdatabox/portal-ng-form-custom';
import {
  FormConfig,  FormFieldModelConfig,  FormComponentDefinition,
  FormFieldComponentStatus,
  FormStatus,
  FormValidatorDefinition,
  FormValidatorFn,
  FormValidatorSummaryErrors,
  ValidatorsSupport,
} from '@researchdatabox/sails-ng-common';
import {formValidatorsSharedDefinitions} from "./validators";
import {HttpClient} from "@angular/common/http";
import {APP_BASE_HREF} from "@angular/common";




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
export class FormService extends HttpClientService {
  protected logName = "FormService";
  protected compClassMap:FormComponentClassMap = {};
  protected modelClassMap:FormFieldModelClassMap = {};
  protected validatorsSupport: ValidatorsSupport;

  private requestOptions: Record<string, unknown> = {};

  constructor(
    @Inject(PortalNgFormCustomService) private customModuleFormCmpResolverService: PortalNgFormCustomService,
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(UtilityService) private utilityService: UtilityService,
    @Inject(HttpClient) protected override http: HttpClient,
    @Inject(APP_BASE_HREF) public override rootContext: string,
    @Inject(ConfigService) protected override configService: ConfigService,
    ) {
    super(http, rootContext, utilityService, configService)
    // start with the static version, will dynamically merge any custom components later
    _merge(this.modelClassMap, StaticModelClassMap);
    _merge(this.compClassMap, StaticComponentClassMap);
    this.loggerService.debug(`${this.logName}: Static component classes:`, this.compClassMap);
    this.loggerService.debug(`${this.logName}: Static model classes:`, this.modelClassMap);

    this.validatorsSupport = new ValidatorsSupport();
  }

  public override async waitForInit(): Promise<any> {
    await super.waitForInit();
    this.requestOptions = this.reqOptsJsonBodyOnly;

    if (!Object.hasOwn(this.requestOptions, 'headers')) {
      this.requestOptions['headers'] = {};
    }
    (this.requestOptions['headers'] as Record<string, string>)['X-ReDBox-Api-Version'] = '2.0';

    this.enableCsrfHeader();
    _merge(this.requestOptions, {context: this.httpContext});
    return this;
  }

  public get getValidatorsSupport(){
    return this.validatorsSupport;
  }

  /** *
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
    const formFields = await this.getFormFields(oid, recordType, editMode, formName);
    this.loggerService.info('Got form config:', formFields);

    const modelData = await this.getModelData(oid, recordType);
    this.loggerService.info('Got model data:', modelData);

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
          },
          expressions: {
            'model.value': {
                template: `<%= _.get(model,'text_1_event','') %>`
            }
          }
        },
        {
          name: 'text_2_event',
          model: {
            name: 'text_2_for_the_form',
            class: 'TextFieldModel',
            config: {
              value: 'hello world! component event',
              defaultValue: 'hello world! component event',
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
          name: 'text_2_component_event',
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
              value: 'hello world 2! component expression'
            }
          },
          component: {
            class: 'TextFieldComponent'
          },
          expressions: {
            'component.visible': {
                template: `<% if(_.isEmpty(_.get(model,'text_2_event',''))) {
                            return false;
                          } else {
                            return true;
                          } %>`
            }
          }
        },
        {
          name: 'text_3_event',
          model: {
            name: 'text_3_for_the_form',
            class: 'TextFieldModel',
            config: {
              value: 'hello world! layout event',
              defaultValue: 'hello world! layout event',
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
          name: 'text_3_layout_event',
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
              value: 'hello world 2! layout expression'
            }
          },
          component: {
            class: 'TextFieldComponent'
          },
          expressions: {
            'layout.visible': {
              template: `<% if(_.isEmpty(_.get(model,'text_3_event',''))) {
                            return false;
                          } else {
                            return true;
                          } %>`
            }
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
        },
        {
          name: 'repeatable_textfield_1',
          model: {
            class: 'RepeatableComponentModel',
            config: {
              value: ['hello world from repeatable value!'],
              defaultValue: ['hello world from repeatable, default!']
            }
          },
          component: {
            class: 'RepeatableComponent',
            config: {
              elementTemplate: {
                model: {
                  class: 'TextFieldModel',
                  config: {
                    wrapperCssClasses: 'col',
                    editCssClasses: 'redbox-form row',
                    defaultValue: 'hello world from elementTemplate!',
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
            },
          },
          layout: {
            class: 'DefaultLayoutComponent',
            config: {
              label: 'Repeatable TextField with default wrapper defined',
              helpText: 'Repeatable component help text',
            }
          },
        },
        {
          name: 'repeatable_group_1',
          model: {
            class: 'RepeatableComponentModel',
            config: {
              value: [ {
                text_3: "hello world from repeating groups"
              }]
            }
          },
          component: {
            class: 'RepeatableComponent',
            config: {
              elementTemplate: {
                // first group component
                name: 'group_1_component',
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
                    hostCssClasses: 'row',
                    componentDefinitions: [
                      {
                        name: 'text_3',
                        model: {
                          class: 'TextFieldModel',
                          config: {
                            value: 'hello world 3!',
                          }
                        },
                        component: {
                          class: 'TextFieldComponent',
                          config: {
                            hostCssClasses: '',
                            wrapperCssClasses: 'col'
                          }
                        }
                      },
                    ]
                  }
                }
              }
            },
          },
          layout: {
            class: 'DefaultLayoutComponent',
            config: {
              label: 'Repeatable TextField with default wrapper defined',
              helpText: 'Repeatable component help text',
            }
          },
        },
        {
          name: 'validation_summary_1',
          model: {name: 'validation_summary_2', class: 'ValidationSummaryFieldModel'},
          component: {class: "ValidationSummaryFieldComponent"}
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
    // Resolve the field and component pairs
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
    this.createFormFieldModelInstances(components, formConfig);
    return new FormComponentsMap(components, formConfig);
  }

  public appendFormFieldType(additionalTypes: FormComponentClassMap) {
    _merge(this.compClassMap, additionalTypes);
  }

  /**
   * Builds an array of form component details by using the config to find the component details.
   * @param componentDefinitions The config for the components.
   */
  public async resolveFormComponentClasses(componentDefinitions:  FormComponentDefinition<unknown>[] | null | undefined): Promise<FormFieldCompMapEntry[]> {
    const fieldArr = [];
    this.loggerService.debug(`${this.logName}: resolving ${componentDefinitions?.length ?? 0} component definitions ${this.utilityService.getNamesClasses(componentDefinitions)}`);
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

  public createFormFieldModelInstances(components:FormFieldCompMapEntry[], formConfig: FormConfig): void {
    this.loggerService.debug(`${this.logName}: create form field model instances from ${components?.length ?? 0} components ${this.utilityService.getNamesClasses(components)}.`);
    const validatorDefinitions = formConfig.validatorDefinitions;
    for (let compEntry of components) {
      this.createFormFieldModelInstance(compEntry, validatorDefinitions);
    }
  }

  public createFormFieldModelInstance(
    compMapEntry: FormFieldCompMapEntry,
    validatorDefinitions: FormValidatorDefinition[] | null | undefined
  ): FormFieldModel<unknown> | null {
    if (compMapEntry.modelClass) {
      const ModelType = compMapEntry.modelClass;
      const modelConfig = compMapEntry.compConfigJson.model as FormFieldModelConfig<unknown>;
      const validatorConfig = modelConfig?.config?.validators ?? [];
      const validators = this.getValidatorsSupport.createFormValidatorInstances(validatorDefinitions, validatorConfig);
      compMapEntry.model = new ModelType(modelConfig, validators) as FormFieldModel<unknown>;
      return compMapEntry.model;
    } else {
      this.logNotAvailable(compMapEntry.modelClass ?? "(unknown)", "model class", this.modelClassMap);
    }
    return null;
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
      const fieldName = compEntry.compConfigJson.name ?? "";
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
   * Get the validation errors for the given control and all child controls.
   * @param componentDefs Gather the validation errors using these component definitions.
   * @param name The optional name of the control.
   * @param control The Angular control instance.
   * @param parents The names of the parent controls.
   * @param results The accumulated results.
   * @return An array of validation errors.
   */
  public getFormValidatorSummaryErrors(
    componentDefs: FormComponentDefinition<unknown>[] | null | undefined,
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
  public componentIdLabel(componentDef: FormComponentDefinition<unknown> | null): {
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

      const readyMsg = `${componentsReady.length} child components are ready '${this.utilityService.getNamesClasses(componentsReady)}'.`
      if (componentsLoaded()) {
        status.set(FormStatus.READY);
        this.loggerService.debug(`${this.logName}: All components for ${name} are ready. Form is ready to be used. ${readyMsg}`);
      } else{
        const waitingMsg = `Component '${name}' is waiting for ${componentsNotReady.length} child components ${this.utilityService.getNamesClasses(componentsNotReady)}.to be ready.`;
        this.loggerService.debug(`${this.logName}: ${waitingMsg} ${readyMsg}`);
      }
    }
  }

  private logNotAvailable(name: string, itemType: string, availableItems: { [index: string]: any }): void {
    this.loggerService.error(`${this.logName}: ${itemType} with name '${name}' not found in list. ` +
      `Check the spelling and whether it is declared in the following list.`, availableItems);
  }

  /**
   * Apply the validators to the form control.
   */
  public setValidators(
    formControl: AbstractControl | null | undefined,
    validators?: FormValidatorFn[] | null | undefined
  ): void {
    // TODO: This method is duplicated in FormFieldModel.setValidators, see if they can be collapsed to one place.
    // set validators to the form control
    const validatorFns = validators?.filter(v => !!v) ?? [];
    this.loggerService.debug(`${this.logName}: setting validators to formControl`, {
      validators: validators,
      formControl: formControl
    });
    if (formControl && validatorFns.length > 0) {
      formControl?.setValidators(validatorFns);
      formControl?.updateValueAndValidity();
    }
  }

  /**
   * Get the form field configuration for the provided oid or recordtype.
   * @param oid The existing record id.
   * @param recordType The recordtype.
   * @param editable Whether the form config should be the editable form or not.
   * @param formName The optional name of the form.
   * @private
   */
  private async getFormFields(oid: string | null, recordType: string, editable: boolean, formName: string | null = null) {
    const ts = new Date().getTime().toString();

    const remainingPaths = oid ? `auto/${oid}` : `${recordType}`;
    const url = new URL(remainingPaths, `${this.brandingAndPortalUrl}/record/form/`);
    url.searchParams.set('ts', ts);
    url.searchParams.set('edit', editable?.toString() ?? 'false');
    if (formName) {
      url.searchParams.set('formName', formName?.toString());
    }

    this.loggerService.info(`Get form fields from url '${url}'.`);
    return await this.http.get<FormConfig>(url.href, this.requestOptions).toPromise();
  }

  /**
   * Get the model data for the given oid, or the form defaults if no oid if given.
   * @param oid The optional oid of an existing record.
   * @param recordType The recordtype.
   * @private
   */
  private async getModelData(oid?: string, recordType?: string) {
    if (!oid && !recordType) {
      throw new Error("Must provide oid or recordType.")
    }

    const ts = new Date().getTime().toString();

    const url = oid
      ? new URL(`${this.brandingAndPortalUrl}/record/metadata/${oid}`)
      : new URL(`${this.brandingAndPortalUrl}/record/default/${recordType}`);
    url.searchParams.set('ts', ts);

    this.loggerService.info(`Get model data from url '${url}'.`);
    return await this.http.get(url.href, this.requestOptions).toPromise();
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
