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
  @Input() field?: FieldModel | null = null;
  @Input() compClass?: typeof FieldComponent;
  @Input() compConfig?: ComponentConfig;
  
  @ViewChild(FormFieldWrapperDirective, {static: true}) formFieldDirective!: FormFieldWrapperDirective;

  ngOnInit() {
    this.loadComponent();
  }

  loadComponent() {
    const viewContainerRef = this.formFieldDirective.viewContainerRef;
    viewContainerRef.clear();

    const componentRef: ComponentRef<FieldComponent> = viewContainerRef.createComponent<FieldComponent>(this.compClass as Type<FieldComponent>);
    // componentRef.instance.data = this.data;
  }

  

}