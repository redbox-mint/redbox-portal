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
import {AbstractControl, FormControl, FormGroup} from '@angular/forms';
import {isEmpty as _isEmpty, isUndefined as _isUndefined, merge as _merge, isPlainObject as _isPlainObject, get as _get} from 'lodash-es';
import {
  FormComponentClassMap,
  FormFieldModelClassMap,
  StaticComponentClassMap,
  StaticModelClassMap
} from './static-comp-field.dictionary';
import {
  ConfigService,
  FormFieldBaseComponent,
  FormFieldCompMapEntry,
  FormFieldModel,
  HttpClientService,
  LoggerService,
  TranslationService,
  UtilityService,
} from '@researchdatabox/portal-ng-common';
import {PortalNgFormCustomService} from '@researchdatabox/portal-ng-form-custom';
import {
  FormComponentDefinition,
  FormConfig,
  FormFieldComponentStatus,
  FormStatus, FormValidatorConfig, FormValidatorDefinition,
  FormValidatorFn,
  FormValidatorSummaryErrors,
  ValidatorsSupport,
} from '@researchdatabox/sails-ng-common';
import {HttpClient} from "@angular/common/http";
import {APP_BASE_HREF} from "@angular/common";

// redboxClientScript.formValidatorDefinitions is provided from index.bundle.js, via client-script.js
declare var redboxClientScript: { formValidatorDefinitions: FormValidatorDefinition[] };

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
  private loadedValidatorDefinitions?: FormValidatorDefinition[];

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
    // Get the form config from the server.
    // Includes the integrated model data (in componentDefinition.model.config.value) for rendering the form.
    const formConfig = await this.getFormConfig(oid, recordType, editMode, formName);
    if (!formConfig){
      throw new Error("Form config from server was empty.");
    }

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
    if (this.loadedValidatorDefinitions === null || this.loadedValidatorDefinitions === undefined) {
      // load the validator definitions to be used when constructing the form controls
      this.loadedValidatorDefinitions = redboxClientScript.formValidatorDefinitions;
      this.loggerService.debug(`Loaded validator definitions`, this.loadedValidatorDefinitions);
    }

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
  public async resolveFormComponentClasses(componentDefinitions:  FormComponentDefinition[] | null | undefined): Promise<FormFieldCompMapEntry[]> {
    const fieldArr = [];
    const names = componentDefinitions?.map(i => i?.name) ?? [];
    this.loggerService.info(`${this.logName}: resolving ${componentDefinitions?.length ?? 0} component definitions ${names.join(',')}`);
    const components = componentDefinitions || [];
    for (let componentConfig of components) {
      let modelClass: typeof FormFieldModel | undefined = undefined;
      let componentClass: typeof FormFieldBaseComponent | undefined = undefined;
      let layoutClass: typeof FormFieldBaseComponent | undefined = undefined;
      const modelClassName:string = componentConfig.model?.class || '';
      let componentClassName:string = componentConfig.component?.class || '';
      let layoutClassName:string = componentConfig.layout?.class || '';

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
      // Components may not have a model class, e.g. a static text component.
      let fieldDef = {};
      if (modelClass) {
        _merge(fieldDef, {
          modelClass: modelClass,
        });
      } else if (modelClassName) {
        this.logNotAvailable(modelClassName, "model class", this.modelClassMap);
      }
      if (componentClass) {
        _merge(fieldDef, {
          componentClass: componentClass,
          compConfigJson: componentConfig,
          layoutClass: layoutClass,
        });
      } else if (componentClassName) {
        this.logNotAvailable(componentClassName, "component class", this.compClassMap);
        // Dont' add to the array if the component class is not available
        fieldDef = {};
      }
      // if (modelClass) {
      //   if (componentClass) {

      //     fieldArr.push({
      //       modelClass: modelClass,
      //       componentClass: componentClass,
      //       compConfigJson: componentConfig,
      //       layoutClass: layoutClass,
      //     } as FormFieldCompMapEntry);
      //   } else {
      //     this.logNotAvailable(componentClassName, "component class", this.compClassMap);
      //   }
      // } else {
      //   this.logNotAvailable(modelClassName, "model class", this.modelClassMap);
      // }
      if (!_isEmpty(fieldDef)) {
        fieldArr.push(fieldDef as FormFieldCompMapEntry);
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
    const names = components?.map(i => i?.compConfigJson?.name) ?? [];
    this.loggerService.debug(`${this.logName}: create form field model instances from ${components?.length ?? 0} components ${names.join(',')}.`);
    for (let compEntry of components) {
      this.createFormFieldModelInstance(compEntry);
    }
  }

  public createFormFieldModelInstance(compMapEntry: FormFieldCompMapEntry): FormFieldModel<unknown> | null {
    const ModelType = compMapEntry.modelClass;
    const modelConfig = compMapEntry.compConfigJson.model;
    if (ModelType && modelConfig) {
      const validatorConfig = modelConfig?.config?.validators ?? [];
      const validators = this.createFormValidatorInstances(validatorConfig);
      compMapEntry.model = new ModelType(modelConfig, validators);
      return compMapEntry.model;
    } else {
      // Model is now optional, so we can return null if the model is not defined. Add appropriate warning to catch config errors.
      this.loggerService.warn(`${this.logName}: Model class or model config is not defined for component. If this is unexpected, check your form configuration.`, compMapEntry);
    }
    return null;
  }

  public createFormValidatorInstances(config: FormValidatorConfig[] | null | undefined): FormValidatorFn[] {
    return this.validatorsSupport.createFormValidatorInstances(this.loadedValidatorDefinitions, config)
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
          `The existing grouped component names are: ${Object.keys(groupMap).join(',')}`);
      }
      groupMap[fieldName] = compEntry;
      if (compEntry.model) {
        const model = compEntry.model;
        const formControl = model.getFormGroupEntry();
        if (formControl && fieldName) {
          groupWithFormControl[fieldName] = formControl;
        }
      } else {
        // Some components may not have a model themselves, but can 'contain' other components
        if (compEntry.formControlMap && !_isEmpty(compEntry.formControlMap)) {
          // traverse the model map and add the models to the group map
          for (const [name, formControl] of Object.entries(compEntry.formControlMap)) {
            if (formControl && name) {
              groupWithFormControl[name] = formControl;
            }
          }
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
    // const modelName = componentDef?.model?.name;
    const itemName = componentDef?.name;

    // construct the id so it is different to the model name
    const name = itemName || null;
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

      const namesReady = componentsReady?.map(i => i?.compConfigJson?.name) ?? [];
      const readyMsg = `${componentsReady.length} child components are ready '${namesReady.join(',')}'.`
      if (componentsLoaded()) {
        status.set(FormStatus.READY);
        this.loggerService.debug(`${this.logName}: All components for ${name} are ready. Form is ready to be used. ${readyMsg}`);
      } else{
        const namesNotReady = componentsNotReady?.map(i => i?.compConfigJson?.name) ?? [];
        const waitingMsg = `Component '${name}' is waiting for ${componentsNotReady.length} child components ${namesNotReady.join(',')} to be ready.`;
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
  private async getFormConfig(oid: string | null, recordType: string, editable: boolean, formName: string | null = null) {
    const ts = new Date().getTime().toString();

    const remainingPaths = oid ? `auto/${oid}` : `${recordType}`;
    const url = new URL(remainingPaths, `${this.brandingAndPortalUrl}/record/form/`);
    url.searchParams.set('ts', ts);
    url.searchParams.set('edit', editable?.toString() ?? 'false');
    if (formName) {
      url.searchParams.set('formName', formName?.toString());
    }

    const result = await this.http.get<{data: FormConfig}>(url.href, this.requestOptions).toPromise();
    this.loggerService.info(`Get form fields from url: ${url}`, result);
    return result?.data;
  }

  /**
   * Get the model data for the given oid, or the form defaults if no oid if given.
   * @param oid The optional oid of an existing record.
   * @param recordType The recordtype.
   */
  public async getModelData(oid?: string, recordType?: string): Promise<Record<string, unknown>> {
    if (!oid && !recordType) {
      throw new Error("Must provide oid or recordType.")
    }

    const ts = new Date().getTime().toString();

    const url = oid
      ? new URL(`${this.brandingAndPortalUrl}/record/metadata/${oid}`)
      : new URL(`${this.brandingAndPortalUrl}/record/default/${recordType}`);
    url.searchParams.set('ts', ts);

    const result = await this.http.get<{data: Record<string, unknown>}>(url.href, this.requestOptions).toPromise();
    this.loggerService.info(`Get model data from url: ${url}`, result);
    return result?.['data'] ?? {};
  }

  public async getDynamicImportFormStructureValidations(recordType: string, oid: string) {
    // TODO: Use this script to validate the form data model structure matches the form config.
    const path = ['dynamicAsset', 'formStructureValidations', recordType?.toString(), oid?.toString()];
    const result = await this.utilityService.getDynamicImport(this.brandingAndPortalUrl, path);
    return result;
  }

  public async getDynamicImportFormDataValidations(recordType: string, oid: string) {
    // TODO: Use this script to validate the form data model values match the form config.
    const path = ['dynamicAsset', 'formDataValidations', recordType?.toString(), oid?.toString()];
    const result = await this.utilityService.getDynamicImport(this.brandingAndPortalUrl, path);
    return result;
  }

  public async getDynamicImportFormExpressions(recordType: string, oid: string) {
    // TODO: Use this script to run the form data model expressions.
    const path = ['dynamicAsset', 'formExpressions', recordType?.toString(), oid?.toString()];
    const result = await this.utilityService.getDynamicImport(this.brandingAndPortalUrl, path);
    return result;
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
