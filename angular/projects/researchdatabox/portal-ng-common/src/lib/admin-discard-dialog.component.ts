import { Component, EventEmitter, Output } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { AdminModalDirective } from './admin-modal.directive';
import { I18NextPipe } from './i18next.pipe';

/** A nested confirmation: keep the editor and its draft alive until discard is explicit. */
@Component({
  selector: 'rb-admin-discard-dialog',
  standalone: true,
  imports: [A11yModule, AdminModalDirective, I18NextPipe],
  template: `
    <div class="modal-backdrop show rb-admin-discard-backdrop"></div>
    <div class="modal d-block rb-admin-discard-modal" role="alertdialog" aria-modal="true"
      [attr.aria-labelledby]="titleId" [attr.aria-describedby]="titleId + '-description'"
      (keydown.escape)="$event.stopPropagation(); keepEditing.emit()">
      <div class="modal-dialog modal-dialog-centered" rbAdminModal cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
        <div class="modal-content rb-admin">
          <div class="modal-header"><h2 class="modal-title" [id]="titleId">{{ 'admin-discard-title' | i18next }}</h2></div>
          <div class="modal-body"><p [id]="titleId + '-description'">{{ 'admin-discard-description' | i18next }}</p></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" cdkFocusInitial (click)="keepEditing.emit()">{{ 'admin-keep-editing' | i18next }}</button>
            <button type="button" class="btn rb-admin-danger-confirm" (click)="discard.emit()">{{ 'admin-discard-changes' | i18next }}</button>
          </div>
        </div>
      </div>
    </div>`
})
export class AdminDiscardDialogComponent {
  private static nextId = 0;
  readonly titleId = `admin-discard-${AdminDiscardDialogComponent.nextId++}`;
  @Output() keepEditing = new EventEmitter<void>();
  @Output() discard = new EventEmitter<void>();
}
