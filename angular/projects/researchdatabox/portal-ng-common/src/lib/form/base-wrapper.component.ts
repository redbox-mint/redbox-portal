import {
  Component,
  Type,
  Input,
  ViewChild,
  OnDestroy
} from '@angular/core';
import { FormBaseWrapperDirective } from './base-wrapper.directive';
import { FormFieldBaseComponent, FormFieldCompMapEntry } from './form-field-base.component';
import { set as _set, get as _get } from 'lodash-es';
import { FormFieldComponentStatus } from './status.model';

/**
 * Form Component Wrapper.
 *
* This component is used to instantiate a form field based on the provided configuration. It is meant to be a a thin wrapper around the individual form component, offering the FormComponent and layout components an abstraction, rather than individual components.
* 
* For simplicity, the wrapper component extends the FormFieldBaseComponent, which provides the basic functionality for form components. 
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
export class FormBaseWrapperComponent<ValueType = string | undefined> extends FormFieldBaseComponent implements OnDestroy {
  @Input() componentClass?: typeof FormFieldBaseComponent | null | undefined = null;
  @Input() defaultComponentConfig?: { [key: string]: { [key: string]: string } | string | null } | string | null | undefined = null;

  @ViewChild(FormBaseWrapperDirective, {static: true}) formFieldDirective!: FormBaseWrapperDirective;

  public async initWrapperComponent(formFieldCompMapEntry?: FormFieldCompMapEntry | null | undefined, omitLayout: boolean = false): Promise<FormFieldBaseComponent<unknown> | null> {
    const name = this.utilityService.getNameClass(this.formFieldCompMapEntry);
    this.loggerService.info(`${this.logName}: Starting loadComponent for '${name}'.`);
    if (!formFieldCompMapEntry) {
      throw new Error("FormBaseWrapperComponent: formFieldCompMapEntry is null."); 
    } 
    this.formFieldCompMapEntry = formFieldCompMapEntry;
    this.componentClass = this.formFieldCompMapEntry.componentClass;
    if (this.status() == FormFieldComponentStatus.READY) {
      return this.getComponentRef()?.instance || null;
    }
    if (!this.componentClass) {
      this.loggerService.error("FormBaseWrapperComponent: componentClass is not defined. Cannot initialize the component.");
      return null;
    }
    // Wait until after the view has been initialized and formFieldDirective is available
    await this.untilViewIsInitiased();
    const viewContainerRef = this.formFieldDirective.viewContainerRef;
    viewContainerRef.clear();
    if (!viewContainerRef) {
      throw new Error("FormBaseWrapperComponent: ViewContainerRef is not provided. Cannot initialize the component.");
    }
    const compClass = omitLayout ? this.componentClass : this.formFieldCompMapEntry?.layoutClass || this.componentClass;

    const compRef = viewContainerRef.createComponent<FormFieldBaseComponent<ValueType>>(compClass as Type<FormFieldBaseComponent<ValueType>>);
  
    if (this.defaultComponentConfig && this.formFieldCompMapEntry && this.formFieldCompMapEntry?.compConfigJson && this.formFieldCompMapEntry?.compConfigJson?.component) {
      _set(this.formFieldCompMapEntry, 'compConfigJson.component.config.defaultComponentCssClasses', _get(this.defaultComponentConfig, 'defaultComponentCssClasses', ''));
    }
    if (compClass == this.formFieldCompMapEntry?.layoutClass) {
      this.formFieldCompMapEntry.layoutRef = compRef;
    } else {
      this.formFieldCompMapEntry.componentRef = compRef;
    }
    await compRef.instance.initComponent(this.formFieldCompMapEntry);
    this.loggerService.info(`${this.logName}: initComponent done for '${name}'.`);
    this.status.set(FormFieldComponentStatus.READY);
    return compRef.instance;
  }

  getComponentRef() {
    return this.formFieldCompMapEntry?.layoutRef || this.formFieldCompMapEntry?.componentRef || null;
  }

  ngOnDestroy() {
    const compRef = this.getComponentRef();
    // Clean up the dynamically created component when the wrapper is destroyed
    if (compRef) {
      compRef.destroy();
    }
  }
}
