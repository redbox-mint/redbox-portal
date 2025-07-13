import {
  Component,
  ComponentRef,
  inject,
  Injector,
  Input,
  OnDestroy,
  signal,
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
  FormConfig,
  GroupFieldModelValueType, GroupFormFieldComponentConfig, GroupFormFieldComponentDefinition,
} from "@researchdatabox/sails-ng-common";
import {FormComponentsMap, FormService} from "../form.service";
import {FormComponent} from "../form.component";
import {get as _get, set as _set, keys as _keys, isObject as _isObject} from "lodash-es";
import {FormBaseWrapperComponent} from "./base-wrapper.component";




/**
 * The model for the Group Component.
 *
 * Contains the FormGroup component, which contains the child components.
 */
export class GroupFieldModel extends FormFieldModel<GroupFieldModelValueType> {
  /**
   * The definitions and config for the child components.
   */
  public formDefMap?: FormComponentsMap;

  public override formControl: FormGroup | null | undefined;

  public get components(): FormFieldCompMapEntry[] {
    return this.formDefMap?.components ?? [];
  }

  public get defaultComponentConfig() {
    return this.formDefMap?.formConfig?.defaultComponentConfig;
  }

  override postCreate(): void {
    // Don't call the super method, as this model needs a FormGroup, and needs to populate it differently.
    // super.postCreate();

    // Init with empty object if no default value.
    if (!this.fieldConfig.config?.defaultValue) {
      _set(this.fieldConfig, 'config.defaultValue', {});
    }

    // Store the initial value.
    this.initValue = _get(this.fieldConfig, 'config.value', this.fieldConfig.config?.defaultValue);

    // Create the empty FormGroup here, not in the component.
    // This is different from FormComponent, which has no model.
    // Creating the FormGroup here allows encapsulating the FormGroup & children in the same way as other components.
    this.formControl = new FormGroup({});
    console.log(`GroupFieldModel: created form control '${this.fieldConfig?.name ?? '(no model name)'}' with model class '${this.fieldConfig?.class}' and initial value '${this.initValue}'`);
  }

  /**
   * Add the child components to the FormGroup.
   *
   * @param formDefMap The built components and definitions.
   */
  public registerChildComponents(formDefMap: FormComponentsMap) {
    // Store the components and definitions.
    this.formDefMap = formDefMap;

    if (!this.formControl) {
      throw new Error("Must register child controls after form group has been created.");
    }

    // Set the controls to the FormGroup, without emitting events.
    const formGroup = this.formControl as FormGroup;
    for (const [key, value] of Object.entries(formDefMap.withFormControl ?? {})) {
      formGroup.addControl(key, value, {emitEvent: false});
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
export class GroupFieldComponent extends FormFieldBaseComponent<GroupFieldModelValueType> implements OnDestroy {
  /**
   * The model associated with this component.
   */
  @Input() public override model?: GroupFieldModel;
  protected override logName: string = "GroupFieldComponent";
  /**
   * Provide access to the NgContainer to allow creating child components.
   * @private
   */
  @ViewChild('componentContainer', {
    read: ViewContainerRef,
    static: false
  })
  private componentContainer!: ViewContainerRef;
  private elementFormConfig?: FormConfig;
  /**
   * Store references to the created wrapper components.
   * @private
   */
  private readonly wrapperComponentRefs: ComponentRef<FormBaseWrapperComponent<unknown>>[];
  private formService = inject(FormService);
  private injector = inject(Injector);

  constructor() {
    super();
    this.wrapperComponentRefs = [];
  }

  public get components(): FormFieldCompMapEntry[] {
    return this.model?.components ?? [];
  }

  protected get getFormComponent(): FormComponent {
    return this.injector.get(FormComponent);
  }

  ngOnDestroy() {
    // Clean up the dynamically created component when the wrapper is destroyed
    for (const compRef of this.wrapperComponentRefs ?? []) {
      if (compRef) {
        compRef.destroy();
      }
    }
  }

  protected override async initData() {
    // Build a form config to store the info needed to build the components.
    const formConfig = this.getFormComponent.formDefMap?.formConfig;
    const groupComponentDefinitions = (this.formFieldCompMapEntry?.compConfigJson?.component?.config as GroupFormFieldComponentConfig)?.componentDefinitions ?? [];
    this.elementFormConfig = {
      // Store the child component definitions.
      componentDefinitions: groupComponentDefinitions,
      // Get the default config.
      defaultComponentConfig: formConfig?.defaultComponentConfig,
      // Get the validator definitions so the child components can use them.
      validatorDefinitions: formConfig?.validatorDefinitions ?? [],
    };

    // Construct the components.
    const formDefMap = await this.formService.createFormComponentsMap(this.elementFormConfig);

    // Create the form group from the form components map.
    const formGroupMap = this.formService.groupComponentsByName(formDefMap);
    if (formGroupMap !== undefined) {
      // Now set the components to the model.
      this.model?.registerChildComponents(formGroupMap)
    }
  }

  protected override async setComponentReady(): Promise<void> {
    await this.untilViewIsInitialised();
    const thisName = this.utilityService.getNameClass(this.formFieldCompMapEntry);
    this.loggerService.debug(`${this.logName}: component '${thisName}' is ready, it will now create child components.`);

    // Create the wrapper components and set the properties from the model components.
    for (const component of this.model?.components ?? []) {
      const wrapperCompRef = this.componentContainer.createComponent(FormBaseWrapperComponent<unknown>);
      wrapperCompRef.instance.defaultComponentConfig = this.model?.defaultComponentConfig;

      await wrapperCompRef.instance.initWrapperComponent(component);

      this.wrapperComponentRefs.push(wrapperCompRef);
    }

    // finally set the status to 'READY'
    await super.setComponentReady();

  }

  public override checkUpdateExpressions() {
    this.loggerService.debug('group component checkUpdateExpressions');
    let comps:FormFieldCompMapEntry[] = this.model?.components ?? [];
    //Evaluate top level expressions
    super.checkUpdateExpressions();
    //Propagate top level expressions and evaluate in its children components
    //this is required for the parent component to delegate responsability of
    //behaiviour to the children i.e. each component will handle its visibility
    //but has to be maintained in sync with the overarching state of the parent
    for(let entry of comps){
      entry.component?.propagateExpressions(this.expressions);
    }
    //Evaluate expressions in children components
    for(let entry of comps){
      entry.component?.checkUpdateExpressions();
    }
  }



}
