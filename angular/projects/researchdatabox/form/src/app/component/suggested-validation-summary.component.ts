import { Component, inject, Input } from '@angular/core';
import { FormFieldCompMapEntry } from '@researchdatabox/portal-ng-common';
import {
  FormValidatorComponentErrors,
  FormValidatorSummaryErrors,
  SuggestedValidationSummaryComponentName,
  SuggestedValidationSummaryFieldComponentConfigFrame,
} from '@researchdatabox/sails-ng-common';
import { FormService } from '../form.service';
import { ValidationSummaryFieldComponent } from './validation-summary.component';

@Component({
  selector: 'redbox-suggested-validation-summary-field',
  template: `
    @let validationList = allValidationErrorsDisplay;
    @if (validationList.length === 0 && showWhenValid) {
      <div class="alert alert-info" role="alert">
        {{ '@dmpt-form-suggested-validation-summary-complete' | i18next }}
      </div>
    }
    @if (validationList.length > 0) {
      <div class="alert alert-warning suggested-validation-summary mt-3" role="alert">
        <i class="fa fa-info-circle suggested-validation-summary__icon" aria-hidden="true"></i>
        <div class="suggested-validation-summary__content">
          <p class="suggested-validation-summary__header mb-2">{{ header | i18next }}</p>
          <div class="validation-summary-list mb-0">
            @for (summary of validationList; track summary.id ?? summary.message ?? $index) {
              @if (summary.errors.length > 0) {
                <div class="validation-summary-item">
                  @if (summary.id) {
                    <a [attr.data-suggested-validation-summary-id]="summary.id"
                       [attr.data-suggested-validation-summary-message]="summary.message"
                       [attr.href]="'#' + summary.id"
                       (click)="onValidationSummaryClick($event, summary)">{{ getValidationSummaryLabel(summary) }}</a>
                  } @else if (summary.message) {
                    <span [attr.data-suggested-validation-summary-id]="summary.id"
                          [attr.data-suggested-validation-summary-message]="summary.message">{{ getValidationSummaryLabel(summary) }}</span>
                  } @else {
                    <span [attr.data-suggested-validation-summary-id]="summary.id"
                          [attr.data-suggested-validation-summary-message]="summary.message">{{ getValidationSummaryLabel(summary) }}</span>
                  }
                  <ul class="validation-summary-errors mb-0">
                    @for (error of summary.errors; track trackValidationError(error, $index)) {
                      @if (error.message) {
                        <li [attr.data-suggested-validation-error-class]="error.class"
                            [attr.data-suggested-validation-error-message]="error.message">{{ error.message | i18next: error.params }}</li>
                      }
                    }
                  </ul>
                </div>
              }
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .suggested-validation-summary {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;
      border-color: #f3c46a;
      border-left: 0.35rem solid #f59e0b;
      background-color: #fff9eb;
      color: #1f2933;
      padding: 1rem 1.25rem;
    }
    .suggested-validation-summary__icon {
      display: inline-block;
      flex: 0 0 auto;
      margin-top: 0;
      color: #b45309;
      font-size: 18px;
      line-height: 1.1;
    }
    .suggested-validation-summary__content {
      min-width: 0;
    }
    .suggested-validation-summary__header {
      color: #1f2933;
      font-size: 14px;
      font-weight: 700;
      line-height: 1.4;
    }
    .validation-summary-list {
      margin: 0;
    }
    .validation-summary-item + .validation-summary-item {
      margin-top: 0.5rem;
    }
    .validation-summary-errors {
      margin-top: 0.25rem;
      margin-left: 2rem;
      padding-left: 1.25rem;
    }
  `],
  standalone: false
})
export class SuggestedValidationSummaryFieldComponent extends ValidationSummaryFieldComponent {
  protected override logName = SuggestedValidationSummaryComponentName;

  @Input() public override model?: never;

  private readonly suggestedFormService = inject(FormService);

  override get allValidationErrorsDisplay(): FormValidatorSummaryErrors[] {
    return (this.formComponent.componentDefArr ?? []).flatMap((mapEntry: FormFieldCompMapEntry) =>
      this.suggestedFormService.getSuggestedValidatorSummaryErrors(
        mapEntry,
        this.enabledValidationGroups,
        this.formComponent.validationGroups
      )
    );
  }

  override trackValidationError(error: FormValidatorComponentErrors, errorIndex: number): string {
    return super.trackValidationError(error, errorIndex);
  }

  public get header(): string {
    return this.suggestedConfig.header ?? '@dmpt-form-suggested-validation-summary-header';
  }

  private get enabledValidationGroups(): string[] {
    return this.suggestedConfig.enabledValidationGroups ?? [];
  }

  private get suggestedConfig(): SuggestedValidationSummaryFieldComponentConfigFrame {
    return this.formFieldCompMapEntry?.compConfigJson?.component?.config as SuggestedValidationSummaryFieldComponentConfigFrame | undefined ?? {};
  }
}
