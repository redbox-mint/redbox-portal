import { FormFieldModel } from './base.model';
import { FormControl, FormGroup } from '@angular/forms';
import { FormFieldComponentDefinition, FormComponentLayoutDefinition, TooltipsModel } from './config.model';
import { Directive, HostBinding, signal, inject, TemplateRef, AfterViewInit, DoCheck, ComponentRef, ApplicationRef, ViewContainerRef } from '@angular/core'; // Import HostBinding
import { LoggerService } from '../logger.service';
import { FormFieldComponentStatus } from './status.model';
import { LoDashTemplateUtilityService } from '../lodash-template-utility.service';
import { get as _get, set as _set, isEmpty as _isEmpty, isUndefined as _isUndefined, keys as _keys, startsWith as _startsWith, has as _has } from 'lodash-es';

/**
 * Base class for form components. Data binding to a form field is optional.
 * 
 * Notes:
 *  - No 'field' property to enforce type safety, i.e. avoid `any`
 * 
 */
@Directive()
export abstract class FormFieldBaseComponent<ValueType = string | undefined> implements AfterViewInit, DoCheck  {
  public name:string = '';
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

  public expressions: any[] = [];
  public expressionStateChanged: boolean = false;
  private componentViewReady:boolean = false; 
  private formComponent:any;
  public form?: FormGroup;

