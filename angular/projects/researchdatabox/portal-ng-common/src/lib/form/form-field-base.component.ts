import { FormFieldModel } from './base.model';
import { FormControl, FormGroup } from '@angular/forms';
import { Directive, HostBinding, ViewChild, signal, inject, TemplateRef, ViewContainerRef, ComponentRef, ApplicationRef, AfterViewInit, DoCheck } from '@angular/core'; // Import HostBinding, ViewChild, ViewContainerRef, and ComponentRef
import { LoggerService } from '../logger.service';
import { get as _get, isEmpty as _isEmpty, isUndefined as _isUndefined, has as _has, set as _set, keys as _keys} from 'lodash-es';
import {UtilityService} from "../utility.service";
import {FormComponentDefinition, FormComponentLayoutDefinition, FormFieldComponentDefinition, FormFieldComponentStatus, TooltipsModel} from '@researchdatabox/sails-ng-common';
import { LoDashTemplateUtilityService } from '../lodash-template-utility.service';


/**
 * Base class for form components. Data binding to a form field is optional.
 *
 * Notes:
 *  - No 'field' property to enforce type safety, i.e. avoid `any`
 *
 */
@Directive()
export abstract class FormFieldBaseComponent<ValueType> implements AfterViewInit {
  protected logName: string | null = "FormFieldBaseComponent";
  public name:string = '';
  public model?: FormFieldModel<ValueType> | null | undefined = null;
  public componentDefinition?: FormFieldComponentDefinition | FormComponentLayoutDefinition;
  public componentDefinitionCache: any = {};
  public formFieldCompMapEntry?: FormFieldCompMapEntry | null | undefined = null;
  // public hostBindingCssClasses: { [key: string]: boolean } | null | undefined = null;
  public hostBindingCssClasses: string| null | undefined = null;
  public isVisible: boolean = true;
  public isDisabled: boolean = false;
  public isReadonly: boolean = false;
  public needsAutofocus: boolean = false;
  public label: string = '';
  public helpText: string = '';
  public tooltips: TooltipsModel | null | undefined = null;
  // The status of the component
  public status = signal<FormFieldComponentStatus>(FormFieldComponentStatus.INIT);

  protected viewInitialised = signal<boolean>(false);

  @ViewChild('beforeContainer', { read: ViewContainerRef, static: false }) protected beforeContainer!: ViewContainerRef;
  @ViewChild('afterContainer', { read: ViewContainerRef, static: false }) protected afterContainer?: ViewContainerRef | null;

  public expressions: any[] = [];
  public expressionStateChanged: boolean = false;

  protected lodashTemplateUtilityService: LoDashTemplateUtilityService = inject(LoDashTemplateUtilityService);


  protected utilityService = inject(UtilityService);
  protected loggerService: LoggerService = inject(LoggerService);

  /**
   * For obtaining a reference to the FormComponent instance.
   * @private
   */
  private appRef: ApplicationRef = inject(ApplicationRef);
  private componentViewReady:boolean = false;
  /**
   * Cache the reference to the FormComponent instance.
   * @private
   */
  private formComponent?:any;
  /**
   * Cache the reference to the FormGroup instance.
   * @private
   */
  private form?: FormGroup;

  /**
   * This method is called to initialize the component with the provided configuration.
   *
   * The framework expects the method to prepare the component for rendering, and at minimum, should prepare:
   *
   * - Any external/remote data sources
   * - The model responsible for the data binding
   * - Any static or dynamic styling or layout information, including CSS classes
   * - Any event handlers
   *
   * For more advanced use cases, override method to define the component init behavior. Just don't forget to call 'super.setComponentReady()' or change the status manually, when the component is ready.
   *
   * @param formFieldCompMapEntry
   */
  async initComponent(formFieldCompMapEntry: FormFieldCompMapEntry | null | undefined): Promise<void> {
    if (!formFieldCompMapEntry) {
      throw new Error(`${this.logName}: cannot initialise component because formFieldCompMapEntry was invalid.`);
    }
    const name = this.utilityService.getNameClass(formFieldCompMapEntry);
    this.loggerService.debug(`${this.logName}: starting initialise component for '${name}'.`);
    try {
      // Create a method that children can override to set their own properties
      this.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
      await this.initData();
      await this.initLayout();
      await this.initEventHandlers();
      // Create a method that children can override to prepare their state.
      await this.setComponentReady();
    } catch (error) {
      this.loggerService.error(`${this.logName}: initialise component failed`, error);
      this.status.set(FormFieldComponentStatus.ERROR);
    }
  }
  
  // ngDoCheck() {
    // if(this.componentViewReady) {
      //Checking expressions undefined ensures it runs only for components that have expressions defined in their component definition
      //the string passed in "dom" is only for tracking and not needed for the expressions logic to work
      // this.checkUpdateExpressions('dom');
    // }
  // }

