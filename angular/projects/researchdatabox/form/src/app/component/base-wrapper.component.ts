
import {
  Component,
  ComponentRef,
  Type,
  Input,
  OnInit,
  OnChanges,
  ViewChild,
  output,
  inject,
  effect, untracked, OnDestroy
} from '@angular/core';
import { FormBaseWrapperDirective } from './base-wrapper.directive';

import { set as _set, get as _get } from 'lodash-es';
import {FormFieldBaseComponent, FormFieldCompMapEntry} from "@researchdatabox/portal-ng-common";
import {KeyValueStringNested, FormFieldComponentStatus} from "@researchdatabox/sails-ng-common";



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
  `,
    standalone: false
})
export class FormBaseWrapperComponent<ValueType> extends FormFieldBaseComponent<ValueType> implements OnDestroy {
  protected override logName: string | null = "FormBaseWrapperComponent";
  @Input() componentClass?: typeof FormFieldBaseComponent | null | undefined = null;
  @Input() defaultComponentConfig?: KeyValueStringNested = null;

  @ViewChild(FormBaseWrapperDirective, {static: true}) formFieldDirective!: FormBaseWrapperDirective;

  componentReady = output<void>();

  public componentRef?: ComponentRef<FormFieldBaseComponent<ValueType>>; // Store the ref if needed later

  private loggerService = inject(LoggerService);
  private utilityService = inject(UtilityService);

  // See https://angular.dev/guide/components/lifecycle#ngoninit
  ngOnInit() {
    this.loadComponent();
  }

  ngOnChanges() {
    this.loggerService.info('FormBaseWrapperComponent ngOnChanges');
  }

  async loadComponent() {
    const name = this.utilityService.getNameClass(this.formFieldCompMapEntry);
    this.loggerService.info(`${this.logName}: Starting loadComponent for '${name}'.`);
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

    this.componentRef = viewContainerRef.createComponent<FormFieldBaseComponent<ValueType>>(this.componentClass as Type<FormFieldBaseComponent<ValueType>>);
    if (this.defaultComponentConfig && this.formFieldCompMapEntry && this.formFieldCompMapEntry?.compConfigJson && this.formFieldCompMapEntry?.compConfigJson?.component) {
      _set(this.formFieldCompMapEntry, 'compConfigJson.component.config.defaultComponentCssClasses', _get(this.defaultComponentConfig, 'defaultComponentCssClasses', ''));
    }
    await this.componentRef.instance.initComponent(this.formFieldCompMapEntry);
    this.loggerService.info(`${this.logName}: initComponent done for '${name}'.`);
    if (this.componentRef && !this.componentRef.hostView.destroyed) {
      this.componentReady.emit();
    } else {
      this.loggerService.warn(`${this.logName}: componentRef has been destroyed, component is no longer 'ready', but form may not be informed. Ignore if this is displayed during test runs.`);
    }
    this.componentRef.changeDetectorRef.detectChanges();
  }


  ngOnDestroy() {
    // Clean up the dynamically created component when the wrapper is destroyed
    if (this.componentRef) {
      this.componentRef.destroy();
    }
  }
}
