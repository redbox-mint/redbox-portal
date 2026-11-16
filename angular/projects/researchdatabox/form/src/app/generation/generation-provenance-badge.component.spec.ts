import { Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GenerationProvenanceBadgeComponent } from './generation-provenance-badge.component';
import { GenerationProvenanceStoreService } from './generation-provenance-store.service';
import { GenerationApiService } from './generation-api.service';

@Pipe({ name: 'i18next', standalone: false })
class TestTranslationPipe implements PipeTransform {
  transform(value: string): string { return value; }
}

describe('GenerationProvenanceBadgeComponent', () => {
  let fixture: ComponentFixture<GenerationProvenanceBadgeComponent>;
  let store: GenerationProvenanceStoreService;
  let api: jasmine.SpyObj<GenerationApiService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<GenerationApiService>('GenerationApiService', ['provenance', 'review']);
    store = new GenerationProvenanceStoreService(api);
    await TestBed.configureTestingModule({
      declarations: [GenerationProvenanceBadgeComponent, TestTranslationPipe],
      providers: [{ provide: GenerationProvenanceStoreService, useValue: store }],
    }).compileComponents();
    fixture = TestBed.createComponent(GenerationProvenanceBadgeComponent);
    fixture.componentRef.setInput('metadataPointer', '/summary');
  });

  it('keeps rationale and evidence visible when a pending generated value is edited', () => {
    store.setPending({
      runId: 'run-1', candidateDigest: 'digest', baseTargetDigest: 'base',
      items: [{
        fieldId: 'summary', metadataPointer: '/summary', value: 'Generated', operation: 'fill', valueHash: 'hash',
        groundingState: 'sourceBacked', reviewRequired: true, rationale: 'Uses the research title.',
        evidence: [{ id: 'record:title', kind: 'source', label: 'Research title' }],
      }],
    });
    store.markEdited('/summary', 'Researcher revised text');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('generation-provenance-edited');
    expect(fixture.nativeElement.textContent).toContain('Uses the research title.');
    expect(fixture.nativeElement.textContent).toContain('Research title');
    expect(fixture.nativeElement.textContent).not.toContain('generation-review-required');
  });

  it('displays saved edited provenance after reload and hides removed values', async () => {
    const field = {
      id: 'saved-1', runId: 'run-1', profileFieldId: 'summary', metadataPointer: '/summary',
      displayState: 'edited' as const, groundingState: 'sourceBacked' as const, reviewRequired: true,
      rationale: 'Uses the research title.', evidence: [], generatedAt: new Date(0).toISOString(),
    };
    api.provenance.and.resolveTo({ recordOid: 'record-1', fields: [field] });
    await store.load('record-1');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('generation-provenance-edited');
    expect(fixture.nativeElement.textContent).toContain(field.rationale);
    expect(fixture.nativeElement.textContent).not.toContain('generation-review-required');

    api.provenance.and.resolveTo({ recordOid: 'record-1', fields: [{ ...field, displayState: 'removed' }] });
    await store.load('record-1');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('aside')).toBeNull();
  });
  it('shows review failure without accepting the review and clears the error when retry succeeds', async () => {
    const field = {
      id: 'saved-review', runId: 'run-1', profileFieldId: 'summary', metadataPointer: '/summary',
      displayState: 'generated' as const, groundingState: 'requiresReview' as const, reviewRequired: true,
      rationale: 'Review the recommendation.', evidence: [], generatedAt: new Date(0).toISOString(),
    };
    api.provenance.and.resolveTo({ recordOid: 'record-1', fields: [field] });
    await store.load('record-1');
    api.review.and.rejectWith(new Error('private failure detail'));
    fixture.detectChanges();

    await expectAsync(fixture.componentInstance.markReviewed()).toBeResolved();
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('generation-review-failed');
    expect(host.textContent).not.toContain('private failure detail');
    expect(store.byPointer()['/summary'].reviewRequired).toBeTrue();
    api.review.and.resolveTo({ ...field, reviewRequired: false });
    await fixture.componentInstance.markReviewed();
    fixture.detectChanges();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(store.byPointer()['/summary'].reviewRequired).toBeFalse();
  });

  it('does not show an old failed review against replacement field provenance', async () => {
    const field = {
      id: 'old-field', runId: 'old-run', profileFieldId: 'summary', metadataPointer: '/summary',
      displayState: 'generated' as const, groundingState: 'requiresReview' as const, reviewRequired: true,
      rationale: 'Old record', evidence: [], generatedAt: new Date(0).toISOString(),
    };
    api.provenance.and.resolveTo({ recordOid: 'old-record', fields: [field] });
    await store.load('old-record');
    let reject = (_error: Error) => {};
    api.review.and.returnValue(new Promise((_resolve, rejectReview) => { reject = rejectReview; }));
    const reviewing = fixture.componentInstance.markReviewed();
    api.provenance.and.resolveTo({ recordOid: 'new-record', fields: [{ ...field, id: 'new-field', runId: 'new-run' }] });
    await store.load('new-record');
    reject(new Error('Old review failure'));
    await expectAsync(reviewing).toBeResolved();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(store.byPointer()['/summary'].id).toBe('new-field');
    expect(store.byPointer()['/summary'].reviewRequired).toBeTrue();
  });

});
