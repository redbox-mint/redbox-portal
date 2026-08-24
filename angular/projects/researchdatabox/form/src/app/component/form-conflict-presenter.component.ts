import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { ConfirmationDialogService } from '../confirmation-dialog.service';
import { FormConflictState } from '../form-concurrency-state';
import { FormConflictChoice, FormConflictReviewProjection } from '../form-conflict-review.service';

@Component({
  selector: 'redbox-form-conflict-presenter',
  styleUrls: ['./form-conflict-presenter.component.scss'],
  template: `
    <section
      class="rb-form-conflict alert alert-warning"
      [hidden]="!canReview"
      [attr.aria-labelledby]="canReview ? titleId : null"
    >
      @if (canReview) {
        <div class="rb-form-conflict__summary">
          <!--
            Keep the live region limited to the short stale-record notice. The
            review below is interactive and changes as choices are made, so
            including it would make assistive technology re-announce every
            conflicting field assertively on each change.
          -->
          <div class="rb-form-conflict__notice" role="alert" aria-live="assertive" aria-atomic="true">
            <h2 [id]="titleId" class="rb-form-conflict__title">This record has changed</h2>
            <p class="rb-form-conflict__message">
              Your edits are still available. Review the differences or reload the latest record and discard your edits.
            </p>
          </div>
          <div class="rb-form-conflict__actions">
            <button
              type="button"
              class="btn btn-primary"
              [attr.aria-expanded]="review ? 'true' : 'false'"
              [attr.aria-controls]="review ? reviewId : null"
              [disabled]="resolving || !canReview"
              (click)="reviewRequested.emit()"
            >
              Review changes
            </button>
            <button
              type="button"
              class="btn btn-outline-danger"
              [disabled]="resolving || !canDiscard"
              (click)="confirmDiscard()"
            >
              Reload latest and discard mine
            </button>
          </div>
        </div>

        @if (review) {
          <section [id]="reviewId" class="rb-form-conflict-review" role="region" [attr.aria-labelledby]="reviewTitleId">
            <h3 [id]="reviewTitleId" class="rb-form-conflict-review__title">Review changes</h3>
            <p>
              Choose which value to keep for each conflicting field. Changes that do not conflict are retained
              automatically.
            </p>

            @if (review.items.length === 0) {
              <p class="rb-form-conflict-review__retained" role="status">
                Your non-conflicting edits are ready to be saved with the latest record.
              </p>
            } @else {
              <div class="rb-form-conflict-review__items">
                @for (item of review.items; track item.id; let itemIndex = $index) {
                  <fieldset class="rb-form-conflict-review__item">
                    <legend class="rb-form-conflict-review__label">
                      {{ item.label }}
                      @if (item.wholeValue) {
                        <span class="badge text-bg-secondary">Whole repeatable</span>
                      }
                    </legend>
                    @if (item.wholeValue) {
                      <p class="rb-form-conflict-review__whole-value-help" [id]="controlId(itemIndex, 'help')">
                        This repeatable or list is resolved as one whole value.
                      </p>
                    }
                    <div class="rb-form-conflict-review__choices">
                      <label
                        class="rb-form-conflict-review__choice"
                        [class.rb-form-conflict-review__choice--selected]="choiceFor(item.id) === 'mine'"
                      >
                        <span class="rb-form-conflict-review__choice-heading">
                          <input
                            type="radio"
                            [name]="controlId(itemIndex, 'choice')"
                            [checked]="choiceFor(item.id) === 'mine'"
                            [attr.aria-describedby]="item.wholeValue ? controlId(itemIndex, 'help') : null"
                            [disabled]="resolving"
                            (change)="choose(item.id, 'mine')"
                          />
                          <strong>Mine</strong>
                        </span>
                        <ng-container
                          *ngTemplateOutlet="renderedValue; context: { $implicit: item.mine }"
                        ></ng-container>
                      </label>
                      <label
                        class="rb-form-conflict-review__choice"
                        [class.rb-form-conflict-review__choice--selected]="choiceFor(item.id) === 'latest'"
                      >
                        <span class="rb-form-conflict-review__choice-heading">
                          <input
                            type="radio"
                            [name]="controlId(itemIndex, 'choice')"
                            [checked]="choiceFor(item.id) === 'latest'"
                            [attr.aria-describedby]="item.wholeValue ? controlId(itemIndex, 'help') : null"
                            [disabled]="resolving"
                            (change)="choose(item.id, 'latest')"
                          />
                          <strong>Latest</strong>
                        </span>
                        <ng-container
                          *ngTemplateOutlet="renderedValue; context: { $implicit: item.latest }"
                        ></ng-container>
                      </label>
                    </div>
                  </fieldset>
                }
              </div>
            }

            <div class="rb-form-conflict-review__submit">
              <button
                type="button"
                class="btn btn-success"
                [disabled]="resolving || !allChoicesMade"
                (click)="submitResolution()"
              >
                {{ resolving ? 'Saving resolution…' : 'Save resolved changes' }}
              </button>
              @if (!allChoicesMade) {
                <span class="text-muted" role="status">Choose mine or latest for every conflicting field.</span>
              }
            </div>
          </section>
        }
      }
    </section>

    <ng-template #renderedValue let-value>
      <span class="rb-form-conflict-review__value-summary">{{ value.summary }}</span>
      @if (value.details.length > 0) {
        <ul class="rb-form-conflict-review__value-details">
          @for (detail of value.details; track $index) {
            <li>{{ detail }}</li>
          }
        </ul>
      }
    </ng-template>
  `,
  standalone: false,
})
export class FormConflictPresenterComponent implements OnChanges {
  private static nextInstanceId = 0;

