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
import {AbstractControl, FormControl} from '@angular/forms';
import {
  isEmpty as _isEmpty,
  isFinite as _isFinite,
  merge as _merge,
  set as _set,
  toNumber as _toNumber
} from 'lodash-es';
import {
  AllComponentClassMapType,
  AllLayoutClassMapType,
  AllModelClassMapType,
  getStaticComponentClassMap,
  getStaticLayoutClassMap,
  getStaticModelClassMap,
} from './static-comp-field.dictionary';
import {
  ConfigService,
  FormFieldBaseComponent,
  FormFieldComponentType,
  FormFieldCompMapEntry,
  FormFieldModel,
  HttpClientService,
  JSONataClientQuerySourceProperty,
  LoggerService, ModifyOptions,
  TranslationService,
  UtilityService
} from '@researchdatabox/portal-ng-common';
import {PortalNgFormCustomService} from '@researchdatabox/portal-ng-form-custom';
import {
  buildLineagePaths as buildLineagePathsHelper, DynamicScriptResponse,
  FieldModelDefinitionKind,
  FormComponentDefinitionFrame,
  FormComponentDefinitionKind,
  FormConfigFrame,
  FormFieldComponentStatus,
  FormFieldValidationGroup,
  FormModesConfig,
  FormStatus,
  FormValidationGroups,
  FormValidatorComponentErrors,
  FormValidatorConfig,
  FormValidatorDefinition,
  FormValidatorFn,
  FormValidatorSummaryErrors,
  getObjectWithJsonPointer,
  JSONataQueryRuntimeContext,
  JSONataQuerySource,
  JSONataQuerySourceProperty,
  KindNameDefaultsMap,
  KindNameDefaultsMapType,
  LineagePaths,
  queryJSONata,
  ValidatorsSupport,
} from '@researchdatabox/sails-ng-common';
import {HttpClient} from "@angular/common/http";
import {APP_BASE_HREF} from "@angular/common";
import {firstValueFrom} from "rxjs";
import {FormValidationGroupsChangeInitial} from "./form-state";


// redboxClientScript.formValidatorDefinitions is provided from index.bundle.js, via client-script.js
declare var redboxClientScript: { formValidatorDefinitions: FormValidatorDefinition[] };

interface SuggestedValidatorSummaryCacheEntry {
  validatorKey: string;
  valueKey: string;
  validatorFns: FormValidatorFn[];
  errors: FormValidatorComponentErrors[];
}

