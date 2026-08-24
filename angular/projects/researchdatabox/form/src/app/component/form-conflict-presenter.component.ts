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
      [hidden]="!visible"
      [attr.aria-labelledby]="visible ? titleId : null"
    >
      @if (visible) {
        <div class="rb-form-conflict__summary">
          <!--
            Keep the live region limited to the short stale-record notice. The
            review below is interactive and changes as choices are made, so
            including it would make assistive technology re-announce every
            conflicting field assertively on each change.
          -->
          <div class="rb-form-conflict__notice" role="alert" aria-live="assertive" aria-atomic="true">
            <h2 [id]="titleId" class="rb-form-conflict__title">{{ titleKey | i18next }}</h2>
            <p class="rb-form-conflict__message">{{ messageKey | i18next }}</p>
          </div>
          @if (conflict) {
            <div class="rb-form-conflict__actions">
              @if (canReview) {
                <button
                  type="button"
                  class="btn btn-primary"
                  [attr.aria-expanded]="review ? 'true' : 'false'"
                  [attr.aria-controls]="review ? reviewId : null"
                  [disabled]="resolving"
                  (click)="reviewRequested.emit()"
                >
                  {{ '@form-conflict-review-action' | i18next }}
                </button>
              }
              @if (canDiscard) {
                <button type="button" class="btn btn-outline-danger" [disabled]="resolving" (click)="confirmDiscard()">
                  {{ '@form-conflict-discard-action' | i18next }}
                </button>
              }
              @if (canExport) {
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  [disabled]="resolving"
                  (click)="exportRequested.emit()"
                >
                  {{ '@form-conflict-export-action' | i18next }}
                </button>
              }
              @if (canReloadForm) {
                <button type="button" class="btn btn-outline-danger" [disabled]="resolving" (click)="confirmReload()">
                  {{ '@form-conflict-load-current-form-action' | i18next }}
                </button>
              }
            </div>
          }
        </div>

        @if (review && canReview) {
          <section [id]="reviewId" class="rb-form-conflict-review" role="region" [attr.aria-labelledby]="reviewTitleId">
            <h3 [id]="reviewTitleId" class="rb-form-conflict-review__title">
              {{ '@form-conflict-review-heading' | i18next }}
            </h3>
            <p>{{ '@form-conflict-review-instructions' | i18next }}</p>

            @if (review.items.length === 0) {
              <p class="rb-form-conflict-review__retained" role="status">
                {{ '@form-conflict-review-no-overlaps' | i18next }}
              </p>
            } @else {
              <div class="rb-form-conflict-review__items">
                @for (item of review.items; track item.id; let itemIndex = $index) {
                  <fieldset class="rb-form-conflict-review__item">
                    <legend class="rb-form-conflict-review__label">
                      {{ item.label }}
                      @if (item.wholeValue) {
                        <span class="badge text-bg-secondary">{{ '@form-conflict-whole-repeatable' | i18next }}</span>
                      }
                    </legend>
                    @if (item.wholeValue) {
                      <p class="rb-form-conflict-review__whole-value-help" [id]="controlId(itemIndex, 'help')">
                        {{ '@form-conflict-whole-repeatable-help' | i18next }}
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
                            [disabled]="resolving || !canSubmitResolution"
                            (change)="choose(item.id, 'mine')"
                          />
                          <strong>{{ '@form-conflict-mine' | i18next }}</strong>
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
                            [disabled]="resolving || !canSubmitResolution"
                            (change)="choose(item.id, 'latest')"
                          />
                          <strong>{{ '@form-conflict-latest' | i18next }}</strong>
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

            @if (canSubmitResolution) {
              <div class="rb-form-conflict-review__submit">
                <button
                  type="button"
                  class="btn btn-success"
                  [disabled]="resolving || !allChoicesMade"
                  (click)="submitResolution()"
                >
                  {{ (resolving ? '@form-conflict-saving-resolution' : '@form-conflict-save-resolution') | i18next }}
                </button>
                @if (!allChoicesMade) {
                  <span class="text-muted" role="status">{{ '@form-conflict-choices-required' | i18next }}</span>
                }
              </div>
            } @else {
              <p class="rb-form-conflict-review__retained" role="status">
                {{ '@form-conflict-review-only' | i18next }}
              </p>
            }
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
  @Input() public mergeAllowed = false;
  @Input() public resolution?: 'already-current';
  @Output() public readonly reviewRequested = new EventEmitter<void>();
  @Output() public readonly discardRequested = new EventEmitter<void>();
  @Output() public readonly exportRequested = new EventEmitter<void>();
  @Output() public readonly reloadRequested = new EventEmitter<void>();
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

  public get visible(): boolean {
    return Boolean(this.conflict || this.resolution === 'already-current');
  }

  public get titleKey(): string {
    const conflict = this.conflict;
    if (!conflict) {
      return '@form-conflict-already-current-title';
    }
    if (conflict.status === 'retrying') {
      return '@form-conflict-merging-title';
    }
    if (conflict.status === 'form-changed') {
      return '@form-conflict-form-changed-title';
    }
    if (conflict.status === 'deleted') {
      return '@form-conflict-deleted-title';
    }
    if (conflict.status === 'permission-lost') {
      return '@form-conflict-permission-lost-title';
    }
    if (conflict.cause === 'precondition-required') {
      return '@form-conflict-old-tab-title';
    }
    if (conflict.status === 'reviewing' && conflict.autoRetryAttempted) {
      return '@form-conflict-repeated-race-title';
    }
    if (conflict.status === 'reviewing') {
      return '@form-conflict-reviewing-title';
    }
    return '@form-conflict-stale-title';
  }

  public get messageKey(): string {
    const conflict = this.conflict;
    if (!conflict) {
      return '@form-conflict-already-current-message';
    }
    if (conflict.status === 'retrying') {
      return '@form-conflict-merging-message';
    }
    if (conflict.status === 'form-changed') {
      return '@form-conflict-form-changed-message';
    }
    if (conflict.status === 'deleted') {
      return '@form-conflict-deleted-message';
    }
    if (conflict.status === 'permission-lost') {
      return '@form-conflict-permission-lost-message';
    }
    if (conflict.cause === 'precondition-required') {
      return '@form-conflict-old-tab-message';
    }
    if (conflict.status === 'reviewing' && conflict.autoRetryAttempted) {
      return '@form-conflict-repeated-race-message';
    }
    if (conflict.status === 'reviewing') {
      return '@form-conflict-reviewing-message';
    }
    return '@form-conflict-stale-message';
  }

  public get canReview(): boolean {
    return Boolean(
      this.conflict?.latest &&
      (this.conflict.cause === 'record-stale' || this.conflict.cause === 'precondition-required') &&
      (this.conflict.status === 'stale' || this.conflict.status === 'reviewing')
    );
  }

  public get canDiscard(): boolean {
    return this.canReview && this.mergeAllowed && this.conflict?.cause === 'record-stale';
  }

  public get canSubmitResolution(): boolean {
    return this.canReview && this.mergeAllowed;
  }

  public get canExport(): boolean {
    return Boolean(this.conflict && this.conflict.status !== 'retrying');
  }

  public get canReloadForm(): boolean {
    return Boolean(
      this.conflict &&
      (this.conflict.cause === 'form-changed' ||
        this.conflict.cause === 'precondition-required' ||
        (this.canReview && !this.mergeAllowed))
    );
  }

  public get allChoicesMade(): boolean {
    const review = this.review;
    return review ? review.items.every(item => Boolean(this.choices[item.id])) : false;
  }

  public choiceFor(id: string): FormConflictChoice | undefined {
    return this.choices[id];
  }

  public choose(id: string, choice: FormConflictChoice): void {
    if (!this.canSubmitResolution || !this.review?.items.some(item => item.id === id) || this.resolving) {
      return;
    }
    this.choices = { ...this.choices, [id]: choice };
  }

  public async confirmDiscard(): Promise<void> {
    if (!this.canDiscard || this.resolving) {
      return;
    }
    const confirmed = await this.confirmationDialogService.confirm({
      title: '@form-conflict-discard-warning-title',
      message: '@form-conflict-discard-warning-message',
      confirmLabel: '@form-conflict-discard-warning-confirm',
      cancelLabel: '@form-conflict-discard-warning-cancel',
      confirmButtonClass: 'btn btn-danger',
    });
    if (confirmed) {
      this.discardRequested.emit();
    }
  }

  public async confirmReload(): Promise<void> {
    if (!this.canReloadForm || this.resolving) {
      return;
    }
    const confirmed = await this.confirmationDialogService.confirm({
      title: '@form-conflict-discard-warning-title',
      message: '@form-conflict-reload-warning-message',
      confirmLabel: '@form-conflict-load-current-form-action',
      cancelLabel: '@form-conflict-discard-warning-cancel',
      confirmButtonClass: 'btn btn-danger',
    });
    if (confirmed) {
      this.reloadRequested.emit();
    }
  }

  public submitResolution(): void {
    if (!this.canSubmitResolution || !this.allChoicesMade || this.resolving) {
      return;
    }
    this.resolutionRequested.emit({ ...this.choices });
  }

  public controlId(itemIndex: number, suffix: string): string {
    return `rb-form-conflict-${this.instanceId}-${itemIndex}-${suffix}`;
  }
}
