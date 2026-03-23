import { Component, computed, inject } from '@angular/core';
import { ConfirmationDialogService } from '../confirmation-dialog.service';

@Component({
  selector: 'redbox-confirmation-dialog',
  template: `
    @if (dialog()) {
      <div
        class="modal fade show d-block"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        style="background-color: rgba(0,0,0,0.5)"
        (keydown.escape)="cancel()"
      >
        <div class="modal-dialog" role="document">
          <div class="modal-content" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
            <div class="modal-header">
              <h5 class="modal-title">{{ title() }}</h5>
              <button type="button" class="btn-close" (click)="cancel()" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <p>{{ dialog()?.message }}</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="cancel()" cdkFocusInitial>
                {{ cancelLabel() }}
              </button>
              <button type="button" [class]="confirmButtonClass()" (click)="confirm()">
                {{ confirmLabel() }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
  standalone: false,
})
export class ConfirmationDialogComponent {
  private readonly confirmationDialogService = inject(ConfirmationDialogService);
  protected readonly dialog = this.confirmationDialogService.dialog;
  protected readonly title = computed(() => this.dialog()?.title ?? 'Confirm');
  protected readonly confirmLabel = computed(() => this.dialog()?.confirmLabel ?? 'Yes');
  protected readonly cancelLabel = computed(() => this.dialog()?.cancelLabel ?? 'No');
  protected readonly confirmButtonClass = computed(() => this.dialog()?.confirmButtonClass ?? 'btn btn-danger');

  confirm(): void {
    this.confirmationDialogService.resolve(true);
  }

  cancel(): void {
    this.confirmationDialogService.resolve(false);
  }
}
