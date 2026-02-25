import { FormFieldBaseComponent, FormFieldCompMapEntry, FormFieldModel } from "@researchdatabox/portal-ng-common";
import {
  QuestionTreeModelValueType,
  QuestionTreeComponentName,
  QuestionTreeModelName, FormConfigFrame, isTypeWithComponentDefinitions,
  isTypeFieldDefinitionName,
  QuestionTreeFieldComponentDefinitionFrame,
  QuestionTreeFieldComponentConfigFrame,
  QuestionTreeOutcomeInfoKey,
  QuestionTreeOutcomeInfo,
} from "@researchdatabox/sails-ng-common";
import { Component, inject, Injector, ViewChild, ViewContainerRef } from "@angular/core";
import {AbstractControl, FormGroup} from "@angular/forms";
import { FormComponentsMap, FormService } from "../form.service";
import { FormComponent } from "../form.component";
import { isEmpty as _isEmpty, isUndefined as _isUndefined } from "lodash-es";
import { FormBaseWrapperComponent } from "./base-wrapper.component";
import {FormComponentEventBus, FormComponentEventType} from "../form-state";
import {debounceTime, filter} from "rxjs";


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

  @ViewChild('componentContainer', { read: ViewContainerRef, static: true })
  private componentContainer!: ViewContainerRef;

  private elementFormConfig?: FormConfigFrame;

  private eventBus = inject(FormComponentEventBus);

  protected get getFormComponent(): FormComponent {
    return this.injector.get(FormComponent);
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
    if (!isTypeFieldDefinitionName<QuestionTreeFieldComponentDefinitionFrame>(componentFormConfig, QuestionTreeComponentName)) {
      throw new Error(`Expected a question tree component, but got ${JSON.stringify(componentFormConfig)}`);
    }

    const componentConfigFormConfig = componentFormConfig.config;
    if (!isTypeWithComponentDefinitions(componentConfigFormConfig) || componentConfigFormConfig.componentDefinitions?.length < 1) {
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
        layout: [],
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

    // React to value changed events from this component or any nested components.
    // The filtering only considers the angular component JSONPointer.
    // TODO: Does the filter need to consider the component names?
    this.eventBus
      .select$(FormComponentEventType.FIELD_VALUE_CHANGED)
      .pipe(
        filter(event =>
          event.fieldId === this.formFieldCompMapEntry?.lineagePaths?.angularComponentsJsonPointer ||
          event.fieldId.startsWith(this.formFieldCompMapEntry?.lineagePaths?.angularComponentsJsonPointer + '/')
        ),
        debounceTime(300)
      )
      .subscribe(event => {
        // When a value in the question tree changes,
        // calculate the outcome and set the data model properties.
        const newValue = this.getOutcomeInfo();
        const modelValue: QuestionTreeModelValueType = {...(this.model?.getValue() ?? {})};
        const currentValue = modelValue[QuestionTreeOutcomeInfoKey];
        const hasChanged = JSON.stringify(newValue) !== JSON.stringify(currentValue);
        if (hasChanged) {
          // The model value is only updated if the outcome property changed.
          // This change will trigger another `field.value.changed' event, which is what we want,
          // because then other components can use the updated outcome value in that subsequent event.
          modelValue[QuestionTreeOutcomeInfoKey] = newValue;
          this.model?.setValue(modelValue);
        }
        console.warn(`Question Tree -> eventbus -> field value ${hasChanged ? 'has changed' : ' is the same'}:`,
          JSON.parse(JSON.stringify({event, value: this.model?.getValue()})));
      });
  }

  private getFieldComponentFrame(): QuestionTreeFieldComponentDefinitionFrame {
    const componentFormConfig = this.formFieldCompMapEntry?.compConfigJson?.component;
    if (!isTypeFieldDefinitionName<QuestionTreeFieldComponentDefinitionFrame>(componentFormConfig, QuestionTreeComponentName)) {
      throw new Error(`Expected a question tree component, but got ${JSON.stringify(componentFormConfig)}`);
    }
    return componentFormConfig;
  }

  /**
   * Get the current outcome info.
   * @protected
   */
  protected getOutcomeInfo() {
    const config = this.getFieldComponentFrame().config;
    if (!config) {
      throw new Error(`${this.logName}: Could not get Question Tree component config.`);
    }
    const data = this.model?.getValue() ?? {};
    const outcomeInfo = this.calculateOutcomeInfo(config, data);
    return outcomeInfo;
  }

  /**
   * Provide the question tree data model to calculate the outcome and metadata structure.
   * @param config The question tree component config that contains the available outcome and meta settings.
   * @param data The question tree data model.
   */
  public calculateOutcomeInfo(config: QuestionTreeFieldComponentConfigFrame, data: QuestionTreeModelValueType): QuestionTreeOutcomeInfo {
    const availableOutcomes = Object.fromEntries(config.availableOutcomes.map(
      ((a, index) => [a.value, index])
    ));
    const questions = config.questions;

    const collectedOutcomes = new Set<string>();
    const collectedDetails = [];

    const outcomeKeys: string[] = [
      QuestionTreeOutcomeInfoKey,
    ];

    // Collect the outcomes and meta.
    for (const [key, value] of Object.entries(data)) {
      if (outcomeKeys.includes(key)) {
        // ignore the outcome data model keys
        continue;
      }
      const question = questions.find(q => q.id === key);
      if (question === undefined) {
        throw new Error(`${this.logName}: Unknown question id '${key}'.`);
      }
      const answers = question.answers.filter(a => {
        if (Array.isArray(value)) {
          return value.includes(a.value);
        } else {
          return value === a.value;
        }
      });
      for (const answer of answers) {
        if (answer.outcome) {
          collectedOutcomes.add(answer.outcome);
          collectedDetails.push({...(answer.meta ?? {}), outcome: answer.outcome});
        }
      }
    }

    // Calculate the most sensitive outcome (0 = least, length - 1 = most).
    let outcome = null;
    for (const current of collectedOutcomes) {
      if (outcome === null) {
        outcome = current;
      } else {
        const prevIndex = availableOutcomes[outcome];
        const currentIndex = availableOutcomes[current];
        if (currentIndex > prevIndex) {
          outcome = current;
        }
      }
    }

    return {outcome: outcome, meta: collectedDetails};
  }

}

