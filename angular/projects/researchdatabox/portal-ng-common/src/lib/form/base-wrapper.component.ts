import { Component, ComponentRef, Type, Input, OnInit, OnChanges, ViewChild, output, inject } from '@angular/core';
import { FormBaseWrapperDirective } from './base-wrapper.directive';
import { FormFieldModel } from './base.model';
import { FormFieldBaseComponent, FormFieldCompMapEntry } from './form-field-base.component';
import { FormFieldComponentDefinition, FormComponentLayoutDefinition } from './config.model';
import { set as _set, get as _get } from 'lodash-es';
import { LoggerService } from '../logger.service';

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
  @Input() componentClass?: typeof FormFieldBaseComponent | null | undefined = null;
  @Input() formFieldCompMapEntry: FormFieldCompMapEntry | null | undefined = null;
  @Input() componentDefinition?: FormFieldComponentDefinition | FormComponentLayoutDefinition;
  @Input() defaultComponentConfig?: { [key: string]: { [key: string]: string } | string | null } | string | null | undefined = null;

  @ViewChild(FormBaseWrapperDirective, {static: true}) formFieldDirective!: FormBaseWrapperDirective;

  componentReady = output<void>();

  public componentRef?: ComponentRef<FormFieldBaseComponent>; // Store the ref if needed later

  private loggerService: LoggerService = inject(LoggerService);

  // See https://angular.dev/guide/components/lifecycle#ngoninit
  ngOnInit() {
    this.loadComponent();
  }

  ngOnChanges() {

  }

  async loadComponent() {
    const viewContainerRef = this.formFieldDirective.viewContainerRef;
    viewContainerRef.clear();

    this.componentRef = viewContainerRef.createComponent<FormFieldBaseComponent>(this.componentClass as Type<FormFieldBaseComponent>);
    if (this.defaultComponentConfig && this.formFieldCompMapEntry && this.formFieldCompMapEntry?.compConfigJson && this.formFieldCompMapEntry?.compConfigJson?.component) {
      _set(this.formFieldCompMapEntry, 'compConfigJson.component.config.defaultComponentCssClasses', _get(this.defaultComponentConfig, 'defaultComponentCssClasses', ''));
    }
    await this.componentRef.instance.initComponent(this.formFieldCompMapEntry);
    if (this.componentRef && !this.componentRef.hostView.destroyed) {
      this.componentReady.emit();
    } else {
      this.loggerService.warn("FormBaseWrapperComponent: componentRef has been destroyed, component is no longer 'ready', but form may not be informed. Ignore if this is displayed during test runs.");
    }
  }


  ngOnDestroy() {
    // Clean up the dynamically created component when the wrapper is destroyed
    if (this.componentRef) {
      this.componentRef.destroy();
    }
  }
}
