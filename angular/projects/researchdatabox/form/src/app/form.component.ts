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
  effect,
  ElementRef,
  HostBinding,
  Inject,
  inject,
  model,
  OnDestroy,
  signal,
  ViewChild,
  ViewContainerRef,
  ViewEncapsulation,
} from '@angular/core';
import {Subscription} from 'rxjs';
import {Location, LocationStrategy, PathLocationStrategy} from '@angular/common';
import {FormControlStatus, FormGroup, PristineChangeEvent, StatusChangeEvent, ValueChangeEvent} from '@angular/forms';
import {
  get as _get,
  isEmpty as _isEmpty,
  isNull as _isNull,
  isString as _isString,
  set as _set,
  trim as _trim
} from 'lodash-es';
import {
  BaseComponent,
  ConfigService,
  FormFieldCompMapEntry,
  LoggerService,
  RecordActionResult,
  RecordService,
  TranslationService,
  UtilityService,
} from '@researchdatabox/portal-ng-common';
import {
  DynamicScriptResponse,
  FormConfigFrame,
  FormRequestParamsMap,
  FormRequestParamValue,
  FormStatus,
  FormValidatorSummaryErrors,
  JSONataQuerySource,
} from '@researchdatabox/sails-ng-common';
import {FormBaseWrapperComponent} from './component/base-wrapper.component';
import {FormComponentsMap, FormService} from './form.service';
import {FormComponentEventBus} from './form-state/events/form-component-event-bus.service';
import {
  FormComponentFocusRequestCoordinator
} from './form-state/events/form-component-focus-request-coordinator.service';
import {
  createFormDefinitionChangedEvent,
  createFormDefinitionReadyEvent,
  createFormDeleteFailureEvent,
  createFormDeleteSuccessEvent,
  createFormSaveFailureEvent,
  createFormSaveSuccessEvent,
  createFormValidationBroadcastEvent,
  FormComponentEvent,
  FormComponentEventType,
  FormStatusDirtyRequestEvent,
  FormValidationGroupsChangeInitial,
  FormValidationGroupsChangeRequestEvent,
} from './form-state/events/form-component-event.types';
import {FormStateFacade} from './form-state/facade/form-state.facade';
import {Store} from '@ngrx/store';
import * as FormActions from './form-state/state/form.actions';
import {FormComponentValueChangeEventConsumer} from './form-state/events/';
import {DebugInfo, FormDebugStateService} from './form-debug/form-debug-state.service';
import {FormBehaviourManager} from './form-state/behaviours/form-behaviour-manager.service';

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
    FormComponentFocusRequestCoordinator,
    FormDebugStateService,
  ],
  encapsulation: ViewEncapsulation.None,
  standalone: false,
})
export class FormComponent extends BaseComponent implements OnDestroy {
  private logName = 'FormComponent';
  /**
   * App name for logging and diagnostics
   */
  appName: string;
  /**
   * The OID of this form if it is associated with a record
   */
  oid = model<string>('');
  /**
   * Branding passed by embedding view
   */
  branding = model<string>('');
  /**
   * Portal passed by embedding view
   */
  portal = model<string>('');
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
    branding: this.utilityService.trimStringSignal(this.branding),
    portal: this.utilityService.trimStringSignal(this.portal),
    recordType: this.utilityService.trimStringSignal(this.recordType),
    formName: this.utilityService.trimStringSignal(this.formName),
  };
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
  public readonly debugState = inject(FormDebugStateService);
  // Backward-compatible aliases for existing tests and callers.
  debugFormComponents = this.debugState.debugFormComponents;
  debugFormValues = this.debugState.debugFormValues;
  debugRawFormValues = this.debugState.debugRawFormValues;
  debugUseRawValues = this.debugState.debugUseRawValues;
  debugShowTranslatedConfig = this.debugState.debugShowTranslatedConfig;
  debugShowModelChanges = this.debugState.debugShowModelChanges;
  debugTranslatedFormConfigInitial = this.debugState.debugTranslatedFormConfigInitial;
  debugTranslatedFormConfigCurrent = this.debugState.debugTranslatedFormConfigCurrent;
  debugModelCurrent = this.debugState.debugModelCurrent;
  debugModelPrevious = this.debugState.debugModelPrevious;
  debugModelChangedPaths = this.debugState.debugModelChangedPaths;
  debugExpandedRows = this.debugState.debugExpandedRows;
  debugEventStreamEnabled = this.debugState.debugEventStreamEnabled;
  debugEventPaused = this.debugState.debugEventPaused;
  debugEventFilterType = this.debugState.debugEventFilterType;
  debugEventFilterFieldId = this.debugState.debugEventFilterFieldId;
  debugEventFilterSourceId = this.debugState.debugEventFilterSourceId;
  debugEventAutoScroll = this.debugState.debugEventAutoScroll;
  debugEventMaxItems = this.debugState.debugEventMaxItems;
  debugEvents = this.debugState.debugEvents;
  debugExpandedEventRows = this.debugState.debugExpandedEventRows;
  readonly debugEventTypes = this.debugState.debugEventTypes;
  /**
   * Reference container for dynamic components injection
   */
  @ViewChild('componentsContainer', { read: ViewContainerRef, static: false }) componentsContainer!:
    | ViewContainerRef
    | undefined;
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
    id: 'form|root',
    kind: 'form',
    name: '',
    class: 'FormComponent',
    status: FormStatus.INIT,
    componentsLoaded: false,
    isReady: false,
    children: [],
  };
  /**
   * The JSONata query source for component definitions
   */
  componentDefQuerySource?: JSONataQuerySource;
  private readonly requestParamsState = signal<FormRequestParamsMap>({});
  public readonly requestParams = this.requestParamsState.asReadonly();
  /**
   * The value change event consumer
   */
  private valueChangeEventConsumer = new FormComponentValueChangeEventConsumer(this.eventBus);
  /**
   * Form-level behaviour runtime.
   *
   * Design constraint from the implementation plan: binding must happen before
   * `FORM_DEFINITION_READY` is published so `runOnFormReady` behaviours cannot be
   * missed. The manager itself binds synchronously and lazily loads compiled
   * templates on first execution.
   */
  private behaviourManager = inject(FormBehaviourManager);

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
    if (_isEmpty(this.trimmedParams.branding())) {
      this.branding.set(elementRef.nativeElement.getAttribute('branding'));
    }
    if (_isEmpty(this.trimmedParams.portal())) {
      this.portal.set(elementRef.nativeElement.getAttribute('portal'));
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

    this.appName =
      `Form::${this.trimmedParams.recordType()}::${this.trimmedParams.formName()} ${this.trimmedParams.oid() ? ' - ' + this.trimmedParams.oid() : ''}`.trim();
    this.loggerService.debug(`'${this.logName}' waiting for '${this.trimmedParams.formName()}' deps to init...`);

    this.refreshRequestParamsFromUrl();
    this.initEffects();
  }

  protected get getFormService() {
    return this.formService;
  }

  protected async initComponent(): Promise<void> {
    this.loggerService.info(
      `${this.logName}: Loading form with OID: ${this.trimmedParams.oid()}, on edit mode:${this.editMode()}, Record Type: ${this.trimmedParams.recordType()}, formName: ${this.trimmedParams.formName()}`
    );
    try {
      this.refreshRequestParamsFromUrl();
      this.configObj = await this.configService.getConfig();
      if (this.downloadAndCreateOnInit()) {
        await this.downloadAndCreateFormComponents();
      } else {
        this.loggerService.warn(
          `${this.logName}: downloadAndCreateOnInit is set to false. Form will not be loaded automatically. Call downloadAndCreateFormComponents() manually to load the form.`
        );
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
      this.formDefMap = await this.formService.downloadFormComponents(
        this.trimmedParams.oid(),
        this.trimmedParams.recordType(),
        this.editMode(),
        this.trimmedParams.formName(),
        this.modulePaths
      );
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
        layout: [],
      });
      this.formDefMap = await this.formService.createFormComponentsMap(formConfig, parentLineagePaths);
    }
    this.componentDefArr = this.formDefMap.components;
    this.refreshTranslatedConfigDebugInfo(true);
    this.refreshComponentDebugInfo();
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
    // Behaviours subscribe before the ready event is published. This ordering is
    // deliberate and is the key runtime contract for form-level automation in v1.
    this.behaviourManager.bind(this);
    // Publish the form definition ready event
    this.eventBus.publish(createFormDefinitionReadyEvent({}));
    // Finally set the flag indicating components are loaded
    this.componentsLoaded.set(true);
  }
  /**
   * Set up the JSONata query source from component definitions
   */
  protected setupQuerySource() {
    this.componentDefQuerySource = this.formService.getJSONataQuerySource(this.componentDefArr, {
      requestParams: this.requestParams(),
    });
  }
  /**
   *
   * Getter for component definition query source
   *
   */
  public getQuerySource(): JSONataQuerySource | undefined {
    return this.componentDefQuerySource;
  }

  public refreshRequestParamsFromUrl(rawHref?: string): void {
    this.requestParamsState.set(this.parseRequestParamsFromUrl(rawHref));
    if (this.componentDefArr.length > 0) {
      this.setupQuerySource();
    }
  }

  public getRequestParam(name: string): FormRequestParamValue | undefined {
    return this.requestParams()[name];
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
      const formIsBusy = this.status() === FormStatus.SAVING || this.status() === FormStatus.DELETING;

      // Dispatch validation lifecycle actions instead of direct status mutation
      // Ignore if saving is in progress
      if (!formIsBusy) {
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
      .subscribe(async evt => {
        // Default payload handling with safe fallbacks
        const force = !!evt.force;
        const targetStep = evt.targetStep ?? '';
        const enabledValidationGroups = evt.enabledValidationGroups ?? [];
        await this.saveForm(force, targetStep, enabledValidationGroups);
      });
    this.subMaps['deleteExecuteSub'] = this.eventBus
      .select$(FormComponentEventType.FORM_DELETE_EXECUTE)
      .subscribe(async (evt) => {
        await this.deleteRecord({
          closeOnDelete: evt.closeOnDelete,
          redirectLocation: evt.redirectLocation,
          redirectDelaySeconds: evt.redirectDelaySeconds,
        });
      });
    // Listen for any changes components have made to their own definitions and update the query source
    this.subMaps['componentDefChangesRequestSub'] = this.eventBus
      .select$(FormComponentEventType.FORM_DEFINITION_CHANGE_REQUEST)
      .subscribe((evt: FormComponentEvent) => {
        // This will only fire if the Form has been initialized and components loaded successfully
        if (this.componentsLoaded()) {
          this.setupQuerySource();
          this.eventBus.publish(
            createFormDefinitionChangedEvent({
              sourceId: evt.sourceId,
            })
          );
        }
      });
    this.subMaps['formDefinitionChangedDebugSub'] = this.eventBus
      .select$(FormComponentEventType.FORM_DEFINITION_CHANGED)
      .subscribe(() => {
        this.refreshTranslatedConfigDebugInfo(false);
        this.refreshComponentDebugInfo();
      });
    this.subMaps['formStatusDirtyRequestSub'] = this.eventBus
      .select$(FormComponentEventType.FORM_STATUS_DIRTY_REQUEST)
      .subscribe((evt: FormStatusDirtyRequestEvent) => {
        if (!this.form) {
          return;
        }
        const targetControl = evt.fieldId ? this.form.get(evt.fieldId) : null;
        targetControl?.markAsDirty();
        this.form.markAsDirty();
      });
    this.subMaps['debugEventStreamSub']?.unsubscribe();
    this.subMaps['debugEventStreamSub'] = this.eventBus.selectAll$().subscribe((event: FormComponentEvent) => {
      this.debugState.captureDebugEvent(event);
    });

    this.subMaps['setValidationGroupsSub']?.unsubscribe();
    this.subMaps['setValidationGroupsSub'] = this.eventBus.select$(FormComponentEventType.FORM_VALIDATION_CHANGE_REQUEST)
      .subscribe((event: FormValidationGroupsChangeRequestEvent) => {
        const originalEnabledValidationGroups = [...this.enabledValidationGroups];
        const initial: FormValidationGroupsChangeInitial = event.initial ?? "current";
        const groups = event.groups ?? {};

        const enabledNames = this.formService.calculateValidationGroups(
          originalEnabledValidationGroups,
          this.validationGroups,
          initial,
          groups
        );

        // Set the enabled validation groups to the form component config.
        this.enabledValidationGroups = enabledNames;
        const validationGroups = this.validationGroups;
        this.componentDefArr?.forEach(mapEntry =>
          this.formService.updateValidators(mapEntry, enabledNames, validationGroups)
        );

        this.loggerService.debug(`${this.logName}: Form enabledValidationGroups changed from ${JSON.stringify(originalEnabledValidationGroups)} to ${JSON.stringify(this.enabledValidationGroups)} from event field ${event.fieldId}`);
      });

    if (this.form) {
      // Wire the form events to update the formGroupStatus signal and publish validation events
      // At the moment, the code will only emit StatusChange and PristineChange events to the EventBus.
      this.subMaps['formGroupChangesSub']?.unsubscribe();
      this.subMaps['formGroupChangesSub'] = this.form.events.subscribe(
        (formGroupEvent: StatusChangeEvent | PristineChangeEvent | ValueChangeEvent<unknown> | unknown) => {
          if (formGroupEvent instanceof StatusChangeEvent || formGroupEvent instanceof PristineChangeEvent) {
            this.broadcastFormStatus();
          }
        }
      );

      this.subMaps['formValueChangesSub']?.unsubscribe();
      this.subMaps['formValueChangesSub'] = this.form.valueChanges.subscribe(() => {
        this.refreshAllDebugInfo({ captureModelPrevious: true });
      });
    }
    // set the initial signal values...
    this.formGroupStatus.set(this.dataStatus);
    this.refreshAllDebugInfo();
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
   * Refresh the form group status signal and publish a FORM_VALIDATION_BROADCAST
   * with the current data status.
   *
   * Use this whenever a control value/state has been mutated with `emitEvent: false`
   * — e.g. expression-driven model updates — so consumers like the Save button
   * effect can re-evaluate. Without this, silent updates can leave the UI's idea
   * of validity out of sync with the FormGroup's actual state.
   */
  public broadcastFormStatus(): void {
    if (!this.form) {
      return;
    }
    this.formGroupStatus.set(this.dataStatus);
    this.eventBus.publish(
      createFormValidationBroadcastEvent({
        isValid: this.dataStatus.valid,
        errors: this.dataStatus.errors,
        status: this.dataStatus,
      })
    );
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
        const validatorConfig = this.formValidators;
        const enabledValidationGroups = this.enabledValidationGroups;
        const validationGroups = this.validationGroups;
        this.formService.setValidators(this.form, validatorConfig, enabledValidationGroups, validationGroups);
      } else if (Object.keys(formGroupMap.completeGroupMap ?? {}).length < 1) {
        // Note that a form can be composed of only components that don't have models, and so don't have FormControls.
        // That is ok. But a form must have at least one component.
        const msg = `No form controls found in the form definition. Form cannot be rendered.`;
        this.loggerService.error(`${this.logName}: ${msg}`);
        throw new Error(msg);
      }
    }
  }

  @HostBinding('class.edit-mode') get isEditMode() {
    return this.editMode();
  }

  @HostBinding('class') get hostClasses(): string {
    const modeClass = this.editMode() ? 'rb-form-edit' : 'rb-form-view';
    const debugOpenClass =
      this.debugState.isDebugEnabled() && !this.debugState.panelCollapsed() ? 'rb-form-debug-open' : '';
    const debugPopoutClass = this.debugState.isDebugPopoutWindow() ? 'rb-form-debug-popout' : '';
    const baselineClasses = `rb-form-host ${modeClass} ${debugOpenClass} ${debugPopoutClass}`.trim();
    if (!this.formDefMap?.formConfig) {
      return baselineClasses;
    }

    const cssClasses = this.editMode()
      ? this.formDefMap.formConfig.editCssClasses
      : this.formDefMap.formConfig.viewCssClasses;

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
    this.formDebugInfo.children = this.componentDefArr?.map((i, siblingIndex) =>
      this.getComponentDebugInfo(i, [], siblingIndex)
    );
    return this.formDebugInfo;
  }

  public getDebugFormValue(): Record<string, unknown> {
    return this.getPersistedFormValue();
  }

  public getDebugRawFormValue(): Record<string, unknown> {
    return this.safePlainObjectSnapshot((this.form?.getRawValue?.() ?? {}) as Record<string, unknown>);
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

  private getComponentDebugInfo(
    formFieldCompMapEntry: FormFieldCompMapEntry,
    parentNamePath: string[] = [],
    siblingIndex: number = 0
  ): DebugInfo {
    const componentEntry = formFieldCompMapEntry;
    const componentConfigClassName = formFieldCompMapEntry?.compConfigJson?.component?.class ?? '';
    const name = this.utilityService.formFieldConfigName(formFieldCompMapEntry);
    const hierarchicalNamePath = [...parentNamePath, name];
    const lineagePaths = formFieldCompMapEntry?.lineagePaths;

    const componentResult: DebugInfo = {
      id: this.buildDebugRowId(
        'component',
        formFieldCompMapEntry,
        hierarchicalNamePath,
        componentConfigClassName,
        siblingIndex
      ),
      kind: 'component',
      name: name,
      class: componentConfigClassName,
      status: componentEntry?.component?.status()?.toString() ?? '',
      viewInitialised: componentEntry?.component?.viewInitialised(),
      lineagePaths,
      componentAttributes: this.extractFieldRuntimeAttributes(componentEntry?.component),
      modelAttributes: this.extractModelRuntimeAttributes(componentEntry?.model, componentEntry?.component),
    };

    // If the component has children components, recursively get their debug info. This used to be hardcoded for specific component types, but now it is generic.
    const component = formFieldCompMapEntry?.component;
    if (Array.isArray(component?.formFieldCompMapEntries)) {
      componentResult.children = component?.formFieldCompMapEntries?.map(
        (i: FormFieldCompMapEntry, childIndex: number) =>
          this.getComponentDebugInfo(i, hierarchicalNamePath, childIndex)
      );
    }

    if (componentEntry?.layout) {
      const layoutName = formFieldCompMapEntry?.compConfigJson?.layout?.name ?? `${name}-layout`;
      const layoutNamePath = [...parentNamePath, layoutName];
      return {
        id: this.buildDebugRowId(
          'layout',
          formFieldCompMapEntry,
          layoutNamePath,
          formFieldCompMapEntry?.compConfigJson?.layout?.class ?? '',
          siblingIndex
        ),
        kind: 'layout',
        lineagePaths,
        name: layoutName,
        class: formFieldCompMapEntry?.compConfigJson?.layout?.class ?? '',
        status: componentEntry?.layout?.status()?.toString() ?? '',
        viewInitialised: componentEntry?.layout?.viewInitialised(),
        layoutAttributes: this.extractFieldRuntimeAttributes(componentEntry?.layout),
        children: [componentResult],
      };
    } else {
      return componentResult;
    }
  }

  private refreshAllDebugInfo(opts?: { captureModelPrevious?: boolean; resetConfigInitial?: boolean }) {
    this.refreshTranslatedConfigDebugInfo(!!opts?.resetConfigInitial);
    this.refreshModelDebugInfo(!!opts?.captureModelPrevious);
    this.refreshComponentDebugInfo();
    this.debugState.setFormValueSnapshots(this.getDebugFormValue(), this.getDebugRawFormValue());
  }

  private refreshTranslatedConfigDebugInfo(resetInitial: boolean) {
    this.debugState.setTranslatedConfigSnapshot(this.formDefMap?.formConfig ?? {}, resetInitial);
  }

  private refreshModelDebugInfo(captureModelPrevious: boolean) {
    this.debugState.setModelSnapshot(this.getDebugFormValue(), captureModelPrevious);
  }

  private refreshComponentDebugInfo() {
    this.debugState.setComponentDebugInfo(this.getDebugInfo());
  }

  public computeChangedPaths(
    previous: unknown,
    current: unknown,
    opts?: { maxDepth?: number; maxPaths?: number }
  ): string[] {
    return this.debugState.computeChangedPaths(previous, current, opts);
  }

  public clearDebugEvents(): void {
    this.debugState.clearDebugEvents();
  }

  public getFilteredDebugEvents() {
    return this.debugState.getFilteredDebugEvents();
  }

  public setDebugEventMaxItems(value: number | string): void {
    this.debugState.setDebugEventMaxItems(value);
  }

  private buildDebugRowId(
    kind: DebugInfo['kind'],
    entry: FormFieldCompMapEntry,
    hierarchicalNamePath: string[],
    className: string,
    siblingIndex: number
  ): string {
    const lineagePointer =
      kind === 'layout' ? entry?.lineagePaths?.layoutJsonPointer : entry?.lineagePaths?.angularComponentsJsonPointer;
    if (lineagePointer) {
      return `${kind}|${lineagePointer}`;
    }
    const recordType = this.trimmedParams.recordType() || '';
    const formName = this.trimmedParams.formName() || '';
    return `${kind}|${recordType}|${formName}|${hierarchicalNamePath.join('/') || '(no-name)'}|${className || '(no-class)'}|${siblingIndex}`;
  }

  private extractFieldRuntimeAttributes(target?: unknown): Record<string, unknown> {
    const typedTarget = target as Record<string, unknown> | undefined;
    if (!typedTarget) {
      return {};
    }
    return this.safePlainObjectSnapshot({
      status: this.safeInvoke(() => (typedTarget['status'] as () => unknown)?.()),
      viewInitialised: this.safeInvoke(() => (typedTarget['viewInitialised'] as () => unknown)?.()),
      isVisible: this.safeInvoke(() => typedTarget['isVisible']),
      isReadonly: this.safeInvoke(() => typedTarget['isReadonly']),
      isDisabled: this.safeInvoke(() => typedTarget['isDisabled']),
      isRequired: this.safeInvoke(() => typedTarget['isRequired']),
      isValid: this.safeInvoke(() => typedTarget['isValid']),
      showValidState: this.safeInvoke(() => typedTarget['showValidState']),
      hostBindingCssClasses: this.safeInvoke(() => typedTarget['hostBindingCssClasses']),
      name: this.safeInvoke(() => typedTarget['name']),
      className: this.safeInvoke(() => typedTarget['className']),
    });
  }

  private extractModelRuntimeAttributes(model?: unknown, component?: unknown): Record<string, unknown> {
    if (!model) {
      return {};
    }
    const typedModel = model as Record<string, unknown>;
    const typedComponent = component as Record<string, unknown> | undefined;
    const modelFormControl = this.safeInvoke(() => typedComponent?.['formControl']) ?? typedModel['formControl'];
    const typedFormControl = (modelFormControl ?? {}) as Record<string, unknown>;
    return this.safePlainObjectSnapshot({
      name: typedModel['name'],
      validators: typedModel['validators'],
      value: this.safeInvoke(() => (typedModel['getValue'] as () => unknown)?.()),
      formControl: {
        value: typedFormControl['value'],
        status: typedFormControl['status'],
        errors: typedFormControl['errors'],
        pristine: typedFormControl['pristine'],
        dirty: typedFormControl['dirty'],
        touched: typedFormControl['touched'],
        untouched: typedFormControl['untouched'],
        disabled: typedFormControl['disabled'],
        enabled: typedFormControl['enabled'],
        pending: typedFormControl['pending'],
        valid: typedFormControl['valid'],
        invalid: typedFormControl['invalid'],
      },
    });
  }

  private safeInvoke<T>(callable: () => T): T | undefined {
    try {
      return callable();
    } catch (error) {
      this.loggerService.debug(`${this.logName}: debug safeInvoke failed`, error);
      return undefined;
    }
  }

  private safePlainObjectSnapshot(value: unknown): Record<string, unknown> {
    return this.debugState.safePlainObjectSnapshot(value);
  }

  // Convenience method to find component definition by name, defaults to the this.componentDefArr if no array is provided.
  public getComponentDefByName(
    name: string,
    componentDefArr: FormFieldCompMapEntry[] = this.componentDefArr
  ): FormFieldCompMapEntry | undefined {
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

  public async saveForm(
    forceSave: boolean = false,
    targetStep: string = '',
    enabledValidationGroups: string[] = ['all']
  ) {
    // Check if the form is ready, defined, modified OR forceSave is set
    // Status check will ensure saves requests will not overlap within the Angular Form app context
    const formIsSaving = _isNull(this.saveResponse());
    const formIsModified = this.form?.dirty || forceSave;
    // At this point, only the validators that we want to run will be set on the angular components.
    const formIsValid = this.form?.valid || forceSave;

    if (this.form && formIsModified) {
      if (formIsValid && !formIsSaving) {
        this.saveResponse.set(null); // Indicate save in progress
        this.loggerService.info(
          `${this.logName}: Form valid flag: ${this.form.valid}, targetStep: ${targetStep}, enabledValidationGroups: ${enabledValidationGroups}. Saving...`
        );
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
                response,
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
          this.saveResponse.set({
            success: false,
            oid: this.trimmedParams.oid(),
            message: errorMsg,
          } as RecordActionResult);
          // Mark form as dirty again since save failed
          this.form.markAllAsDirty();
          // emit failure event
          this.eventBus.publish(createFormSaveFailureEvent({ error: errorMsg }));
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
      this.eventBus.publish(createFormSaveFailureEvent({ error: message }));
    }
  }

  public async deleteRecord(options?: { closeOnDelete?: boolean; redirectLocation?: string; redirectDelaySeconds?: number }) {
    const oid = this.trimmedParams.oid();
    if (_isEmpty(oid)) {
      this.eventBus.publish(createFormDeleteFailureEvent({ error: 'Cannot delete a record without an oid' }));
      return;
    }

    try {
      const response = await this.recordService.delete(oid);
      if (!response || !_get(response, 'success', false)) {
        const errorMessage = _get(response, 'message')?.toString() ?? 'Delete failed: invalid response from server';

        this.eventBus.publish(
          createFormDeleteFailureEvent({ error: errorMessage })
        );
      } else {
        this.eventBus.publish(
          createFormDeleteSuccessEvent({
            oid,
            response,
            closeOnDelete: options?.closeOnDelete,
            redirectLocation: options?.redirectLocation,
            redirectDelaySeconds: options?.redirectDelaySeconds,
          })
        );

        if (options?.closeOnDelete && !_isEmpty(options?.redirectLocation)) {
          const redirectLocation = this.resolveRedirectLocation(String(options.redirectLocation), oid);
          const redirectDelaySeconds = Math.max(0, Number(options.redirectDelaySeconds ?? 3));
          window.setTimeout(() => {
            window.location.href = redirectLocation;
          }, redirectDelaySeconds * 1000);
        }
      }
    } catch (error: unknown) {
      this.loggerService.error(`${this.logName}: Error occurred while deleting form record:`, error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      this.eventBus.publish(createFormDeleteFailureEvent({ error: errorMsg }));
    }
  }

  /**
   * Get the compiled items for the form with the default values.
   */
  public async getFormCompiledItems(): Promise<DynamicScriptResponse> {
    const recordType = this.trimmedParams.recordType();
    const formMode = this.editMode() ? 'edit' : 'view';
    // Response is cached in utilityService.getDynamicImport.
    return await this.formService.getDynamicImportFormCompiledItems(recordType, undefined, formMode);
  }

  /**
   * Get the compiled items for the form with the record's values.
   */
  public async getRecordCompiledItems(): Promise<DynamicScriptResponse> {
    const recordType = this.trimmedParams.recordType();
    const oid = this.trimmedParams.oid();
    const formMode = this.editMode() ? 'edit' : 'view';
    // Response is cached in utilityService.getDynamicImport.
    return await this.formService.getDynamicImportFormCompiledItems(recordType, oid, formMode);
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
      status: (this.form?.status as FormControlStatus) || 'DISABLED',
    } as FormGroupStatus;
  }

  /**
   * Get the available validation group definitions.
   */
  public get validationGroups() {
    return this.formDefMap?.formConfig?.validationGroups ?? {};
  }

  /**
   * Get the form-level validators.
   */
  public get formValidators() {
    return this.formDefMap?.formConfig?.validators ?? [];
  }

  /**
   * Get the currently enabled validation group names.
   */
  public get enabledValidationGroups(): string[] {
    return this.formDefMap?.formConfig.enabledValidationGroups ?? [];
  }

  /**
   * Set the enabled validation groups by name.
   * All other validation groups are disabled.
   * @param value The validation groups to enable.
   */
  public set enabledValidationGroups(value: string[] | null | undefined) {
    if (this.formDefMap) {
      _set(this.formDefMap, 'formConfig.enabledValidationGroups', value ?? []);
    }
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    // Clean up subscriptions
    Object.values(this.subMaps).forEach(sub => sub.unsubscribe());
    this.focusRequestCoordinator.destroy();
    this.behaviourManager.destroy();
  }

  public get componentQuerySource(): JSONataQuerySource | undefined {
    return this.componentDefQuerySource;
  }

  public get formConfigMeta(): Record<string,unknown> {
    return this.formDefMap?.formConfigMeta ?? {};
  }

  private parseRequestParamsFromUrl(rawHref?: string): FormRequestParamsMap {
    const fallbackOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const href = rawHref ?? (typeof window !== 'undefined' ? window.location.href : fallbackOrigin);
    const parsedUrl = new URL(href, fallbackOrigin);
    const search = parsedUrl.search.startsWith('?') ? parsedUrl.search.slice(1) : parsedUrl.search;
    if (_isEmpty(search)) {
      return {};
    }

    const requestParams: Record<string, FormRequestParamValue> = {};
    for (const rawSegment of search.split('&')) {
      if (_isEmpty(rawSegment)) {
        continue;
      }

      const hasEquals = rawSegment.includes('=');
      const [rawName, ...rawValueParts] = rawSegment.split('=');
      const name = this.decodeRequestParamSegment(rawName);
      if (_isEmpty(name)) {
        continue;
      }

      const value = hasEquals ? this.decodeRequestParamSegment(rawValueParts.join('=')) : true;

      requestParams[name] = this.mergeRequestParamValue(requestParams[name], value);
    }

    return requestParams;
  }

  private decodeRequestParamSegment(segment: string): string {
    const normalizedSegment = segment.replace(/\+/g, ' ');
    try {
      return decodeURIComponent(normalizedSegment);
    } catch (error) {
      this.loggerService.warn(
        `${this.logName}: Failed to decode request parameter segment. Falling back to the raw segment.`,
        {
          error,
          segment,
        }
      );
      return normalizedSegment;
    }
  }

  private mergeRequestParamValue(
    existingValue: FormRequestParamValue | undefined,
    nextValue: FormRequestParamValue
  ): FormRequestParamValue {
    if (existingValue === undefined) {
      return nextValue;
    }

    if (existingValue === true && nextValue === true) {
      return true;
    }

    const existingValues = existingValue === true ? [] : Array.isArray(existingValue) ? existingValue : [existingValue];
    const nextValues = nextValue === true ? [] : Array.isArray(nextValue) ? nextValue : [nextValue];
    const mergedValues = [...existingValues, ...nextValues];

    return mergedValues.length > 0 ? mergedValues : true;
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
        this.loggerService.warn(
          `${this.logName}: Invalid brandingAndPortalUrl '${brandingAndPortalUrl}', falling back to relative path.`
        );
      }
    }
    return `record/edit/${createdOid}`;
  }

  private resolveRedirectLocation(template: string, oid: string): string {
    const contextVariables = (this.formConfigMeta["contextVariables"] ?? {}) as Record<string, unknown>;
    return template
      .replaceAll('@oid', oid)
      .replaceAll('@branding', String(contextVariables['@branding'] ?? '@branding'))
      .replaceAll('@portal', String(contextVariables['@portal'] ?? '@portal'));
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
