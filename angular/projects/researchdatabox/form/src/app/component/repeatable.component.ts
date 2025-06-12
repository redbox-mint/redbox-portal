import { Input, Component, ComponentRef, inject, ViewChild, ViewContainerRef, output, Type, TemplateRef, EmbeddedViewRef } from '@angular/core';
import { FormArray, AbstractControl } from '@angular/forms';
import { FormFieldBaseComponent, FormFieldModel, FormFieldModelDefinition, FormFieldModelConfig, FormFieldComponentDefinition, FormComponentLayoutDefinition, FormFieldComponentStatus, FormFieldDefinition, FormFieldCompMapEntry, FormConfig, FormBaseWrapperComponent, DefaultLayoutComponent } from '@researchdatabox/portal-ng-common';

import { set as _set, isEmpty as _isEmpty, cloneDeep as _cloneDeep, get as _get } from 'lodash-es';
import { FormComponentsMap, FormService } from '../form.service';
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
  @Input() public override model?: RepeatableComponentModel | null | undefined = null;

  @Input() public override componentDefinition?: RepeatableComponentDefinition;
  
  protected formService = inject(FormService);

  protected elemInitFieldEntry?: FormFieldCompMapEntry;

  protected compDefMapEntries: Array<RepeatableElementEntry> = [];
  
  @ViewChild('repeatableContainer', { read: ViewContainerRef, static: true }) repeatableContainer!: ViewContainerRef;
  @ViewChild('removeButtonTemplate', { read: TemplateRef<any>, static: false }) removeButtonTemplate!: TemplateRef<any>;

  // Simple counter to track the next locally unique ID for the repeatable elements, mainly for deletion purposes, not meant to be globally unique nor persisted in the DB.
  protected nextLocalUniqueId = 0;

  protected override async initData() { 
    await this.untilViewIsInitiased();
    // Prepare the element template 
    const elementTemplate = this.componentDefinition?.config?.elementTemplate;
    if (!elementTemplate) {
      throw new Error("RepeatableComponent: elementTemplate is not defined in the component definition.");
    }
    // Resolve the classes using the FormService
    let formComponentsMap:FormComponentsMap = await this.formService.createFormComponentsMap({
      componentDefinitions: [elementTemplate] as (FormFieldComponentDefinition | FormComponentLayoutDefinition)[]
    } as FormConfig);
    
    
    if (_isEmpty(formComponentsMap)) {
      throw new Error("RepeatableComponent: No components found in the formComponentsMap.");
    }
    if (!this.model) {
      throw new Error("RepeatableComponent: model is not defined. Cannot initialize the component.");
    }

    this.elemInitFieldEntry = formComponentsMap.components[0];
    this.elemInitFieldEntry.layoutClass = RepeatableLayoutComponent;
    
    // Loop through the elements of the model and insert into the container 
    const elemVals = this.model.initValue;
    if (!Array.isArray(elemVals)) {
      throw new Error("RepeatableComponent: model value is not an array. Cannot initialize the component.");
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
      throw new Error("RepeatableComponent: elemInitFieldEntry is not defined. Cannot append new element.");
    }
    const elemEntry = this.createFieldNewMapEntry(this.elemInitFieldEntry, value);
    await this.createElement(elemEntry);
  }


  protected createFieldNewMapEntry(templateEntry: FormFieldCompMapEntry, value: any): RepeatableElementEntry {

    const elemEntry: FormFieldCompMapEntry = {     
      modelClass: templateEntry.modelClass,
      layoutClass: templateEntry.layoutClass,
      componentClass: templateEntry.componentClass,
      compConfigJson: _cloneDeep(templateEntry.compConfigJson),
      localUniqueId: this.nextLocalUniqueId++,
    } as FormFieldCompMapEntry;
    const model = new (elemEntry.modelClass as any) (elemEntry.compConfigJson.model as FormFieldModelConfig) as FormFieldModel;
    // TODO: validate the value
    if (value) {
      model.setValue(value);
    }
    elemEntry.model = model;
    return { defEntry: elemEntry, localUniqueId: this.nextLocalUniqueId++ } as RepeatableElementEntry;
  }

  protected async createElement(elemEntry: RepeatableElementEntry ) {  
    const elemFieldEntry = elemEntry.defEntry;
    // Create a new component for the repeatable element
    const componentRef: ComponentRef<FormBaseWrapperComponent> = this.repeatableContainer.createComponent<FormBaseWrapperComponent>(FormBaseWrapperComponent);
    
    const compInstance = await componentRef.instance.initWrapperComponent(elemFieldEntry);
    ((compInstance as unknown) as RepeatableLayoutComponent<Array<unknown>>).removeFn = this.removeElementFn(elemEntry);

    elemFieldEntry.component = compInstance;
    if (this.model?.formControl && compInstance?.model) {
      this.model.formControl.push(compInstance.model.getFormGroupEntry() as AbstractControl);
    } else {
      this.loggerService.warn("RepeatableComponent: model or formControl is not defined, not adding the element's form control to the 'this.formControl'. If any data is missing, this is why.");
    }
    elemEntry.wrapperRef = componentRef;
    this.compDefMapEntries.push(elemEntry);
    return componentRef;
  }

  public removeElementFn(elemEntry: RepeatableElementEntry) {
    const that = this;
    return function() {
      that.loggerService.debug("RepeatableComponent: removeElement called: ", elemEntry.localUniqueId);
      const defIdx = that.compDefMapEntries.findIndex((entry) => entry.localUniqueId === elemEntry.localUniqueId);
      if (defIdx === -1) {
        that.loggerService.warn("RepeatableComponent: removeElement called, but no element found with localUniqueId:", elemEntry.localUniqueId);
        return;
      }
      that.compDefMapEntries.splice(defIdx, 1);
      elemEntry.wrapperRef?.destroy();
      that.model?.removeElement(elemEntry.defEntry?.model);
    }
  }
  

}


