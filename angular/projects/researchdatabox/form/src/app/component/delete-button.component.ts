import {Component, computed, signal} from '@angular/core';
import {DeleteButtonComponentName, DeleteButtonFieldComponentDefinitionOutline} from '@researchdatabox/sails-ng-common';
import {FormFieldCompMapEntry, ModifyOptions} from '@researchdatabox/portal-ng-common';
import {createFormDeleteRequestedEvent} from '../form-state';
import {ButtonBaseComponent} from "./button-base.component";

@Component({
  selector: 'redbox-form-delete-button',
  template: `
    @if (isVisible && getFormComponent.editMode()) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')"/>
      <div class="rb-form-delete-button">
        <button
          type="button"
          [class]="buttonCssClasses"
          (click)="delete()"
          [disabled]="disabled()"
          [innerHtml]="displayLabel"
        ></button>
      </div>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')"/>
    }
  `,
  standalone: false,
})
export class DeleteButtonComponent extends ButtonBaseComponent {
  public override logName = DeleteButtonComponentName;
  public override componentDefinition?: DeleteButtonFieldComponentDefinitionOutline;

  protected override fallbackVariantClass: string = 'btn-danger';
  private readonly configuredDisabled = signal(false);

  protected readonly disabled = computed(() => {
    const hasOid = !!this.getFormComponent.oid()?.trim();
    return !this.getFormComponent.editMode() || this.configuredDisabled() || this.formStateFacade.isDeleting() || this.formStateFacade.isSaving() || !hasOid;
  });

  protected override setPropertiesFromComponentMapEntry(entry: FormFieldCompMapEntry): void {
    super.setPropertiesFromComponentMapEntry(entry);
    this.configuredDisabled.set(this.isDisabled);
  }

  public override setDisabled(disabled: boolean, opts?: ModifyOptions): void {
    super.setDisabled(disabled, opts);
    this.configuredDisabled.set(disabled);
  }

  get displayLabel(): string {
    const label = this.translate(this.componentDefinition?.config?.label) ?? '';
    return label.trim() || this.formService.translate('@form-delete-button');
  }

  async delete(): Promise<void> {
    if (this.disabled()) {
      return;
    }

    const confirmed = await this.confirmDelete();
    if (!confirmed || this.disabled()) {
      return;
    }

    const redirectLocation = String(this.componentDefinition?.config?.redirectLocation ?? '').trim();
    const resolvedRedirectLocation = await this.resolveRedirectLocation(redirectLocation);
    if (this.disabled()) return;
    this.eventBus.publish(
      createFormDeleteRequestedEvent({
        closeOnDelete: this.componentDefinition?.config?.closeOnDelete,
        redirectLocation: resolvedRedirectLocation,
        redirectDelaySeconds: this.componentDefinition?.config?.redirectDelaySeconds,
        sourceId: this.name ?? undefined,
      })
    );
  }

  private async confirmDelete(): Promise<boolean> {
    const confirmationMessage = this.componentDefinition?.config?.confirmationMessage?.trim();
    if (!confirmationMessage) {
      return true;
    }

    return this.confirmationDialogService.confirm({
      title: this.componentDefinition?.config?.confirmationTitle,
      message: confirmationMessage,
      confirmLabel: this.componentDefinition?.config?.confirmButtonMessage,
      cancelLabel: this.componentDefinition?.config?.cancelButtonMessage,
      confirmButtonClass: this.resolveButtonCssClasses(this.buttonCssClasses, this.fallbackVariantClass),
    });
  }
}
