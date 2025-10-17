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
  computed,
  model,
  OnDestroy
} from '@angular/core';
import { Subscription } from 'rxjs';
import { Location, LocationStrategy, PathLocationStrategy } from '@angular/common';
import { FormGroup, FormControlStatus } from '@angular/forms';
import { isEmpty as _isEmpty, isString as _isString, isNull as _isNull, isUndefined as _isUndefined, set as _set, get as _get, trim as _trim } from 'lodash-es';
import { ConfigService, LoggerService, TranslationService, BaseComponent, FormFieldCompMapEntry, UtilityService, RecordService, RecordActionResult } from '@researchdatabox/portal-ng-common';
import { FormStatus, FormConfigFrame } from '@researchdatabox/sails-ng-common';
import {FormBaseWrapperComponent} from "./component/base-wrapper.component";
import { FormComponentsMap, FormService } from './form.service';


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
/**

 */
@Component({
    selector: 'redbox-form',
    templateUrl: './form.component.html',
    styleUrls: ['./form.component.scss'],
    providers: [Location, { provide: LocationStrategy, useClass: PathLocationStrategy }],
    standalone: false
})
export class FormComponent extends BaseComponent implements OnDestroy {
  private logName: string = "FormComponent";
  appName: string;
  oid = model<string>('');
  recordType = model<string>('');
  editMode = model<boolean>(true);
  formName = model<string>('');
  downloadAndCreateOnInit = model<boolean>(true);
  // Convenience map of trimmed string params
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
  formDefMap?: FormComponentsMap;
  modulePaths:string[] = [];

  status = signal<FormStatus>(FormStatus.INIT);
  componentsLoaded = signal<boolean>(false);
  statusChangesSubscription?: Subscription;

  debugFormComponents = signal<Record<string, unknown>>({});

  @ViewChild('componentsContainer', { read: ViewContainerRef, static: false }) componentsContainer!: ViewContainerRef | undefined;

  recordService = inject(RecordService);
  saveResponse = signal<RecordActionResult | undefined>(undefined);

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

    this.appName = `Form::${this.trimmedParams.recordType()}::${this.trimmedParams.formName()} ${ this.trimmedParams.oid() ? ' - ' + this.trimmedParams.oid() : ''}`.trim();
    this.loggerService.debug(`'${this.logName}' waiting for '${this.trimmedParams.formName()}' deps to init...`);

    effect(() => {
      if (this.componentsLoaded()) {
        this.registerUpdateExpression();
      }
    });

