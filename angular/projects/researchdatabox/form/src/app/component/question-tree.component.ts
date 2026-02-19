import {FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel} from "@researchdatabox/portal-ng-common";
import {
  QuestionTreeModelValueType,
  QuestionTreeComponentName,
  QuestionTreeModelName, FormConfigFrame, isTypeWithComponentDefinitions,
  isTypeFieldDefinitionName,
  QuestionTreeFieldComponentDefinitionFrame
} from "@researchdatabox/sails-ng-common";
import {Component, inject, Injector, ViewChild, ViewContainerRef} from "@angular/core";
import {AbstractControl, FormGroup} from "@angular/forms";
import {FormComponentsMap, FormService} from "../form.service";
import {FormComponent} from "../form.component";
import {isEmpty as _isEmpty, isUndefined as _isUndefined} from "lodash-es";
import {FormBaseWrapperComponent} from "./base-wrapper.component";


export class QuestionTreeModel extends FormFieldModel<QuestionTreeModelValueType> {
  protected override logName = QuestionTreeModelName;
  public override formControl?: FormGroup;

  protected override postCreateGetInitValue(): QuestionTreeModelValueType {
    return this.fieldConfig.config?.value ?? {};
  }

  protected override postCreateGetFormControl(): FormGroup<{ [key: string]: AbstractControl<any> }> {
    // Create the empty FormGroup here, not in the component.
    // This is different from FormComponent, which has no model.
    // Creating the FormGroup here allows encapsulating the FormGroup & children
    // in the same way as other components.
    const modelElems: { [key: string]: AbstractControl<any> } = {};
    return new FormGroup(modelElems);
  }

  public addItem(name: string, targetModel?: FormFieldModel<unknown>) {
    if (this.formControl && name && targetModel) {
      this.formControl.addControl(name, targetModel.getFormControl());
    } else {
      throw new Error(`${this.logName}: formControl or name or targetModel are not valid. Cannot add item.`);
    }
  }
}

@Component({
  selector: 'redbox-questiontreefield',
  template: `
    <ng-container *ngTemplateOutlet="getTemplateRef('before')"/>
    <ng-container #componentContainer/>
    <ng-container *ngTemplateOutlet="getTemplateRef('after')"/>
  `,
  standalone: false
})
export class QuestionTreeComponent extends FormFieldBaseComponent<QuestionTreeModelValueType> {
  protected override logName = QuestionTreeComponentName;
  public override model?: QuestionTreeModel;

  private formService = inject(FormService);
  private injector = inject(Injector);
  protected formComponentsMap?: FormComponentsMap;

  @ViewChild('componentContainer', {read: ViewContainerRef, static: true})
  private componentContainer!: ViewContainerRef;

  private elementFormConfig?: FormConfigFrame;

  protected get getFormComponent(): FormComponent {
    return this.injector.get(FormComponent);
  }
  public override get formFieldBaseComponents(): FormFieldBaseComponent<unknown>[] {
    return this.formFieldCompMapEntries
      .map(c => c.component)
      .filter(c => c !== undefined && c !== null);
  }

  public override get formFieldCompMapEntries() : FormFieldCompMapEntry[] {
    return this.formComponentsMap?.components ?? [];
  }

  protected override async initData() {
    await this.untilViewIsInitialised();

    // Build a form config to store the info needed to build the components.
    const formConfig = this.getFormComponent.formDefMap?.formConfig;
    const formComponentName = this.formFieldCompMapEntry?.compConfigJson?.name ?? "";

    const componentFormConfig = this.formFieldCompMapEntry?.compConfigJson?.component;
    if (!isTypeFieldDefinitionName<QuestionTreeFieldComponentDefinitionFrame>(componentFormConfig, QuestionTreeComponentName)){
      throw new Error(`Expected a question tree component, but got ${JSON.stringify(componentFormConfig)}`);
    }

    const componentConfigFormConfig = componentFormConfig.config;
    if (!isTypeWithComponentDefinitions(componentConfigFormConfig) || componentConfigFormConfig.componentDefinitions?.length < 1){
      throw new Error(`Expected a question tree component config with at least one componentDefinition, but got ${JSON.stringify(componentConfigFormConfig)}`);
    }

    const componentDefinitions = componentConfigFormConfig.componentDefinitions;
    this.elementFormConfig = {
      name: `form-config-generated-questiontree-${formComponentName}`,
      // Store the child component definitions.
      componentDefinitions: componentDefinitions,
      // Get the default config.
      defaultComponentConfig: formConfig?.defaultComponentConfig,
    };

    // Construct the components.
    const parentLineagePaths = this.formService.buildLineagePaths(
      this.formFieldCompMapEntry?.lineagePaths,
      {
        angularComponents: [],
        dataModel: [],
        formConfig: ['component', 'config', 'componentDefinitions'],
      });
    this.formComponentsMap = await this.formService.createFormComponentsMap(this.elementFormConfig, parentLineagePaths);

    if (_isEmpty(this.formComponentsMap)) {
      throw new Error(`${this.logName}: No components found in the formComponentsMap.`);
    }
    if (!this.model) {
      throw new Error(`${this.logName}: model is not defined. Cannot initialize the component.`);
    }

    // Create the form fields from the form components map.
    const elemVals = this.model.initValue ?? {};
    const formGroupMap = this.formService.groupComponentsByName(this.formComponentsMap);
    for (const key of Object.keys(formGroupMap.withFormControl ?? {})) {
      // Create the wrapper component.
      const wrapperRef = this.componentContainer.createComponent(FormBaseWrapperComponent<unknown>);
      wrapperRef.instance.defaultComponentConfig = this.elementFormConfig?.defaultComponentConfig;
      const elemFieldEntry = formGroupMap.completeGroupMap?.[key];
      const compInstance = await wrapperRef.instance.initWrapperComponent(elemFieldEntry);

      // Populate the component model if it has one.
      const hasModel = this.model?.formControl && compInstance?.model;
      if (hasModel) {
        const elemVal = elemVals?.[key];
        if (compInstance?.model && !_isUndefined(elemVal)) {
          compInstance.model.setValue(elemVal);
        }
        this.model.addItem(key, compInstance.model);
      } else {
        this.loggerService.warn(`${this.logName}: model or formControl for '${key}' is not defined, not adding the element's form control to the 'this.formControl'. If any data is missing, this is why.`);
      }

      // Set the reference to the wrapper component.
      // TODO: is this needed? See how other components with nested components do this?
      if (elemFieldEntry) {
        elemFieldEntry.componentRef = wrapperRef;
      }
    }
  }

}