export class RepeatableFormFieldDefinition extends FormFieldDefinition {

}

export class RepeatableComponentModel extends FormFieldModel<Array<unknown>> {
  public override initValue?: Array<unknown> | null | undefined;
  public override formControl!: FormArray;


  public override postCreate(): void {
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
        throw new Error("RepeatableComponentModel: model not found in formControl.");
      }
      this.formControl.removeAt(modelIdx);
    } else {
      throw new Error("RepeatableComponentModel: formControl is not a FormArray. Cannot remove element.");
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

export class RepeatableComponentDefinition extends FormFieldComponentDefinition {
  public override config?: RepeatableComponentConfigDefinition | null | undefined;
}

export class RepeatableComponentConfigDefinition extends FormFieldDefinition {
  elementTemplate?: FormFieldComponentDefinition;
}

/** 
 * Used to store the information about a repeatable element in the form, including its model, component, and layout, and other information needed to add or remove it from the form dynamically.
 */
export interface RepeatableElementEntry {
  defEntry: FormFieldCompMapEntry;
  wrapperRef: ComponentRef<FormBaseWrapperComponent> | null | undefined;
  // The unique ID of the repeatable element, used to identify it in the form. This is not meant to be persisted in the database, but rather to be used for dynamic operations in the form.
  localUniqueId?: number | undefined;
}

@Component({
  selector: 'redbox-form-repeatable-component-layout',
  template: `
  <ng-container #componentContainer></ng-container>  
  <ng-template #afterComponentTemplate>
    <button type="button" class="fa fa-minus-circle btn text-20 pull-right btn-danger" (click)="clickedRemove()" [attr.aria-label]="'remove-button-label' | i18next"></button>
  </ng-template>
  `,
  standalone: false,
})
export class RepeatableLayoutComponent<ValueType> extends DefaultLayoutComponent<ValueType> {
  
  public removeFn?: () => void;

  protected clickedRemove() {
    this.removeFn?.call(this);
  }

}