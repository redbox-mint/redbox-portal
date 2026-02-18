import { Component, ComponentRef, inject, ViewChild, ViewContainerRef, TemplateRef, Injector } from '@angular/core';
import { FormArray, AbstractControl } from '@angular/forms';
import { FormFieldBaseComponent, FormFieldModel, FormFieldCompMapEntry } from '@researchdatabox/portal-ng-common';
import {
  FormConfigFrame,
  RepeatableComponentName,
  RepeatableElementLayoutName,
  RepeatableFieldComponentConfig,
  RepeatableModelName
} from '@researchdatabox/sails-ng-common';
import { isEmpty as _isEmpty, cloneDeep as _cloneDeep, isUndefined as _isUndefined } from 'lodash-es';
import { FormService } from '../form.service';
import { FormComponent } from "../form.component";
import { FormBaseWrapperComponent } from "./base-wrapper.component";
import { DefaultLayoutComponent } from "./default-layout.component";
import { createFormDefinitionChangeRequestEvent, FormComponentEventBus } from '../form-state';

/**
 * Repeatable Form Field Component
 *
 * The layout-specific section is meant to be minimal.
 *
 *
 */
@Component({
  selector: 'redbox-form-repeatable',
  template:
    `
    <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
    <div class="rb-form-repeatable">
      <div class="rb-form-repeatable__items">
        <ng-container #repeatableContainer></ng-container>
      </div>
      @if (isStatusReady() && isVisible) {
        <button type="button" class="rb-form-repeatable__add btn btn-md btn-primary" (click)="appendNewElement()" [attr.aria-label]="'add-button-label' | i18next">Add</button>
      }
    </div>
    <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
  `,
  standalone: false
})
export class RepeatableComponent extends FormFieldBaseComponent<Array<unknown>> {
  protected override logName = RepeatableComponentName;
  public override model?: RepeatableComponentModel;

  protected formService = inject(FormService);
  private injector = inject(Injector);
  protected elemInitFieldEntry?: FormFieldCompMapEntry;

  protected compDefMapEntries: Array<RepeatableElementEntry> = [];

  @ViewChild('repeatableContainer', { read: ViewContainerRef, static: true }) repeatableContainer!: ViewContainerRef;
  @ViewChild('removeButtonTemplate', { read: TemplateRef<any>, static: false }) removeButtonTemplate!: TemplateRef<any>;


  private newElementFormConfig?: FormConfigFrame;
  private readonly eventBus = inject(FormComponentEventBus);

  protected get getFormComponent(): FormComponent {
    return this.injector.get(FormComponent);
  }

  public override get formFieldBaseComponents(): FormFieldBaseComponent<unknown>[] {
    return this.formFieldCompMapEntries
      .map(c => c.component)
      .filter(c => c !== undefined && c !== null);
  }

  public override get formFieldCompMapEntries(): FormFieldCompMapEntry[] {
    return this.compDefMapEntries?.map(i => i?.defEntry) ?? [];
  }

  protected override async initData() {
    await this.untilViewIsInitialised();
    // Prepare the element template
    const elementTemplate = (this.componentDefinition?.config as RepeatableFieldComponentConfig)?.elementTemplate;
    const formComponentName = this.formFieldCompMapEntry?.compConfigJson?.name ?? "";
    if (!elementTemplate) {
      throw new Error(`${this.logName}: elementTemplate is not defined in the component definition for '${formComponentName}'.`);
    }

    // Resolve the classes using the FormService
    this.newElementFormConfig = {
      name: `form-config-generated-repeatable-${formComponentName}`,
      // Add an empty name to satisfy the FormConfig, the name will be replaced with a generated name.
      componentDefinitions: [{ ...elementTemplate, name: "" }],
      // TODO: Get the default config?
      // defaultComponentConfig: this.getFormComponent.formDefMap?.formConfig?.defaultComponentConfig,
    };
    const parentLineagePaths = this.formService.buildLineagePaths(
      this.formFieldCompMapEntry?.lineagePaths,
      {
        angularComponents: [],
        dataModel: [],
        formConfig: ['component', 'config', 'elementTemplate'],
      }
    );
    const formComponentsMap = await this.formService.createFormComponentsMap(this.newElementFormConfig, parentLineagePaths);

    if (_isEmpty(formComponentsMap)) {
      throw new Error(`${this.logName}: No components found in the formComponentsMap for '${formComponentName}'.`);
    }
    if (!this.model) {
      throw new Error(`${this.logName}: model is not defined. Cannot initialize the component for '${formComponentName}'.`);
    }

    this.elemInitFieldEntry = formComponentsMap.components[0];
    let layoutClass = this.elemInitFieldEntry?.layoutClass;
    if (!layoutClass) {
      // If the layout class is not defined, use the default layout class.
      layoutClass = RepeatableElementLayoutComponent
    }
    this.elemInitFieldEntry.layoutClass = layoutClass;

    // Loop through the elements of the model and insert into the container
    const elemVals = this.model.initValue;
    if (!Array.isArray(elemVals)) {
      throw new Error(`${this.logName}: model value is not an array. Cannot initialize the component for '${formComponentName}'.`);
    }

    // A repeatable needs at least one item.
    if (elemVals.length === 0) {
      // If we get here, there is no default from the repeatable or an ancestor.
      // Use the default value from the elementTemplate, because elementTemplate defines the default for new entries.
      // If there is no model value, use undefined.
      // Undefined is not set to control.value, anything else is set, which is what we want.
      const elementTemplateValue = elementTemplate?.model?.config?.value;
      elemVals.push(elementTemplateValue);
      this.loggerService.warn(`${this.logName}: Created one element for repeatable '${formComponentName}' with no value: ${JSON.stringify(elemVals)}`);
    }

    for (const elementValue of elemVals) {
      await this.appendNewElement(elementValue);
    }
  }

