import { Component, inject, effect, signal } from '@angular/core';
import { FormFieldBaseComponent } from '@researchdatabox/portal-ng-common';
import { FormComponent } from '../form.component';
import { FormStatusSignalBridge } from '../form-state/facade/form-status-signal-bridge';
import {SaveButtonComponentName, SaveButtonFieldComponentDefinitionOutline} from '@researchdatabox/sails-ng-common';
import { FormComponentEventBus, createFormSaveRequestedEvent } from '../form-state/events';

@Component({
  selector: 'redbox-form-save-button',
  template:`
  @if (isVisible) {
    <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
    <button type="button" class="btn btn-primary" (click)="save()" [innerHtml]="label" [disabled]="disabled()"></button>
    <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
  }
  `,
  standalone: false
})
export class SaveButtonComponent extends FormFieldBaseComponent<undefined> {
  public override logName = SaveButtonComponentName;
  protected override formComponent: FormComponent = inject(FormComponent);
  disabled = signal<boolean>(false);
  private readonly eventBus = inject(FormComponentEventBus);
  
  protected formStatusSignalBridge = inject(FormStatusSignalBridge);
  public override componentDefinition?: SaveButtonFieldComponentDefinitionOutline;

  constructor() {
    super();
    // Monitor form status to update disabled state
    effect(() => {
      const dataStatus = this.formComponent.formGroupStatus();
      // Disable if the form is invalid, pristine, or not ready (including VALIDATION_PENDING or SAVING)
      this.disabled.set(!dataStatus.valid ||
      dataStatus.pristine ||
      this.formStatusSignalBridge.isValidationPending() ||
      this.formStatusSignalBridge.isSaving());
    });
  }

  public async save() {
    if (this.formComponent && !this.disabled()) {
      // Publish a typed event to request save; NgRx effects will orchestrate execution
      this.eventBus.publish(
        createFormSaveRequestedEvent({
          force: this.componentDefinition?.config?.forceSave,
          targetStep: this.componentDefinition?.config?.targetStep,
          skipValidation: this.componentDefinition?.config?.skipValidation,
          sourceId: this.name ?? undefined
        })
      );
    } else {
      this.loggerService.debug(`Save button clicked but form is pristine, currently saving, not valid or dirty`);
    }
  }

}
