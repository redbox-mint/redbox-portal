import { Injectable, signal } from '@angular/core';

export interface ConfirmationDialogConfig {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmButtonClass?: string;
}

interface ConfirmationDialogState extends ConfirmationDialogConfig {
  visible: boolean;
}

@Injectable()
export class ConfirmationDialogService {
  readonly dialog = signal<ConfirmationDialogState | null>(null);
  private resolver: ((value: boolean) => void) | null = null;

  confirm(config: ConfirmationDialogConfig): Promise<boolean> {
    this.dialog.set({
      title: config.title,
      message: config.message,
      confirmLabel: config.confirmLabel,
      cancelLabel: config.cancelLabel,
      confirmButtonClass: config.confirmButtonClass,
      visible: true,
    });

    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
    });
  }

  resolve(result: boolean): void {
    this.dialog.set(null);
    this.resolver?.(result);
    this.resolver = null;
  }
}
