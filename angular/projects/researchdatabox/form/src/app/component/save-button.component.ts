import {Component, effect, signal} from '@angular/core';
import {SaveButtonComponentName, SaveButtonFieldComponentDefinitionOutline} from '@researchdatabox/sails-ng-common';
import {FormComponentEventType, createFormSaveRequestedEvent} from '../form-state';
import {ButtonBaseComponent} from "./button-base.component";

@Component({
  selector: 'redbox-form-save-button',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')"/>
      <div class="rb-form-save-button">
        <button
          type="button"
          [class]="buttonCssClasses"
          (click)="save()"
          [innerHtml]="translate(currentLabel())"
          [disabled]="disabled()"
        ></button>
      </div>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')"/>
    }
  `,
  standalone: false
})
export class SaveButtonComponent extends ButtonBaseComponent {
  public override logName = SaveButtonComponentName;
  disabled = signal<boolean>(true);
  public override componentDefinition?: SaveButtonFieldComponentDefinitionOutline;
  protected currentLabel = signal<string | undefined>(this.componentDefinition?.config?.label);


  protected override fallbackVariantClass: string = 'btn-primary';

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
      const defaultLabel = this.componentDefinition?.config?.label;
      const savingLabel = this.componentDefinition?.config?.labelSaving ?? defaultLabel;
      this.currentLabel.set(isSaving ? savingLabel : defaultLabel);
    });
  }

  public async save() {
    if (!this.disabled()) {
      // Publish a typed event to request save; NgRx effects will orchestrate execution
      const redirectLocation = String(this.componentDefinition?.config?.redirectLocation ?? '').trim();
      this.eventBus.publish(
        createFormSaveRequestedEvent({
          force: this.componentDefinition?.config?.forceSave,
          targetStep: this.componentDefinition?.config?.targetStep,
          closeOnSave: this.componentDefinition?.config?.closeOnSave,
          redirectLocation: await this.resolveRedirectLocation(redirectLocation),
          redirectDelaySeconds: this.componentDefinition?.config?.redirectDelaySeconds,
          enabledValidationGroups: this.componentDefinition?.config?.enabledValidationGroups ?? this.getFormComponent.enabledValidationGroups,
          sourceId: this.name ?? undefined
        })
      );
    } else {
      this.loggerService.debug(`Save button is disabled; save action not triggered.`);
    }
  }
}
