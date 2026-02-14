import { Component, inject } from '@angular/core';
import { FormFieldBaseComponent } from '@researchdatabox/portal-ng-common';
import { FormComponent } from '../form.component';
import {
  CancelButtonComponentName,
  CancelButtonFieldComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import { Location } from '@angular/common';
import { FormStateFacade } from '../form-state';

@Component({
  selector: 'redbox-form-cancel-button',
  template: `
    @if (isVisible) {
      <ng-container *ngTemplateOutlet="getTemplateRef('before')" />
      <button
        type="button"
        class="btn btn-secondary"
        (click)="cancel()"
        [disabled]="isCancelDisabled"
        [innerHtml]="displayLabel"
      ></button>
      <ng-container *ngTemplateOutlet="getTemplateRef('after')" />
    }

    @if (showConfirmDialog) {
      <div
        class="modal fade show d-block"
        tabindex="-1"
        role="dialog"
        [attr.aria-labelledby]="confirmationTitleId"
        [attr.aria-describedby]="confirmationMessageId"
        aria-modal="true"
        style="background-color: rgba(0,0,0,0.5)"
        (keydown.escape)="hideConfirmDialog()"
      >
        <div class="modal-dialog" role="document">
          <div class="modal-content" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
            <div class="modal-header">
              <h5 class="modal-title" [id]="confirmationTitleId">{{ confirmationTitle }}</h5>
              <button type="button" class="btn-close" (click)="hideConfirmDialog()" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <p [id]="confirmationMessageId">{{ confirmationMessage }}</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="hideConfirmDialog()" cdkFocusInitial>
                {{ cancelButtonMessage }}
              </button>
              <button type="button" class="btn btn-primary" (click)="doCancel()">{{ confirmButtonMessage }}</button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
  standalone: false,
})
export class CancelButtonComponent extends FormFieldBaseComponent<undefined> {
  private static dialogSequence = 0;
  public override logName = CancelButtonComponentName;
  protected override formComponent: FormComponent = inject(FormComponent);
  public override componentDefinition?: CancelButtonFieldComponentDefinitionOutline;
  private location: Location = inject(Location);
  protected formStateFacade = inject(FormStateFacade);
  private readonly dialogId = ++CancelButtonComponent.dialogSequence;
  public readonly confirmationTitleId = `cancel-confirm-title-${this.dialogId}`;
  public readonly confirmationMessageId = `cancel-confirm-message-${this.dialogId}`;

  showConfirmDialog = false;

  get displayLabel(): string {
    const label = (this.componentDefinition?.config?.label ?? '').trim();
    return label || 'Cancel';
  }

  get isSaving(): boolean {
    return this.formStateFacade.isSaving();
  }

  get isCancelDisabled(): boolean {
    return this.isDisabled || this.isSaving;
  }

  get confirmationMessage(): string {
    return this.componentDefinition?.config?.confirmationMessage ?? '';
  }

  get confirmationTitle(): string {
    return this.componentDefinition?.config?.confirmationTitle ?? 'Confirm';
  }

  get cancelButtonMessage(): string {
    return this.componentDefinition?.config?.cancelButtonMessage ?? 'No';
  }

  get confirmButtonMessage(): string {
    return this.componentDefinition?.config?.confirmButtonMessage ?? 'Yes';
  }

  private get formIsDirty(): boolean {
    return this.formComponent.form?.dirty ?? false;
  }

  public cancel() {
    if (this.confirmationMessage && this.formIsDirty) {
      this.showConfirmDialog = true;
    } else {
      this.doCancel();
    }
  }

  public hideConfirmDialog() {
    this.showConfirmDialog = false;
  }

  public doCancel() {
    this.showConfirmDialog = false;
    this.location.back();
  }
}
