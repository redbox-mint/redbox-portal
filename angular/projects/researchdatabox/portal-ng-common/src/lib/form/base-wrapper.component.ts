import { Component, ComponentRef, Type, Input, OnInit, ViewChild } from '@angular/core';
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
export class FormBaseWrapperComponent implements OnInit {
  @Input() field?: FormFieldModel | null | undefined = null;
  @Input() compClass?: typeof FormFieldComponent;
  @Input() compConfig?: FormComponentBaseConfig;
  
  @ViewChild(FormBaseWrapperDirective, {static: true}) formFieldDirective!: FormBaseWrapperDirective;

  public componentRef?: ComponentRef<FormFieldComponent>; // Store the ref if needed later

  ngOnInit() {
    this.loadComponent();
  }

  loadComponent() {
    const viewContainerRef = this.formFieldDirective.viewContainerRef;
    viewContainerRef.clear();

    this.componentRef = viewContainerRef.createComponent<FormFieldComponent>(this.compClass as Type<FormFieldComponent>);
    this.componentRef.instance.field = this.field;
    // componentRef.instance.config = this.compConfig;
    // componentRef.instance.data = this.data;
  }

  
  ngOnDestroy() {
    // Clean up the dynamically created component when the wrapper is destroyed
    if (this.componentRef) {
      this.componentRef.destroy();
    }
  }
}