import { Injectable, signal } from '@angular/core';
import {
  GenerationCandidatePatch,
  GenerationFieldProvenanceView,
} from '@researchdatabox/sails-ng-common';
import { GenerationApiService } from './generation-api.service';

@Injectable({ providedIn: 'root' })
export class GenerationProvenanceStoreService {
  private readonly byPointerState = signal<Record<string, GenerationFieldProvenanceView>>({});
  public readonly byPointer = this.byPointerState.asReadonly();

  constructor(private readonly api: GenerationApiService) {}

  public clear(): void {
    this.byPointerState.set({});
  }

  public setPending(candidate: GenerationCandidatePatch): void {
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
    const response = await this.api.provenance(oid);
    this.byPointerState.set(Object.fromEntries(response.fields.map((field) => [field.metadataPointer, field])));
  }

  public async markReviewed(pointer: string): Promise<void> {
    const field = this.byPointerState()[pointer];
    if (!field?.reviewRequired) return;
    if (!field.id.startsWith('pending:')) {
      await this.api.review(field.id);
    }
    this.byPointerState.update((current) => ({
      ...current,
      [pointer]: { ...field, reviewRequired: false, reviewedAt: new Date().toISOString() },
    }));
  }

  public markEdited(pointer: string, value: unknown): void {
    const field = this.byPointerState()[pointer];
    if (!field) return;
    const displayState = value === undefined || value === null || value === '' ? 'removed' : 'edited';
    this.byPointerState.update((current) => ({
      ...current,
      [pointer]: {
        ...field,
        displayState,
        reviewRequired: false,
        reviewedAt: field.reviewRequired ? new Date().toISOString() : field.reviewedAt,
      },
    }));
  }
}
