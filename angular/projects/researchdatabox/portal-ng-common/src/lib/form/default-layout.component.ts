import { FormFieldBaseComponent, FormFieldCompMapEntry } from './form-field-base.component';
import { FormComponentLayoutDefinition } from './config.model';
import { isEmpty as _isEmpty, set as _set, get as _get, keys as _keys } from 'lodash-es';
import { Component, ViewChild, ViewContainerRef, TemplateRef, ComponentRef, AfterViewInit } from '@angular/core';
import { FormBaseWrapperComponent } from './base-wrapper.component';
/**
 * Default Form Component Layout
 * 
 * This component provides additional layout-specific functionality for form components. 
 * 
 * The default layout is the following, which based by the legacy form field layout:
 * 
 * <div>
 *   <label>
 *    Label
 *    <span>Required indicator</span>
 *    <button>Help Button</button>
 *  </label>
 *  <span>Help Text</span> 
 *  <ng-container>The component</ng-container>
 * </div>
 *
 * Other layouts can be defined, 
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Component({
  selector: 'redbox-form-default-component-layout',
  template: `
  @if (model && componentDefinition) {
    @if (componentDefinition.config?.label) {
      <label [attr.title]="tooltips ? tooltips['labelTT'] : ''">
        <span [innerHtml]="componentDefinition?.config?.label"></span>
        <span class="form-field-required-indicator" [innerHTML]="componentDefinition?.config?.labelRequiredStr"></span>
        @if (componentDefinition.config?.helpText) {
          <button type="button" class="btn btn-default" (click)="toggleHelpTextVisibility()" [attr.aria-label]="'help' | i18next ">
          <span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span>
          </button>
        }
      </label>
      @if (helpTextVisible) {
        <span class="help-block" [innerHtml]="componentDefinition?.config?.helpText"></span>
      }
    }
    <ng-container #componentContainer>
    </ng-container> 
    <!-- instead of rendering the 'before' and 'after' templates around the componentContainer, we supply named templates so the component can render these as it sees fit -->
    <ng-template #beforeComponentTemplate>
      Before, is help showing:  {{ helpTextVisible }}
    </ng-template>
    <ng-template #afterComponentTemplate>
      After, is help showing:  {{ helpTextVisible }}
    </ng-template>
  }
  `,
  standalone: false,
  // Note: No need for host property here if using @HostBinding
})
export class DefaultLayoutComponent<ValueType> extends FormFieldBaseComponent<ValueType> implements AfterViewInit {
  helpTextVisible: boolean = false;  
  labelRequiredStr: string = '';
  helpTextVisibleOnInit: boolean = false;
  componentClass?: typeof FormFieldBaseComponent | null;
  
  public override componentDefinition?: FormComponentLayoutDefinition;

  @ViewChild('componentContainer', { read: ViewContainerRef, static: false })
  componentContainer!: ViewContainerRef;

  @ViewChild('beforeComponentTemplate', { read: TemplateRef, static: false })
  beforeComponentTemplate!: TemplateRef<any>;
  @ViewChild('afterComponentTemplate', { read: TemplateRef, static: false })
  afterComponentTemplate!: TemplateRef<any>;

  wrapperComponentRef!: ComponentRef<FormBaseWrapperComponent<unknown>>;

  

  /**
   * Override to set additional properties required by the wrapper component.
   * 
   * @param formFieldCompMapEntry 
   */
  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.componentClass = formFieldCompMapEntry?.componentClass;
    this.componentDefinition = formFieldCompMapEntry?.compConfigJson?.layout as FormComponentLayoutDefinition;
    if(this.formFieldCompMapEntry != null && this.formFieldCompMapEntry != undefined) {
      this.formFieldCompMapEntry.layout = this as FormFieldBaseComponent;
    }
  }
  /**
   * Override what it takes to get the component to be 'ready'
   */
  protected override async setComponentReady(): Promise<void> {
    // Set all the bound properties to the component
    this.wrapperComponentRef = this.componentContainer.createComponent(FormBaseWrapperComponent);
    this.wrapperComponentRef.instance.componentClass = this.componentClass;
    this.wrapperComponentRef.instance.model = this.model;
    this.wrapperComponentRef.instance.formFieldCompMapEntry = this.formFieldCompMapEntry;
    
    
    if (this.formFieldCompMapEntry && this.beforeComponentTemplate && this.afterComponentTemplate) {
      this.formFieldCompMapEntry.componentTemplateRefMap = {
        before: this.beforeComponentTemplate,
        after: this.afterComponentTemplate
      };
    }
    this.wrapperComponentRef.changeDetectorRef.detectChanges();
    // finally set the status to 'READY'
    await super.setComponentReady();
  }
  
  override ngAfterViewInit() {
    this.initChildConfig();
  }

  public toggleHelpTextVisibility() {
    this.helpTextVisible = !this.helpTextVisible;
  }

  private setHelpTextVisibleOnInit() {
    this.helpTextVisible = true;
  }

  //Layout specific config values that need to be applied after generic/base component config has been applied 
  public override initChildConfig(): void {
    this.initConfig();
    _set(this.componentDefinition as object,'config.helpTextVisible',this.helpTextVisible);

    this.labelRequiredStr = this.componentDefinition?.config?.labelRequiredStr ?? '';
    this.helpTextVisibleOnInit = this.componentDefinition?.config?.helpTextVisibleOnInit ?? false;
    this.tooltips = this.componentDefinition?.config?.tooltips ?? null;
    this.helpTextVisible = _get(this.componentDefinition?.config,'helpTextVisible',false);
    if(this.helpTextVisibleOnInit) {
      this.setHelpTextVisibleOnInit();
    }
    
    //Add required layout specific variables to the local state cache
    _set(this.componentDefinitionCache,'labelRequiredStr',this.componentDefinition?.config?.labelRequiredStr);
    _set(this.componentDefinitionCache,'helpTextVisibleOnInit',this.componentDefinition?.config?.helpTextVisibleOnInit);
    _set(this.componentDefinitionCache,'tooltips',this.componentDefinition?.config?.tooltips);
    _set(this.componentDefinitionCache,'helpTextVisible',this.helpTextVisible);
    
    this.expressionStateChanged = false;
  }

  override hasExpressionsConfigChanged(): boolean {
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

}