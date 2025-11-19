import {
  Component,
  inject,
  Injector,
  ViewChild,
  ViewContainerRef
} from '@angular/core';
import {FormGroup} from "@angular/forms";
import {
  FormFieldBaseComponent,
  FormFieldCompMapEntry,
  FormFieldModel,
} from "@researchdatabox/portal-ng-common";
import {
  FormConfigFrame,
  GroupFieldModelValueType, GroupFieldComponentConfig, GroupFieldModelName, GroupFieldComponentName,
} from "@researchdatabox/sails-ng-common";
import {FormComponentsMap, FormService} from "../form.service";
import {FormComponent} from "../form.component";
import {
  get as _get,
  set as _set,
  isEmpty as _isEmpty,
  isUndefined as _isUndefined,
  isNull as _isNull,
} from "lodash-es";
import {FormBaseWrapperComponent} from "./base-wrapper.component";

/**
 * The model for the Group Component.
 */
export class GroupFieldModel extends FormFieldModel<GroupFieldModelValueType> {
  protected override logName = GroupFieldModelName;
  public override formControl?: FormGroup;

  override postCreate(): void {
    // Don't call the super method, as this model needs a FormGroup, and needs to populate it differently.
    // super.postCreate();

    // Init with empty object if no default value.
    if (!this.fieldConfig.config?.defaultValue) {
      _set(this.fieldConfig, 'config.defaultValue', {});
    }

    // Store the init value. Use the default value if the value is not set.
    this.initValue = _get(this.fieldConfig, 'config.value') ?? this.fieldConfig.config?.defaultValue;

    // Create the empty FormGroup here, not in the component.
    // This is different from FormComponent, which has no model.
    // Creating the FormGroup here allows encapsulating the FormGroup & children in the same way as other components.
    this.formControl = new FormGroup({});
    console.debug(`${this.logName}: created form control with model class '${this.fieldConfig?.class}' and initial value:`, this.initValue);
  }

  public addItem(name: string, targetModel?: FormFieldModel<unknown>){
    if (this.formControl && name && targetModel){
      this.formControl.addControl(name, targetModel.getFormControl());
    } else {
      throw new Error(`${this.logName}: formControl or name or targetModel are not valid. Cannot add item.`);
    }
  }
}

@Component({
  selector: 'redbox-groupfield',
  template: `
    <ng-container *ngTemplateOutlet="getTemplateRef('before')"/>
    <ng-container #componentContainer/>
    <ng-container *ngTemplateOutlet="getTemplateRef('after')"/>
  `,
  standalone: false
})
export class GroupFieldComponent extends FormFieldBaseComponent<GroupFieldModelValueType> {
  protected override logName: string = GroupFieldComponentName;
  public override model?: GroupFieldModel;

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
    const groupComponentDefinitions = (this.formFieldCompMapEntry?.compConfigJson?.component?.config as GroupFieldComponentConfig)?.componentDefinitions ?? [];
    const formComponentName = this.formFieldCompMapEntry?.compConfigJson?.name;
    this.elementFormConfig = {
      name: `form-config-generated-group-${formComponentName}`,
      // Store the child component definitions.
      componentDefinitions: groupComponentDefinitions,
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

    // Create the form group fields from the form components map.
    const elemVals = this.model.initValue ?? {};
    const formGroupMap = this.formService.groupComponentsByName(this.formComponentsMap);
    for (const key of Object.keys(formGroupMap.withFormControl ?? {})) {
      const elemVal = elemVals?.[key];
      const wrapperRef = this.componentContainer.createComponent(FormBaseWrapperComponent<unknown>);
      wrapperRef.instance.defaultComponentConfig = this.elementFormConfig?.defaultComponentConfig;
      const elemFieldEntry = formGroupMap.completeGroupMap?.[key];
      const compInstance = await wrapperRef.instance.initWrapperComponent(elemFieldEntry);
      if (this.model?.formControl && compInstance?.model) {
        if (!_isUndefined(elemVal)) {
          compInstance.model.setValue(elemVal);
        }
        this.model.addItem(key, compInstance.model);
      } else {
        this.loggerService.warn(`${this.logName}: model or formControl is not defined, not adding the element's form control to the 'this.formControl'. If any data is missing, this is why.`);
      }

      // TODO: is this necessary?
      if (elemFieldEntry) {
        elemFieldEntry.componentRef = wrapperRef;
      }
    }
  }

  public override checkUpdateExpressions() {
    this.loggerService.debug('group component checkUpdateExpressions');
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