  @Input() public conflict: FormConflictState | null = null;
  @Input() public review: FormConflictReviewProjection | null = null;
  @Input() public resolving = false;
  @Output() public readonly reviewRequested = new EventEmitter<void>();
  @Output() public readonly discardRequested = new EventEmitter<void>();
  @Output() public readonly resolutionRequested = new EventEmitter<Readonly<Record<string, FormConflictChoice>>>();

  private readonly instanceId = FormConflictPresenterComponent.nextInstanceId++;
  public readonly titleId = `rb-form-conflict-${this.instanceId}-title`;
  public readonly reviewId = `rb-form-conflict-${this.instanceId}-review`;
  public readonly reviewTitleId = `rb-form-conflict-${this.instanceId}-review-title`;
  private choices: Record<string, FormConflictChoice> = {};
  private reviewRequestId: string | null = null;

  public constructor(private readonly confirmationDialogService: ConfirmationDialogService) {}

  public ngOnChanges(): void {
    const nextRequestId = this.review?.requestId ?? null;
    if (nextRequestId !== this.reviewRequestId) {
      this.reviewRequestId = nextRequestId;
      this.choices = {};
      return;
    }
    const validIds = new Set(this.review?.items.map(item => item.id) ?? []);
    this.choices = Object.fromEntries(Object.entries(this.choices).filter(([id]) => validIds.has(id))) as Record<
      string,
      FormConflictChoice
    >;
  }

  public get canReview(): boolean {
    return Boolean(this.conflict?.latest && (this.conflict.status === 'stale' || this.conflict.status === 'reviewing'));
  }

  public get canDiscard(): boolean {
    return this.canReview;
  }

  public get allChoicesMade(): boolean {
    const review = this.review;
    return review ? review.items.every(item => Boolean(this.choices[item.id])) : false;
  }

  public choiceFor(id: string): FormConflictChoice | undefined {
    return this.choices[id];
  }

  public choose(id: string, choice: FormConflictChoice): void {
    if (!this.review?.items.some(item => item.id === id) || this.resolving) {
      return;
    }
    this.choices = { ...this.choices, [id]: choice };
  }

  public async confirmDiscard(): Promise<void> {
    if (!this.canDiscard || this.resolving) {
      return;
    }
    const confirmed = await this.confirmationDialogService.confirm({
      title: 'Discard your edits?',
      message: 'Reload the latest record and permanently discard your unsaved edits?',
      confirmLabel: 'Discard my edits',
      cancelLabel: 'Keep editing',
      confirmButtonClass: 'btn btn-danger',
    });
    if (confirmed) {
      this.discardRequested.emit();
    }
  }

  public submitResolution(): void {
    if (!this.allChoicesMade || this.resolving) {
      return;
    }
    this.resolutionRequested.emit({ ...this.choices });
  }

  public controlId(itemIndex: number, suffix: string): string {
    return `rb-form-conflict-${this.instanceId}-${itemIndex}-${suffix}`;
  }
}
