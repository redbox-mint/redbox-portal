import { DOCUMENT } from '@angular/common';
import { Component, inject, Injector, Input } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry } from "@researchdatabox/portal-ng-common";
import { FormComponent } from "../form.component";
import {
  FormValidatorComponentErrors,
  FormValidatorSummaryErrors,
  ValidationSummaryComponentName,
} from "@researchdatabox/sails-ng-common";
import { TabComponent } from './tab.component';


@Component({
  selector: 'redbox-validation-summary-field',
  template: `
    @let validationList = allValidationErrorsDisplay;
    @if (validationList.length === 0) {
      <div class="alert alert-info" role="alert">
        The form is valid.
      </div>
    }
    @if (validationList.length > 0) {
      <div class="alert alert-danger mt-3" role="alert">
        <p class="mb-2">{{ '@dmpt-form-validation-fail-prefix' | i18next }}</p>
        <ul class="validation-summary-list mb-0">
          @for (summary of validationList; track summary.id ?? summary.message ?? $index) {
            @if (summary.errors.length > 0) {
              <li class="validation-summary-item">
                @if (summary.id && summary.message) {
                  <a [attr.data-validation-summary-id]="summary.id"
                     [attr.data-validation-summary-message]="summary.message"
                     [attr.href]="'#' + summary.id"
                     (click)="onValidationSummaryClick($event, summary)">{{ summary.message | i18next }}</a>
                } @else if (summary.id && !summary.message) {
                  <a [attr.data-validation-summary-id]="summary.id"
                     [attr.data-validation-summary-message]="summary.message"
                     [attr.href]="'#' + summary.id"
                     (click)="onValidationSummaryClick($event, summary)">{{ summary.id }}</a>
                } @else if (!summary.id && summary.message) {
                  <span [attr.data-validation-summary-id]="summary.id"
                        [attr.data-validation-summary-message]="summary.message">{{ summary.message | i18next }}</span>
                } @else {
                  <span [attr.data-validation-summary-id]="summary.id"
                        [attr.data-validation-summary-message]="summary.message">{{ "@validator-label-default" | i18next }}</span>
                }
                <ul class="validation-summary-errors mb-0">
                  @for (error of summary.errors; track trackValidationError(error, $index)) {
                    @if (error.message) {
                      <li [attr.data-validation-error-class]="error.class"
                          [attr.data-validation-error-message]="error.message">{{ error.message | i18next: error.params }}</li>
                    }
                  }
                </ul>
              </li>
            }
          }
        </ul>
      </div>
    }
  `,
  styles: [`
    .validation-summary-list {
      margin: 0;
      padding-left: 1.25rem;
    }
    .validation-summary-item + .validation-summary-item {
      margin-top: 0.5rem;
    }
    .validation-summary-errors {
      margin-top: 0.25rem;
      padding-left: 1.25rem;
    }
  `],
  standalone: false
})
export class ValidationSummaryFieldComponent extends FormFieldBaseComponent<string> {
  protected override logName = ValidationSummaryComponentName;

  /**
   * The model associated with this component.
   *
   * @type {FieldModel<any>}
   * @memberof FieldComponent
   */
  @Input() public override model?: never;

  private _injector = inject(Injector);
  private readonly doc = inject(DOCUMENT);
  private readonly focusableSelector = [
    'input:not([type="hidden"]):not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'button:not([disabled])',
    'a[href]:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  get allValidationErrorsDisplay(): FormValidatorSummaryErrors[] {
    return this.getFormComponent?.getValidationErrors() ?? [];
  }

  public trackValidationError(error: FormValidatorComponentErrors, errorIndex: number): string {
    return `${error.class}-${error.message}-${errorIndex}`;
  }

  public onValidationSummaryClick(event: MouseEvent, summary: FormValidatorSummaryErrors): void {
    event.preventDefault();
    void this.revealAndFocusValidationTarget(summary);
  }

  private async revealAndFocusValidationTarget(summary: FormValidatorSummaryErrors): Promise<void> {
    this.revealTabParents(summary.lineagePaths?.angularComponents ?? []);
    await new Promise((resolve) => setTimeout(resolve, 0));
    this.focusValidationTarget(summary);
  }

  private revealTabParents(angularPath: Array<string | number>): void {
    if (angularPath.length < 2) {
      return;
    }
    for (let index = 0; index < angularPath.length - 1; index++) {
      const containerName = String(angularPath[index]);
      const targetTabId = String(angularPath[index + 1]);
      const candidate = this.findComponentEntryByName(containerName);
      if (candidate?.component instanceof TabComponent) {
        candidate.component.selectTab(targetTabId);
      }
    }
  }

  private focusValidationTarget(summary: FormValidatorSummaryErrors): void {
    const linkedElement = summary.id ? this.doc.getElementById(summary.id) : null;
    if (linkedElement instanceof HTMLElement) {
      this.scrollAndFocus(linkedElement);
      return;
    }

    const entry = this.findComponentEntryFromLineage(summary.lineagePaths?.angularComponents ?? []);
    const targetElement =
      entry?.componentRef?.location?.nativeElement ??
      entry?.layoutRef?.location?.nativeElement;
    if (targetElement instanceof HTMLElement) {
      const focusable = this.findFocusableElement(targetElement) ?? targetElement;
      this.scrollAndFocus(focusable);
    }
  }

  private scrollAndFocus(element: HTMLElement): void {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
    if (typeof element.focus === 'function') {
      element.focus({ preventScroll: true });
    }
  }

  private findFocusableElement(parent: HTMLElement): HTMLElement | null {
    const focusable = parent.querySelector(this.focusableSelector);
    return focusable instanceof HTMLElement ? focusable : null;
  }

  private findComponentEntryFromLineage(angularPath: Array<string | number>): FormFieldCompMapEntry | undefined {
    let currentEntries = this.getFormComponent?.componentDefArr ?? [];
    let currentEntry: FormFieldCompMapEntry | undefined;

    for (const segment of angularPath) {
      const segmentName = String(segment);
      currentEntry = currentEntries.find((entry) => entry.compConfigJson?.name === segmentName);
      if (!currentEntry) {
        return undefined;
      }
      currentEntries = currentEntry.component?.formFieldCompMapEntries ?? [];
    }

    return currentEntry;
  }

  private findComponentEntryByName(name: string, entries: FormFieldCompMapEntry[] = this.getFormComponent?.componentDefArr ?? []): FormFieldCompMapEntry | undefined {
    for (const entry of entries) {
      if (entry.compConfigJson?.name === name) {
        return entry;
      }
      const childEntry = this.findComponentEntryByName(name, entry.component?.formFieldCompMapEntries ?? []);
      if (childEntry) {
        return childEntry;
      }
    }
    return undefined;
  }

  private get getFormComponent(): FormComponent {
    return this._injector.get(FormComponent);
  }

}
