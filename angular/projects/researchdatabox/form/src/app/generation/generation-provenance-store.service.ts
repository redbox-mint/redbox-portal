import { Injectable, signal } from '@angular/core';
import {
  GenerationCandidatePatch,
  GenerationFieldProvenanceView,
} from '@researchdatabox/sails-ng-common';
import { GenerationApiService } from './generation-api.service';

@Injectable({ providedIn: 'root' })
export class GenerationProvenanceStoreService {
  private revision = 0;
  private readonly byPointerState = signal<Record<string, GenerationFieldProvenanceView>>({});
  public readonly byPointer = this.byPointerState.asReadonly();

  constructor(private readonly api: GenerationApiService) {}

  public clear(): void {
    this.revision++;
    this.byPointerState.set({});
  }

  public setPending(candidate: GenerationCandidatePatch): void {
    this.revision++;
    const now = new Date().toISOString();
    this.byPointerState.set(Object.fromEntries(candidate.items.map((item) => [item.metadataPointer, {
      id: `pending:${candidate.runId}:${item.fieldId}`,
      runId: candidate.runId,
      profileFieldId: item.fieldId,
      metadataPointer: item.metadataPointer,
      displayState: 'generated',
      groundingState: item.groundingState,
      reviewRequired: item.reviewRequired,
      reviewReasonCode: item.reviewReasonCode,
      rationale: item.rationale,
      evidence: item.evidence,
      generatedAt: now,
    } satisfies GenerationFieldProvenanceView])));
  }

  public async load(oid: string): Promise<void> {
    if (!oid) {
      this.clear();
      return;
    }
    const revision = ++this.revision;
    const response = await this.api.provenance(oid);
    if (revision !== this.revision) return;
    this.byPointerState.set(Object.fromEntries(response.fields.map((field) => [
      field.metadataPointer,
      field.displayState === 'edited' ? { ...field, reviewRequired: false } : field,
    ])));
  }

  public async markReviewed(pointer: string): Promise<void> {
    const field = this.byPointerState()[pointer];
    if (!field?.reviewRequired) return;
    const revision = this.revision;
    if (!field.id.startsWith('pending:')) {
      await this.api.review(field.id);
    }
    if (revision !== this.revision || this.byPointerState()[pointer] !== field) return;
    this.byPointerState.update((current) => ({
      ...current,
      [pointer]: { ...field, reviewRequired: false, reviewedAt: new Date().toISOString() },
    }));
  }

  public markEdited(pointer: string, value: unknown): void {
    if (!this.byPointerState()[pointer]) return;
    this.revision++;
    this.byPointerState.update((current) => {
      const next = { ...current };
      if (value === undefined || value === null || value === '') {
        delete next[pointer];
      } else {
        next[pointer] = { ...current[pointer], displayState: 'edited', reviewRequired: false };
      }
      return next;
    });
  }
}
