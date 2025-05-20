import { FormFieldModel } from './base.model';
import { FormControl } from '@angular/forms';
import { FormFieldComponentDefinition, FormComponentLayoutDefinition, TooltipsModel } from './config.model';
import { Directive, HostBinding, signal, inject, TemplateRef, AfterViewInit, DoCheck, ComponentRef, NgZone } from '@angular/core'; // Import HostBinding
import { LoggerService } from '../logger.service';
import { FormFieldComponentStatus } from './status.model';
import { LoDashTemplateUtilityService } from '../lodash-template-utility.service';
import { get as _get, set as _set, isEmpty as _isEmpty, isUndefined as _isUndefined, keys as _keys } from 'lodash-es';
/**
 * Base class for form components. Data binding to a form field is optional.
 * 
 * Notes:
 *  - No 'field' property to enforce type safety, i.e. avoid `any`
 * 
 */
@Directive()
export abstract class FormFieldBaseComponent<ValueType = string | undefined> implements AfterViewInit, DoCheck  {
  public model?: FormFieldModel<ValueType> | null | undefined = null;
  public componentDefinition?: FormFieldComponentDefinition | FormComponentLayoutDefinition;
  public componentDefinitionCache: any = {};
  public formFieldCompMapEntry?: FormFieldCompMapEntry | null | undefined = null;
  public hostBindingCssClasses: { [key: string]: boolean } | null | undefined = null;
  public isVisible: boolean = true;
  public isDisabled: boolean = false;
  public isReadonly: boolean = false;
  public needsAutofocus: boolean = false;
  public label: string = '';
  public helpText: string = '';
  public tooltips: TooltipsModel | null | undefined = null;
  // The status of the component
  public status = signal<FormFieldComponentStatus>(FormFieldComponentStatus.INIT);
  public formFieldComponentRef?: ComponentRef<FormFieldBaseComponent>;

  public expressions: { [key: string]: any } | null | undefined = null;
  public expressionStateChanged: boolean = false;
  private lodashTemplateUtilityService: LoDashTemplateUtilityService = inject(LoDashTemplateUtilityService);
  private componentViewReady:boolean = false; 

  loggerService: LoggerService = inject(LoggerService);

  constructor(public zone: NgZone) {}

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
  async initComponent(formFieldCompMapEntry: FormFieldCompMapEntry | null | undefined) {
    if (!formFieldCompMapEntry) {
      throw new Error("FieldComponent: formFieldCompMapEntry is null.");
    }
    try {
      // Create a method that children can override to set their own properties
      this.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
      await this.initData();
      await this.initLayout();
      await this.initEventHandlers();
      // Create a method that children to prepare their state.
      await this.setComponentReady();
    } catch (error) {
      this.loggerService.error("FieldComponent: initComponent failed", error);
      this.status.set(FormFieldComponentStatus.ERROR);
    }
  }

  ngDoCheck() {
    this.loggerService.info('ngDoCheck');
    if(!_isUndefined(this.expressions)) {
      this.checkUpdateExpressions(this.expressions);
      this.loggerService.info(`ngDoCheck expressionStateChanged ${this.expressionStateChanged}`);
      if(this.componentViewReady && this.expressionStateChanged) {
        this.initChildConfig();
      }
    }
  }

  private checkUpdateExpressions(expressions: { [key: string]: any } | null | undefined) {
    if(!_isEmpty(expressions)) {
      for(let exp of _keys(expressions)) {
        let value:any = null;
        let expObj = _get(expressions,exp,{});
        let data = this.model?.formControl?.value;
        if (_get(expObj,'template','').indexOf('<%') != -1) {
          let config = { template: _get(expObj,'template') };
          let v = this.lodashTemplateUtilityService.runTemplate(data,config);
          value = v === 'false' ? false : v;
        } else {
          let v = _get(this.componentDefinition,_get(expObj,'value',null));
          value = v === 'false' ? false : v;
        }
        _set(this.componentDefinition as object,exp,value);
      }
      this.expressionStateChanged = this.hasExpressionsConfigChanged();
    }
  }
  
  ngAfterViewInit() {
    this.initConfig();
    this.componentViewReady = true;
  }

  protected abstract initChildConfig():void;
  

  initConfig() {
    setTimeout(() => {
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
    });
  }

  hasExpressionsConfigChanged(): boolean {
    let propertyChanged = false;
    for(let key of _keys(this.componentDefinitionCache)) {
      let newValue = _get(this.componentDefinition?.config,key);
      let oldValue = _get(this.componentDefinitionCache,key);
      let configPropertyChanged = oldValue !== newValue;
      if(configPropertyChanged) {
        propertyChanged = true;
        this.loggerService.info(`key ${key} oldValue ${oldValue} newValue ${newValue} propertyChanged ${propertyChanged}`);
        break;
      }
    }
    return propertyChanged;
  }

  public setDisabled(state: boolean) {
   this.isDisabled = state;
  }
  
  public setVisibility(state: boolean) {
   this.isVisible = state;
  }

  public setReadonly(state: boolean) {
   this.isReadonly = state;
  }

  public setAutofocus(state: boolean) {
    this.needsAutofocus = state;
  }

  public setLabel(label: string) {
    this.label = label;
  }

  public setTooltips(tooltips: TooltipsModel | null | undefined) {
    this.tooltips = tooltips;
  }

  protected setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry) {
    this.formFieldCompMapEntry = formFieldCompMapEntry;
    this.formFieldCompMapEntry.component = this as FormFieldBaseComponent;
    this.model = this.formFieldCompMapEntry?.model as FormFieldModel<ValueType> | null;
    this.componentDefinition = this.formFieldCompMapEntry.compConfigJson.component as FormFieldComponentDefinition | FormComponentLayoutDefinition;
    this.expressions = this.formFieldCompMapEntry.compConfigJson.expressions;
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
    if (this.componentDefinition?.config?.defaultComponentCssClasses) {
      if (typeof this.componentDefinition.config?.defaultComponentCssClasses === 'string') {
      this.hostBindingCssClasses = { [this.componentDefinition.config?.defaultComponentCssClasses]: true };
      } else {
      // Assuming it's already in the desired { [key: string]: boolean } format
      // this.hostBindingCssClasses = this.config.defaultComponentCssClasses;
      }
    } else {
      this.hostBindingCssClasses = {}; // Initialize as empty object if no default classes
    }
  }
  
  /**
   * The FormControl instance for this field.
   */
  get formControl(): FormControl<ValueType> {
    const control = this.model?.formControl;
    if (!control) {
      console.error("FieldComponent formControl returned null for field:", this.model);
      // Return a dummy control or throw, depending on desired behavior
      throw new Error("FieldComponent: field.formModel is null.");
    }
    return control as FormControl<ValueType>;
  }

  // Use @HostBinding to bind to the host element's class attribute
  // This getter returns an object similar to what you'd pass to [ngClass]
  @HostBinding('class') get hostClasses() {
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
    this.status.set(FormFieldComponentStatus.READY);
  }
}

/**
 * The complete metadata data structure describing a form field component, including the necessary constructors to create and init the component and model.
 * 
 * @export
 * @interface FormFieldCompMapEntry
 */
export interface FormFieldCompMapEntry {
  modelClass?: typeof FormFieldModel | null;
  layoutClass?: typeof FormFieldBaseComponent | null;
  componentClass?: typeof FormFieldBaseComponent | null;
  compConfigJson: any,
  model?: FormFieldModel | null;
  component?: FormFieldBaseComponent | null;
  expressionStateChanged: boolean;
  componentTemplateRefMap? : { [key: string]: TemplateRef<any> } | null | undefined;
}