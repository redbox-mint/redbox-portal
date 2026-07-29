import {Component, computed, effect, signal} from '@angular/core';
import {SaveButtonComponentName, SaveButtonFieldComponentDefinitionOutline} from '@researchdatabox/sails-ng-common';
import {FormFieldCompMapEntry} from '@researchdatabox/portal-ng-common';
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
  public override componentDefinition?: SaveButtonFieldComponentDefinitionOutline;
  protected currentLabel = signal<string | undefined>(this.componentDefinition?.config?.label);
  protected hasTargetStep = signal<boolean>(false);
  private readonly validationSignal = this.eventBus.selectSignal(FormComponentEventType.FORM_VALIDATION_BROADCAST);

  readonly disabled = computed(() => {
    const dataStatusEvent = this.validationSignal();
    const isSaving = this.formStateFacade.isSaving();
    const isValidationPending = this.formStateFacade.isValidationPending();
    const hasTargetStep = this.hasTargetStep();
    if (dataStatusEvent && dataStatusEvent.status) {
      const dataStatus = dataStatusEvent.status;
      this.loggerService.debug(`SaveButtonComponent computed: validation or pristine signal event: `, dataStatus);
      // Disable when any of the following is true:
      // - form is invalid
      // - form has NOT been modified (i.e., not dirty) and this is not a workflow transition button
      // - async validation is pending
      // - a save is currently in progress
      return (!dataStatus.valid) || (!dataStatus.dirty && !hasTargetStep) || isValidationPending || isSaving;
    }
    // When validation status is not yet available (e.g. initial load before the first
    // FORM_VALIDATION_BROADCAST), default to disabled for standard save, but enabled for
    // target-step buttons so workflow transitions can proceed.
    // Still respect pending/saving states.
    return !hasTargetStep || isValidationPending || isSaving;
  });

  protected override fallbackVariantClass: string = 'btn-primary';

  constructor() {
    super();
    effect(() => {
      const isSaving = this.formStateFacade.isSaving();
      const defaultLabel = this.componentDefinition?.config?.label;
      const savingLabel = this.componentDefinition?.config?.labelSaving ?? defaultLabel;
      this.currentLabel.set(isSaving ? savingLabel : defaultLabel);
    });
  }

  protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
    this.hasTargetStep.set(String(this.componentDefinition?.config?.targetStep ?? '').trim().length > 0);
  }

  public async save() {
    if (!this.disabled()) {
      // Publish a typed event to request save; NgRx effects will orchestrate execution
      const redirectLocation = String(this.componentDefinition?.config?.redirectLocation ?? '').trim();
      this.eventBus.publish(
        createFormSaveRequestedEvent({
          force: this.componentDefinition?.config?.forceSave || this.hasTargetStep(),
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