  private lodashTemplateUtilityService: LoDashTemplateUtilityService = inject(LoDashTemplateUtilityService);
  private appRef: ApplicationRef = inject(ApplicationRef);
  private containerRef: ViewContainerRef = inject(ViewContainerRef);
  loggerService: LoggerService = inject(LoggerService);

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
    if(this.componentViewReady) {
      //Checking expressions undefined ensures it runs only for components that have expressions defined in their component definition
      if(!_isUndefined(this.expressions)) {
        this.checkUpdateExpressions(this.expressions, 'dom');
      }
    }
  }

  public checkUpdateExpressions(expressions: any[], expressionType: string = '') {
    
    if(!_isEmpty(expressions)) {
      this.loggerService.info('ngDoCheck ',_get(this.componentDefinition,'class',''));
      this.loggerService.info('ngDoCheck name ',this.name);
      this.loggerService.info('ngDoCheck expressionType ',expressionType);
      for(let expObj of expressions) {
        let value:any = null;
        let data = this.model?.formControl?.value;
        let targetPropertyPath = _get(expObj,'targetProperty','');
        if (_get(expObj,'expression.template','').indexOf('<%') != -1) {
          let config = { template: _get(expObj,'expression.template') };
          let v = this.lodashTemplateUtilityService.runTemplate(data,config,{},this);
          value = v === 'false' ? false : v;
        } else {
          let v = _get(this.componentDefinition,_get(expObj,'value',null));
          value = v === 'false' ? false : v;
        }

        let targetComponentName = _get(expObj,'targetComponent','');

        if(targetComponentName != '') {

          try {

              let formComponent = this.getFormComponent();

              if(!_isUndefined(formComponent)) {
                let components = formComponent.instance.components;

                for(let compEntry of components) {
                  let compName = _get(compEntry,'name','');
                  if(compName == targetComponentName) {
                    if(_startsWith(targetPropertyPath, 'config.')) {
                      if(_has(compEntry.component.componentDefinition,targetPropertyPath)) {
                        _set(compEntry.component.componentDefinition as object,targetPropertyPath,value);
                      } else if(_has(compEntry.layout.componentDefinition,targetPropertyPath)) {
                        _set(compEntry.layout.componentDefinition as object,targetPropertyPath,value);
                      } else {
                        this.loggerService.warn(`Property '${targetPropertyPath}' does not exist on target componentDefinition component `,compEntry.component.componentDefinition);
                        this.loggerService.warn(`Property '${targetPropertyPath}' does not exist on target componentDefinition layout `,compEntry.layout.componentDefinition);
                      }
                    } else if (_has(compEntry.component,targetPropertyPath)) {
                      compEntry.component[targetPropertyPath] = value;
                    } else if (_has(compEntry.layout,targetPropertyPath)) {
                      compEntry.layout[targetPropertyPath] = value;
                    } else {
                      this.loggerService.warn(`Property '${targetPropertyPath}' does not exist on target component `,compName);
                    }
                    
                    compEntry.component.expressionStateChanged = compEntry.component.hasExpressionsConfigChanged();
                    compEntry.layout.expressionStateChanged = compEntry.layout.hasExpressionsConfigChanged();
                    if(compEntry.component.expressionStateChanged) {
                      this.loggerService.info(`ngDoCheck compEntry.component.expressionStateChanged ${this.expressionStateChanged}`,'');
                      compEntry.component.initChildConfig();
                    } else if(compEntry.layout.expressionStateChanged) {
                      this.loggerService.info(`ngDoCheck compEntry.layout.expressionStateChanged ${this.expressionStateChanged}`,'');
                      compEntry.layout.initChildConfig();
                    }
                  }
                }
              }
            
          } catch (err) {
            this.loggerService.error('checkUpdateExpressions failed', err);
          }

        } else {

          //TODO FIXME if there is no targetComponent the expressions are evaluated for the same component where the expression is defined
          _set(this.componentDefinition as object,targetPropertyPath,value);
          this.expressionStateChanged = this.hasExpressionsConfigChanged();
          this.loggerService.info(`ngDoCheck expressionStateChanged ${this.expressionStateChanged}`,'');
          if(this.expressionStateChanged) {
            this.initChildConfig();
          }
        }
        
      }
    }
  }
  
  ngAfterViewInit() {
    this.initConfig();
    this.form = this.getFormGroup();
    this.componentViewReady = true;
    this.getFormGroup()?.valueChanges.subscribe((value) => {
      console.log('Form value changed:', value);
      
      this.loggerService.info('changed '+_get(this.componentDefinition,'class',''),'');
      if(!_isUndefined(this.expressions)) {
        this.checkUpdateExpressions(this.expressions,'model');
        this.loggerService.info(`changed expressionStateChanged ${this.expressionStateChanged}`,'');
        if(this.expressionStateChanged) {
          this.initChildConfig();
        }
      }

    });
  }

  public abstract initChildConfig():void;


  protected initConfig() {
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
        this.loggerService.info(`key ${key} oldValue ${oldValue} newValue ${newValue} propertyChanged ${propertyChanged}`,'');
        break;
      }
    }
    return propertyChanged;
  }

  protected getFormComponent(): any {
    if(_isUndefined(this.formComponent)) {
      let formComponent:any = this.appRef.components[0];
      this.formComponent = formComponent;
    }
    return this.formComponent;
  }

  protected getFormGroup(): FormGroup | undefined {
     let formComponent:any = this.getFormComponent();
    if(!_isUndefined(formComponent) && _isUndefined(this.form)) {
      this.form = formComponent.instance.form;
    }
    return this.form;
  }

  public getComponentByName(targetComponentName:string): any {
    let compRef;
    try {
      let formComponent = this.getFormComponent();

      if(!_isUndefined(formComponent)) {
        let components = formComponent.instance.components;

        for(let compEntry of components) {
          let compName = _get(compEntry,'compConfigJson.name','');
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
      let formComponent = this.getFormComponent();

      if(!_isUndefined(formComponent)) {
        let components = formComponent.instance.components;

        for(let compEntry of components) {
          let layoutName = _get(compEntry,'compConfigJson.name','');
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
    this.formFieldCompMapEntry.name = this.formFieldCompMapEntry.compConfigJson.name;
    if(!_isUndefined(this.formFieldCompMapEntry.name)) {
      this.name = this.formFieldCompMapEntry.name;
    }
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
  name?: string;
  modelClass?: typeof FormFieldModel | null;
  layoutClass?: typeof FormFieldBaseComponent | null;
  componentClass?: typeof FormFieldBaseComponent | null;
  compConfigJson: any,
  model?: FormFieldModel | null;
  component?: FormFieldBaseComponent | null;
  layout?: FormFieldBaseComponent | null;
  componentTemplateRefMap? : { [key: string]: TemplateRef<any> } | null | undefined;
}