  public async appendNewElement(value?: any) {
    if (!this.elemInitFieldEntry) {
      throw new Error(`${this.logName}: elemInitFieldEntry is not defined. Cannot append new element.`);
    }
    if (value === undefined) {
      // If the provided value is undefined, use the elementTemplate model config value,
      // which is the default for new entries.
      value = (this.componentDefinition?.config as RepeatableFieldComponentConfig)?.elementTemplate?.model?.config?.value;
    }
    const elemEntry = this.createFieldNewMapEntry(this.elemInitFieldEntry, value);
    await this.createElement(elemEntry);
  }

  protected rebuildLineagePaths() {
    for (let index = 0; index < this.compDefMapEntries.length; index++) {
      const indexStr = index.toString();
      const lineagePath = this.formService.buildLineagePaths(
        this.formFieldCompMapEntry?.lineagePaths,
        {
          angularComponents: [indexStr],
          dataModel: [indexStr],
          formConfig: ['component', 'config', 'elementTemplate'],
        });
      this.compDefMapEntries[index].defEntry.lineagePaths = lineagePath;
    }
    // Every time the lineage paths are rebuilt, the form definition has essentially changed. Sending an event to notify listeners.
    this.eventBus.publish(
      createFormDefinitionChangeRequestEvent({
        sourceId: this.formFieldConfigName() || undefined
      })
    );
  }

  protected createFieldNewMapEntry(templateEntry: FormFieldCompMapEntry, value: any): RepeatableElementEntry {
    const localUniqueId = RepeatableFieldComponentConfig.getLocalUID();

    const elemEntry = {
      modelClass: templateEntry.modelClass,
      layoutClass: templateEntry.layoutClass,
      componentClass: templateEntry.componentClass,
      compConfigJson: _cloneDeep(templateEntry.compConfigJson),
      localUniqueId: localUniqueId,
    } as FormFieldCompMapEntry;

    // The component and layout names are set from the repeatable component name or a default name,
    // with localUniqueId appended to ensure uniqueness.
    const baseName = this.formFieldConfigName('repeatable');

    if (elemEntry.compConfigJson) {
      elemEntry.compConfigJson.name = `${baseName}-${localUniqueId}`;
    }
    if (elemEntry.compConfigJson?.layout) {
      elemEntry.compConfigJson.layout.name = `${baseName}-layout-${localUniqueId}`;
    }

    // Create new form field.
    const model = this.formService.createFormFieldModelInstance(elemEntry);
    if (model !== null) {
      elemEntry.model = model;
    }

    // Note that the repeatable elementTemplate does not have a 'name' property.
    // This means that the array elements do not have to have a 'top-level key', like most other components.
    // This is done to enable the array to be strings or numbers (using e.g. input component), as well as objects (using e.g. group component).
    return {
      defEntry: elemEntry,
      wrapperRef: null,
      localUniqueId: localUniqueId,
      value: value
    };
  }

  protected async createElement(elemEntry: RepeatableElementEntry) {
    const elemFieldEntry = elemEntry.defEntry;
    // Pushing early so rebuilding the lineage paths will be accurate
    this.compDefMapEntries.push(elemEntry);
    this.rebuildLineagePaths();
    // Create a new component for the repeatable element
    const wrapperRef = this.repeatableContainer.createComponent(FormBaseWrapperComponent<unknown>);
    // TODO: how to know when to apply defaultComponentConfig or not?
    // componentRef.instance.defaultComponentConfig = this.newElementFormConfig?.defaultComponentConfig;
    const compInstance = await wrapperRef.instance.initWrapperComponent(elemFieldEntry);
    const layoutInstance = ((compInstance as unknown) as RepeatableElementLayoutComponent<Array<unknown>>);
    layoutInstance.removeFn = this.removeElementFn(elemEntry);
    if (this.model?.formControl && compInstance?.model) {
      if (!_isUndefined(elemEntry.value)) {
        compInstance.model.setValue(elemEntry.value);
      }
      this.model.addElement(compInstance.model);
    } else {
      this.loggerService.warn(`${this.logName}: model or formControl is not defined, not adding the element's form control to the 'this.formControl'. If any data is missing, this is why.`);
    }
    elemEntry.wrapperRef = wrapperRef;
    return wrapperRef;
  }

