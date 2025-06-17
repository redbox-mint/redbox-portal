import {
  Component,
  Type,
  Input,
  ViewChild,
  OnDestroy
} from '@angular/core';
import { FormBaseWrapperDirective } from './base-wrapper.directive';

import { set as _set, get as _get } from 'lodash-es';
import {FormFieldBaseComponent, FormFieldCompMapEntry} from "@researchdatabox/portal-ng-common";
import {KeyValueStringNested, FormFieldComponentStatus} from "@researchdatabox/sails-ng-common";



/**
 * Form Component Wrapper.
 *
* This component is used to instantiate a form field based on the provided configuration.
 * It is meant to be a a thin wrapper around the individual form component,
 * offering the FormComponent and layout components an abstraction,
 * rather than individual components.
*
* For simplicity, the wrapper component extends the FormFieldBaseComponent,
 * which provides the basic functionality for form components.
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
export class FormBaseWrapperComponent<ValueType> extends FormFieldBaseComponent<ValueType> implements OnDestroy {
  protected override logName: string | null = "FormBaseWrapperComponent";
  @Input() componentClass?: typeof FormFieldBaseComponent | null | undefined = null;
  @Input() defaultComponentConfig?: KeyValueStringNested = null;

  @ViewChild(FormBaseWrapperDirective, {static: true}) formFieldDirective!: FormBaseWrapperDirective;

  protected get getComponentRef() {
    return this.formFieldCompMapEntry?.layoutRef || this.formFieldCompMapEntry?.componentRef || null;
  }

  public async initWrapperComponent(
    formFieldCompMapEntry?: FormFieldCompMapEntry | null | undefined,
    omitLayout: boolean = false
  ): Promise<FormFieldBaseComponent<ValueType> | null> {
    const name = this.utilityService.getNameClass(this.formFieldCompMapEntry);
    this.loggerService.info(`${this.logName}: Starting initWrapperComponent for '${name}'.`);

    // Ensure the initialisation details are available.
    if (!formFieldCompMapEntry) {
      throw new Error(`${this.logName}: formFieldCompMapEntry is null.`);
    }

    // Store the form field details.
    this.formFieldCompMapEntry = formFieldCompMapEntry;
    this.componentClass = this.formFieldCompMapEntry.componentClass;

    // If the wrapper has already been initialised, provide the component instance.
    // TODO: Does this make sense, when a different formFieldCompMapEntry might have been provided and set above?
    if (this.status() == FormFieldComponentStatus.READY) {
      return (this.getComponentRef?.instance as FormFieldBaseComponent<ValueType>) || null;
    }

    // Ensure the component class is available.
    if (!this.componentClass) {
      this.loggerService.error(`${this.logName}: componentClass is not defined. Cannot initialize the component.`);
      return null;
    }

    // Wait until after the view has been initialized and formFieldDirective is available.
    await this.untilViewIsInitialised();

    // Obtain the reference to the view container.
    const viewContainerRef = this.formFieldDirective.viewContainerRef;
    viewContainerRef.clear();
    if (!viewContainerRef) {
      throw new Error(`${this.logName}: ViewContainerRef is not provided. Cannot initialize the component.`);
    }

    // Select which class to use.
    const compClass = omitLayout ? this.componentClass : (this.formFieldCompMapEntry?.layoutClass || this.componentClass);
    // TODO: can typescript typeof be converted to angular Type?
    //       Casting to unknown then to the angular Type is bit odd?
    const comClassTyped = compClass as unknown as Type<FormFieldBaseComponent<ValueType>>;

    // Create an instance of the component from the class.
    const compRef = viewContainerRef.createComponent(comClassTyped);

    // Provide the default css classes to the new component instance.
    if (this.defaultComponentConfig && this.formFieldCompMapEntry?.compConfigJson?.component) {
      const defaultCss = _get(this.defaultComponentConfig, 'defaultComponentCssClasses', '');
      _set(this.formFieldCompMapEntry, 'compConfigJson.component.config.defaultComponentCssClasses', defaultCss);
    }

    // Store a reference to the component instance.
    if (compClass == this.formFieldCompMapEntry?.layoutClass) {
      this.formFieldCompMapEntry.layoutRef = compRef;
    } else {
      this.formFieldCompMapEntry.componentRef = compRef;
    }

    // Initialise the component.
    await compRef.instance.initComponent(this.formFieldCompMapEntry);
    this.loggerService.info(`${this.logName}: initComponent done for '${name}'.`);

    // After the component is initialised, this wrapper is now ready.
    this.status.set(FormFieldComponentStatus.READY);
    return compRef.instance;
  }

  ngOnDestroy() {
    const compRef = this.getComponentRef;
    // Clean up the dynamically created component when the wrapper is destroyed
    if (compRef) {
      compRef.destroy();
    }
  }
}
