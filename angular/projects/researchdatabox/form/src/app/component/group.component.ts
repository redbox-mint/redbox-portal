import {
  Component,
  inject,
  Injector,
  ViewChild,
  ViewContainerRef
} from '@angular/core';
import { AbstractControl, FormGroup } from "@angular/forms";
import {
  FormFieldBaseComponent,
  FormFieldCompMapEntry,
  FormFieldModel,
} from "@researchdatabox/portal-ng-common";
import {
  FormConfigFrame,
  GroupFieldModelValueType, GroupFieldModelName, GroupFieldComponentName,
  isTypeFieldDefinitionName,
  isTypeWithComponentDefinitions,
  GroupFieldComponentDefinitionFrame,
} from "@researchdatabox/sails-ng-common";
import { FormComponentsMap, FormService } from "../form.service";
import { FormComponent } from "../form.component";
import {
  get as _get,
  isEmpty as _isEmpty,
  isUndefined as _isUndefined,
} from "lodash-es";
import { FormBaseWrapperComponent } from "./base-wrapper.component";
import { RepeatableComponent } from './repeatable.component';
import { syncComponentDisplayFromModel } from '../form-state/custom-display-sync.control';


export type GroupFormControlValueType = { [key: string]: AbstractControl<unknown> };
export type GroupFormControlType = FormGroup<GroupFormControlValueType>;

/**
 * The model for the Group Component.
 */
export class GroupFieldModel extends FormFieldModel<GroupFieldModelValueType> {
  protected override logName = GroupFieldModelName;
  public override formControl?: GroupFormControlType;

  protected override postCreateGetInitValue(): GroupFieldModelValueType {
    return this.fieldConfig.config?.value ?? {};
  }

  protected override postCreateGetFormControl(): GroupFormControlType {
    // Create the empty FormGroup here, not in the component.
    // This is different from FormComponent, which has no model.
    // Creating the FormGroup here allows encapsulating the FormGroup & children in the same way as other components.
    // in the same way as other components.
    const modelElems: GroupFormControlValueType = {};
    const formControl = new FormGroup(modelElems);
    return formControl;
  }

  public addItem(name: string, targetModel?: FormFieldModel<unknown>) {
    const control = targetModel?.getFormControl();
    if (this.formControl && name && control) {
      if (this.formControl.disabled && control.enabled) {
        control.disable();
      }
      this.formControl.addControl(name, control);
    } else {
      throw new Error(`${this.logName}: formControl or name or targetModel are not valid. Cannot add item.`);
    }
  }
}

@Component({
  selector: 'redbox-groupfield',
  template: `
    <ng-container *ngTemplateOutlet="getTemplateRef('before')"/>
    <div class="rb-form-group">
      <ng-container #componentContainer/>
    </div>
    <ng-container *ngTemplateOutlet="getTemplateRef('after')"/>
  `,
  standalone: false
})
export class GroupFieldComponent extends FormFieldBaseComponent<GroupFieldModelValueType> {
  protected override logName: string = GroupFieldComponentName;
  public override model?: GroupFieldModel;

  private formService = inject(FormService);
  protected formComponentsMap?: FormComponentsMap;

  @ViewChild('componentContainer', { read: ViewContainerRef, static: true })
  private componentContainer!: ViewContainerRef;

  protected get getFormComponent(): FormComponent {
    return this.formComponent;
  }

  public override get formFieldBaseComponents(): FormFieldBaseComponent<unknown>[] {
    return this.formFieldCompMapEntries
      .map(c => c.component)
      .filter(c => c !== undefined && c !== null);
  }

  public override get formFieldCompMapEntries(): FormFieldCompMapEntry[] {
    return this.formComponentsMap?.components ?? [];
  }

