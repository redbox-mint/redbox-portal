import { Component, ComponentRef, Type, Input, OnInit, ViewChild } from '@angular/core';
import { FormFieldWrapperDirective } from './form-field-wrapper.directive';
import { FieldModel, FieldComponent,  ComponentConfig } from '@researchdatabox/portal-ng-common';
/**
 * Form Field Wrapper component. 
 * 
 * Allows for loose-coupling between fields and components, responsible for injection of fields/components.
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Component({
    selector: 'redbox-form-field',
    template: `
    <ng-template formFieldComp></ng-template>
  `,
    standalone: false
})
export class FormFieldWrapperComponent implements OnInit {
  @Input() field?: FieldModel | null | undefined = null;
  @Input() compClass?: typeof FieldComponent;
  @Input() compConfig?: ComponentConfig;
  
  @ViewChild(FormFieldWrapperDirective, {static: true}) formFieldDirective!: FormFieldWrapperDirective;

  public componentRef?: ComponentRef<FieldComponent>; // Store the ref if needed later

  ngOnInit() {
    this.loadComponent();
  }

  loadComponent() {
    const viewContainerRef = this.formFieldDirective.viewContainerRef;
    viewContainerRef.clear();

    this.componentRef = viewContainerRef.createComponent<FieldComponent>(this.compClass as Type<FieldComponent>);
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