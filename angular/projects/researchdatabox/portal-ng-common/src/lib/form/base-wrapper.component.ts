import { Component, ComponentRef, Type, Input, OnInit, OnChanges, ViewChild } from '@angular/core';
import { FormBaseWrapperDirective } from './base-wrapper.directive';
import { FormFieldModel } from './base.model';
import { FormFieldComponent } from './base.component';
import { FormComponentBaseConfig } from './config.model';
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
export class FormBaseWrapperComponent implements OnInit, OnChanges {
  @Input() model?: FormFieldModel | null | undefined = null;
  @Input() componentClass?: typeof FormFieldComponent | null | undefined = null;
  @Input() componentConfig?: FormComponentBaseConfig;
  
  @ViewChild(FormBaseWrapperDirective, {static: true}) formFieldDirective!: FormBaseWrapperDirective;

  public componentRef?: ComponentRef<FormFieldComponent>; // Store the ref if needed later

  // See https://angular.dev/guide/components/lifecycle#ngoninit
  ngOnInit() {
    this.loadComponent();
  }
  
  ngOnChanges() {
    
  }

  loadComponent() {
    const viewContainerRef = this.formFieldDirective.viewContainerRef;
    viewContainerRef.clear();

    this.componentRef = viewContainerRef.createComponent<FormFieldComponent>(this.componentClass as Type<FormFieldComponent>);
    this.componentRef.instance.model = this.model;
  }

  
  ngOnDestroy() {
    // Clean up the dynamically created component when the wrapper is destroyed
    if (this.componentRef) {
      this.componentRef.destroy();
    }
  }
}