import { Component, ComponentRef, inject, ViewChild, ViewContainerRef, TemplateRef, Injector } from '@angular/core';
import { FormArray, AbstractControl } from '@angular/forms';
import { FormFieldBaseComponent, FormFieldModel, FormFieldCompMapEntry  } from '@researchdatabox/portal-ng-common';
import {FormConfigFrame, RepeatableFieldComponentConfig} from '@researchdatabox/sails-ng-common';
import { set as _set, isEmpty as _isEmpty, cloneDeep as _cloneDeep, get as _get, isUndefined as _isUndefined, isNull as _isNull } from 'lodash-es';
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
    @if (isStatusReady() && isVisible) {
      <button type="button" class="btn btn-md btn-primary" (click)="appendNewElement()" [attr.aria-label]="'Add'">Add</button>
    }
    <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
  `,
  standalone: false
})
export class RepeatableComponent extends FormFieldBaseComponent<Array<unknown>> {
  protected override logName: string | null = "RepeatableComponent";
  public override model?: RepeatableComponentModel;

  protected formService = inject(FormService);
  private injector = inject(Injector);
  protected elemInitFieldEntry?: FormFieldCompMapEntry;

  protected compDefMapEntries: Array<RepeatableElementEntry> = [];

  @ViewChild('repeatableContainer', { read: ViewContainerRef, static: true }) repeatableContainer!: ViewContainerRef;
  @ViewChild('removeButtonTemplate', { read: TemplateRef<any>, static: false }) removeButtonTemplate!: TemplateRef<any>;


  private newElementFormConfig?: FormConfigFrame;

  protected get getFormComponent(): FormComponent {
    return this.injector.get(FormComponent);
  }

  public override get formFieldBaseComponents(): FormFieldBaseComponent<unknown>[] {
    return this.formFieldCompMapEntries
      .map(c => c.component)
      .filter(c => c !== undefined && c !== null);
  }

  public override get formFieldCompMapEntries() : FormFieldCompMapEntry[]  {
    return this.compDefMapEntries?.map(i => i?.defEntry) ?? [];
  }

  protected override async initData() {
    await this.untilViewIsInitialised();
    // Prepare the element template
    const formFieldCompDef = this.componentDefinition;
    const elementTemplate = (formFieldCompDef?.config as RepeatableFieldComponentConfig)?.elementTemplate;
    if (!elementTemplate) {
      throw new Error(`${this.logName}: elementTemplate is not defined in the component definition.`);
    }

    // Resolve the classes using the FormService
    this.newElementFormConfig = {
      name: `form-config-generated-repeatable-${this.formFieldCompMapEntry?.compConfigJson?.name}`,
      // Add an empty name to satisfy the FormConfig, the name will be replaced with a generated name.
      componentDefinitions: [{...elementTemplate, name: ""}],
      // Get the default config.
      // defaultComponentConfig: this.getFormComponent.formDefMap?.formConfig?.defaultComponentConfig,
    };
    const parentLineagePaths = this.formService.buildLineagePaths(
      this.formFieldCompMapEntry?.lineagePaths,
      {
        angularComponents: [],
        dataModel: [],
        formConfig: ['component', 'config', 'elementTemplate'],
      });
    let formComponentsMap = await this.formService.createFormComponentsMap(this.newElementFormConfig, parentLineagePaths);

    if (_isEmpty(formComponentsMap)) {
      throw new Error(`${this.logName}: No components found in the formComponentsMap.`);
    }
    if (!this.model) {
      throw new Error(`${this.logName}: model is not defined. Cannot initialize the component.`);
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
      throw new Error(`${this.logName}: model value is not an array. Cannot initialize the component.`);
    }

    if (elemVals.length === 0) {
      // If the model is empty, we need to create at least one element with the default value
      elemVals.push(this.model.fieldConfig.config?.defaultValue || null);
    }

    for (const elementValue of elemVals) {
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
    const baseName = this.formFieldConfigName('repeatable') || 'repeatable-element';

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

  protected async createElement(elemEntry: RepeatableElementEntry ) {
    const elemFieldEntry = elemEntry.defEntry;
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
    let comps:FormFieldCompMapEntry[] = this.formFieldCompMapEntries ?? [];
    //Evaluate top level expressions
    super.checkUpdateExpressions();
    //Propagate top level expressions and evaluate in its children components
    //this is required for the parent component to delegate responsibility of
    //behaviour to the children i.e. each component will handle its visibility
    //but has to be maintained in sync with the overarching state of the parent
    for(let entry of comps) {
      if(_isUndefined(entry.component?.formFieldCompMapEntry?.layout)) {
        entry.component?.propagateExpressions(this.expressions, true);
      } else {
        entry.component?.propagateExpressions(this.expressions);
      }
      let components = entry.component?.formFieldBaseComponents;
      if(!_isUndefined(components) && !_isNull(components) && !_isEmpty(components)) {
        for(let comp of components) {
          let temp:FormFieldBaseComponent<unknown> = comp as FormFieldBaseComponent<unknown>;
          temp.propagateExpressions(this.expressions);
        }
      }
    }
    //Evaluate expressions in children components
    for(let entry of comps) {
      entry.component?.checkUpdateExpressions();
    }
  }
}




export class RepeatableComponentModel extends FormFieldModel<Array<unknown>> {
  protected override logName = "RepeatableComponentModel";
  public override formControl?: FormArray;

  public override postCreate(): void {
    // Don't call the super method, as this model needs a FormArray, and needs to populate it differently.
    // super.postCreate();

    // Init with empty array if no default value is set
    if (!this.fieldConfig.config?.defaultValue) {
      _set(this.fieldConfig, 'config.defaultValue', []);
    }
    // Store the init value. Use the default value if the value is not set.
    this.initValue = _get(this.fieldConfig, 'config.value') ?? this.fieldConfig.config?.defaultValue;

    // not setting value yet, this will be done in the component for lazy init
    const modelElems: AbstractControl[] = [];

    this.formControl = new FormArray(modelElems);
    console.debug(`${this.logName}: created form control with model class '${this.fieldConfig?.class}' and initial value:`, this.initValue);
  }

  public addElement(targetModel?: FormFieldModel<unknown>){
    if (this.formControl && targetModel){
      this.formControl.push(targetModel.getFormGroupEntry());
    } else {
      throw new Error(`${this.logName}: formControl or targetModel are not valid. Cannot add element.`);
    }
  }

  public removeElement(targetModel?: FormFieldModel<unknown>): void {
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
  <ng-container #componentContainer></ng-container>
  @if (isVisible) {
    <button type="button" class="col-auto fa fa-minus-circle btn text-20 btn-danger" (click)="clickedRemove()" [attr.aria-label]="'remove-button-label' | i18next"></button>
  }
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
  protected override logName = "RepeatableElementLayoutComponent";
  public removeFn?: () => void;

  protected clickedRemove() {
    this.removeFn?.call(this);
  }
}