  public checkUpdateExpressions(expressionType: string = '') {

    if(!_isUndefined(this.expressions) && !_isEmpty(this.expressions)) {
      this.loggerService.info('checkUpdateExpressions ',_get(this.componentDefinition,'class',''));
      this.loggerService.info('checkUpdateExpressions name ',this.name);
      this.loggerService.info('checkUpdateExpressions expressionType ',expressionType);
      let expressionKeys = _keys(this.expressions);
      for(let key of expressionKeys) {
        let expObj:any = _get(this.expressions,key,{});
        if(!_isUndefined(expObj) && !_isEmpty(expObj)) {

          let value:any = null;
          let data = this.model?.formControl?.value;
          let path = key.split('.');
          let targetPropertyPath = path[1];
          if (_get(expObj,'expression.template','').indexOf('<%') != -1) {
            let config = { template: _get(expObj,'expression.template') };
            let v = this.lodashTemplateUtilityService.runTemplate(data,config,{},this,this.getFormGroup()?.value);
            value = v === 'false' ? false : v;
          } else {
            let v = _get(this.componentDefinition,_get(expObj,'value',null));
            value = v === 'false' ? false : v;
          }

          let targetComponentName = _get(expObj,'targetComponent','');

          if(targetComponentName != '') {

            try {

              let formComponent = this.getFormComponent2();

              if(!_isUndefined(formComponent)) {
                let components = formComponent.instance.components;

                for(let compEntry of components) {
                  let compName = _get(compEntry,'name','');
                  if(compName == targetComponentName) {
                    if (_has(compEntry.component.componentDefinition.config,targetPropertyPath)) {
                      compEntry.component.componentDefinition.config[targetPropertyPath] = value;
                      this.loggerService.info(`checkUpdateExpressions property '${targetPropertyPath}' found in component.componentDefinition.config `,compName);
                    } else if (_has(compEntry.layout.componentDefinition.config,targetPropertyPath)) {
                      compEntry.layout.componentDefinition.config[targetPropertyPath] = value;
                      //the string passed in from layout component bound to clickedBy property is only for tracking and not needed for the expressions logic to work
                      this.loggerService.info('checkUpdateExpressions clickedBy ',compEntry.layout.clickedBy);
                      this.loggerService.info(`checkUpdateExpressions property '${targetPropertyPath}' found in layout.componentDefinition.config `,compName);
                    } else {
                      this.loggerService.info(`checkUpdateExpressions property '${targetPropertyPath}' does not exist on target component or layout `,compName);
                    }

                    compEntry.component.expressionStateChanged = compEntry.component.hasExpressionsConfigChanged();
                    compEntry.layout.expressionStateChanged = compEntry.layout.hasExpressionsConfigChanged();
                    if(compEntry.component.expressionStateChanged) {
                      this.loggerService.info(`checkUpdateExpressions compEntry.component.expressionStateChanged ${this.expressionStateChanged}`,'');
                      compEntry.component.initChildConfig();
                    } else if(compEntry.layout.expressionStateChanged) {
                      this.loggerService.info(`checkUpdateExpressions compEntry.layout.expressionStateChanged ${this.expressionStateChanged}`,'');
                      compEntry.layout.initChildConfig();
                    }
                  }
                }
              }

            } catch (err) {
              this.loggerService.error('checkUpdateExpressions failed', err);
            }

          } else {

            if(!_isUndefined(this.componentDefinition)) {

              let targetLayout = key.includes('layout.') ? true : false;
              if(targetLayout && _has(this.formFieldCompMapEntry?.layout?.componentDefinition?.config,targetPropertyPath)) {
                _set(this.formFieldCompMapEntry?.layout?.componentDefinition,'config.'+targetPropertyPath,value);
                this.loggerService.info(`checkUpdateExpressions property '${targetPropertyPath}' found in layout componentDefinition.config `,this.name);
              } else if (!targetLayout && _has(this.componentDefinition.config,targetPropertyPath)) {
                _set(this.componentDefinition,'config.'+targetPropertyPath,value);
                this.loggerService.info(`checkUpdateExpressions property '${targetPropertyPath}' found in componentDefinition.config `,this.name);
              }

              this.expressionStateChanged = this.hasExpressionsConfigChanged();
              this.loggerService.info(`checkUpdateExpressions expressionStateChanged ${this.expressionStateChanged}`,'');
              if(this.expressionStateChanged) {
                this.initChildConfig();
              } else if (this.formFieldCompMapEntry?.layout?.hasExpressionsConfigChanged()) {
                this.loggerService.info(`checkUpdateExpressions layout expressionStateChanged`,'');
                this.initChildConfig();
              }

            }
          }

        }
      }
    }
  }

