import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { FormFieldWrapperDirective } from './form-field-wrapper.directive';
import { FormBaseComponent } from '@researchdatabox/portal-ng-common';
/**
 * Form Field Wrapper component
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
  @Input() compInfo: any = null as any;
  @Input() data: any;
  
  @ViewChild(FormFieldWrapperDirective, {static: true}) formFieldDirective!: FormFieldWrapperDirective;

  ngOnInit() {
    this.loadComponent();
  }

  loadComponent() {
    const viewContainerRef = this.formFieldDirective.viewContainerRef;
    viewContainerRef.clear();

    const componentRef = viewContainerRef.createComponent<FormBaseComponent>(this.compInfo);
    // componentRef.instance.data = this.data;
  }

  

}