    // Monitor async validation state using Angular signals effect
    effect(() => {
      const formGroupStatus = this.formGroupStatus();
      const currentPending = formGroupStatus?.pending || false;
      const wasPending = this.previousFormGroupStatus()?.pending || false;
      const isValid = formGroupStatus?.valid || false;
      const wasValid = this.previousFormGroupStatus()?.valid || false;
      const inSaving = this.status() === FormStatus.SAVING;

      let next: FormStatus | null = null;
      if (currentPending && !inSaving) {
        next = FormStatus.VALIDATION_PENDING;
      } else if (wasPending && !currentPending && !isValid && !inSaving) {
        next = FormStatus.VALIDATION_ERROR;
      } else if (wasPending && !currentPending && isValid && this.status() === FormStatus.VALIDATION_PENDING) {
        next = FormStatus.READY;
      } else if (!wasValid && isValid && !currentPending && wasPending) {
        next = FormStatus.READY;
      }

      if (next !== null && this.status() !== next) {
        this.status.set(next);
      }
      this.previousFormGroupStatus.set(formGroupStatus);
    });
  }

  protected get getFormService(){
    return this.formService;
  }

  protected async initComponent(): Promise<void> {
    this.loggerService.info(`${this.logName}: Loading form with OID: ${this.trimmedParams.oid()}, on edit mode:${this.editMode()}, Record Type: ${this.trimmedParams.recordType()}, formName: ${this.trimmedParams.formName()}`);
    try {
      if (this.downloadAndCreateOnInit()) {
        await this.downloadAndCreateFormComponents();
      } else {
        this.loggerService.warn(`${this.logName}: downloadAndCreateOnInit is set to false. Form will not be loaded automatically. Call downloadAndCreateFormComponents() manually to load the form.`);
      }
    } catch (error) {
      this.loggerService.error(`${this.logName}: Error loading form`, error);
      this.status.set(FormStatus.LOAD_ERROR);
      throw error;
    }
  }

  public async downloadAndCreateFormComponents(formConfig?: FormConfigFrame): Promise<void> {
    if (!formConfig) {
      this.loggerService.info(`${this.logName}: creating form definition by downloading config`);
      this.formDefMap = await this.formService.downloadFormComponents(this.trimmedParams.oid(), this.trimmedParams.recordType(), this.editMode(), this.trimmedParams.formName(), this.modulePaths);
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
    for (const componentDefEntry of this.componentDefArr){
      const componentRef = compContainerRef.createComponent(FormBaseWrapperComponent);
      componentRef.instance.defaultComponentConfig = this.formDefMap?.formConfig?.defaultComponentConfig;
      componentRef.changeDetectorRef.detectChanges();

      await componentRef.instance.initWrapperComponent(componentDefEntry);
    }
    // Moved the creation of the FormGroup to after all components are created, allows for components that have custom management of their children components.
    await this.createFormGroup();
    // Set the status to READY if all components are loaded
    this.status.set(FormStatus.READY);
    this.componentsLoaded.set(true);
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
        if (this.form) {
          this.statusChangesSubscription?.unsubscribe();
          this.statusChangesSubscription = this.form.statusChanges.subscribe((status: any) => {
            this.formGroupStatus.set(this.dataStatus);
          });
          this.form.valueChanges.subscribe(() => this.debugFormComponents.set(this.getDebugInfo()));
        }

        // set up validators
        const validatorConfig = this.formDefMap.formConfig.validators;
        const validators = this.formService.createFormValidatorInstances(validatorConfig);
        this.formService.setValidators(this.form, validators);
      } else if (Object.keys(formGroupMap.completeGroupMap ?? {}).length < 1) {
        // Note that a form can be composed of only components that don't have models, and so don't have FormControls.
        // That is ok. But a form must have at least one component.
        const msg = `No form controls found in the form definition. Form cannot be rendered.`;
        this.loggerService.error(`${this.logName}: ${msg}`);
        throw new Error(msg);
      }
    }
  }

  protected async getAndApplyUpdatedDataModel(){
    const dataModel = await this.formService.getModelData(this.trimmedParams.oid(), this.trimmedParams.recordType());
    this.form?.patchValue(dataModel);
  }

  protected registerUpdateExpression(){
    if(this.componentsLoaded()) {
      if(!_isUndefined(this.form)) {
        this.form.valueChanges.subscribe((value) => {
          for(let compEntry of this.componentDefArr) {
            let compName = _get(compEntry,'name','');
            // this.loggerService.info(`FormComponent: valueChanges: `, compName);
            if(!_isNull(compEntry.component) && !_isUndefined(compEntry.component)) {
              // this.loggerService.info('FormComponent: valueChanges ',_get(compEntry.component.componentDefinition,'class',''));
              let component = compEntry.component;
              component.checkUpdateExpressions();
            }
          }
        });
      }
    }
  }

  @HostBinding('class.edit-mode') get isEditMode() {
    return this.editMode();
  }

  @HostBinding('class') get hostClasses(): string {
    if (!this.formDefMap?.formConfig) {
      return '';
    }

    const cssClasses = this.editMode() ? this.formDefMap.formConfig.editCssClasses : this.formDefMap.formConfig.viewCssClasses;

    if (!cssClasses) {
      return '';
    }

    if (_isString(cssClasses)) {
      return cssClasses;
    }

    // If cssClasses is an object with key-value pairs, transform it to space-delimited string
    // where keys with truthy values become class names
    return Object.entries(cssClasses)
      .filter(([_, value]) => value)
      .map(([className, _]) => className)
      .join(' ');
  }

  public getValidationErrors(){
    const components = this.formDefMap?.formConfig.componentDefinitions;
    return this.formService.getFormValidatorSummaryErrors(components, null, this.form);
  }

  public getDebugInfo(): DebugInfo {
    return {
      name: "",
      class: 'FormComponent',
      status: this.status(),
      componentsLoaded: this.componentsLoaded(),
      isReady: this.isReady,
      children: this.componentDefArr?.map(i => this.getComponentDebugInfo(i)),
    };
  }

  private getComponentDebugInfo(formFieldCompMapEntry: FormFieldCompMapEntry): DebugInfo {
    const componentEntry = formFieldCompMapEntry;
    this.loggerService.debug('getComponentDebugInfo', formFieldCompMapEntry);
    const componentConfigClassName = formFieldCompMapEntry?.compConfigJson?.component?.class ?? "";
    const name = formFieldCompMapEntry?.compConfigJson?.name || formFieldCompMapEntry?.name || "(not set)";

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

  public async saveForm(forceSave: boolean = false, targetStep: string = '', skipValidation: boolean = false) {
    // Check if the form is ready, defined, modified OR forceSave is set
    // Status check will ensure saves requests will not overlap within the Angular Form app context
    if (this.status() === FormStatus.READY && this.form && (this.form.dirty || forceSave)) {
      if (this.form.valid || skipValidation) {
        this.loggerService.info(`${this.logName}: Form valid flag: ${this.form.valid}, skipValidation: ${skipValidation}. Submitting...`);
        // Here you can handle the form submission, e.g., send it to the server
        this.loggerService.debug(`${this.logName}: Form value:`, this.form.value);
        // set status to 'saving'
        this.status.set(FormStatus.SAVING);
        try {
          let response: RecordActionResult;
          if (_isEmpty(this.trimmedParams.oid())) {
            response = await this.recordService.create(this.form.value, this.trimmedParams.recordType(), targetStep);
          } else {
            response = await this.recordService.update(this.trimmedParams.oid(), this.form.value, targetStep);
          }
          if (response?.success) {
            this.loggerService.info(`${this.logName}: Form submitted successfully:`, response);
            this.form.markAsPristine();
          } else {
            this.loggerService.warn(`${this.logName}: Form submission failed:`, response);
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
        }
        // set back to ready when all processing is complete
        this.status.set(FormStatus.READY);
      } else {
        this.loggerService.warn(`${this.logName}: Form is invalid. Cannot submit.`);
        // Handle form errors, e.g., show a message to the user
      }
    } else {
      this.loggerService.info(`${this.logName}: Form is not ready/defined, dirty or forceSave is false. No action taken.`);
    }
  }

  public async getCompiledItem() {
    const recordType = this.trimmedParams.recordType();
    const result = await this.formService.getDynamicImportFormCompiledItems(recordType);
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
    this.statusChangesSubscription?.unsubscribe();
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
