import {Component} from '@angular/core';
import {CancelButtonComponentName, CancelButtonFieldComponentDefinitionOutline} from '@researchdatabox/sails-ng-common';
import {ButtonBaseComponent} from "./button-base.component";
import {createFormRedirectRequestedEvent} from "../form-state";

@Component({
  selector: 'redbox-form-cancel-button',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')"/>
      <div class="rb-form-cancel-button">
        <button
          type="button"
          [class]="buttonCssClasses"
          (click)="cancel()"
          [disabled]="isCancelDisabled"
          [innerHtml]="displayLabel"
        ></button>
      </div>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')"/>
    }
  `,
  standalone: false,
})
export class CancelButtonComponent extends ButtonBaseComponent {
  public override logName = CancelButtonComponentName;
  public override componentDefinition?: CancelButtonFieldComponentDefinitionOutline;

  protected override fallbackVariantClass: string = 'btn-warning';

  get displayLabel(): string {
    const label = this.translate(this.componentDefinition?.config?.label) ?? '';
    return label.trim() || 'Cancel';
  }

  get isSaving(): boolean {
    return this.formStateFacade.isSaving();
  }

  get isCancelDisabled(): boolean {
    return this.isDisabled || this.isSaving;
  }

  private get formIsDirty(): boolean {
    return this.formComponent.form?.dirty ?? false;
  }

  public async cancel(): Promise<void> {
    if (this.formIsDirty) {
      const confirmed = await this.confirmCancel();
      if (!confirmed) {
        return;
      }
    }

    const redirectLocationRaw = String(this.componentDefinition?.config?.redirectLocation ?? '').trim();
    const redirectLocationRendered = await this.resolveRedirectLocation(redirectLocationRaw);
    const oid = String(this.getFormComponent.trimmedParams.oid() ?? "").trim();
    const redirectLocation = this.formComponent.resolveRedirectLocation(redirectLocationRendered ?? '', oid);
    this.eventBus.publish(
      createFormRedirectRequestedEvent({
        // if there is a redirectLocation, use that, otherwise go to the previous page.
        historyDelta: redirectLocationRendered ? undefined : -1,
        redirectLocation: redirectLocation,
        redirectDelaySeconds: this.componentDefinition?.config?.redirectDelaySeconds,
        sourceId: this.name ?? undefined,
      })
    );
  }

  private async confirmCancel(): Promise<boolean> {
    const confirmationMessage = this.componentDefinition?.config?.confirmationMessage?.trim();
    if (!confirmationMessage) {
      return true;
    }

    return this.confirmationDialogService.confirm({
      title: this.componentDefinition?.config?.confirmationTitle ?? 'Confirm',
      message: confirmationMessage,
      confirmLabel: this.componentDefinition?.config?.confirmButtonMessage ?? 'Yes',
      cancelLabel: this.componentDefinition?.config?.cancelButtonMessage ?? 'No',
      confirmButtonClass: this.resolveButtonCssClasses(this.buttonCssClasses, this.fallbackVariantClass),
    });
  }
}
