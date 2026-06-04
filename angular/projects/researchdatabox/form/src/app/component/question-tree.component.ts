import {
  FormFieldBaseComponent,
  FormFieldCompMapEntry,
  FormFieldModel
} from "@researchdatabox/portal-ng-common";
import {
  QuestionTreeModelValueType,
  QuestionTreeComponentName,
  QuestionTreeModelName,
  FormConfigFrame,
  isTypeWithComponentDefinitions,
  isTypeFieldDefinitionName,
  QuestionTreeFieldComponentDefinitionFrame,
  QuestionTreeFieldComponentConfigFrame,
  QuestionTreeOutcomeInfoKey,
  QuestionTreeOutcomeInfo,
  QuestionTreeOutcome,
  isQuestionTreeQuestionActivated,
} from "@researchdatabox/sails-ng-common";
import { Component, inject, ViewChild, ViewContainerRef } from "@angular/core";
import { AbstractControl, FormGroup } from "@angular/forms";
import { FormComponentsMap, FormService } from "../form.service";
import { FormComponent } from "../form.component";
import { isEmpty as _isEmpty, isUndefined as _isUndefined, isEqual as _isEqual } from "lodash-es";
import { FormBaseWrapperComponent } from "./base-wrapper.component";
import {
  FormComponentEventBus,
  FormComponentEventType
} from "../form-state";
import {debounceTime, filter } from "rxjs";

export type QuestionTreeFormControlValueType = { [key: string]: AbstractControl<unknown> };
export type QuestionTreeFormControlType = FormGroup<QuestionTreeFormControlValueType>;

export class QuestionTreeModel extends FormFieldModel<QuestionTreeModelValueType> {
  protected override logName = QuestionTreeModelName;
  public override formControl?: QuestionTreeFormControlType;

  protected override postCreateGetInitValue(): QuestionTreeModelValueType {
    return this.fieldConfig.config?.value ?? QuestionTreeModel.getEmptyModel();
  }

  protected override postCreateGetFormControl(): QuestionTreeFormControlType {
    // Create the empty FormGroup here, not in the component.
    // This is different from FormComponent, which has no model.
    // Creating the FormGroup here allows encapsulating the FormGroup & children
    // in the same way as other components.
    const modelElems: QuestionTreeFormControlValueType = {};
    return new FormGroup(modelElems);
  }

  public addItem(name: string, targetModel?: FormFieldModel<unknown>) {
    const targetFormControl = targetModel?.getFormControl();
    if (this.formControl && name && targetFormControl) {
      this.formControl.addControl(name, targetFormControl);
    } else {
      throw new Error(`${this.logName}: formControl or name or targetModel are not valid. Cannot add item.`);
    }
  }