  ngAfterViewInit() {

    //normalise componentDefinition that is used to track property changes given these may not be present
    _set(this.componentDefinition as object,'config.visible',this.componentDefinition?.config?.visible ?? true);
    _set(this.componentDefinition as object,'config.disabled',this.componentDefinition?.config?.disabled ?? false);
    _set(this.componentDefinition as object,'config.readonly',this.componentDefinition?.config?.readonly ?? false);
    _set(this.componentDefinition as object,'config.autofocus',this.componentDefinition?.config?.autofocus ?? false);
    _set(this.componentDefinition as object,'config.label',this.componentDefinition?.config?.label ?? '');
    _set(this.componentDefinition as object,'config.tooltips',this.componentDefinition?.config?.tooltips ?? null);

    this.initConfig();
    this.componentViewReady = true;
    this.loggerService.debug(`FieldComponent ngAfterViewInit: componentViewReady:`, this.componentViewReady);
    this.viewInitialised.set(true);
  }

  public abstract initChildConfig():void;


  protected initConfig() {
      this.isVisible = this.componentDefinition?.config?.visible ?? true;
      this.isDisabled = this.componentDefinition?.config?.disabled ?? false;
      this.isReadonly = this.componentDefinition?.config?.readonly ?? false;
      this.needsAutofocus = this.componentDefinition?.config?.autofocus ?? false;
      this.label = this.componentDefinition?.config?.label ?? '';
      this.tooltips = this.componentDefinition?.config?.tooltips ?? null;

      this.componentDefinitionCache = {
        visible: this.componentDefinition?.config?.visible,
        disabled: this.componentDefinition?.config?.disabled,
        readonly: this.componentDefinition?.config?.readonly,
        autofocus: this.componentDefinition?.config?.autofocus,
        label: this.componentDefinition?.config?.label,
        tooltips: this.componentDefinition?.config?.tooltips
      }
  }

  hasExpressionsConfigChanged(): boolean {
    let propertyChanged = false;
    for(let key of _keys(this.componentDefinitionCache)) {
      let newValue = _get(this.componentDefinition?.config,key);
      let oldValue = _get(this.componentDefinitionCache,key);
      let configPropertyChanged = oldValue !== newValue;
      if(configPropertyChanged) {
        propertyChanged = true;
        this.loggerService.info(`key ${key} oldValue ${oldValue} newValue ${newValue} propertyChanged ${propertyChanged}`,'');
        break;
      }
    }
    return propertyChanged;
  }

  get isDebug(): boolean {
    const formComponent = this.getFormComponent2();
    return formComponent?.formDefMap?.formConfig?.debugValue ?? false;
  }

  protected getFormComponent2(): any {
    if(this.formComponent === undefined) {
      this.formComponent = this.appRef.components[0];
    }
    return this.formComponent;
  }

  protected getFormGroup(): FormGroup | undefined {
    if(this.form == undefined) {
      this.form = this.getFormComponent2()?.instance?.form;
    }
    return this.form;
  }

  public getComponentByName(targetComponentName:string): any {
    let compRef;
    try {
      let formComponent = this.getFormComponent2();

      if(!_isUndefined(formComponent)) {
        let components = formComponent.instance.components;

        for(let compEntry of components) {
          let compName = _get(compEntry,'name','');
          if(compName == targetComponentName) {
            compRef = compEntry.component;
            return compRef;
          }
        }
      }
    } catch (err) {
      this.loggerService.error('checkUpdateExpressions failed', err);
    }
    return compRef;
  }

  public getLayoutByName(targetComponentName:string): any {
    let layoutRef;
    try {
      let formComponent = this.getFormComponent2();

      if(!_isUndefined(formComponent)) {
        let components = formComponent.instance.components;

        for(let compEntry of components) {
          let layoutName = _get(compEntry,'name','');
          if(layoutName == targetComponentName) {
            layoutRef = compEntry.layout;
            return layoutRef;
          }
        }
      }
    } catch (err) {
      this.loggerService.error('checkUpdateExpressions failed', err);
    }
    return layoutRef;
  }