/**
 *
 * Responsible for retrieving form configuration and building form components.
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
  protected compClassMap: AllComponentClassMapType = {};
  protected modelClassMap: AllModelClassMapType = {};
  protected layoutClassMap: AllLayoutClassMapType = {};
  protected kindNameDefaultsMap: KindNameDefaultsMapType;
  protected validatorsSupport: ValidatorsSupport;

  private requestOptions: Record<string, unknown> = {};
  private loadedValidatorDefinitions?: Map<string, FormValidatorDefinition>;
  // Suggested validation is read from template getters, so cache by control to avoid rebuilding validators on every change detection pass.
  private suggestedValidatorSummaryCache = new WeakMap<AbstractControl, SuggestedValidatorSummaryCacheEntry>();

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
    _merge(this.modelClassMap, getStaticModelClassMap());
    this.loggerService.debug(`${this.logName}: Static component classes:`,
      Object.fromEntries(Object.entries(this.compClassMap).map(([key, value]) => [key, value.name]))
    );

    _merge(this.compClassMap, getStaticComponentClassMap());
    this.loggerService.debug(`${this.logName}: Static model classes:`,
      Object.fromEntries(Object.entries(this.modelClassMap).map(([key, value]) => [key, value.name]))
    );

    _merge(this.layoutClassMap, getStaticLayoutClassMap());
    this.loggerService.debug(`${this.logName}: Static layout classes:`,
      Object.fromEntries(Object.entries(this.layoutClassMap).map(([key, value]) => [key, value?.constructor?.name]))
    );

    this.kindNameDefaultsMap = KindNameDefaultsMap;

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
    _merge(this.requestOptions, { context: this.httpContext });
    return this;
  }

  /**
   * Download and consequently loads the form config.
   *
   * Fields can use:
   * - components that are included in this app module
   * - components
   *
   * Returns:
   *  array of form fields containing the corresponding component information, ready for rendering.
   */
  public async downloadFormComponents(oid: string, recordType: string, editMode: boolean, formName: string, modulePaths: string[]): Promise<FormComponentsMap> {
    // Get the form config from the server.
    // Includes the integrated model data (in componentDefinition.model.config.value) for rendering the form.
    const formConfigResp = await this.getFormConfig(oid, recordType, editMode, formName);
    const formConfig = formConfigResp?.data;
    const formConfigMeta = formConfigResp?.meta ?? {};
    if (!formConfig) {
      throw new Error("Form config from server was empty.");
    }

    // This form config is the top of the lineage.
    const parentLineagePaths = this.buildLineagePaths({
      angularComponents: [],
      dataModel: [],
      formConfig: ['componentDefinitions'],
      layout: [],
    });

    // Resolve the field and component pairs
    return this.createFormComponentsMap(formConfig, parentLineagePaths, formConfigMeta);
  }

  /**
   * Create form components from the form component definition configuration.
   *
   * @param formConfig The form configuration.
   * @param parentLineagePaths The linage paths of the parent item.
   * @param meta The metadata from the API request to get the form config.
   * @returns The config and the components built from the config.
   */
  public async createFormComponentsMap(
    formConfig: FormConfigFrame, parentLineagePaths: LineagePaths, meta?: Record<string, unknown>): Promise<FormComponentsMap> {
    if (this.loadedValidatorDefinitions === null || this.loadedValidatorDefinitions === undefined) {
      // load the validator definitions to be used when constructing the form controls
      this.loadedValidatorDefinitions = this.validatorsSupport.createValidatorDefinitionMapping(redboxClientScript.formValidatorDefinitions);
      this.loggerService.debug(`Loaded validator definitions`, this.loadedValidatorDefinitions);
    }

    const componentDefinitions = Array.isArray(formConfig?.componentDefinitions) ? formConfig?.componentDefinitions : [];

    // The formConfig might be a synthetic one, built only for this method.
    // So, don't add 'componentDefinitions' to the lineage paths.
    // The lineage paths passed to this method are expected to reflect the real structure.
    const components = await this.resolveFormComponentClasses(componentDefinitions, parentLineagePaths);

    // Instantiate the field classes, note these are optional, i.e. components may not have a form bound value
    this.createFormFieldModelInstances(components, formConfig?.enabledValidationGroups, formConfig?.validationGroups);
    return new FormComponentsMap(components, formConfig, meta);
  }

  /**
   * Builds an array of form component details by using the config to find the component details.
   * @param componentDefinitions The config for the components.
   * @param parentLineagePaths The linage paths of the parent item.
   */
  public async resolveFormComponentClasses(componentDefinitions: FormComponentDefinitionFrame[], parentLineagePaths: LineagePaths): Promise<FormFieldCompMapEntry[]> {
    const fieldArr: FormFieldCompMapEntry[] = [];
    const compDefInfo = componentDefinitions?.map(i => `'${i?.name}':${i?.component?.class}`) ?? [];
    this.loggerService.info(`${this.logName}: resolving ${componentDefinitions?.length ?? 0} component definitions ${compDefInfo.join(',')}`);
    const components = componentDefinitions || [];
    for (let index = 0; index < components.length; index++) {
      const componentConfig = components[index];

      const componentName = componentConfig?.name;
      const isModuleCustom = componentConfig.module === 'custom';

      let modelClass: typeof FormFieldModel<unknown> | undefined = undefined;
      let componentClass: FormFieldComponentType | undefined = undefined;
      let layoutClass: FormFieldComponentType | undefined = undefined;

      const modelClassName = componentConfig.model?.class || '';
      const componentClassName = componentConfig.component?.class || '';
      const layoutClassName = componentConfig.layout?.class || '';

      try {
        // Resolve the model. The model is only available for some components.
        // TODO: If the model is available for a component, it must be resolved. Can this be enforced?
        if (modelClassName && modelClassName in this.modelClassMap) {
          modelClass = this.modelClassMap[modelClassName];
          if (modelClass) {
            this.loggerService.debug(`${this.logName}: found static map model '${modelClassName}': '${modelClass.name}'.`);
          }
        }
        if (modelClassName && modelClass === undefined && isModuleCustom) {
          modelClass = await this.customModuleFormCmpResolverService.getFieldClass(modelClassName);
          if (modelClass) {
            this.loggerService.debug(`${this.logName}: found custom module model '${modelClassName}': '${modelClass.name}'.`);
            // If the custom model was found, cache it in the class map
            this.modelClassMap[modelClassName] = modelClass;
          }
        }

        // Resolve the component. A component is required.
        // A 'default' component can be defined for each field on the server-side.
        if (componentClassName && componentClassName in this.compClassMap) {
          componentClass = this.compClassMap[componentClassName];
          if (componentClass) {
            this.loggerService.debug(`${this.logName}: found static map component '${componentClassName}': '${componentClass.name}'.`);
          }
        }
        if (componentClassName && componentClass === undefined && isModuleCustom) {
          // Check for a custom component.
          componentClass = await this.customModuleFormCmpResolverService.getComponentClass(componentClassName);
          if (componentClass) {
            this.loggerService.debug(`${this.logName}: found custom module component '${componentClassName}': '${componentClass.name}'.`);
            // If the custom component was found, cache it in the class map
            this.compClassMap[componentClassName] = componentClass;
          }
        }

        // Resolve the layout. A layout is optional.
        if (layoutClassName && layoutClassName in this.layoutClassMap) {
          layoutClass = this.layoutClassMap[layoutClassName] ?? undefined;
          if (layoutClass) {
            this.loggerService.debug(`${this.logName}: found static map layout '${layoutClassName}': '${layoutClass.name}'.`);
          }
        }
        if (layoutClassName && layoutClass === undefined && isModuleCustom) {
          // Check for a custom component.
          layoutClass = await this.customModuleFormCmpResolverService.getComponentClass(layoutClassName);
          if (layoutClass) {
            this.loggerService.debug(`${this.logName}: found custom module layout '${layoutClassName}': '${layoutClass.name}'.`);
            // If the custom component was found, cache it in the class map
            this.layoutClassMap[layoutClassName] = layoutClass;
          }
        }

      } catch (error) {
        this.loggerService.error(`${this.logName}: failed to resolve '${componentName}' ` +
          `with component '${componentClassName}' model '${modelClassName}' layout '${layoutClassName}'`, error);
      }

      // Compose the field definition.
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
        // Don't add to the array if the component class is not available
        fieldDef = {};
      }

      if (componentConfig?.expressions) {
        _set(fieldDef, 'expressions', componentConfig.expressions);
      }

      // Add the field definition to the list if it has the minimum requirements.
      if (!_isEmpty(fieldDef)) {
        _merge(fieldDef, {
          // TODO: This may need a check for whether the dataModel should include the component name or not.
          //       Maybe use formService.shouldIncludeInFormControlMap?
          lineagePaths: this.buildLineagePaths(parentLineagePaths, {
            angularComponents: [componentName],
            dataModel: modelClass ? [componentName] : [],
            formConfig: [index],
            layout: [`${componentName}-layout`],
          }),
        });
        fieldArr.push(fieldDef as FormFieldCompMapEntry);
      }
    }
    this.loggerService.info(`${this.logName}: resolved form component types:`, fieldArr);
    return fieldArr;
  }

  public createFormFieldModelInstances(
    components: FormFieldCompMapEntry[], enabledValidationGroups?: string[] | null, validationGroups?: FormValidationGroups | null
  ): void {
    const names = components?.map(i => i?.compConfigJson?.name) ?? [];
    this.loggerService.debug(`${this.logName}: create form field model instances from ${components?.length ?? 0} components ${names.join(',')}.`);
    for (let compEntry of components) {
      this.createFormFieldModelInstance(compEntry, enabledValidationGroups, validationGroups);
    }
  }

  public createFormFieldModelInstance(
    compMapEntry: FormFieldCompMapEntry, enabledValidationGroups?: string[] | null, validationGroups?: FormValidationGroups | null
  ): FormFieldModel<unknown> | null {
    const ModelType = compMapEntry.modelClass;
    const modelConfig = compMapEntry.compConfigJson.model;

    const componentClassName = compMapEntry?.compConfigJson?.component?.class;
    const name = compMapEntry?.compConfigJson?.name;
    const layoutClassName = compMapEntry?.compConfigJson?.layout?.class;
    const modelClassName = compMapEntry?.compConfigJson?.model?.class;

    if (ModelType && modelConfig) {
      compMapEntry.model = new ModelType(modelConfig);
      const formControl = compMapEntry.model.formControl;
      const validators = compMapEntry.model.validators;
      this.setValidators(formControl, validators, enabledValidationGroups, validationGroups);
      return compMapEntry.model;
    }

    // Check if there is a default model class name for this field component.
    const sourceDefaultsMap = this.kindNameDefaultsMap.get(FormComponentDefinitionKind);
    const targetDefaultsMap = sourceDefaultsMap?.get(componentClassName);
    const modelClassDefaultName = targetDefaultsMap?.get(FieldModelDefinitionKind);
    const hasModelClassDefault = modelClassDefaultName !== undefined && modelClassDefaultName !== null;

    if (hasModelClassDefault) {
      // If there is a default model class name, then assume that there must be a model class.
      // It is an error to not provide ModelType or not provide modelConfig when there is a default model class name.
      throw new Error(`${this.logName}: Model class or model config is not defined for component name ${JSON.stringify(name)}. ` +
        `Component class ${JSON.stringify(componentClassName)} layout class ${JSON.stringify(layoutClassName)} model class ${JSON.stringify(modelClassName)}. ` +
        `The assumption is that if there is a default model class '${JSON.stringify(modelClassDefaultName)}', then a model class must be provided.`);
    }

    // Model is optional, so we can return null if the model is not defined and there is no default model class name.
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

      // Populate the map of name to compEntry.
      if (groupMap[fieldName]) {
        throw new Error(`${this.logName}: Field name '${fieldName}' is already used. Names must be unique, please change the names to be unique. ` +
          `The existing grouped component names are: ${Object.keys(groupMap).join(',')}`);
      }
      groupMap[fieldName] = compEntry;

      // const includeInFormControlMap = this.shouldIncludeInFormControlMap(compEntry);
      // if (!includeInFormControlMap) {
      //   continue;
      // }

      // Populate the map of name to form control.
      if (compEntry.model) {
        const model = compEntry.model;
        const formControl = model.formControl;
        if (formControl && fieldName) {
          groupWithFormControl[fieldName] = formControl;
        }
      } else {
        // Some components may not have a model themselves, but can 'contain' other components.
        if (compEntry.formControlMap && !_isEmpty(compEntry.formControlMap)) {
          // Traverse the model map and add the models to the group map.
          // The form controls added here are child form controls.
          // We made the design choice to add them to the parent level to make them available.
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

  public shouldIncludeInFormControlMap(compEntry: FormFieldCompMapEntry | null | undefined): boolean {
    if (!compEntry) {
      return false;
    }

    const modelDisabled = compEntry.compConfigJson?.model?.config?.disabled === true;
    const componentDisabled = compEntry.compConfigJson?.component?.config?.disabled === true;
    const layoutDisabled = compEntry.compConfigJson?.layout?.config?.disabled === true;
    return !(modelDisabled || componentDisabled || layoutDisabled);
  }

  /**
   * Get the flat array of validation errors for the given component and all child components.
   * @param mapEntry Gather the validation errors for this component.
   * @return An array of validation errors.
   */
  public getFormValidatorSummaryErrors(mapEntry: FormFieldCompMapEntry | null): FormValidatorSummaryErrors[] {
    const result: FormValidatorSummaryErrors[] = [];

    if (!mapEntry) {
      this.loggerService.warn(`Cannot get form validator summary errors due to missing mapEntry.`);
      return result;
    }

    // Get form component id and label.
    const { id, labelMessage } = this.componentIdLabel(mapEntry.compConfigJson);

    // Get the validation errors from the form control.
    const formControl = mapEntry.model?.formControl;
    const lineagePaths = mapEntry.lineagePaths;
    if (formControl && lineagePaths) {
      const errors = this.getFormValidatorComponentErrors(formControl);
      if (errors.length > 0) {
        result.push({ id, message: labelMessage, errors, lineagePaths });
      }
    }

    // Get the validation errors from any child controls.
    for (const childMapEntry of mapEntry.component?.formFieldCompMapEntries ?? []) {
      result.push(...this.getFormValidatorSummaryErrors(childMapEntry));
    }

    return result;
  }

  /**
   * Evaluate validators for advisory validation groups without attaching them to controls.
   */
  public getSuggestedValidatorSummaryErrors(
    mapEntry: FormFieldCompMapEntry | null,
    enabledValidationGroups: string[],
    validationGroups: FormValidationGroups
  ): FormValidatorSummaryErrors[] {
    const result: FormValidatorSummaryErrors[] = [];

    if (!mapEntry) {
      this.loggerService.warn(`Cannot get suggested validator summary errors due to missing mapEntry.`);
      return result;
    }

    if (enabledValidationGroups.length === 0) {
      return result;
    }

    if (!this.shouldIncludeInFormControlMap(mapEntry)) {
      // Advisory validators should mirror normal form validation and ignore fields disabled by config.
      return result;
    }

    const formControl = mapEntry.model?.formControl;
    const validators = mapEntry.model?.validators ?? [];
    const lineagePaths = mapEntry.lineagePaths;
    if (formControl && !formControl.disabled && lineagePaths && validators.length > 0) {
      const errors = this.getCachedSuggestedValidatorComponentErrors(
        formControl,
        validators,
        enabledValidationGroups,
        validationGroups
      );
      if (errors.length > 0) {
        const { id, labelMessage } = this.componentIdLabel(mapEntry.compConfigJson);
        result.push({ id, message: labelMessage, errors, lineagePaths });
      }
    }

    for (const childMapEntry of mapEntry.component?.formFieldCompMapEntries ?? []) {
      result.push(...this.getSuggestedValidatorSummaryErrors(childMapEntry, enabledValidationGroups, validationGroups));
    }

    return result;
  }

  /**
   * Advisory summaries execute validators outside Angular's normal control pipeline.
   * Cache the expensive validator construction and last error result so template reads
   * stay cheap while still recalculating when validation config or form values change.
   */
  private getCachedSuggestedValidatorComponentErrors(
    formControl: AbstractControl,
    validators: FormValidatorConfig[],
    enabledValidationGroups: string[],
    validationGroups: FormValidationGroups
  ): FormValidatorComponentErrors[] {
    const validatorKey = this.getSuggestedValidatorCacheKey(validators, enabledValidationGroups, validationGroups);
    // Validator output can depend on sibling fields, so include the root form value as well as this control's own value.
    const valueKey = this.getSuggestedValidatorValueKey(formControl);
    const cached = this.suggestedValidatorSummaryCache.get(formControl);

    if (cached?.validatorKey === validatorKey && cached.valueKey === valueKey) {
      return cached.errors;
    }

    const availableGroups = validationGroups ?? {};
    const enabledValidators = this.validatorsSupport.enabledValidators(availableGroups, enabledValidationGroups, validators);
    const validatorFns = cached?.validatorKey === validatorKey
      ? cached.validatorFns
      : this.validatorsSupport.createFormValidatorInstancesFromMapping(
        this.loadedValidatorDefinitions ?? new Map<string, FormValidatorDefinition>(),
        enabledValidators
      );
    const errors = validatorFns.flatMap((validatorFn) =>
      this.validatorsSupport.getFormValidatorComponentErrors(validatorFn(formControl))
    );

    this.suggestedValidatorSummaryCache.set(formControl, {
      validatorKey,
      valueKey,
      validatorFns,
      errors,
    });

    return errors;
  }

  private getSuggestedValidatorCacheKey(
    validators: FormValidatorConfig[],
    enabledValidationGroups: string[],
    validationGroups: FormValidationGroups
  ): string {
    return JSON.stringify({
      enabledValidationGroups,
      validationGroups: validationGroups ?? {},
      validators,
    });
  }

  private getSuggestedValidatorValueKey(formControl: AbstractControl): string {
    return JSON.stringify({
      disabled: formControl.disabled,
      value: formControl.value,
      rootValue: formControl.root?.value,
    });
  }

  /**
   * Get the form validator errors for a component's control.
   * @param control
   */
  public getFormValidatorComponentErrors(control: AbstractControl | null | undefined): FormValidatorComponentErrors[] {
    return this.validatorsSupport.getFormValidatorComponentErrors(control?.errors ?? {});
  }

  /**
   * Get the component id and translatable label message.
   *
   * @param componentDef The component definition from the form config.
   */
  public componentIdLabel(componentDef: FormComponentDefinitionFrame | null): {
    id: string | null,
    labelMessage: string | null
  } {
    const idParts = ["form", "item", "id"];

    const itemName = componentDef?.name;

    // construct the id so it is different to the model name
    const name = itemName || null;
    const id = name ? [...idParts, name.replaceAll('_', '-')].join('-') : null;

    // the label message comes from componentDefinition.layout.config.label
    const labelMessage = componentDef?.layout?.config?.label || null;

    // build the result
    return { id: id, labelMessage: labelMessage };
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
      } else {
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
   * @param formControl Apply the enabled validators to this form control.
   * @param validators All validators configured on this component.
   * @param enabledValidationGroups The validation group names that are currently enabled. No groups means all validators are enabled.
   * @param validationGroups The available validation groups.
   * @param updateValueAndValidityOpts Recalculates the value and validation status of the control.
   *    By default, it also updates the value and validity of its ancestors.
   */
  public setValidators(
    formControl?: AbstractControl | null,
    validators?: FormValidatorConfig[] | null,
    enabledValidationGroups?: string[] | null,
    validationGroups?: FormValidationGroups | null,
    updateValueAndValidityOpts?: { doUpdate?: boolean } & ModifyOptions,
  ): void {
    if (!formControl) {
      this.loggerService.warn(`${this.logName}: Cannot set validators because formControl was not provided.`);
      return;
    }

    if (!validators) {
      validators = [];
    }

    // Get the form-level configs.
    const defMap = this.loadedValidatorDefinitions ?? new Map<string, FormValidatorDefinition>();
    const availableGroups = validationGroups ?? {};

    if (!enabledValidationGroups) {
      enabledValidationGroups = [];
    }

    // Filter the validator configs to the enabled ones.
    const enabledValidators = this.validatorsSupport.enabledValidators(availableGroups, enabledValidationGroups, validators);
    const validatorFns = this.validatorsSupport.createFormValidatorInstancesFromMapping(defMap, enabledValidators) ?? [];

    // For debugging:
    // this.loggerService.debug(`${this.logName}: setting validators to formControl`,
    //   {definedValidators: validators, enabledValidators, formControlValue: formControl.value});

    // Set validators to the form control.
    // This may setValidators with an empty array - that is ok, and is necessary to remove existing validators.
    formControl.setValidators(validatorFns);
    if (updateValueAndValidityOpts?.doUpdate !== false) {
      // TODO: Store the first created validator functions per formControl, and use that in .hasValidator.
      //       This should reduce the amount of churn and events.
      formControl.updateValueAndValidity({
        onlySelf: updateValueAndValidityOpts?.onlySelf,
        emitEvent: updateValueAndValidityOpts?.emitEvent,
      });
    }
  }

  /**
   * Update the validators for this component and all child components.
   * @param mapEntry A component's map entry.
   * @param enabledValidationGroups The validation group names that are currently enabled. No groups means all validators are enabled.
   * @param validationGroups The available validation groups.
   */
  public updateValidators(
    mapEntry: FormFieldCompMapEntry, enabledValidationGroups?: string[] | null, validationGroups?: FormValidationGroups | null
  ): void {
    // Set the validators for the form control.
    if (mapEntry?.model?.formControl) {
      const formControl = mapEntry?.model?.formControl;
      const validators = mapEntry?.model?.validators;
      const updateValueAndValidityOpts = { doUpdate: true, onlySelf: true, emitEvent: false };
      this.setValidators(formControl, validators, enabledValidationGroups, validationGroups, updateValueAndValidityOpts);
    }

    // Set the validators for any child controls.
    for (const childMapEntry of mapEntry?.component?.formFieldCompMapEntries ?? []) {
      this.updateValidators(childMapEntry, enabledValidationGroups, validationGroups)
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

    type rawRespType = { data: FormConfigFrame, meta: Record<string, unknown> };
    const rawResp = this.http.get<rawRespType>(url.href, this.requestOptions);
    const result = await firstValueFrom(rawResp);
    this.loggerService.info(`Get form fields from url: ${url}`, result);
    return result;
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

    const result = await firstValueFrom(this.http.get<{ data: Record<string, unknown> }>(url.href, this.requestOptions));
    this.loggerService.info(`Get model data from url: ${url}`, result);
    return result?.['data'] ?? {};
  }

  // /**
  //  * TODO: Use this script to validate the form data model structure matches the form config.
  //  * @param recordType
  //  * @param oid
  //  */
  // public async getDynamicImportFormStructureValidations(recordType: string, oid: string) {
  //   const path = ['dynamicAsset', 'formStructureValidations', recordType?.toString(), oid?.toString()];
  //   const result = await this.utilityService.getDynamicImport(this.brandingAndPortalUrl, path);
  //   return result;
  // }

  // /**
  //  * TODO: Use this script to validate the form data model values match the form config.
  //  * @param recordType
  //  * @param oid
  //  */
  // public async getDynamicImportFormDataValidations(recordType: string, oid: string) {
  //   const path = ['dynamicAsset', 'formDataValidations', recordType?.toString(), oid?.toString()];
  //   const result = await this.utilityService.getDynamicImport(this.brandingAndPortalUrl, path);
  //   return result;
  // }

  // /**
  //  * TODO: Use this script to run the form data model expressions.
  //  * @param recordType
  //  * @param oid
  //  */
  // public async getDynamicImportFormExpressions(recordType: string, oid: string) {
  //   const path = ['dynamicAsset', 'formExpressions', recordType?.toString(), oid?.toString()];
  //   const result = await this.utilityService.getDynamicImport(this.brandingAndPortalUrl, path);
  //   return result;
  // }

  /**
   * Get all the compiled items for the form.
   * @param recordType The form record type.
   * @param oid The record id.
   * @param formMode The form mode.
   */
  public async getDynamicImportFormCompiledItems(
    recordType: string, oid?: string, formMode?: FormModesConfig
  ): Promise<DynamicScriptResponse> {
    const normalizedRecordType = String(recordType ?? '').trim() || (oid ? 'auto' : '');
    const path = ['dynamicAsset', 'formCompiledItems', normalizedRecordType];
    if (oid) {
      path.push(oid?.toString());
    }
    const params = formMode === "edit" ? { edit: "true" } : undefined;
    return await this.utilityService.getDynamicImport(this.brandingAndPortalUrl, path, params);
  }

  /**
   * Build the lineage paths from a base item,
   * and add the entries as relative parts at the end of each lineage path.
   * @param base The base paths.
   * @param more The relative paths to append.
   */
  public buildLineagePaths(base?: LineagePaths, more?: LineagePaths): LineagePaths {
    // Delegate to shared helper to keep existing FormService API intact.
    return buildLineagePathsHelper(base, more);
  }

  /**
   * Reshapes a FormFieldCompMapEntry into a JSONataClientQuerySourceProperty.
   *
   * @param item
   * @returns
   */
  public transformIntoJSONataProperty(item: FormFieldCompMapEntry, isLayout?: boolean): JSONataClientQuerySourceProperty {
    if (!item) {
      throw new Error(`${this.logName}: Cannot get JSONata property entry for null or undefined item.`);
    }
    const jsonPointer = item.lineagePaths?.angularComponentsJsonPointer;
    let property: JSONataClientQuerySourceProperty = {
      name: item.compConfigJson?.name,
      lineagePaths: item.lineagePaths,
      jsonPointer: jsonPointer
    };
    if (isLayout) {
      // add layout
      const layoutJsonPointer = item.lineagePaths?.layoutJsonPointer;
      property = {
        name: item.compConfigJson.layout?.name ? item.compConfigJson.layout?.name : `${item.compConfigJson.name}-layout`,
        lineagePaths: item.lineagePaths,
        jsonPointer: layoutJsonPointer
      };
      // ignore children for layout
      return property;
    }
    const children = item?.component?.formFieldCompMapEntries || [];
    if (!_isEmpty(children)) {
      // recursively get the query source for the child items
      property.children = [];
      for (let childItem of children) {
        const childPropertyEntry = this.transformIntoJSONataProperty(childItem);
        property.children.push(childPropertyEntry);
      }
    }
    return property;
  }

  /**
   * Transforms a JSONata entry to a JSON Pointer friendly object.
   *
   * @param jsonDoc - arbitrary object to build on
   * @param formFieldEntry The form field entry associated with the JSONata entry.
   * @param jsonataEntry The JSONata entry to be transformed into a JSON Pointer friendly object.
   */
  public transformJSONataEntryToJSONPointerSource(jsonDoc: Record<string, unknown>, formFieldEntry: FormFieldCompMapEntry, jsonataEntry: JSONataQuerySourceProperty, isLayout?: boolean): object {
    const object: JSONataResultDoc = {
      metadata: {
        formFieldEntry: formFieldEntry,
        component: formFieldEntry.component,
        layout: formFieldEntry.layout,
        model: formFieldEntry.model,
        lineagePaths: formFieldEntry.lineagePaths,
        jsonPointer: isLayout ? jsonataEntry.lineagePaths?.layoutJsonPointer : jsonataEntry.jsonPointer
      }
    };
    // Recursively build the object structure if there are children
    if (jsonataEntry.children && jsonataEntry.children.length > 0) {
      for (let i = 0; i < jsonataEntry.children.length; i++) {
        const childEntry = jsonataEntry.children[i];
        const childFormFieldEntry = formFieldEntry?.component?.formFieldCompMapEntries?.find(c => c.compConfigJson?.name === childEntry.name);
        if (childFormFieldEntry) {
          this.transformJSONataEntryToJSONPointerSource(object, childFormFieldEntry, childEntry, isLayout);
        }
      }
    }
    if (isLayout) {
      _set(jsonDoc, this.getPropertyNameFromJSONPointerAsNumber(jsonataEntry.lineagePaths?.layoutJsonPointer, `${jsonataEntry.name}-layout`), object);
    } else {
      _set(jsonDoc, this.getPropertyNameFromJSONPointerAsNumber(jsonataEntry?.jsonPointer, jsonataEntry.name), object);
    }
    return jsonDoc;
  }

  /**
   * Convenience method to get the property name from a JSON Pointer string as a number. Converts last part of the segment to number if possible, otherwise returns the default name. No, the name will not always be a number but conversion is prioritised as per JSON Pointer spec.
   *
   * @param jsonPointer
   * @param defaultName
   * @returns
   */
  private getPropertyNameFromJSONPointerAsNumber(jsonPointer?: string, defaultName: string = ''): string {
    // Intentionally rebuilding the array to decouple this logic from the source of the JSON Pointer data
    const name = jsonPointer?.split('/').pop() || '';
    const num = _toNumber(name);
    return _isFinite(num) ? name : defaultName;
  }

  /**
   * Reshapes a FormFieldCompMapEntry array into a JSONataQuerySource. Needed to prepare for JSONata queries.
   */
  public getJSONataQuerySource(origObject: FormFieldCompMapEntry[], runtimeContext?: JSONataQueryRuntimeContext): JSONataQuerySource {
    let queryDoc: JSONataQuerySourceProperty[] = [];
    let jsonPointerSource: JSONataResultDoc = {};
    // loop through each item in the original object and build the query source, index is important
    for (let i = 0; i < origObject.length; i++) {
      const item = origObject[i];

      const propertyEntry = this.transformIntoJSONataProperty(item);
      queryDoc.push(propertyEntry);
      const layoutEntry = this.transformIntoJSONataProperty(item, true);
      queryDoc.push(layoutEntry);
      this.transformJSONataEntryToJSONPointerSource(jsonPointerSource, item, propertyEntry);
      this.transformJSONataEntryToJSONPointerSource(jsonPointerSource, item, propertyEntry, true);
    }

    const querySource: JSONataQuerySource = {
      queryOrigSource: origObject,
      querySource: queryDoc,
      jsonPointerSource: jsonPointerSource,
      runtimeContext
    }
    return querySource;
  }

  /**
   * Queries a JSONata source using the provided expression. Returns an array of FormFieldCompMapEntry objects
   * corresponding to the results, or, if `returnPointerOnly` is true, returns only the JSON pointer strings.
   *
   * @param jsonataSource The JSONataQuerySource to query.
   * @param jsonataExpression The JSONata expression to evaluate.
   * @param returnPointerOnly If true, only the JSON pointer strings are returned. Defaults to false.
   * @returns A Promise resolving to either an array of FormFieldCompMapEntry objects or JSON pointer strings.
   */
  public async queryJSONataSource(
    jsonataSource: JSONataQuerySource,
    jsonataExpression: string,
    returnPointerOnly: boolean = false
  ): Promise<FormFieldCompMapEntry[] | unknown> {
    const queryRes = await queryJSONata(
      jsonataSource,
      jsonataExpression
    );
    if (returnPointerOnly) {
      return queryRes;
    }
    // Return an object/array of FormFieldCompMapEntry based on the JSON pointer result
    const returnArr: FormFieldCompMapEntry[] = [];
    if (Array.isArray(queryRes)) {
      for (let result of queryRes) {
        const obj = getObjectWithJsonPointer(jsonataSource.jsonPointerSource, result.jsonPointer);
        returnArr.push(obj?.val?.metadata?.formFieldEntry);
      }
    }
    return returnArr;
  }

  public translate(value?: string): string {
    if (!value) {
      return '';
    }
    const translated = this.translationService.t(value);
    if (translated === undefined || translated === null || translated === '') {
      return value;
    }
    return translated?.toString() ?? "";
  }

  /**
   * Calculate the new validation group names.
   * @param currentValidationGroups The currently enabled validation groups.
   * @param validationGroups The available validation groups.
   * @param initial The initial validation groups to use when calculating the new validation groups.
   * @param groups The validation group names to include and exclude.
   */
  public calculateValidationGroups(
    currentValidationGroups: string[],
    validationGroups: FormValidationGroups,
    initial?: FormValidationGroupsChangeInitial,
    groups?: FormFieldValidationGroup
  ): string[]{
    let enabledNames = [...currentValidationGroups];
    // Initial is 'current' by default.
    initial = initial ?? "current";
    switch(initial) {
      case "all":
        enabledNames = Object.keys(validationGroups);
        break;
      case "none":
        enabledNames = [];
        break;
      case "current":
        // No change to the enabled validation groups.
        break;
      default:
        // For an unknown initial state, default to 'current'.
        this.loggerService.error(`${this.logName}: Unknown set enabled validation group initial state '${initial}'.`);
    }

    // Add enabled group names.
    for (const name of groups?.include ?? []) {
      if (!enabledNames.includes(name)) {
        enabledNames.push(name);
      }
    }

    // Remove disabled group names.
    for (const name of groups?.exclude ?? []) {
      const index = enabledNames.indexOf(name);
      if (index > -1) {
        enabledNames.splice(index, 1);
      }
    }

    // For debugging:
    // this.loggerService.debug(`${this.logName}: Calculated validation groups ${JSON.stringify(enabledNames)} from currentValidationGroups ${JSON.stringify(currentValidationGroups)} validationGroups ${JSON.stringify(validationGroups)} initial ${initial} groups ${JSON.stringify(groups)}`);

    return enabledNames;
  }
}

/**
 *  This is a client-side, Angular specific data model of the downloaded form configuration.
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
  formConfig: FormConfigFrame;
  /**
   * Map of item name to form field component map entry.
   */
  completeGroupMap?: { [key: string]: FormFieldCompMapEntry };
  /**
   * Mapping of name to angular FormControl. Used to create angular form.
   */
  withFormControl?: { [key: string]: FormControl };
  /**
   * Metadata returned with the form config API call.
   */
  formConfigMeta?: Record<string, unknown>;

  constructor(components: FormFieldCompMapEntry[], formConfig: FormConfigFrame, meta?: Record<string, unknown>) {
    this.components = components;
    this.formConfig = formConfig;
    this.formConfigMeta = meta;
    this.completeGroupMap = undefined;
    this.withFormControl = undefined;
  }
}

/**
 * Internal interface for resulting document from JSONata query with metadata. This will not be returned to consumers.
 */
interface JSONataResultDoc {
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}