  public removeElementFn(elemEntry: RepeatableElementEntry) {
    const that = this;
    return function () {
      that.loggerService.debug(`${that.logName}: removeElement called: `, elemEntry.localUniqueId);
      that.loggerService.debug(`${that.logName}: removeElement called, matching elemEntry:`,
        that.compDefMapEntries.find(i => i === elemEntry)
      );
      const defIdx = that.compDefMapEntries.findIndex((entry) => entry.localUniqueId === elemEntry.localUniqueId);
      if (defIdx === -1) {
        that.loggerService.warn(`${that.logName}: removeElement called, but no element found with localUniqueId:`, elemEntry.localUniqueId);
        return;
      }
      that.compDefMapEntries.splice(defIdx, 1);
      elemEntry.wrapperRef?.destroy();
      that.model?.removeElement(elemEntry.defEntry?.model);
      that.rebuildLineagePaths();
    }
  }
}




export class RepeatableComponentModel extends FormFieldModel<Array<unknown>> {
  protected override logName = RepeatableModelName;
  public override formControl?: FormArray;

  public override postCreate(): void {
    // Don't call the super method, as this model needs a FormArray, and needs to populate it differently.
    // super.postCreate();

    // Store the init value. Use an empty array if the value is not set.
    this.initValue = this.fieldConfig.config?.value ?? [];

    // not setting value yet, this will be done in the component for lazy init
    const modelElems: AbstractControl[] = [];

    this.formControl = new FormArray(modelElems);
    if (this.fieldConfig.config?.disabled) {
      this.formControl.disable();
    }
    console.debug(`${this.logName}: created form control with model class '${this.fieldConfig?.class}' and initial value:`, this.initValue);
  }

  public addElement(targetModel?: FormFieldModel<unknown>) {
    const control = targetModel?.getFormControl();
    if (this.formControl && control) {
      if (this.formControl.disabled && control.enabled) {
        control.disable();
      }
      this.formControl.push(control);
    } else {
      throw new Error(`${this.logName}: formControl or targetModel are not valid. Cannot add element.`);
    }
  }

  public removeElement(targetModel?: FormFieldModel<unknown>): void {
    if (this.formControl && this.formControl instanceof FormArray) {
      const modelIdx = this.formControl?.controls.findIndex((control: unknown) => control === targetModel?.getFormControl());
      if (modelIdx === -1 || modelIdx === undefined) {
        throw new Error(`${this.logName}: model not found in formControl.`);
      }
      this.formControl.removeAt(modelIdx);
    } else {
      throw new Error(`${this.logName}: formControl is not a FormArray. Cannot remove element.`);
    }
  }
}



/**
 * Used to store the information about a repeatable element in the form, including its model, component, and layout, and other information needed to add or remove it from the form dynamically.
 */
export interface RepeatableElementEntry {
  defEntry: FormFieldCompMapEntry;
  wrapperRef: ComponentRef<FormBaseWrapperComponent<unknown>> | null | undefined;
  // The unique ID of the repeatable element, used to identify it in the form. This is not meant to be persisted in the database, but rather to be used for dynamic operations in the form.
  localUniqueId?: string;
  // The value of the element. Unfortunately, in the group compoment, the structure of the data model is not known until after the component is initialised, so we store the value here to set afterwards.
  value: unknown;
}

@Component({
  selector: 'redbox-form-repeatable-component-layout',
  template: `
  <div class="rb-form-repeatable-item">
    <div class="rb-form-repeatable-item__content">
      <ng-container #componentContainer></ng-container>
    </div>
    @if (isVisible) {
      <button type="button" class="rb-form-repeatable-item__remove col-auto fa fa-minus-circle btn text-20 btn-danger" (click)="clickedRemove()" [attr.aria-label]="'remove-button-label' | i18next"></button>
    }
  </div>
  <ng-template #afterComponentTemplate>
    @if (isVisible) {
      @let componentValidationList = getFormValidatorComponentErrors;
      @if (componentValidationList.length > 0) {
        <div class="invalid-feedback">
          Field validation errors:
          <ul>
            @for (error of componentValidationList; track $index) {
              <li>{{ error.message | i18next: error.params }}</li>
            }
          </ul>
        </div>
      }
      <div class="valid-feedback">The field is valid.</div>
    }
  </ng-template>
  `,
  standalone: false,
})
export class RepeatableElementLayoutComponent<ValueType> extends DefaultLayoutComponent<ValueType> {
  protected override logName = RepeatableElementLayoutName;
  public removeFn?: () => void;

  protected clickedRemove() {
    this.removeFn?.call(this);
  }
}
