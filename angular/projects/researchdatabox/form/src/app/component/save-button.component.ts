import {Component, computed, DestroyRef, effect, inject, signal} from '@angular/core';
import {SaveButtonComponentName, SaveButtonFieldComponentDefinitionOutline} from '@researchdatabox/sails-ng-common';
import {FormFieldCompMapEntry, ModifyOptions} from '@researchdatabox/portal-ng-common';
import {FormComponentEventType, createFormSaveRequestedEvent} from '../form-state';
import {ButtonBaseComponent} from "./button-base.component";

@Component({
  selector: 'redbox-form-save-button',
  template: `
    @if (isVisible && getFormComponent.editMode()) {
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
  private readonly configuredDisabled = signal(false);
  private readonly destroyRef = inject(DestroyRef);
  private readonly validationSignal = this.eventBus.selectSignal(FormComponentEventType.FORM_VALIDATION_BROADCAST);

  readonly disabled = computed(() => {
    if (!this.getFormComponent.editMode() || this.configuredDisabled() || this.getFormComponent.saveBlockedByConflict()) return true;
    const dataStatusEvent = this.validationSignal();
    // The event bus does not replay validation broadcasts to newly created buttons.
    // Track the initial snapshot even before the FormGroup exists, so loading
    // later fields invalidates the workflow button's cached fallback.
    const initialStatus = this.getFormComponent.formGroupStatus();
    const dataStatus = dataStatusEvent?.status ?? (this.getFormComponent.form ? initialStatus : undefined);
    const isSaving = this.formStateFacade.isSaving();
    const isValidationPending = this.formStateFacade.isValidationPending();
    const hasTargetStep = this.hasTargetStep();
    if (dataStatus) {
      this.loggerService.debug(`SaveButtonComponent computed: validation or pristine signal event: `, dataStatus);
      // Disable when any of the following is true:
      // - form is invalid
      // - form has NOT been modified (i.e., not dirty) and this is not a workflow transition button
      // - async validation is pending
      // - a save is currently in progress
      // Form-level server failures can depend on the requested action (for
      // example activation versus saving a draft). Submission clears these
      // errors and validates again; local and field-level errors still block.
      const invalid = !dataStatus.valid && !this.getFormComponent.canRetryFormLevelServerErrors();
      return invalid || (!dataStatus.dirty && !hasTargetStep) || isValidationPending || isSaving;
    }
    // When no form validation status is available yet, default to disabled for standard save, but enabled for
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

  public override setDisabled(disabled: boolean, opts?: ModifyOptions): void {
    super.setDisabled(disabled, opts);
    this.configuredDisabled.set(this.isDisabled);
  }

  public async save() {
    const form = this.getFormComponent.form;
    const oid = this.getFormComponent.trimmedParams.oid();
    const stillCurrent = () => !this.destroyRef.destroyed && this.getFormComponent.form === form &&
      this.getFormComponent.trimmedParams.oid() === oid;
    if (stillCurrent() && !this.disabled()) {
      if (!await this.confirmSave() || !stillCurrent() || this.disabled()) return;
      // Publish a typed event to request save; NgRx effects will orchestrate execution
      const redirectLocation = String(this.componentDefinition?.config?.redirectLocation ?? '').trim();
      const resolvedRedirectLocation = await this.resolveRedirectLocation(redirectLocation);
      // Redirect template resolution yields even without a configured redirect.
      // Recheck the action boundary before publishing into the save pipeline.
      if (!stillCurrent() || this.disabled()) return;
      this.eventBus.publish(
        createFormSaveRequestedEvent({
          force: this.componentDefinition?.config?.forceSave || this.hasTargetStep(),
          operation: this.componentDefinition?.config?.operation,
          targetStep: this.componentDefinition?.config?.targetStep,
          closeOnSave: this.componentDefinition?.config?.closeOnSave,
          redirectLocation: resolvedRedirectLocation,
          redirectDelaySeconds: this.componentDefinition?.config?.redirectDelaySeconds,
          enabledValidationGroups: this.componentDefinition?.config?.enabledValidationGroups ?? this.getFormComponent.enabledValidationGroups,
          sourceId: this.name ?? undefined
        })
      );
    } else {
      this.loggerService.debug(`Save button is disabled; save action not triggered.`);
    }
  }

  private async confirmSave(): Promise<boolean> {
    const confirmationMessage = this.componentDefinition?.config?.confirmationMessage?.trim();
    if (!confirmationMessage) return true;
    return this.confirmationDialogService.confirm({
      title: this.componentDefinition?.config?.confirmationTitle,
      message: confirmationMessage,
      confirmLabel: this.componentDefinition?.config?.confirmButtonMessage,
      cancelLabel: this.componentDefinition?.config?.cancelButtonMessage,
      confirmButtonClass: this.resolveButtonCssClasses(this.buttonCssClasses, this.fallbackVariantClass),
    });
  }
}
