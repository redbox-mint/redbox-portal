import { Component, computed, input } from '@angular/core';
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
  readonly field = computed(() => this.store.byPointer()[this.metadataPointer()]);

  constructor(private readonly store: GenerationProvenanceStoreService) {}

  public async markReviewed(): Promise<void> {
    await this.store.markReviewed(this.metadataPointer());
  }
}