  protected setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry) {
    if (!formFieldCompMapEntry) {
      throw new Error(`${this.logName}: cannot set component properties because formFieldCompMapEntry was invalid.`);
    }
    this.formFieldCompMapEntry = formFieldCompMapEntry;
    this.formFieldCompMapEntry.component = this as FormFieldBaseComponent<ValueType>;
    this.model = this.formFieldCompMapEntry?.model as FormFieldModel<ValueType> | null;
    this.componentDefinition = this.formFieldCompMapEntry.compConfigJson?.component as FormFieldComponentDefinition | FormComponentLayoutDefinition;
  }
  /**
   * Retrieve or compute any data needed for the component.
   */
  protected async initData() {
  }
  /**
   * Prepare any layout-specific information, including CSS classes.
   */
  protected async initLayout() {
    this.initHostBindingCssClasses();
  }
  /**
   * Prepare the event handlers for this component.
   */
  protected async initEventHandlers() {
  }
  /**
  * Prepare the CSS classes for the host element.
  */
  protected initHostBindingCssClasses() {
    // If the component definition has default CSS classes, use them.
    if (this.componentDefinition?.config?.hostCssClasses !== undefined) {
      if (typeof this.componentDefinition.config.hostCssClasses === 'string') {
        // this.hostBindingCssClasses = { [this.componentDefinition.config.hostCssClasses]: true };
        this.hostBindingCssClasses = this.componentDefinition.config.hostCssClasses;
      } 
    } else {
      if (this.componentDefinition?.config?.defaultComponentCssClasses) {
        if (typeof this.componentDefinition.config?.defaultComponentCssClasses === 'string') {
          // this.hostBindingCssClasses = { [this.componentDefinition.config?.defaultComponentCssClasses]: true };
          this.hostBindingCssClasses = this.componentDefinition.config?.defaultComponentCssClasses;
        } else {
        // Assuming it's already in the desired { [key: string]: boolean } format
        // this.hostBindingCssClasses = this.config.defaultComponentCssClasses;
        }
      } else {
        this.hostBindingCssClasses = null; // No default classes provided
        // this.hostBindingCssClasses = {}; // Initialize as empty object if no default classes
      }
    }
  }

  /**
   * The FormControl instance for this field.
   */
  get formControl(): FormControl<ValueType> {
    const control = this.model?.formControl;
    if (!control) {
      // Return a dummy control or throw, depending on desired behavior
      const name = this.utilityService.getNameClass(this.formFieldCompMapEntry);
      throw new Error(`${this.logName}: could not get form control from model for '${name}'.`);
    }
    return control as FormControl<ValueType>;
  }

  get isRequired(): boolean {
    return this.model?.validators?.some(v => v?.name === 'required') ?? false;
  }

  get isValid(): boolean {
    return Object.keys(this.formControl?.errors ?? {}).length === 0;
  }

  // Use @HostBinding to bind to the host element's class attribute
  // This getter returns an object similar to what you'd pass to [ngClass]
  @HostBinding('class') public get hostClasses() {
    return this.hostBindingCssClasses;
  }

  /**
   * Get the template reference for the specified template name.
   *
   * @param templateName - The name of the template to retrieve.
   * @returns The TemplateRef instance or null if not found.
   */
  getTemplateRef(templateName: string): TemplateRef<any> | null {
    return _get(this.formFieldCompMapEntry, `componentTemplateRefMap.${templateName}`, null);
  }
  /**
   * Convenience method to check if a template reference exists for the specified template name.
   */
  hasTemplateRef(templateName: string): boolean {
    return !_isEmpty(this.getTemplateRef(templateName));
  }

  /**
   * Set the component status to READY.
   */
  protected async setComponentReady() {
    const name = this.utilityService.getNameClass(this.formFieldCompMapEntry);
    this.loggerService.debug(`${this.logName}: in setComponentReady component '${name}' is ready.`);
    this.status.set(FormFieldComponentStatus.READY);
  }

  isStatusReady(): boolean {
    return this.status() === FormFieldComponentStatus.READY;
  }

  protected untilViewIsInitialised(): Promise<void> {
    return new Promise<void>((resolve) => {
      const checkStatus = () => {
        if (this.viewInitialised()) {
          resolve();
        } else {
          setTimeout(checkStatus, 10);
        }
      };
      checkStatus();
    });
  }
}

/**
 * The complete metadata data structure describing a form field component, including the necessary constructors to create and init the component and model.
 *
 * @export
 * @interface FormFieldCompMapEntry
 */
export interface FormFieldCompMapEntry {
  name?: string;
  modelClass?: typeof FormFieldModel | null;
  layoutClass?: typeof FormFieldBaseComponent | null;
  componentClass?: typeof FormFieldBaseComponent | null;
  compConfigJson: FormComponentDefinition<unknown>;
  model?: FormFieldModel<unknown> | null;
  component?: FormFieldBaseComponent<unknown> | null;
  componentRef?: ComponentRef<FormFieldBaseComponent<unknown> | null | undefined>;
  layout?: FormFieldBaseComponent<unknown> | null | undefined;
  layoutRef?: ComponentRef<FormFieldBaseComponent<unknown> | null | undefined>;
  componentTemplateRefMap? : { [key: string]: TemplateRef<unknown> } | null | undefined;
}
