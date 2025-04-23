import { Component, ComponentRef, Type, Input, OnInit, ViewChild } from '@angular/core';
import { BaseWrapperDirective } from './base-wrapper.directive';
import { FieldModel } from './base.model';
import { FieldComponent } from './base.component';
import { ComponentConfig } from './config.model';
/**
 * Form Component Wrapper. 
 * 
* This component is used to dynamically load a form component based on the provided configuration.
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Component({
    selector: 'redbox-base-wrapper',
    template: `
    <ng-template redboxBaseWrapper></ng-template>
  `,
    standalone: false
})
export class BaseWrapperComponent implements OnInit {
  @Input() field?: FieldModel | null | undefined = null;
  @Input() compClass?: typeof FieldComponent;
  @Input() compConfig?: ComponentConfig;
  
  @ViewChild(BaseWrapperDirective, {static: true}) formFieldDirective!: BaseWrapperDirective;

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