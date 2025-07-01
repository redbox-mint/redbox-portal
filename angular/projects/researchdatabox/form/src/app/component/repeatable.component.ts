import { Input, Component, ComponentRef, inject, ViewChild, ViewContainerRef, TemplateRef, Injector } from '@angular/core';
import { FormArray, AbstractControl } from '@angular/forms';
import { FormFieldBaseComponent, FormFieldModel, FormFieldCompMapEntry  } from '@researchdatabox/portal-ng-common';
import {  FormFieldModelDefinition, FormFieldModelConfig, FormFieldComponentDefinition, FormFieldDefinition, FormConfig, } from '@researchdatabox/sails-ng-common';
import { set as _set, isEmpty as _isEmpty, cloneDeep as _cloneDeep, get as _get, isUndefined as _isUndefined } from 'lodash-es';
import { FormService } from '../form.service';
import { FormComponent } from "../form.component";
import {FormBaseWrapperComponent} from "./base-wrapper.component";
import {DefaultLayoutComponent} from "./default-layout.component";

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
    <ng-container #repeatableContainer></ng-container>
    @if (isStatusReady()) {
      <button type="button" class="btn btn-md btn-primary" (click)="appendNewElement()" [attr.aria-label]="'Add'">Add</button>
    }
    <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
  `,
  standalone: false
})
export class RepeatableComponent extends FormFieldBaseComponent<Array<unknown>> {
  protected override logName: string | null = "RepeatableComponent";
  public override model?: RepeatableComponentModel | null | undefined = null;

  protected formService = inject(FormService);
  private injector = inject(Injector);
  protected elemInitFieldEntry?: FormFieldCompMapEntry;

  protected compDefMapEntries: Array<RepeatableElementEntry> = [];

  @ViewChild('repeatableContainer', { read: ViewContainerRef, static: true }) repeatableContainer!: ViewContainerRef;
  @ViewChild('removeButtonTemplate', { read: TemplateRef<any>, static: false }) removeButtonTemplate!: TemplateRef<any>;

  // Simple counter to track the next locally unique ID for the repeatable elements, mainly for deletion purposes, not meant to be globally unique nor persisted in the DB.
  protected nextLocalUniqueId = 0;

  private newElementFormConfig?: FormConfig;

  protected get getFormComponent(): FormComponent {
    return this.injector.get(FormComponent);
  }

  protected override async initData() {
    await this.untilViewIsInitialised();
    // Prepare the element template
    const formFieldCompDef = this.componentDefinition as FormFieldComponentDefinition;
    const elementTemplate = formFieldCompDef?.config?.elementTemplate;
    if (!elementTemplate) {
      throw new Error(`${this.logName}: elementTemplate is not defined in the component definition.`);
    }

    // Resolve the classes using the FormService
    const formConfig = this.getFormComponent.formDefMap?.formConfig;
    this.newElementFormConfig = {
      componentDefinitions: [elementTemplate],
      // Get the debugValue from the FormComponent.
      debugValue: formConfig?.debugValue,
      // Get the default config.
      // defaultComponentConfig: formConfig?.defaultComponentConfig,
      // Get the validator definitions so the child components can use them.
      validatorDefinitions: formConfig?.validatorDefinitions,
    };
    let formComponentsMap = await this.formService.createFormComponentsMap(this.newElementFormConfig);

    if (_isEmpty(formComponentsMap)) {
      throw new Error(`${this.logName}: No components found in the formComponentsMap.`);
    }
    if (!this.model) {
      throw new Error(`${this.logName}: model is not defined. Cannot initialize the component.`);
    }

    this.elemInitFieldEntry = formComponentsMap.components[0];
    this.elemInitFieldEntry.layoutClass = RepeatableLayoutComponent;

    // Loop through the elements of the model and insert into the container
    const elemVals = this.model.initValue;
    if (!Array.isArray(elemVals)) {
      throw new Error(`${this.logName}: model value is not an array. Cannot initialize the component.`);
    }

    if (elemVals.length === 0) {
      // If the model is empty, we need to create at least one element with the default value
      elemVals.push(this.model.fieldConfig.config?.defaultValue || null);
    }

    for (let i = 0; i < elemVals.length; i++) {
      const elementValue = elemVals[i];
      await this.appendNewElement(elementValue);
    }
  }

  public async appendNewElement(value?: any) {
    if (!this.elemInitFieldEntry) {
      throw new Error(`${this.logName}: elemInitFieldEntry is not defined. Cannot append new element.`);
    }
    const elemEntry = this.createFieldNewMapEntry(this.elemInitFieldEntry, value);
    await this.createElement(elemEntry);
  }


  protected createFieldNewMapEntry(templateEntry: FormFieldCompMapEntry, value: any): RepeatableElementEntry {
    // TODO: There is a potential data race condition in this method:
    //  if two new fields are created fast enough, they might have the same localUniqueId.

    const localUniqueId = this.nextLocalUniqueId;

    // Increment the local id for the next new field.
    this.nextLocalUniqueId += 1;

    const elemEntry = {
      modelClass: templateEntry.modelClass,
      layoutClass: templateEntry.layoutClass,
      componentClass: templateEntry.componentClass,
      compConfigJson: _cloneDeep(templateEntry.compConfigJson),
      localUniqueId: localUniqueId,
    } as FormFieldCompMapEntry;
    // Create new form field.
    const model = this.formService.createFormFieldModelInstance(elemEntry, this.newElementFormConfig?.validatorDefinitions);

    elemEntry.model = model;

    return {
      defEntry: elemEntry,
      wrapperRef: null,
      localUniqueId: localUniqueId,
      value: value
    };
  }

  protected async createElement(elemEntry: RepeatableElementEntry ) {
    const elemFieldEntry = elemEntry.defEntry;
    // Create a new component for the repeatable element
    const wrapperRef = this.repeatableContainer.createComponent(FormBaseWrapperComponent<unknown>);
    // TODO: how to know when to apply defaultComponentConfig or not?
    // componentRef.instance.defaultComponentConfig = this.newElementFormConfig?.defaultComponentConfig;
    const compInstance = await wrapperRef.instance.initWrapperComponent(elemFieldEntry);
    const layoutInstance = ((compInstance as unknown) as RepeatableLayoutComponent<Array<unknown>>);
    layoutInstance.removeFn = this.removeElementFn(elemEntry);
    // layoutInstance.wrapperComponentRef = componentRef;
    layoutInstance.hostBindingCssClasses = "row align-items-start";
    layoutInstance.wrapperComponentRef.instance.hostBindingCssClasses = "col";

    elemFieldEntry.component = compInstance;
    if (this.model?.formControl && compInstance?.model) {
      if (!_isUndefined(elemEntry.value)) {
        compInstance.model.setValue(elemEntry.value);
      }
      this.model.formControl.push(compInstance.model.getFormGroupEntry() as AbstractControl);
    } else {
      this.loggerService.warn(`${this.logName}: model or formControl is not defined, not adding the element's form control to the 'this.formControl'. If any data is missing, this is why.`);
    }
    elemEntry.wrapperRef = wrapperRef;
    this.compDefMapEntries.push(elemEntry);
    return wrapperRef;
  }

  public removeElementFn(elemEntry: RepeatableElementEntry) {
    const that = this;
    return function() {
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
    }
  }

  public override checkUpdateExpressions() {
     this.loggerService.debug('repeatable checkUpdateExpressions');
    super.checkUpdateExpressions();
    if(this.expressionStateChanged) {
      //Run top level expression and if changed propagate result to children
      for(let entry of this.compDefMapEntries) {
        entry.defEntry.component?.propagateExpressions(this.expressions);
      }
    }
    //TODO run through repeatable components and evaluate expressions for each component
  }

}


