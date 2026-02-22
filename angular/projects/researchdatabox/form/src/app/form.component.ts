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
import {
  Component,
  Inject,
  ElementRef,
  signal,
  HostBinding,
  ViewChild,
  ViewContainerRef,
  inject,
  effect,
  model,
  OnDestroy,
  ViewEncapsulation
} from '@angular/core';
import { Subscription } from 'rxjs';
import { Location, LocationStrategy, PathLocationStrategy } from '@angular/common';
import { FormGroup, FormControlStatus, StatusChangeEvent, PristineChangeEvent, ValueChangeEvent } from '@angular/forms';
import { isEmpty as _isEmpty, isString as _isString, isNull as _isNull, isUndefined as _isUndefined, set as _set, get as _get, trim as _trim } from 'lodash-es';
import { ConfigService, LoggerService, TranslationService, BaseComponent, FormFieldCompMapEntry, UtilityService, RecordService, RecordActionResult } from '@researchdatabox/portal-ng-common';
import {
  FormStatus,
  FormConfigFrame,
  JSONataQuerySource,
  FormValidatorSummaryErrors
} from '@researchdatabox/sails-ng-common';
import { FormBaseWrapperComponent } from "./component/base-wrapper.component";
import { FormComponentsMap, FormService } from './form.service';
import { FormComponentEventBus } from './form-state/events/form-component-event-bus.service';
import { FormComponentFocusRequestCoordinator } from './form-state/events/form-component-focus-request-coordinator.service';
import { createFormDefinitionChangedEvent, createFormDefinitionReadyEvent, createFormSaveFailureEvent, createFormSaveSuccessEvent, createFormValidationBroadcastEvent, FormComponentEvent, FormComponentEventType } from './form-state/events/form-component-event.types';
import { FormStateFacade } from './form-state/facade/form-state.facade';
import { Store } from '@ngrx/store';
import * as FormActions from './form-state/state/form.actions';
import { FormComponentValueChangeEventConsumer } from './form-state/events/';


