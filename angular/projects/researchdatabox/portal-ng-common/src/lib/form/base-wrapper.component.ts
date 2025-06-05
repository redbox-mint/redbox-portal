import { Component, ComponentRef, Type, Input, OnInit, OnChanges, ViewChild, viewChild, ViewContainerRef, output, inject, signal } from '@angular/core';
import { FormBaseWrapperDirective } from './base-wrapper.directive';
import { FormFieldModel } from './base.model';
import { FormFieldBaseComponent, FormFieldCompMapEntry } from './form-field-base.component';
import { FormFieldComponentDefinition, FormComponentLayoutDefinition } from './config.model';
import { set as _set, get as _get } from 'lodash-es';
import { LoggerService } from '../logger.service';

import { FormFieldComponentStatus } from './status.model';

/**
 * Form Component Wrapper. 
 * 
* This component is used to instantiate a form field based on the provided configuration. It is meant to be a a thin wrapper around the individual form component, offering the FormComponent and layout components an abstraction, rather than individual components.
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Component({
    selector: 'redbox-form-base-wrapper',
    template: `
    <ng-template redboxFormBaseWrapper></ng-template>
    <ng-container>
      <pre>Wrapper Status: {{ status() }}</pre>
    </ng-container>
  `,
    standalone: false
})
export class FormBaseWrapperComponent<ValueType = string | undefined> {
  @Input() model?: FormFieldModel<ValueType> | null | undefined = null;
  @Input() componentClass?: typeof FormFieldBaseComponent | null | undefined = null;
  @Input() formFieldCompMapEntry: FormFieldCompMapEntry | null | undefined = null;
  @Input() componentDefinition?: FormFieldComponentDefinition | FormComponentLayoutDefinition;
  @Input() defaultComponentConfig?: { [key: string]: { [key: string]: string } | string | null } | string | null | undefined = null;

  @ViewChild(FormBaseWrapperDirective, {static: true}) formFieldDirective!: FormBaseWrapperDirective;

  componentReady = output<void>();

  public componentRef?: ComponentRef<FormFieldBaseComponent>; // Store the ref if needed later

  private loggerService: LoggerService = inject(LoggerService);

  public status = signal<FormFieldComponentStatus>(FormFieldComponentStatus.INIT);

  public async initWrapperComponent(formFieldCompMapEntry?: FormFieldCompMapEntry | null | undefined, omitLayout: boolean = false): Promise<FormFieldBaseComponent | null> {
    if (!formFieldCompMapEntry && !this.formFieldCompMapEntry) {
      throw new Error("FormBaseWrapperComponent: formFieldCompMapEntry is null."); 
    } else {
      if (formFieldCompMapEntry) {
        this.formFieldCompMapEntry = formFieldCompMapEntry;
        this.componentClass = formFieldCompMapEntry.componentClass;
      }
    }
    if (this.status() == FormFieldComponentStatus.READY) {
      return this.componentRef?.instance || null;
    }
    if (!this.componentClass) {
      this.loggerService.error("FormBaseWrapperComponent: componentClass is not defined. Cannot initialize the component.");
      return null;
    }
    // Wait until after the view has been initialized and formFieldDirective is available
    if (!this.formFieldDirective) {
      await new Promise<void>((resolve) => {
        const checkDirective = () => {
          if (this.formFieldDirective) {
            resolve();
          } else {
            setTimeout(checkDirective, 10);
          }
        };
        checkDirective();
      });
    }
    const viewContainerRef = this.formFieldDirective.viewContainerRef;
    viewContainerRef.clear();
    if (!viewContainerRef) {
      throw new Error("FormBaseWrapperComponent: ViewContainerRef is not provided. Cannot initialize the component.");
    }
    const compClass = omitLayout ? this.componentClass : this.formFieldCompMapEntry?.layoutClass || this.componentClass;
    this.componentRef = viewContainerRef.createComponent<FormFieldBaseComponent>(compClass as Type<FormFieldBaseComponent>);
    if (this.defaultComponentConfig && this.formFieldCompMapEntry && this.formFieldCompMapEntry?.compConfigJson && this.formFieldCompMapEntry?.compConfigJson?.component) {
      _set(this.formFieldCompMapEntry, 'compConfigJson.component.config.defaultComponentCssClasses', _get(this.defaultComponentConfig, 'defaultComponentCssClasses', ''));
    }
    if (compClass == this.formFieldCompMapEntry?.layoutClass) {
      this.formFieldCompMapEntry.layoutRef = this.componentRef;
    }
    await this.componentRef.instance.initComponent(this.formFieldCompMapEntry);
    if (this.componentRef && !this.componentRef.hostView.destroyed) {
      this.componentReady.emit();
    } else {
      this.loggerService.warn("FormBaseWrapperComponent: componentRef has been destroyed, component is no longer 'ready', but form may not be informed. Ignore if this is displayed during test runs.");
    }
    this.status.set(FormFieldComponentStatus.READY);
    return this.componentRef.instance;
  }

  
  ngOnDestroy() {
    // Clean up the dynamically created component when the wrapper is destroyed
    if (this.componentRef) {
      this.componentRef.destroy();
    }
  }
}