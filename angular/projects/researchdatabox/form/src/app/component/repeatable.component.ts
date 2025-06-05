import { Input, Component, ComponentRef, inject, ViewChild, ViewContainerRef, output, Type, TemplateRef, EmbeddedViewRef } from '@angular/core';
import { FormArray, AbstractControl } from '@angular/forms';
import { FormFieldBaseComponent, FormFieldModel, FormFieldModelDefinition, FormFieldModelConfig, FormFieldComponentDefinition, FormComponentLayoutDefinition, FormFieldComponentStatus, FormFieldDefininition, FormFieldCompMapEntry, FormConfig, FormBaseWrapperComponent } from '@researchdatabox/portal-ng-common';

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
    <ng-container>
      <pre>Repeatable Status: {{ status() }}</pre>
    </ng-container>
    <ng-template #removeButtonTemplate>
       @let label = "Remove";
      <button type="button" class="btn btn-danger" (click)="removeElement($event)" [innerHtml]="label"></button>
    </ng-template>
  `,
  standalone: false
})
export class RepeatableComponent extends FormFieldBaseComponent<Array<unknown>> {
  @Input() public override model?: RepeatableComponentModel | null | undefined = null;

  @Input() public override componentDefinition?: RepeatableComponentDefinition;
  
  protected formService = inject(FormService);

  protected elemInitFieldEntry?: FormFieldCompMapEntry;

  protected compDefMapEntries: Array<FormFieldCompMapEntry> = [];
  protected compRefs: Array<ComponentRef<FormBaseWrapperComponent | FormFieldBaseComponent>> = [];
  
  @ViewChild('repeatableContainer', { read: ViewContainerRef, static: true }) repeatableContainer!: ViewContainerRef;
  @ViewChild('removeButtonTemplate', { read: TemplateRef<any>, static: false }) removeButtonTemplate!: TemplateRef<any>;


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
    // elemEntry.model = new (elemEntry.modelClass as any) (elemEntry.compConfigJson.model as FormFieldModelConfig) as FormFieldModel;
    const componentRef = await this.createElement(this.elemInitFieldEntry, value, elemEntry);
    // elemEntry.component = componentRef.instance;
    this.compDefMapEntries.push(elemEntry);
    this.compRefs.push(componentRef);
  }

  public removeElementByIndex(index: number) {
    return 
  }

  protected createFieldNewMapEntry(templateEntry: FormFieldCompMapEntry, value: any): FormFieldCompMapEntry {

    const elemEntry: FormFieldCompMapEntry = {     
      modelClass: templateEntry.modelClass,
      layoutClass: templateEntry.layoutClass,
      componentClass: templateEntry.componentClass,
      compConfigJson: _cloneDeep(templateEntry.compConfigJson),
      
    } as FormFieldCompMapEntry;
    return elemEntry;
  }

  protected async createElement(templateEntry: FormFieldCompMapEntry, value: any, elemEntry: FormFieldCompMapEntry) {  
    const elemFieldEntry = this.createFieldNewMapEntry(templateEntry, value);
    const model = new (elemFieldEntry.modelClass as any) (elemFieldEntry.compConfigJson.model as FormFieldModelConfig) as FormFieldModel;
    // TODO: validate the value
    if (value) {
      model.setValue(value);
    }
    elemFieldEntry.model = model;
    // Create a new component for the repeatable element
    const componentRef: ComponentRef<FormBaseWrapperComponent> = this.repeatableContainer.createComponent<FormBaseWrapperComponent>(FormBaseWrapperComponent);
    // elemEntry.componentTemplateRefMap = {
    //   after: 
    // };
    const elemFieldRemoveButtonTemplate = this.removeButtonTemplate.createEmbeddedView({context: {label: 'Remove Me'}});
    elemFieldEntry.componentTemplateRefMap = {
      after: elemFieldRemoveButtonTemplate
    }

    const compInstance = await componentRef.instance.initWrapperComponent(elemFieldEntry);
    // const componentRef = this.repeatableContainer.createComponent<FormFieldBaseComponent>((elemFieldEntry.componentClass as any) as Type<FormFieldBaseComponent>);
    // // Initialize the component with the template entry
    // await componentRef.instance.initComponent(elemFieldEntry);

    elemEntry.component = compInstance;
    if (this.model?.formControl && compInstance?.model) {
      this.model.formControl.push(compInstance.model.getFormGroupEntry() as AbstractControl);
    } else {
      this.loggerService.warn("RepeatableComponent: model or formControl is not defined, not adding the element's form control to the 'this.formControl'. If any data is missing, this is why.");
    }
    
    return componentRef;
  }

  public removeElement(event: MouseEvent, ): void {
    event.preventDefault();
    event.stopPropagation();
    this.loggerService.debug("RepeatableComponent: removeElement called", event);
    this.loggerService.debug(event);
    // const target = event.target as HTMLElement;
    // const compRef = this.compRefs.find(ref => ref.location.nativeElement === target);
    // if (compRef) {
    //   const index = this.compRefs.indexOf(compRef);
    //   if (index > -1) {
    //     this.compRefs.splice(index, 1);
    //     this.compDefMapEntries.splice(index, 1);
    //     this.repeatableContainer.remove(index);
    //     // Remove the form control from the model
    //     if (this.model?.formControl) {
    //       this.model.formControl.removeAt(index);
    //     }
    //   }
    // }
  }
}


export class RepeatableFormFieldDefinition extends FormFieldDefininition {

}

export class RepeatableComponentModel extends FormFieldModel<Array<unknown>> {
  public override initValue?: Array<unknown> | null | undefined;
  public override formControl!: FormArray;


  public override postCreate(): void {
    // Init with empty array if no default value is set
    if (!this.fieldConfig.config?.defaultValue) {
      _set(this.fieldConfig, 'config.defaultValue', []);
    }
    // Uthe default value if the initial value is not set
    this.initValue = _get(this.fieldConfig.config, 'value', this.fieldConfig.config?.defaultValue);
    // console.log("RepeatableComponentModel: prepared form control for lazy-init at the component level, but init JSON value should be:", this.initValue);

    // not setting value yet, this will be done in the component for lazy init
    const modelElems: AbstractControl[] = [];
    
    this.formControl = new FormArray(modelElems);
    // console.log("RepeatableComponentModel: created form model:", this.formControl);
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

export class RepeatableComponentConfigDefinition extends FormFieldDefininition {
  elementTemplate?: FormFieldComponentDefinition;
}

@Component({
  selector: 'redbox-form-repeatable-button',
  template: `<button type="button" [class]="" (click)="onClick()">{{label}}</button>`
})
export class RepeatableButtonComponent {
  @Input() label = 'Click me';
  clicked = output<void>();

  onClick() {
    this.clicked.emit();
  }
}