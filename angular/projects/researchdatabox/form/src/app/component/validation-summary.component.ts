import { Component, inject, Injector, Input } from '@angular/core';
import { FormFieldBaseComponent } from "@researchdatabox/portal-ng-common";
import { FormComponent } from "../form.component";
import {
  FormValidatorComponentErrors,
  FormValidatorSummaryErrors,
  ValidationSummaryComponentName,
} from "@researchdatabox/sails-ng-common";
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import { createLineageFieldFocusRequestEvent } from '../form-state/events/form-component-event.types';


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
  private readonly eventBus = inject(FormComponentEventBus);

  get allValidationErrorsDisplay(): FormValidatorSummaryErrors[] {
    return this.getFormComponent?.getValidationErrors() ?? [];
  }

  public trackValidationError(error: FormValidatorComponentErrors, errorIndex: number): string {
    return `${error.class}-${error.message}-${errorIndex}`;
  }

  public onValidationSummaryClick(event: MouseEvent, summary: FormValidatorSummaryErrors): void {
    event.preventDefault();
    const lineagePath = summary.lineagePaths?.angularComponents ?? [];
    if (lineagePath.length === 0) {
      return;
    }
    this.eventBus.publish(
      createLineageFieldFocusRequestEvent({
        fieldId: summary.id ?? String(lineagePath[lineagePath.length - 1]),
        targetElementId: summary.id ?? undefined,
        lineagePath,
        requestId: this.buildFocusRequestId(),
        source: 'validation-summary',
        sourceId: this.getFormComponent.eventScopeId
      })
    );
  }

  private get getFormComponent(): FormComponent {
    return this._injector.get(FormComponent);
  }

  private buildFocusRequestId(): string {
    return `validation-summary-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
