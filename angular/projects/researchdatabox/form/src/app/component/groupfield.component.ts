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
  FormBaseWrapperComponent,
  FormConfig,
  FormFieldBaseComponent,
  FormFieldCompMapEntry,
  FormFieldModel,
  FormStatus
} from "@researchdatabox/portal-ng-common";
import {FormComponentsMap, FormService} from "../form.service";
import {FormComponent} from "../form.component";
import {get as _get} from "lodash-es";


export type GroupFieldModelValueType = { [key: string]: unknown };

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

  public get debugValue() {
    return this.formDefMap?.formConfig?.debugValue ?? false;
  }

  public get defaultComponentConfig() {
    return this.formDefMap?.formConfig?.defaultComponentConfig;
  }

  override postCreate(): void {
    // Don't call the super method, as this model needs a FormGroup, and needs to populate it differently.
    // super.postCreate();

    // Store the initial value.
    this.initValue = _get(this.fieldConfig.config, 'value', this.fieldConfig.config?.defaultValue);

    // TODO: create or configure the validators

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
    @if (isStatusReady() && (model?.components?.length ?? 0) > 0 && model?.debugValue) {
      <div class="alert alert-info" role="alert">
        <h4>Group Component Debug</h4>
        <ul>
          <li>status: {{ status() }}</li>
          <li>children:
            <ul>
              @for(component of model?.components; track component.component){
                <li>{{ utilityService.getNameClass(component?.component?.formFieldCompMapEntry) }}: {{component?.component?.status()}}</li>
              }
            </ul>
          </li>
        </ul>
      </div>
    }
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
    const formConfig = new FormConfig();

    // Store the child component definitions.
    formConfig.componentDefinitions = this.formFieldCompMapEntry?.compConfigJson?.component?.config?.componentDefinitions ?? [];

    // Get the debugValue from the FormComponent.
    formConfig.debugValue = this.getFormComponent.formDefMap?.formConfig?.debugValue;

    // Get the default config
    formConfig.defaultComponentConfig = this.getFormComponent.formDefMap?.formConfig?.defaultComponentConfig;

    // Construct the components.
    const formDefMap = await this.formService.createFormComponentsMap(formConfig);

    // Create the form group from the form components map.
    const formGroupMap = this.formService.groupComponentsByName(formDefMap);
    if (formGroupMap !== undefined) {
      // Now set the components to the model.
      this.model?.registerChildComponents(formGroupMap)
    }
  }

  protected override async setComponentReady(): Promise<void> {
    await this.untilViewIsInitiased();
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
}
