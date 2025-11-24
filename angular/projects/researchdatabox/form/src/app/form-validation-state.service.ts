import { Injectable, signal } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';

@Injectable()
export class FormValidationStateService {
  private validationAttempted = signal<boolean>(false);

  markValidationAttempted(): void {
    this.validationAttempted.set(true);
  }

  hasValidationBeenAttempted(): boolean {
    return this.validationAttempted();
  }

  shouldShowControlValidation(control: AbstractControl | null | undefined): boolean {
    return this.validationAttempted() || !!control?.dirty;
  }

  shouldShowValidationSummary(control: AbstractControl | null | undefined): boolean {
    return this.validationAttempted() || this.hasDirtyControl(control);
  }

  private hasDirtyControl(control: AbstractControl | null | undefined): boolean {
    if (!control) {
      return false;
    }
    const anyControl = control as any;
    if (anyControl?.controls) {
      const children = Array.isArray(anyControl.controls) ? anyControl.controls : Object.values(anyControl.controls as Record<string, AbstractControl>);
      return children.some((child: AbstractControl) => this.hasDirtyControl(child));
    }
    return !!control?.dirty;
  }
}