  public static getEmptyModel():  QuestionTreeModelValueType {
    return {[QuestionTreeOutcomeInfoKey]: null}
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
  protected formComponentsMap?: FormComponentsMap;

  @ViewChild('componentContainer', { read: ViewContainerRef, static: true })
  private componentContainer!: ViewContainerRef;

  private eventBus = inject(FormComponentEventBus);

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
    if (!isTypeFieldDefinitionName<QuestionTreeFieldComponentDefinitionFrame>(componentFormConfig, QuestionTreeComponentName)) {
      throw new Error(`Expected a question tree component, but got ${JSON.stringify(componentFormConfig)}`);
    }

    const componentConfigFormConfig = componentFormConfig.config;
    if (!isTypeWithComponentDefinitions(componentConfigFormConfig) || componentConfigFormConfig.componentDefinitions?.length < 1) {
      throw new Error(`Expected a question tree component config with at least one componentDefinition, but got ${JSON.stringify(componentConfigFormConfig)}`);
    }

    const componentDefinitions = componentConfigFormConfig.componentDefinitions;
    const elementFormConfig: FormConfigFrame = {
      name: `form-config-generated-questiontree-${formComponentName}`,
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

    // Create the form fields from the form components map.
    const elemVals: QuestionTreeModelValueType = this.model.initValue ?? QuestionTreeModel.getEmptyModel();
    const formGroupMap = this.formService.groupComponentsByName(this.formComponentsMap);
    for (const key of Object.keys(formGroupMap.withFormControl ?? {})) {
      // Create the wrapper component.
      const wrapperRef = this.componentContainer.createComponent(FormBaseWrapperComponent<unknown>);
      wrapperRef.instance.defaultComponentConfig = elementFormConfig?.defaultComponentConfig;
      const elemFieldEntry = formGroupMap.completeGroupMap?.[key];
      const compInstance = await wrapperRef.instance.initWrapperComponent(elemFieldEntry);

      // Populate the component model if it has one.
      const hasModel = this.model?.formControl && compInstance?.model;
      if (hasModel) {
        const elemVal = elemVals?.[key];
        if (compInstance?.model && !_isUndefined(elemVal)) {
          // Don't emit the value from setting the model value on form load.
          // The visible state and model value are set from the form config.
          compInstance.model.setValue(elemVal, {onlySelf: true, emitEvent: false});
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

    // React to value changed or ui attributes changed events from this component or nested components.
    // The filtering only considers the angular component JSONPointer.
    // This allows the question tree to ensure the nested components are consistent with the model data.
    this.eventBus
      .select$(FormComponentEventType.FIELD_VALUE_CHANGED)
      .pipe(
        filter(event =>
          (event.fieldId === this.formFieldCompMapEntry?.lineagePaths?.angularComponentsJsonPointer ||
            event.fieldId.startsWith(this.formFieldCompMapEntry?.lineagePaths?.angularComponentsJsonPointer + '/'))
          && event.sourceId !== '*'
        ),
        debounceTime(50),
      )
      .subscribe(() => this.moveTowardsConsistentModelDataAndComponents());
    this.eventBus
      .select$(FormComponentEventType.FIELD_UI_ATTRIBUTE_CHANGED)
      .pipe(
        filter(event =>
          (event.fieldId === this.formFieldCompMapEntry?.lineagePaths?.angularComponentsJsonPointer ||
            event.fieldId.startsWith(this.formFieldCompMapEntry?.lineagePaths?.angularComponentsJsonPointer + '/'))
          && event.sourceId !== '*'
        ),
        debounceTime(50),
      )
      .subscribe(() => this.moveTowardsConsistentModelDataAndComponents());
  }

  /**
   * Detect whether the nested components and the model data are consistent.
   * - If they are, and the outcome data has changed, update the outcome data and emit an event to indicate this change.
   * - If they are not, make one change to move them towards being consistent, which will emit more events triggering another check.
   * @private
   */
  private moveTowardsConsistentModelDataAndComponents() {
    const questions = this.getFieldComponentFrame().config?.questions ?? [];
    const currentModelData: QuestionTreeModelValueType = this.model?.getValue() ?? QuestionTreeModel.getEmptyModel();

    // TODO: there's a step missing that should recalculate the last item to be changed, but currently doesn't

    // For each event, see if the model data and the visibility of each component match.
    for (const formFieldCompMapEntry of this.formFieldCompMapEntries) {
      const questionId = formFieldCompMapEntry?.compConfigJson?.name;
      const shouldBeActivated = isQuestionTreeQuestionActivated(questionId, questions, currentModelData);

      const isLayoutVisible = formFieldCompMapEntry?.layout?.isVisible;
      const isLayoutChanged = shouldBeActivated !== isLayoutVisible;
      const isComponentVisible = formFieldCompMapEntry?.component?.isVisible;
      const isComponentChanged = shouldBeActivated !== isComponentVisible;

      // If the visibility does not match, update this component and stop.
      if (isLayoutChanged && formFieldCompMapEntry?.layout) {
        // This change will emit an event.
        formFieldCompMapEntry.layout.setProperty('visible', shouldBeActivated);
      }
      if (isComponentChanged && formFieldCompMapEntry?.component) {
        // This change will emit an event.
        formFieldCompMapEntry.component.setProperty('visible', shouldBeActivated);
      }

      // If the component was visible and is now hidden, set the value to null.
      if ((isLayoutChanged || isComponentChanged) && !shouldBeActivated) {
        // Emit the event so this question tree component can process nested components again.
        formFieldCompMapEntry?.model?.setValue( null);
      }

      // Change only one component at a time.
      if (isLayoutChanged || isComponentChanged) {

        // for debugging
        this.loggerService.debug(`${this.logName}: Updated component ${questionId}`, {
          shouldBeActivated, isLayoutVisible, isLayoutChanged, isComponentVisible, isComponentChanged,
          value: formFieldCompMapEntry?.model?.getValue(),
        });

        break;
      }
    }

    // Update the outcome in the model data to reflect the state of the nested components.
    const updatedModelData = this.model?.getValue() ?? QuestionTreeModel.getEmptyModel();
    const currentOutcome = updatedModelData?.[QuestionTreeOutcomeInfoKey];
    const newOutcome = this.getOutcomeInfo();
    const isOutcomeChanged = !_isEqual(currentOutcome, newOutcome);
    if (isOutcomeChanged) {
      this.model?.setValue({...updatedModelData, [QuestionTreeOutcomeInfoKey]: newOutcome});

      // for debugging:
      this.loggerService.debug(`${this.logName}: Updated question tree model data`, {
        questions, modelData: this.model?.getValue()
      });
    }
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
  protected getOutcomeInfo(): QuestionTreeOutcomeInfo | null {
    const config = this.getFieldComponentFrame().config;
    if (!config) {
      throw new Error(`${this.logName}: Could not get Question Tree component config.`);
    }
    const data = this.model?.getValue() ?? QuestionTreeModel.getEmptyModel();
    const outcomeInfo = this.calculateOutcomeInfo(config, data);
    return outcomeInfo;
  }

  /**
   * Provide the question tree data model to calculate the outcome and metadata structure.
   * @param config The question tree component config that contains the available outcome and meta settings.
   * @param data The question tree data model.
   */
  public calculateOutcomeInfo(config: QuestionTreeFieldComponentConfigFrame, data: QuestionTreeModelValueType): QuestionTreeOutcomeInfo | null {
    const availableOutcomes = Object.fromEntries((config.availableOutcomes ?? []).map(
      o => [o.value, o])
    );
    const availableMeta = config.availableMeta ?? {};

    const availableOutcomeIndexes = Object.fromEntries(config.availableOutcomes.map(
      ((a, index) => [a.value, index])
    ));
    const questions = config.questions;

    const collectedOutcomes = new Set<string>();
    const collectedMeta: ({ outcome: QuestionTreeOutcome, [key: string]: QuestionTreeOutcome })[] = [];

    const outcomeKeys: string[] = [QuestionTreeOutcomeInfoKey];

    // Collect the outcomes and meta.
    for (const [key, value] of Object.entries(data ?? {})) {
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
          collectedMeta.push({
            outcome: availableOutcomes[answer.outcome],
            ...(Object.fromEntries(Object.entries(answer.meta ?? {}).map(
              ([metaKey, metaValue]) => [
                metaKey,
                { value: metaValue, label: availableMeta?.[metaKey]?.[metaValue] ?? null }
              ]
            ))),
          });
        }
      }
    }

    // Calculate the most sensitive outcome (0 = least, length - 1 = most).
    let outcome: QuestionTreeOutcome | null = null;
    for (const current of collectedOutcomes) {
      if (outcome === null) {
        outcome = availableOutcomes[current];
      } else {
        const prevIndex = availableOutcomeIndexes[outcome.value];
        const currentIndex = availableOutcomeIndexes[current];
        if (currentIndex > prevIndex) {
          outcome = availableOutcomes[current];
        }
      }
    }

    if (!outcome) {
      return null;
    }
    return { outcome: outcome, meta: collectedMeta };
  }
}
