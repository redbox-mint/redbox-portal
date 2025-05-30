import {Component, effect, inject, Injector, Input, signal, untracked} from '@angular/core';
import {FormGroup} from "@angular/forms";
import {
  FormConfig,
  FormFieldBaseComponent,
  FormFieldCompMapEntry,
  FormFieldModel,
  FormStatus,
  FormComponentDefinition,
  FormFieldComponentStatus,
} from "@researchdatabox/portal-ng-common";
import {FormComponentsMap, FormService} from "../form.service";
import {FormComponent} from "../form.component";


export type GroupFieldModelValueType = { [key: string]: unknown };

export class GroupFieldModel extends FormFieldModel<GroupFieldModelValueType> {

  // TODO: Should the formControl in this model:
  //  1. be kept in sync with the child controls by calls to model.formControl.setValue in the GroupFieldComponent?
  //  2. or should GroupFieldModel.formControl be a FormGroup that contains the components?
  //  The current implementation is option 1.
}

@Component({
  selector: 'redbox-groupfield',
  template: `
    <ng-container *ngTemplateOutlet="getTemplateRef('before')"/>
    <ng-container [ngTemplateOutlet]="compsTemplate"></ng-container>
    <ng-container *ngTemplateOutlet="getTemplateRef('after')"/>

    <ng-template #compsTemplate>
      <ng-container *ngFor="let component of components">
        <redbox-form-base-wrapper [model]="component.model"
                                  [componentClass]="component.layoutClass || component.componentClass"
                                  [formFieldCompMapEntry]="component"
                                  [defaultComponentConfig]="getFormComponent.formDefMap?.formConfig?.defaultComponentConfig"
                                  (componentReady)="registerComponentReady(component)"></redbox-form-base-wrapper>
      </ng-container>
    </ng-template>
    <ng-container *ngIf="components.length > 0 && formDefMap?.formConfig?.debugValue">
      <div class="alert alert-info" role="alert">
      <h4>Group Component Debug</h4>
      <ul>
        <li>status: {{ status() }}</li>
        <li>groupStatus: {{ groupStatus() }}</li>
        <li>componentsLoaded: {{ componentsLoaded() }}</li>
      </ul>
      </div>
    </ng-container>
  `,
  standalone: false
})
export class GroupFieldComponent extends FormFieldBaseComponent<GroupFieldModelValueType> {
  protected override logName: string = "GroupFieldComponent";
  /**
   * The FormGroup instance
   */
  form?: FormGroup;
  /**
   * The form components
   */
  components: FormFieldCompMapEntry[] = [];
  /**
   *
   */
  formDefMap?: FormComponentsMap;
  /**
   * The model associated with this component.
   */
  @Input() public override model?: GroupFieldModel;

  groupStatus = signal<FormStatus>(FormStatus.INIT);
  componentsLoaded = signal<boolean>(false);

  private formService = inject(FormService);
  private injector = inject(Injector);

  constructor() {
    super();

    effect(() => {
      this.loggerService.info(`${this.logName}: groupStatus value is:` , this.groupStatus());
      untracked(() => {
        this.checkReadyAndSetIfReady();
      })
    });
    effect(() => {
      this.loggerService.info(`${this.logName}: componentsLoaded value is:`, this.componentsLoaded());
      untracked(() => {
        this.checkReadyAndSetIfReady();
      })
    });
  }

  protected get getFormComponent(): FormComponent {
    return this.injector.get(FormComponent);
  }

  protected checkReadyAndSetIfReady(){
    const status = this.status();
    const componentsLoaded = this.componentsLoaded();
    const groupStatus = this.groupStatus();
    this.loggerService.info(`${this.logName}: status check:`, {
      componentsLoaded: componentsLoaded, groupStatus: groupStatus, status: status
    });
    if (groupStatus === FormStatus.READY && componentsLoaded) {
      this.status.set(FormFieldComponentStatus.READY);
    }
  }

  /**
   * Notification hook for when a component is ready.
   */
  protected registerComponentReady(componentEntry: FormFieldCompMapEntry): void {
    const thisName = this.utilityService.getName(this.model);
    const componentName = this.utilityService.getName(componentEntry);
    this.loggerService.debug(`${this.logName}: '${thisName}' component '${componentName}' registered as ready.`);
    this.formService.triggerComponentReady(thisName, this.formDefMap, this.componentsLoaded, this.groupStatus);
    // TODO: The approach of setting the component ready here doesn't work, as the base wrapper only emits the event after initComponent.
    //       By the time the call to registerComponentReady occurs after the children have initialised,
    //       the GroupFieldComponent has already emitted the componentReady event and doesn't emit it again.
    //       To fix this, I added `componentReady.emit()` in the base wrapper constructor when the component status changes.
    //       And used signal effects to emit the event when all statuses are ready.
  }

  protected override async setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry) {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);

    // get the component definitions for this group
    const childComponentDefinitions: FormComponentDefinition[] = formFieldCompMapEntry?.compConfigJson?.component?.config?.componentDefinitions ?? [];

    // build a form config to then build the form components map
    const formConfig = new FormConfig();
    formConfig.componentDefinitions = childComponentDefinitions;
    // TODO: how to inherit formConfig.debugValue from the parent form component?
    formConfig.debugValue = true;
    this.formDefMap = await this.formService.createFormComponentsMap(formConfig);
  }

  protected override setComponentReady(): Promise<void> {
    this.loggerService.debug(`${this.logName}: this component is ready, it will now initialise child components.`);

    if (this.formDefMap) {
      // create the form group from the form components map
      const formGroupInfo = this.formService.createFormGroup(this.formDefMap);
      if (formGroupInfo !== undefined) {
        this.form = formGroupInfo.form;

        // Initialise the model value from the FormGroup.
        this.model?.setValue(this.form.value);

        // Update the model value whenever the FormGroup value changes.
        // TODO: This feels a little hacky, but it does work.
        //       Is there a better / easier way?
        this.form.valueChanges.subscribe((val) => {
          this.loggerService.info(`${this.logName}: form.value is:`, val);
          this.model?.setValue(val);
        });

        // setting components will trigger the form to be rendered
        this.components = formGroupInfo.components;
      }
    }

    // don't set form ready yet, that is done in registerComponentReady and the signal effects
    // return super.setComponentReady();
    return Promise.resolve();
  }
}
