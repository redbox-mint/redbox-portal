import {Component, inject, effect, signal, Injector} from '@angular/core';
import { FormFieldBaseComponent } from '@researchdatabox/portal-ng-common';
import { FormComponent } from '../form.component';
import {SaveButtonComponentName, SaveButtonFieldComponentDefinitionOutline} from '@researchdatabox/sails-ng-common';
import { FormComponentEventBus, FormComponentEventType, createFormSaveRequestedEvent } from '../form-state/events';
import { FormStateFacade } from '../form-state';

@Component({
  selector: 'redbox-form-save-button',
  template:`
  @if (isVisible) {
    <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
    <div class="rb-form-save-button">
      <button type="button" class="btn btn-primary" (click)="save()" [innerHtml]="currentLabel()" [disabled]="disabled()"></button>
    </div>
    <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
  }
  `,
  standalone: false
})
export class SaveButtonComponent extends FormFieldBaseComponent<undefined> {
  public override logName = SaveButtonComponentName;
  protected override formComponent: FormComponent = inject(FormComponent);
  disabled = signal<boolean>(true);
  private readonly eventBus = inject(FormComponentEventBus);
  public override componentDefinition?: SaveButtonFieldComponentDefinitionOutline;
  protected currentLabel = signal<string | undefined>(this.componentDefinition?.config?.label);
  protected formStateFacade = inject(FormStateFacade);
  private _injector = inject(Injector);

  constructor() {
    super();
    const validationSignal = this.eventBus.selectSignal(FormComponentEventType.FORM_VALIDATION_BROADCAST);
    // Monitor form status to update disabled state
    effect(() => {
      const dataStatusEvent = validationSignal();
      const isSaving = this.formStateFacade.isSaving();
      const isValidationPending = this.formStateFacade.isValidationPending();
      if (dataStatusEvent && dataStatusEvent.status) {
        const dataStatus = dataStatusEvent.status;
        this.loggerService.debug(`SaveButtonComponent effect: validation or pristine signal event: `, dataStatus);
        // Disable when any of the following is true:
        // - form is invalid
        // - form has NOT been modified (i.e., not dirty)
        // - async validation is pending
        // - a save is currently in progress
        const isDisabled: boolean = (!dataStatus.valid) || (!dataStatus.dirty) || isValidationPending || isSaving;
        this.disabled.set(isDisabled);
      } else {
        // TODO: Decide if there's a use case for enabling the button when lacking information about the validation status of the form
      }
    });
    effect(() => {
      const isSaving = this.formStateFacade.isSaving();
      this.currentLabel.set(isSaving ? this.componentDefinition?.config?.labelSaving : this.componentDefinition?.config?.label);
    });
  }

  public async save() {
    if (!this.disabled()) {
      // Publish a typed event to request save; NgRx effects will orchestrate execution
      this.eventBus.publish(
        createFormSaveRequestedEvent({
          force: this.componentDefinition?.config?.forceSave,
          targetStep: this.componentDefinition?.config?.targetStep,
          enabledValidationGroups: this.getFormComponent.formDefMap?.formConfig?.enabledValidationGroups ?? ["all"],
          sourceId: this.name ?? undefined
        })
      );
    } else {
      this.loggerService.debug(`Save button is disabled; save action not triggered.`);
    }
  }

  private get getFormComponent(): FormComponent {
    return this._injector.get(FormComponent);
  }

}