export class RepeatableFormFieldDefinition extends FormFieldDefinition {

}

export class RepeatableComponentModel extends FormFieldModel<Array<unknown>> {
  private logName = "RepeatableComponentModel";
  public override initValue?: Array<unknown> | null | undefined;
  public override formControl!: FormArray;



  public override postCreate(): void {
    // Don't call the super method, as this model needs a FormArray, and needs to populate it differently.
    // super.postCreate();

    // Init with empty array if no default value is set
    if (!this.fieldConfig.config?.defaultValue) {
      _set(this.fieldConfig, 'config.defaultValue', []);
    }
    // The default value if the initial value is not set
    this.initValue = _get(this.fieldConfig.config, 'value', this.fieldConfig.config?.defaultValue);
    // not setting value yet, this will be done in the component for lazy init
    const modelElems: AbstractControl[] = [];

    this.formControl = new FormArray(modelElems);
    // console.log("RepeatableComponentModel: created form model:", this.formControl);
  }

  public removeElement(targetModel: FormFieldModel<unknown> | null | undefined): void {
    if (this.formControl && this.formControl instanceof FormArray) {
      const modelIdx = this.formControl?.controls.findIndex((control: unknown) => control === targetModel?.getFormGroupEntry());
      if (modelIdx === -1 || modelIdx === undefined) {
        throw new Error(`${this.logName}: model not found in formControl.`);
      }
      this.formControl.removeAt(modelIdx);
    } else {
      throw new Error(`${this.logName}: formControl is not a FormArray. Cannot remove element.`);
    }
  }
}