  protected override async initData() {
    await this.untilViewIsInitialised();

    // Build a form config to store the info needed to build the components.
    const formConfig = this.getFormComponent.formDefMap?.formConfig;
    const formComponentName = this.formFieldCompMapEntry?.compConfigJson?.name ?? "";

    const componentFormConfig = this.formFieldCompMapEntry?.compConfigJson?.component;
    if (!isTypeFieldDefinitionName<GroupFieldComponentDefinitionFrame>(componentFormConfig, GroupFieldComponentName)) {
      throw new Error(`Expected a group component, but got ${JSON.stringify(componentFormConfig)}`);
    }

    const componentConfigFormConfig = componentFormConfig.config;
    if (!isTypeWithComponentDefinitions(componentConfigFormConfig) || componentConfigFormConfig.componentDefinitions?.length < 1) {
      throw new Error(`Expected a group component config with at least one componentDefinition, but got ${JSON.stringify(componentConfigFormConfig)}`);
    }

    const componentDefinitions = componentConfigFormConfig.componentDefinitions;
    const elementFormConfig: FormConfigFrame = {
      name: `form-config-generated-group-${formComponentName}`,
      // Store the child component definitions.
      componentDefinitions: componentDefinitions,
      // Get the default config.
      defaultComponentConfig: formConfig?.defaultComponentConfig,
      // Use the current enabledValidationGroups for creating the component.
      // Subsequent updates will use the FormComponent's enabledValidationGroups property.
      enabledValidationGroups: this.getFormComponent.enabledValidationGroups,
      validationGroups: this.getFormComponent.validationGroups,
    };

    // Construct the components.
    const parentLineagePaths = this.formService.buildLineagePaths(
      this.formFieldCompMapEntry?.lineagePaths,
      {
        angularComponents: [],
        layout: [],
        dataModel: [],
        formConfig: ['component', 'config', 'componentDefinitions'],
      });
    this.formComponentsMap = await this.formService.createFormComponentsMap(elementFormConfig, parentLineagePaths);

    if (_isEmpty(this.formComponentsMap)) {
      throw new Error(`${this.logName}: No components found in the formComponentsMap.`);
    }
    if (!this.model) {
      throw new Error(`${this.logName}: model is not defined. Cannot initialize the component.`);
    }

    // Create the form group fields from the form components map.
    const elemVals = this.model.initValue ?? {};
    const formGroupMap = this.formService.groupComponentsByName(this.formComponentsMap);
    for (const key of Object.keys(formGroupMap.completeGroupMap ?? {})) {
      // Create the wrapper component.
      const wrapperRef = this.componentContainer.createComponent(FormBaseWrapperComponent<unknown>);
      wrapperRef.instance.defaultComponentConfig = elementFormConfig?.defaultComponentConfig;
      const elemFieldEntry = formGroupMap.completeGroupMap?.[key];
      const compInstance = await wrapperRef.instance.initWrapperComponent(elemFieldEntry);

      // Populate the component model if it has one.
      const hasModel = this.model?.formControl && compInstance?.model;
      const includeInFormControlMap = this.formService.shouldIncludeInFormControlMap(elemFieldEntry);
      if (hasModel && includeInFormControlMap) {
        const elemVal = elemVals?.[key];
        if (compInstance?.model && !_isUndefined(elemVal)) {
          if (compInstance instanceof RepeatableComponent && Array.isArray(elemVal) && compInstance.formFieldCompMapEntries.length === 0) {
            for (const repeatableValue of elemVal) {
              await compInstance.appendNewElement(repeatableValue, false);
            }
          } else {
            compInstance.model.setValue(elemVal as never);
          }
        }
        this.model.addItem(key, compInstance.model);
        await syncComponentDisplayFromModel(compInstance);
      } else {
        this.loggerService.debug(`${this.logName}: component for '${key}' does not have a model or formControl, skipping addItem.`);
      }

      // Set the reference to the wrapper component.
      // TODO: is this needed? See how other components with nested components do this?
      if (elemFieldEntry) {
        elemFieldEntry.componentRef = wrapperRef;
      }
    }
  }
}
