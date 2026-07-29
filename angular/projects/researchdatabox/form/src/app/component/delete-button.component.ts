import {Component, computed} from '@angular/core';
import {DeleteButtonComponentName, DeleteButtonFieldComponentDefinitionOutline} from '@researchdatabox/sails-ng-common';
import {createFormDeleteRequestedEvent} from '../form-state';
import {ButtonBaseComponent} from "./button-base.component";

@Component({
  selector: 'redbox-form-delete-button',
  template: `
    @if (isVisible) {
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

  protected readonly disabled = computed(() => {
    const hasOid = !!this.getFormComponent.oid()?.trim();
    return this.isDisabled || this.formStateFacade.isDeleting() || this.formStateFacade.isSaving() || !hasOid;
  });

  get displayLabel(): string {
    const label = this.translate(this.componentDefinition?.config?.label) ?? '';
    return label.trim() || 'Delete';
  }

  async delete(): Promise<void> {
    if (this.disabled()) {
      return;
    }

    const confirmed = await this.confirmDelete();
    if (!confirmed) {
      return;
    }

    const redirectLocation = String(this.componentDefinition?.config?.redirectLocation ?? '').trim();
    this.eventBus.publish(
      createFormDeleteRequestedEvent({
        closeOnDelete: this.componentDefinition?.config?.closeOnDelete,
        redirectLocation: await this.resolveRedirectLocation(redirectLocation),
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
