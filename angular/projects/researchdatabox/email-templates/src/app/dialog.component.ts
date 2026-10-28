import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';

let nextDialogId = 0;

/**
 * Modal dialog on the native `<dialog>` element. `showModal()` gives focus
 * containment, Escape handling and an inert background without a dependency;
 * this wrapper adds Bootstrap modal styling and returns focus to the element
 * that opened it.
 */
@Component({
  selector: 'email-templates-dialog',
  standalone: true,
  template: `
    <dialog
      #dialog
      class="et-dialog"
      [class.et-dialog-wide]="wide"
      [attr.aria-labelledby]="titleId"
      [attr.aria-describedby]="describedBy || null"
      (cancel)="onCancel($event)"
      (close)="onNativeClose()"
    >
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title h5" [id]="titleId">{{ heading }}</h2>
          <button type="button" class="btn-close" [attr.aria-label]="closeLabel" [disabled]="locked" (click)="dismiss()"></button>
        </div>
        <div class="modal-body">
          <ng-content></ng-content>
        </div>
        <div class="modal-footer">
          <ng-content select="[dialog-footer]"></ng-content>
        </div>
      </div>
    </dialog>
  `,
  styles: [
    `
      /* Bootstrap's modal variables are declared on .modal and in rem; the portal
         uses a 10px root, so define the surface here in px. */
      .et-dialog {
        --bs-modal-padding: 20px;
        --bs-modal-header-padding: 16px 20px;
        --bs-modal-color: var(--bs-body-color);
        --bs-modal-bg: var(--bs-body-bg);
        --bs-modal-border-color: var(--bs-border-color-translucent);
        --bs-modal-border-width: 1px;
        --bs-modal-border-radius: 8px;
        --bs-modal-inner-border-radius: 7px;
        --bs-modal-header-border-color: var(--bs-border-color);
        --bs-modal-header-border-width: 1px;
        --bs-modal-title-line-height: 1.4;
        --bs-modal-footer-gap: 8px;
        --bs-modal-footer-border-color: var(--bs-border-color);
        --bs-modal-footer-border-width: 1px;
        border: 0;
        padding: 0;
        width: min(560px, calc(100vw - 32px));
        max-height: calc(100vh - 48px);
        background: transparent;
        color: var(--bs-body-color);
        font-size: 15px;
        line-height: 1.5;
        overflow: visible;
      }
      .et-dialog.et-dialog-wide {
        width: min(880px, calc(100vw - 32px));
      }
      .et-dialog::backdrop {
        background: rgba(15, 23, 42, 0.5);
      }
      .et-dialog .modal-content {
        box-shadow: 0 24px 64px rgba(15, 23, 42, 0.28);
      }
      .et-dialog .modal-title {
        font-size: 18px;
        font-weight: 600;
      }
      .et-dialog .modal-header .btn-close {
        width: 12px;
        height: 12px;
        padding: 6px;
        margin: -6px -6px -6px auto;
        background-size: 12px;
      }
      .et-dialog .modal-body {
        max-height: calc(100vh - 200px);
        overflow: auto;
      }
      .et-dialog .modal-footer {
        gap: 8px;
        padding: 12px 20px;
        background: var(--bs-tertiary-bg);
        border-bottom-left-radius: var(--bs-modal-inner-border-radius);
        border-bottom-right-radius: var(--bs-modal-inner-border-radius);
      }
      .et-dialog .modal-footer > * {
        margin: 0;
      }
      .et-dialog .modal-footer .btn {
        font-size: 14px;
        padding: 6px 14px;
      }
    `,
  ],
})
export class DialogComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() open = false;
  @Input() heading = '';
  @Input() closeLabel = 'Close';
  @Input() describedBy = '';
  @Input() wide = false;
  @Input() locked = false;
  private static returnTargets = new WeakMap<HTMLElement, HTMLElement>();
  /** Emitted when the user dismisses the dialog (Escape, close button). */
  @Output() dismissed = new EventEmitter<void>();

  @ViewChild('dialog', { static: true }) private dialogRef!: ElementRef<HTMLDialogElement>;

  readonly titleId = `et-dialog-title-${++nextDialogId}`;
  private returnFocus: HTMLElement | null = null;
  private viewReady = false;

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.sync();
  }

  ngOnChanges(): void {
    if (this.viewReady) {
      this.sync();
    }
  }

  ngOnDestroy(): void {
    if (this.dialogRef.nativeElement.open) {
      this.dialogRef.nativeElement.close();
    }
  }

  dismiss(): void {
    if (!this.locked) this.dismissed.emit();
  }

  onCancel(event: Event): void {
    // Keep the open state owned by the parent: Escape asks, the parent decides.
    event.preventDefault();
    this.dismiss();
  }

  onNativeClose(): void {
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected && target.getClientRects().length && !target.closest('[hidden], dialog:not([open])')) target.focus();
  }

  private sync(): void {
    const dialog = this.dialogRef.nativeElement;
    if (this.open && !dialog.open) {
      const active = document.activeElement;
      const parent = active instanceof HTMLElement ? active.closest('dialog') : null;
      this.returnFocus = parent ? DialogComponent.returnTargets.get(parent) ?? null
        : active instanceof HTMLElement && active !== document.body ? active : null;
      if (this.returnFocus) DialogComponent.returnTargets.set(dialog, this.returnFocus);
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
      // Prefer an explicitly marked control over the close button.
      const preferred = dialog.querySelector<HTMLElement>('[data-autofocus]');
      preferred?.focus();
    } else if (!this.open && dialog.open) {
      dialog.close();
      this.onNativeClose();
    }
  }
}