/**
 * The ReDBox Form
 *
 * Goals:
  - unopinionated layout
  - dynamic component loading at runtime
  - defined form event lifecycle and ability to listen
  - validation and error handling

  Pending Goals:
  - support concurrent modifications

 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Component({
  selector: 'redbox-form',
  templateUrl: './form.component.html',
  styleUrls: ['./form.component.scss'],
  providers: [
    Location,
    { provide: LocationStrategy, useClass: PathLocationStrategy },
    FormComponentFocusRequestCoordinator
  ],
  encapsulation: ViewEncapsulation.None,
  standalone: false
})
export class FormComponent extends BaseComponent implements OnDestroy {
  private logName = "FormComponent";
  /**
   * App name for logging and diagnostics
   */
  appName: string;
  /**
   * The OID of this form if it is associated with a record
   */
  oid = model<string>('');
  /**
   * The record type of this form
   */
  recordType = model<string>('');
  /**
   * Indicates the current mode of the form
   */
  editMode = model<boolean>(true);
  /**
   * The name of the form configuration to load
   */
  formName = model<string>('');
  /**
   * Indicates whether to download and create the form components on init
   */
  downloadAndCreateOnInit = model<boolean>(true);
  /**
   * Convenience map for trimmed signal params
   */
  trimmedParams = {
    oid: this.utilityService.trimStringSignal(this.oid),
    recordType: this.utilityService.trimStringSignal(this.recordType),
    formName: this.utilityService.trimStringSignal(this.formName)
  }
  /**
   * The FormGroup instance
   */
  form?: FormGroup;
  /**
   * The form group status signal
   */
  formGroupStatus = signal<FormGroupStatus>(this.dataStatus);
  /**
   * The previous formGroup status
   */
  previousFormGroupStatus = signal<FormGroupStatus>(this.dataStatus);
  /**
   * The form components
   */
  componentDefArr: FormFieldCompMapEntry[] = [];
  /**
   * The form definition map
   */
  formDefMap?: FormComponentsMap;
  /**
   * The module paths for dynamic imports
   */
  modulePaths: string[] = [];

  /**
   * The form status signal - sourced from the facade (R16.4)
   * This is the canonical signal-based interface for child components to observe form status (R16.15)
   */
  public facade = inject(FormStateFacade);
  /**
   * The NgRx store
   */
  private store = inject(Store);
  /**
   * Subscribe to EventBus execute command (Task 15)
   */
  private eventBus = inject(FormComponentEventBus);
  private focusRequestCoordinator = inject(FormComponentFocusRequestCoordinator);
  public readonly eventScopeId = `form-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  /**
   * Status of the form, derived from the facade as signal
   */
  status = this.facade.status;
  /**
   * Indicates whether the form components have been loaded
   */
  componentsLoaded = signal<boolean>(false);
  /**
   * Form component debug map
   */
  debugFormComponents = signal<Record<string, unknown>>({});
  /**
    * Form values debug map (actual payload)
   */
  debugFormValues = signal<Record<string, unknown>>({});
  /**
   * Raw form values debug map (includes disabled controls)
   */
  debugRawFormValues = signal<Record<string, unknown>>({});
  /**
   * Toggle for using raw form values in debug panel
   */
  debugUseRawValues = signal<boolean>(false);
  /**
   * Reference container for dynamic components injection
   */
  @ViewChild('componentsContainer', { read: ViewContainerRef, static: false }) componentsContainer!: ViewContainerRef | undefined;
  /**
   * Record service
   */
  recordService = inject(RecordService);
  /**
   * Browser location service used for URL state updates
   */
  private locationService = inject(Location);
  /**
   * Save response after save operations, also used to track in-flight saves (null)
   */
  saveResponse = signal<RecordActionResult | null | undefined>(undefined);

  /**
   * Map of subscriptions for various component events
   */
  subMaps: Record<string, Subscription> = {};

  /**
   * Debug info structure
   */
  formDebugInfo: DebugInfo = {
    name: "",
    class: 'FormComponent',
    status: FormStatus.INIT,
    componentsLoaded: false,
    isReady: false,
    children: []
  };
  /**
   * The JSONata query source for component definitions
   */
  componentDefQuerySource?: JSONataQuerySource;
  /**
   * The value change event consumer
   */
  private valueChangeEventConsumer = new FormComponentValueChangeEventConsumer(this.eventBus);

  protected configObj: Record<string, unknown> = {};

  public get config() {
    return this.configObj;
  }

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(ElementRef) elementRef: ElementRef,
    @Inject(FormService) private formService: FormService,
    @Inject(UtilityService) protected utilityService: UtilityService
  ) {
    super();
    this.initDependencies = [this.translationService, this.configService, this.formService, this.recordService];
    // Params can be injected via HTML if the app is used outside of Angular
    if (_isEmpty(this.trimmedParams.oid())) {
      this.oid.set(elementRef.nativeElement.getAttribute('oid'));
    }
    if (_isEmpty(this.trimmedParams.recordType())) {
      this.recordType.set(elementRef.nativeElement.getAttribute('recordType'));
    }
    if (_isEmpty(this.trimmedParams.formName())) {
      this.formName.set(elementRef.nativeElement.getAttribute('formName'));
    }
    // HTML attribute overrides the defaults on init, but not when injected via Angular
    if (!_isEmpty(_trim(elementRef.nativeElement.getAttribute('editMode')))) {
      this.editMode.set(elementRef.nativeElement.getAttribute('editMode') === 'true');
    }
    if (!_isEmpty(_trim(elementRef.nativeElement.getAttribute('downloadAndCreateOnInit')))) {
      this.downloadAndCreateOnInit.set(elementRef.nativeElement.getAttribute('downloadAndCreateOnInit') === 'true');
    }

    this.appName = `Form::${this.trimmedParams.recordType()}::${this.trimmedParams.formName()} ${this.trimmedParams.oid() ? ' - ' + this.trimmedParams.oid() : ''}`.trim();
    this.loggerService.debug(`'${this.logName}' waiting for '${this.trimmedParams.formName()}' deps to init...`);

    this.initEffects();
  }

  protected get getFormService() {
    return this.formService;
  }

  protected async initComponent(): Promise<void> {
    this.loggerService.info(`${this.logName}: Loading form with OID: ${this.trimmedParams.oid()}, on edit mode:${this.editMode()}, Record Type: ${this.trimmedParams.recordType()}, formName: ${this.trimmedParams.formName()}`);
    try {
      this.configObj = await this.configService.getConfig();
      if (this.downloadAndCreateOnInit()) {
        await this.downloadAndCreateFormComponents();
      } else {
        this.loggerService.warn(`${this.logName}: downloadAndCreateOnInit is set to false. Form will not be loaded automatically. Call downloadAndCreateFormComponents() manually to load the form.`);
      }
    } catch (error) {
      this.loggerService.error(`${this.logName}: Error loading form`, error);
      // Dispatch load failure action instead of direct mutation
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred during form load';
      this.store.dispatch(FormActions.loadInitialDataFailure({ error: errorMsg }));
      throw error;
    }
  }

  public async downloadAndCreateFormComponents(formConfig?: FormConfigFrame): Promise<void> {
    if (!formConfig) {
      this.loggerService.info(`${this.logName}: creating form definition by downloading config`);
      this.formDefMap = await this.formService.downloadFormComponents(this.trimmedParams.oid(), this.trimmedParams.recordType(), this.editMode(), this.trimmedParams.formName(), this.modulePaths);
      // Store the form recordType if the recordType was not provided by the page.
      if (!this.trimmedParams.recordType() && this.formDefMap?.formConfig?.type) {
        this.recordType.set(this.formDefMap?.formConfig?.type);
      }
    } else {
      this.loggerService.info(`${this.logName}: creating form definition from provided config`);
      const parentLineagePaths = this.formService.buildLineagePaths({
        angularComponents: [],
        dataModel: [],
        formConfig: ['componentDefinitions'],
      });
      this.formDefMap = await this.formService.createFormComponentsMap(formConfig, parentLineagePaths);
    }
    this.componentDefArr = this.formDefMap.components;
    const compContainerRef: ViewContainerRef | undefined = this.componentsContainer;
    if (!compContainerRef) {
      throw new Error(`${this.logName}: No component container found. Cannot load components.`);
    }
    for (const componentDefEntry of this.componentDefArr) {
      const componentRef = compContainerRef.createComponent(FormBaseWrapperComponent);
      componentRef.instance.defaultComponentConfig = this.formDefMap?.formConfig?.defaultComponentConfig;
      componentRef.changeDetectorRef.detectChanges();

      await componentRef.instance.initWrapperComponent(componentDefEntry);
    }
    // Moved the creation of the FormGroup to after all components are created, allows for components that have custom management of their children components.
    await this.createFormGroup();
    // Dispatch load success action (R16.2, AC53)
    this.store.dispatch(FormActions.loadInitialDataSuccess({ data: this.form?.value || {} }));

    // Build the initial query source for component definitions
    this.setupQuerySource();
    // Initialize subscriptions to event bus
    this.initSubscriptions();
    // Publish the form definition ready event
    this.eventBus.publish(createFormDefinitionReadyEvent({}));
    // Finally set the flag indicating components are loaded
    this.componentsLoaded.set(true);
  }
  /**
   * Set up the JSONata query source from component definitions
   */
  protected setupQuerySource() {
    this.componentDefQuerySource = this.formService.getJSONataQuerySource(this.componentDefArr);
  }
  /**
   *
   * Getter for component definition query source
   *
   */
  public getQuerySource(): JSONataQuerySource | undefined {
    return this.componentDefQuerySource;
  }
  /**
   * Initialize reactive effects
   */
  protected initEffects() {
    // This is needed to update the debugging info when form status changes.
    effect(() => {
      this.getDebugInfo();
    });

    // Monitor async validation state and dispatch actions (R16.3, AC56)
    effect(() => {
      const formGroupStatus = this.formGroupStatus();
      const formGroupIsPending = formGroupStatus?.pending || false;
      const formGroupWasPending = this.previousFormGroupStatus()?.pending || false;
      const formGroupIsValid = formGroupStatus?.valid || false;
      const formGroupWasValid = this.previousFormGroupStatus()?.valid || false;
      const formIsSaving = this.status() === FormStatus.SAVING;

      // Dispatch validation lifecycle actions instead of direct status mutation
      // Ignore if saving is in progress
      if (!formIsSaving) {
        // If validation is pending
        if (formGroupIsPending && !formGroupWasPending) {
          this.store.dispatch(FormActions.formValidationPending());
        }
        // If validation completed
        if (!formGroupIsPending) {
          if (!formGroupIsValid && formGroupWasValid) {
            this.store.dispatch(FormActions.formValidationFailure({ error: 'Form validation failed' }));
          }
          if (formGroupIsValid && !formGroupWasValid) {
            this.store.dispatch(FormActions.formValidationSuccess());
          }
        }
      }
      this.previousFormGroupStatus.set(formGroupStatus);
    });
  }
  /**
   * Initialize subscriptions to event bus
   */
  protected initSubscriptions() {
    this.focusRequestCoordinator.bind(this);

    // Listen for execute save command and invoke saveForm (Task 15)
    this.subMaps['saveExecuteSub'] = this.eventBus
      .select$(FormComponentEventType.FORM_SAVE_EXECUTE)
      .subscribe(async (evt) => {
        // Default payload handling with safe fallbacks
        const force = !!evt.force;
        const targetStep = evt.targetStep ?? '';
        const enabledValidationGroups = evt.enabledValidationGroups ?? ["all"];
        await this.saveForm(force, targetStep, enabledValidationGroups);
      });
    // Listen for any changes components have made to their own definitions and update the query source
    this.subMaps['componentDefChangesRequestSub'] = this.eventBus
      .select$(FormComponentEventType.FORM_DEFINITION_CHANGE_REQUEST)
      .subscribe((evt: FormComponentEvent) => {
        // This will only fire if the Form has been initialized and components loaded successfully
        if (this.componentsLoaded()) {
          this.setupQuerySource();
          this.eventBus.publish(createFormDefinitionChangedEvent({
            sourceId: evt.sourceId
          }));
        }
      });

    if (this.form) {
      // Wire the form events to update the formGroupStatus signal and publish validation events
      // At the moment, the code will only emit StatusChange and PristineChange events to the EventBus.
      this.subMaps['formGroupChangesSub']?.unsubscribe();
      this.subMaps['formGroupChangesSub'] = this.form.events.subscribe((formGroupEvent: StatusChangeEvent | PristineChangeEvent | ValueChangeEvent<unknown> | unknown) => {
        if (formGroupEvent instanceof StatusChangeEvent || formGroupEvent instanceof PristineChangeEvent) {
          this.formGroupStatus.set(this.dataStatus);
          this.eventBus.publish(
            createFormValidationBroadcastEvent({
              isValid: this.dataStatus.valid,
              errors: this.dataStatus.errors,
              status: this.dataStatus
            })
          );
        }
      });

      this.subMaps['formValueChangesSub']?.unsubscribe();
      this.subMaps['formValueChangesSub'] = this.form.valueChanges.subscribe(() => {
        this.debugFormComponents.set(this.getDebugInfo());
        this.debugFormValues.set(this.getDebugFormValue());
        this.debugRawFormValues.set(this.getDebugRawFormValue());
      });
    }
    // set the initial signal values...
    this.formGroupStatus.set(this.dataStatus);
    this.debugFormComponents.set(this.getDebugInfo());
    this.debugFormValues.set(this.getDebugFormValue());
    this.debugRawFormValues.set(this.getDebugRawFormValue());
    // TODO: Placeholder for form-level expressions handling
    // Init the change event consumer
    // if (this.formDefMap?.formConfig.expressions){
    //   this.valueChangeEventConsumer.bind({
    //     formComponent: this,
    //     customHandlerFn: async (event: FormComponentEventBase) => {
    //       this.loggerService.debug(`${this.logName}: Value change event received: `, event);
    //     }
    //   });
    // }
  }
  /**
   * Create the form group based on the form definition map.
   */
  private async createFormGroup(): Promise<void> {
    if (this.formDefMap && this.formDefMap.formConfig) {
      const components = this.formDefMap.components;
      // set up the form group
      const formGroupMap = this.formService.groupComponentsByName(this.formDefMap);
      this.loggerService.debug(`${this.logName}: formGroup:`, formGroupMap);
      // create the form group
      if (!_isEmpty(formGroupMap.withFormControl)) {
        this.form = new FormGroup(formGroupMap.withFormControl);
        if (!this.form) {
          const msg = `${this.logName}: Failed to create Angular FormGroup, check the form definition.`;
          this.loggerService.error(msg);
          throw new Error(msg);
        }

        // set up validators
        const validatorConfig = this.formDefMap.formConfig.validators;
        const enabledGroups = this.formDefMap.formConfig.enabledValidationGroups ?? ["all"];
        this.formService.setValidators(this.form, validatorConfig, enabledGroups);

      } else if (Object.keys(formGroupMap.completeGroupMap ?? {}).length < 1) {
        // Note that a form can be composed of only components that don't have models, and so don't have FormControls.
        // That is ok. But a form must have at least one component.
        const msg = `No form controls found in the form definition. Form cannot be rendered.`;
        this.loggerService.error(`${this.logName}: ${msg}`);
        throw new Error(msg);
      }
    }
  }

  protected async getAndApplyUpdatedDataModel() {
    const dataModel = await this.formService.getModelData(this.trimmedParams.oid(), this.trimmedParams.recordType());
    this.form?.patchValue(dataModel);
  }

  @HostBinding('class.edit-mode') get isEditMode() {
    return this.editMode();
  }

  @HostBinding('class') get hostClasses(): string {
    const modeClass = this.editMode() ? 'rb-form-edit' : 'rb-form-view';
    const baselineClasses = `rb-form-host ${modeClass}`.trim();
    if (!this.formDefMap?.formConfig) {
      return baselineClasses;
    }

    const cssClasses = this.editMode() ? this.formDefMap.formConfig.editCssClasses : this.formDefMap.formConfig.viewCssClasses;

    if (!cssClasses) {
      return baselineClasses;
    }

    if (_isString(cssClasses)) {
      return `${baselineClasses} ${cssClasses}`.trim();
    }

    // If cssClasses is an object with key-value pairs, transform it to space-delimited string
    // where keys with truthy values become class names
    const resolvedClasses = Object.entries(cssClasses)
      .filter(([_, value]) => value)
      .map(([className, _]) => className)
      .join(' ');
    return `${baselineClasses} ${resolvedClasses}`.trim();
  }

  /**
   * Get the validation errors from all the controls in this form, and recurse into the control's child controls.
   */
  public getValidationErrors(): FormValidatorSummaryErrors[] {
    const result: FormValidatorSummaryErrors[] = [];
    const mapEntries = this.formDefMap?.components ?? [];
    for (const mapEntry of mapEntries) {
      const errors = this.formService.getFormValidatorSummaryErrors(mapEntry);
      result.push(...errors);
    }
    return result;
  }

  public getDebugInfo() {
    this.formDebugInfo.name = this.appName;
    this.formDebugInfo.status = this.status();
    this.formDebugInfo.componentsLoaded = this.componentsLoaded();
    this.formDebugInfo.isReady = this.isReady;
    this.formDebugInfo.children = this.componentDefArr?.map(i => this.getComponentDebugInfo(i));
    return this.formDebugInfo;
  }

  public getDebugFormValue(): Record<string, unknown> {
    return this.getPersistedFormValue();
  }

  public getDebugRawFormValue(): Record<string, unknown> {
    return structuredClone((this.form?.getRawValue?.() ?? {}) as Record<string, unknown>);
  }

  private getPersistedFormValue(): Record<string, unknown> {
    const formValue = structuredClone((this.form?.value ?? {}) as Record<string, unknown>);
    const groupMap = this.formDefMap?.completeGroupMap ?? {};
    for (const [name, compEntry] of Object.entries(groupMap)) {
      const includeByConfig = this.formService.shouldIncludeInFormControlMap(compEntry);
      if (!includeByConfig) {
        delete formValue[name];
      }
    }
    return formValue;
  }


  private getComponentDebugInfo(formFieldCompMapEntry: FormFieldCompMapEntry): DebugInfo {
    const componentEntry = formFieldCompMapEntry;
    this.loggerService.debug('getComponentDebugInfo', formFieldCompMapEntry);
    const componentConfigClassName = formFieldCompMapEntry?.compConfigJson?.component?.class ?? "";
    const name = this.utilityService.formFieldConfigName(formFieldCompMapEntry);

    const componentResult: DebugInfo = {
      name: name,
      class: componentConfigClassName,
      status: componentEntry?.component?.status()?.toString() ?? "",
      viewInitialised: componentEntry?.component?.viewInitialised(),
    };

    // If the component has children components, recursively get their debug info. This used to be hardcoded for specific component types, but now it is generic.
    const component = formFieldCompMapEntry?.component;
    if (Array.isArray(component?.formFieldCompMapEntries)) {
      componentResult.children = component?.formFieldCompMapEntries?.map((i: FormFieldCompMapEntry) => this.getComponentDebugInfo(i));
    }

    if (componentEntry?.layout) {
      return {
        name: formFieldCompMapEntry?.compConfigJson?.layout?.name ?? "",
        class: formFieldCompMapEntry?.compConfigJson?.layout?.class ?? "",
        status: componentEntry?.layout?.status()?.toString() ?? "",
        viewInitialised: componentEntry?.layout?.viewInitialised(),
        children: [componentResult],
      }
    } else {
      return componentResult;
    }
  }

  // Convenience method to find component definition by name, defaults to the this.componentDefArr if no array is provided.
  public getComponentDefByName(name: string, componentDefArr: FormFieldCompMapEntry[] = this.componentDefArr): FormFieldCompMapEntry | undefined {
    let foundComponentDef = componentDefArr.find(comp => {
      return comp.compConfigJson?.name === name;
    });
    // If not found, continue to search in the component's children
    if (!foundComponentDef) {
      let componentDef = foundComponentDef as any;
      if (!_isEmpty(componentDef?.component?.components)) {
        for (const child of componentDef?.component?.components) {
          foundComponentDef = this.getComponentDefByName(name, child.component?.components || []);
        }
      }
    }
    return foundComponentDef;
  }

  public async saveForm(forceSave: boolean = false, targetStep: string = '', enabledValidationGroups: string[] = ["all"]) {
    // Check if the form is ready, defined, modified OR forceSave is set
    // Status check will ensure saves requests will not overlap within the Angular Form app context
    const formIsSaving = _isNull(this.saveResponse());
    const formIsModified = this.form?.dirty || forceSave;
    // At this point, only the validators that we want to run will be set on the angular components.
    const formIsValid = this.form?.valid || forceSave;

    if (this.form && formIsModified) {
      if (formIsValid && !formIsSaving) {
        this.saveResponse.set(null); // Indicate save in progress
        this.loggerService.info(`${this.logName}: Form valid flag: ${this.form.valid}, targetStep: ${targetStep}, enabledValidationGroups: ${enabledValidationGroups}. Saving...`);
        this.loggerService.debug(`${this.logName}: Form value:`, this.form.value);

        try {
          let response: RecordActionResult;
          const currentFormValue = this.getPersistedFormValue();
          // Mark form as pristine as we cloned the data already
          this.form.markAsPristine();
          if (_isEmpty(this.trimmedParams.oid())) {
            // Actual record creation via RecordService call
            response = await this.recordService.create(currentFormValue, this.trimmedParams.recordType(), targetStep);
          } else {
            // Actual record update via RecordService call
            response = await this.recordService.update(this.trimmedParams.oid(), currentFormValue, targetStep);
          }
          if (response?.success) {
            this.loggerService.info(`${this.logName}: Form submitted successfully:`, response);
            if (_isEmpty(this.trimmedParams.oid()) && !_isEmpty(response?.oid)) {
              const createdOid = String(response?.oid);
              this.oid.set(createdOid);
              this.locationService.replaceState(this.buildEditRecordPath(createdOid));
            }
            // Emit success event
            this.eventBus.publish(
              createFormSaveSuccessEvent({
                savedData: currentFormValue,
                oid: !_isEmpty(response?.oid) ? String(response?.oid) : this.trimmedParams.oid(),
                response
              })
            );
          } else {
            this.loggerService.warn(`${this.logName}: Form submission failed:`, response);
            // Mark form as dirty again since save failed
            this.form.markAllAsDirty();
            // Emit failure event
            this.eventBus.publish(
              createFormSaveFailureEvent({ error: _get(response, 'message')?.toString() ?? 'Unknown error' })
            );
          }
          this.saveResponse.set(response);
        } catch (error: unknown) {
          this.loggerService.error(`${this.logName}: Error occurred while submitting form:`, error);
          // Emit an response with the error message object as string
          let errorMsg = 'Unknown error occurred';
          if (error instanceof Error) {
            errorMsg = error.message;
          }
          this.saveResponse.set({ success: false, oid: this.trimmedParams.oid(), message: errorMsg } as RecordActionResult);
          // Mark form as dirty again since save failed
          this.form.markAllAsDirty();
          // emit failure event
          this.eventBus.publish(
            createFormSaveFailureEvent({ error: errorMsg })
          );
        }
      } else {
        this.saveResponse.set(undefined); // Reset save response
        // TODO: Do we need to discriminate between invalid and save pending states?
        this.loggerService.warn(`${this.logName}: Form is invalid. Cannot submit.`);
        // Handle form errors, e.g., show a message to the user
        this.eventBus.publish(
          createFormSaveFailureEvent({ error: 'Form is invalid. Please correct the errors and try again.' })
        );
      }
    } else {
      this.saveResponse.set(undefined); // Reset save response
      // TODO: Do we need to discriminate between not defined and not modified events?
      const message = !this.form ? 'Form is not defined.' : 'Form has not been modified.';
      this.loggerService.warn(`${this.logName}: ${message} Cannot submit.`);
      this.eventBus.publish(
        createFormSaveFailureEvent({ error: message })
      );
    }
  }

  /**
   * Get the compiled items for the form with the default values.
   */
  public async getFormCompiledItems() {
    const recordType = this.trimmedParams.recordType();
    const formMode = this.editMode() ? "edit" : "view";
    const result = await this.formService.getDynamicImportFormCompiledItems(recordType, undefined, formMode);
    // TODO: cache?
    return result;
  }

  /**
   * Get the compiled items for the form with the record's values.
   */
  public async getRecordCompiledItems() {
    const recordType = this.trimmedParams.recordType();
    const oid = this.trimmedParams.oid();
    const formMode = this.editMode() ? "edit" : "view";
    const result = await this.formService.getDynamicImportFormCompiledItems(recordType, oid, formMode);
    // TODO: cache?
    return result;
  }

  // Expose the `form` status
  public get dataStatus(): FormGroupStatus {
    return {
      valid: this.form?.valid || false,
      dirty: this.form?.dirty || false,
      pristine: this.form?.pristine || false,
      invalid: this.form?.invalid || false,
      pending: this.form?.pending || false,
      disabled: this.form?.disabled || false,
      enabled: this.form?.enabled || false,
      touched: this.form?.touched || false,
      untouched: this.form?.untouched || false,
      value: this.form?.value || null,
      errors: this.form?.errors || null,
      status: this.form?.status as FormControlStatus || 'DISABLED',
    } as FormGroupStatus;
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    Object.values(this.subMaps).forEach(sub => sub.unsubscribe());
    this.focusRequestCoordinator.destroy();
  }

  public get componentQuerySource(): JSONataQuerySource | undefined {
    return this.componentDefQuerySource;
  }

  private buildEditRecordPath(oid: string): string {
    const createdOid = String(oid ?? '').trim();
    if (_isEmpty(createdOid)) {
      return 'record/edit';
    }
    const brandingAndPortalUrl = String(this.recordService.brandingAndPortalUrl ?? '').trim();
    if (!_isEmpty(brandingAndPortalUrl)) {
      try {
        const parsedUrl = new URL(brandingAndPortalUrl);
        const basePath = parsedUrl.pathname.replace(/\/+$/, '');
        return `${basePath}/record/edit/${createdOid}`;
      } catch {
        this.loggerService.warn(`${this.logName}: Invalid brandingAndPortalUrl '${brandingAndPortalUrl}', falling back to relative path.`);
      }
    }
    return `record/edit/${createdOid}`;
  }
}

export interface FormGroupStatus {
  valid: boolean;
  invalid: boolean;
  dirty: boolean;
  pristine: boolean;
  pending: boolean;
  disabled: boolean;
  enabled: boolean;
  touched: boolean;
  untouched: boolean;
  value: any;
  errors: any;
  status: FormControlStatus;
}

type DebugInfo = {
  class: string,
  status: string,
  name: string,
  componentsLoaded?: boolean,
  viewInitialised?: boolean,
  isReady?: boolean,
  children?: any[]
};
