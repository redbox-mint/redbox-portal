import { Component, ComponentRef, Type, Input, OnInit, OnChanges, ViewChild } from '@angular/core';
import { FormBaseWrapperDirective } from './base-wrapper.directive';
import { FormFieldModel } from './base.model';
import { FormFieldComponent, FormFieldCompMapEntry } from './base.component';
import { FormComponentBaseConfig, FormComponentLayoutConfig } from './config.model';
import { set as _set } from 'lodash-es';
/**
 * Form Component Wrapper. 
 * 
* This component is used to dynamically load a form component based on the provided configuration.
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Component({
    selector: 'redbox-form-base-wrapper',
    template: `
    <ng-template redboxFormBaseWrapper></ng-template>
  `,
    standalone: false
})
export class FormBaseWrapperComponent<ValueType = string | undefined> implements OnInit, OnChanges {
  @Input() model?: FormFieldModel<ValueType> | null | undefined = null;
  @Input() componentClass?: typeof FormFieldComponent | null | undefined = null;
  @Input() formFieldCompMapEntry: FormFieldCompMapEntry | null | undefined = null;
  @Input() componentConfig?: FormComponentBaseConfig | FormComponentLayoutConfig;
  @Input() defaultComponentCssClasses?: { [key: string]: string } | string | null = null;
  
  @ViewChild(FormBaseWrapperDirective, {static: true}) formFieldDirective!: FormBaseWrapperDirective;

  public componentRef?: ComponentRef<FormFieldComponent>; // Store the ref if needed later

  // See https://angular.dev/guide/components/lifecycle#ngoninit
  ngOnInit() {
    this.loadComponent();
  }
  
  ngOnChanges() {
    
  }

  async loadComponent() {
    const viewContainerRef = this.formFieldDirective.viewContainerRef;
    viewContainerRef.clear();

    this.componentRef = viewContainerRef.createComponent<FormFieldComponent>(this.componentClass as Type<FormFieldComponent>);
    if (this.formFieldCompMapEntry && this.formFieldCompMapEntry?.compConfigJson && this.formFieldCompMapEntry?.compConfigJson?.component) {
      const defaultComponentCssClasses = this.defaultComponentCssClasses || '';
      _set(this.formFieldCompMapEntry, 'compConfigJson.component.defaultComponentCssClasses', defaultComponentCssClasses);
    }
    await this.componentRef.instance.initComponent(this.formFieldCompMapEntry);
  }

  
  ngOnDestroy() {
    // Clean up the dynamically created component when the wrapper is destroyed
    if (this.componentRef) {
      this.componentRef.destroy();
    }
  }
}