export class RepeatableModelConfig extends FormFieldModelConfig<unknown[]> {

  public override config?: RepeatableModelDefinition | null | undefined = null; // the component definition for the repeatable component, e.g. a list of components to repeat

  // Migrate properties from `RepeatableContainer`

}

export class RepeatableModelDefinition extends FormFieldModelDefinition<Array<unknown>> {
  public override value?: Array<unknown> | undefined = []; // The initial value of the repeatable component, e.g. an empty array
  public override defaultValue?: unknown[] | undefined;
  // TODO: Migrate JSON configurable properties from `RepeatableContainer`
}

/**
 * Used to store the information about a repeatable element in the form, including its model, component, and layout, and other information needed to add or remove it from the form dynamically.
 */
export interface RepeatableElementEntry {
  defEntry: FormFieldCompMapEntry;
  wrapperRef: ComponentRef<FormBaseWrapperComponent<unknown>> | null | undefined;
  // The unique ID of the repeatable element, used to identify it in the form. This is not meant to be persisted in the database, but rather to be used for dynamic operations in the form.
  localUniqueId?: number | undefined;
  // The value of the element. Unfortunately, in the group compoment, the structure of the data model is not known until after the component is initialised, so we store the value here to set afterwards.
  value: unknown; 
}

@Component({
  selector: 'redbox-form-repeatable-component-layout',
  template: `
  <ng-container #componentContainer></ng-container>
  <button type="button" class="col-auto fa fa-minus-circle btn text-20 btn-danger" (click)="clickedRemove()" [attr.aria-label]="'remove-button-label' | i18next"></button>
  
  <ng-template #afterComponentTemplate>
    @let componentValidationList = getFormValidatorComponentErrors;
    @if (componentValidationList.length > 0) {
      <div class="invalid-feedback">
        Field validation errors:
        <ul>
          @for (error of componentValidationList; track error.name) {
            <li>{{ error.message ?? "(no message)" | i18next: error.params }}</li>
          }
        </ul>
      </div>
    }
    <div class="valid-feedback">The field is valid.</div>
  </ng-template>
  `,
  standalone: false,
})
export class RepeatableLayoutComponent<ValueType> extends DefaultLayoutComponent<ValueType> {
  protected override logName = "RepeatableLayoutComponent";
  public removeFn?: () => void;

  protected clickedRemove() {
    this.removeFn?.call(this);
  }
}
