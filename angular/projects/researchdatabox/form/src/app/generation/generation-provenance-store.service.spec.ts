import { GenerationCandidatePatch, GenerationFieldProvenanceView } from '@researchdatabox/sails-ng-common';
import { GenerationApiService } from './generation-api.service';
import { GenerationProvenanceStoreService } from './generation-provenance-store.service';

function pendingCandidate(): GenerationCandidatePatch {
  return {
    runId: 'run-1', candidateDigest: 'digest', baseTargetDigest: 'base',
    items: [{
      fieldId: 'sharing', metadataPointer: '/sharing', value: 'Review first', operation: 'fill', valueHash: 'hash',
      groundingState: 'requiresReview', reviewRequired: true, reviewReasonCode: 'MISSING_GUIDANCE',
      rationale: 'No applicable consent guidance.', evidence: [],
    }],
  };
}

describe('GenerationProvenanceStoreService', () => {
  let api: jasmine.SpyObj<GenerationApiService>;
  let service: GenerationProvenanceStoreService;

  beforeEach(() => {
    api = jasmine.createSpyObj<GenerationApiService>('GenerationApiService', ['provenance', 'review']);
    service = new GenerationProvenanceStoreService(api);
  });

  it('tracks pending generated provenance and clears it after an edit', () => {
    service.setPending(pendingCandidate());
    expect(service.byPointer()['/sharing']).toEqual(jasmine.objectContaining({
      id: 'pending:run-1:sharing', displayState: 'generated', reviewRequired: true,
    }));

    service.markEdited('/sharing', 'User-authored sharing statement');

    expect(service.byPointer()['/sharing']).toBeUndefined();
  });

  it('reviews pending fields locally and clears provenance when the value is removed', async () => {
    service.setPending(pendingCandidate());
    await service.markReviewed('/sharing');
    expect(api.review).not.toHaveBeenCalled();
    expect(service.byPointer()['/sharing'].reviewRequired).toBeFalse();

    service.markEdited('/sharing', '');
    expect(service.byPointer()['/sharing']).toBeUndefined();
  });

  it('loads committed provenance and persists review through the API', async () => {
    const field: GenerationFieldProvenanceView = {
      id: 'provenance-1', runId: 'run-1', profileFieldId: 'summary', metadataPointer: '/summary',
      displayState: 'generated', groundingState: 'guidanceBacked', reviewRequired: true,
      rationale: 'Uses policy.', evidence: [], generatedAt: new Date(0).toISOString(),
    };
    api.provenance.and.resolveTo({ recordOid: 'record-1', fields: [field] });
    api.review.and.resolveTo({ ...field, reviewRequired: false });

    await service.load('record-1');
    await service.markReviewed('/summary');

    expect(api.provenance).toHaveBeenCalledOnceWith('record-1');
    expect(api.review).toHaveBeenCalledOnceWith('provenance-1');
    expect(service.byPointer()['/summary'].reviewRequired).toBeFalse();

    service.markEdited('/summary', 'Researcher-authored summary');
    expect(service.byPointer()['/summary']).toBeUndefined();
  });
  it('ignores a provenance response after the form is cleared', async () => {
    let finish!: (value: { recordOid: string; fields: GenerationFieldProvenanceView[] }) => void;
    api.provenance.and.returnValue(new Promise((resolve) => { finish = resolve; }));
    service.setPending(pendingCandidate());
    const field = service.byPointer()['/sharing'];
    const loading = service.load('old-record');
    service.clear();
    finish({ recordOid: 'old-record', fields: [field] });
    await loading;
    expect(service.byPointer()).toEqual({});
  });

  it('keeps the newest record when provenance requests finish out of order', async () => {
    let finish!: (value: { recordOid: string; fields: GenerationFieldProvenanceView[] }) => void;
    service.setPending(pendingCandidate());
    const field = service.byPointer()['/sharing'];
    api.provenance.and.returnValue(new Promise((resolve) => { finish = resolve; }));
    const older = service.load('old-record');
    api.provenance.and.resolveTo({ recordOid: 'new-record', fields: [] });
    await service.load('new-record');
    finish({ recordOid: 'old-record', fields: [field] });
    await older;
    expect(service.byPointer()).toEqual({});
  });

  it('does not restore a field edited while its review request is in flight', async () => {
    service.setPending(pendingCandidate());
    const field = { ...service.byPointer()['/sharing'], id: 'committed-provenance' };
    api.provenance.and.resolveTo({ recordOid: 'record-1', fields: [field] });
    await service.load('record-1');
    let finish!: (value: GenerationFieldProvenanceView) => void;
    api.review.and.returnValue(new Promise((resolve) => { finish = resolve; }));
    const reviewing = service.markReviewed('/sharing');
    service.markEdited('/sharing', 'New author value');
    finish({ ...field, reviewRequired: false });
    await reviewing;
    expect(service.byPointer()).toEqual({});
  });

  it('does not apply a completed review to a replacement record', async () => {
    service.setPending(pendingCandidate());
    const field = { ...service.byPointer()['/sharing'], id: 'committed-provenance' };
    api.provenance.and.resolveTo({ recordOid: 'old-record', fields: [field] });
    await service.load('old-record');
    let finish!: (value: GenerationFieldProvenanceView) => void;
    api.review.and.returnValue(new Promise((resolve) => { finish = resolve; }));
    const reviewing = service.markReviewed('/sharing');
    service.clear();
    service.setPending(pendingCandidate());
    finish({ ...field, reviewRequired: false });
    await reviewing;
    expect(service.byPointer()['/sharing'].id).toBe('pending:run-1:sharing');
    expect(service.byPointer()['/sharing'].reviewRequired).toBeTrue();
  });

});
