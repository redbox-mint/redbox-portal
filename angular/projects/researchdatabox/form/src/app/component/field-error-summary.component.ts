import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormValidatorComponentErrors } from '@researchdatabox/sails-ng-common';
import { getAdditionalErrorCount, getPrimaryError, hasMultipleErrors } from './field-error-helpers';

@Component({
  selector: 'redbox-field-error-summary',
  template: `
    @if (primaryError) {
      <div class="rb-form-field-error-summary" [attr.id]="summaryId" aria-live="polite">
        <span class="rb-form-field-error-summary__primary"
              [attr.data-validation-error-class]="primaryError.class"
              [attr.data-validation-error-message]="primaryError.message">
          {{ primaryError.message | i18next: primaryError.params }}
        </span>
        @if (hasExtraErrors) {
          <button type="button"
                  class="rb-form-field-error-toggle"
                  [attr.aria-expanded]="isExpanded"
                  [attr.aria-controls]="detailPanelId"
                  [attr.aria-label]="'form.additionalErrorsButtonAriaLabel' | i18next: { count: additionalErrorCount }"
                  (click)="toggleExpanded()"
                  (keydown)="onToggleKeydown($event)">
            {{ 'form.additionalErrorsButtonLabel' | i18next: { count: additionalErrorCount } }}
          </button>
        }
      </div>
      @if (hasExtraErrors && isExpanded) {
        <div class="rb-form-field-error-panel"
             [attr.id]="detailPanelId"
             role="region"
             [attr.aria-label]="'form.validationErrorsAriaLabel' | i18next: { fieldName: fieldName }">
          <p class="rb-form-field-error-panel__title">{{ 'form.fixFollowingErrors' | i18next }}</p>
          <ul class="rb-form-field-error-panel__list">
            @for (error of errors; track trackError(error, $index)) {
              <li class="rb-form-field-error-panel__item"
                  [attr.data-validation-error-class]="error.class"
                  [attr.data-validation-error-message]="error.message">
                {{ error.message | i18next: error.params }}
              </li>
            }
          </ul>
        </div>
      }
    }
  `,
  standalone: false,
})
export class FieldErrorSummaryComponent implements OnChanges {
  private static nextInstanceId = 0;

  @Input() errors: FormValidatorComponentErrors[] = [];
  @Input() fieldName: string = '';

  private readonly instanceId = FieldErrorSummaryComponent.nextInstanceId++;

  public isExpanded: boolean = false;

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['errors'] && !this.hasExtraErrors) {
      this.isExpanded = false;
    }
  }

  public get primaryError(): FormValidatorComponentErrors | null {
    return getPrimaryError(this.errors);
  }

  public get additionalErrorCount(): number {
    return getAdditionalErrorCount(this.errors);
  }

  public get hasExtraErrors(): boolean {
    return hasMultipleErrors(this.errors);
  }

  public get summaryId(): string {
    return `${this.fieldName || 'field'}-${this.instanceId}-error-summary`;
  }

  public get detailPanelId(): string {
    return `${this.fieldName || 'field'}-${this.instanceId}-error-details`;
  }

  public toggleExpanded(): void {
    if (!this.hasExtraErrors) {
      return;
    }
    this.isExpanded = !this.isExpanded;
  }

  public onToggleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    this.toggleExpanded();
  }

  public trackError(error: FormValidatorComponentErrors, index: number): string {
    return `${error.class ?? 'error'}-${error.message ?? 'message'}-${index}`;
  }
}
