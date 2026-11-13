import { Component, computed, input, signal } from '@angular/core';
import { GenerationFieldProvenanceView } from '@researchdatabox/sails-ng-common';
import { GenerationProvenanceStoreService } from './generation-provenance-store.service';

@Component({
  selector: 'redbox-generation-provenance-badge',
  template: `
    @if (field(); as item) {
      <aside class="rb-generation-badge" [class.rb-generation-badge--review]="item.reviewRequired">
        <details>
          <summary>
            <span class="rb-generation-badge__mark" aria-hidden="true">✦</span>
            <span>
              {{ (item.displayState === 'edited' ? 'generation-provenance-edited' : 'generation-provenance-generated') | i18next }}
            </span>
            @if (item.reviewRequired) {
              <span class="badge text-bg-warning">{{ 'generation-review-required' | i18next }}</span>
            }
          </summary>
          <div class="rb-generation-badge__detail">
            <p>{{ item.rationale }}</p>
            @if (item.evidence.length > 0) {
              <p class="rb-generation-badge__sources">{{ 'generation-sources' | i18next }}</p>
              <ul>
                @for (evidence of item.evidence; track evidence.id) {
                  <li>{{ evidence.label }}</li>
                }
              </ul>
            }
            @if (reviewError()) {
              <div class="alert alert-danger" role="alert">{{ reviewError()! | i18next }}</div>
            }
            @if (item.reviewRequired) {
              <button type="button" class="btn btn-sm btn-outline-secondary" (click)="markReviewed()">
                {{ 'generation-mark-reviewed' | i18next }}
              </button>
            }
          </div>
        </details>
      </aside>
    }
  `,
  standalone: false,
})
export class GenerationProvenanceBadgeComponent {
  readonly metadataPointer = input.required<string>();
  readonly field = computed(() => {
    const field = this.store.byPointer()[this.metadataPointer()];
    return field?.displayState === 'removed' ? undefined : field;
  });

  private readonly failedReview = signal<GenerationFieldProvenanceView | null>(null);
  readonly reviewError = computed(() => {
    const field = this.field();
    return field?.reviewRequired && this.failedReview() === field ? 'generation-review-failed' : null;
  });

  constructor(private readonly store: GenerationProvenanceStoreService) {}

  public async markReviewed(): Promise<void> {
    const field = this.field();
    if (!field?.reviewRequired) return;
    this.failedReview.set(null);
    try {
      await this.store.markReviewed(this.metadataPointer());
    } catch {
      if (this.field() === field) this.failedReview.set(field);
    }
  }
}
