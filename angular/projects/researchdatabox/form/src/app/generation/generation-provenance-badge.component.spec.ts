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
});
