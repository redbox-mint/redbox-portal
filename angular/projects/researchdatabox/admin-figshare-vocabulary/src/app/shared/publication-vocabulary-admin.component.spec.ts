import { ChangeDetectorRef, Injector, runInInjectionContext } from '@angular/core';
import {
  PublicationVocabularyApiService,
  PublicationVocabularySource,
  PublicationVocabularyCrosswalk,
  PublicationTargetTerm,
  TranslationService,
} from '@researchdatabox/portal-ng-common';
import { FigshareVocabularyApiService } from '../services/figshare-vocabulary-api.service';
import {
  PublicationVocabularyAdminComponent,
  parsePublicationSnapshot,
} from './publication-vocabulary-admin.component';

const target: PublicationTargetTerm = {
  id: 'subjects:opaque%3AABC',
  namespace: 'subjects',
  value: 'opaque:ABC',
  sourceId: 'ABC',
  label: 'Opaque subject',
  selectable: true,
  historical: false,
};
const source: PublicationVocabularySource = {
  id: 'source',
  provider: 'test',
  namespace: 'subjects',
  displayName: 'Subjects',
  scope: 'public',
  catalogueId: 'subjects',
  version: 2,
  archived: false,
};
function crosswalk(): PublicationVocabularyCrosswalk {
  return {
    id: 'crosswalk',
    name: 'Mappings',
    sourceId: source.id,
    localVocabularyId: 'local',
    version: 4,
    status: 'draft',
    workingRevision: 2,
    approvedRevision: 1,
    normalizer: 'exact-v1',
    revisions: [
      {
        revision: 1,
        mappings: [{ id: 'edge', localEntryId: 'entry', targetId: target.id, status: 'approved', matchType: 'manual' }],
        entries: [{ id: 'entry', label: 'Local', value: 'CaseSensitive', codes: ['CaseSensitive'] }],
        targets: [target],
        approvedAt: '2025-01-01T00:00:00Z',
        approvedBy: 'departed-approver',
        digest: 'original',
        auditReferences: ['original-audit'],
      },
      { revision: 2, mappings: [], entries: [], targets: [], digest: 'draft', auditReferences: [] },
    ],
  };
}
describe('Shared vocabulary administration (PUB-24)', () => {
  let component: PublicationVocabularyAdminComponent;
  let api: jasmine.SpyObj<PublicationVocabularyApiService>;
  beforeEach(() => {
    api = jasmine.createSpyObj<PublicationVocabularyApiService>('SharedApi', [
      'capabilities',
      'sources',
      'crosswalks',
      'localVocabularies',
      'crosswalk',
      'localEntries',
      'targets',
      'saveMappings',
      'approve',
      'importSnapshot',
      'sourceHistory',
    ]);
    const legacy = jasmine.createSpyObj<FigshareVocabularyApiService>('LegacyApi', [
      'waitForInit',
      'discoverTaxonomies',
    ]);
    const translations = jasmine.createSpyObj<TranslationService>('Translations', ['waitForInit']);
    const injector = Injector.create({ providers: [{ provide: ChangeDetectorRef, useValue: { markForCheck() {} } }] });
    component = runInInjectionContext(
      injector,
      () => new PublicationVocabularyAdminComponent(api, legacy, translations)
    );
    component.capabilities = { snapshotImport: true, figshareScopes: [], editMappings: true, approve: true };
    component.sources = [source];
    component.active = crosswalk();
    component.selectRevision(2);
    api.crosswalks.and.resolveTo([]);
  });
  it('retains immutable historical approval, original attribution and audit references', () => {
    component.selectRevision(1);
    expect(component.revision?.approvedBy).toBe('departed-approver');
    expect(component.revision?.auditReferences).toEqual(['original-audit']);
    expect(component.canEdit).toBeFalse();
    component.removeMapping('edge');
    expect(component.mappings.length).toBe(1);
    expect(component.canApprove).toBeFalse();
  });
  it('adds an opaque target without numeric coercion and saves against the current optimistic version', async () => {
    component.localPage = {
      data: [{ id: 'entry', value: 'CaseSensitive', label: 'Local', codes: ['CaseSensitive'] }],
      meta: { total: 1, offset: 0, limit: 50 },
    };
    component.targetPage = { data: [target], meta: { total: 1, offset: 0, limit: 50 } };
    component.selectedLocalId = 'entry';
    component.selectedTargetId = target.id;
    component.addMapping();
    expect(component.mappings[0].targetId).toBe('subjects:opaque%3AABC');
    expect(component.canApprove).toBeFalse();
    const saved = crosswalk();
    saved.version = 5;
    api.saveMappings.and.resolveTo(saved);
    await component.saveDraft();
    expect(api.saveMappings).toHaveBeenCalledWith('crosswalk', 4, [
      jasmine.objectContaining({ localEntryId: 'entry', targetId: target.id }),
    ]);
    expect(component.active?.version).toBe(5);
    expect(component.active?.revisions[0].digest).toBe('original');
    expect(component.dirty).toBeFalse();
  });
  it('retains unsaved changes after a stale editor rejection and never retries automatically', async () => {
    component.dirty = true;
    api.saveMappings.and.rejectWith({ status: 409, error: { detail: 'private upstream error' } });
    await component.saveDraft();
    expect(component.error).toBe('@publication-vocabulary-conflict');
    expect(component.dirty).toBeTrue();
    expect(component.active?.version).toBe(4);
    expect(api.saveMappings).toHaveBeenCalledTimes(1);
    expect(component.error).not.toContain('private');
  });
  it('requires explicit confirmation before approving a saved revision', async () => {
    component.mappings = crosswalk().revisions[0].mappings;
    await component.approve();
    expect(api.approve).not.toHaveBeenCalled();
    component.confirmingApproval = true;
    api.approve.and.resolveTo({ ...crosswalk(), version: 5, approvedRevision: 2, status: 'approved' });
    await component.approve();
    expect(api.approve).toHaveBeenCalledWith('crosswalk', 4);
    expect(component.active?.approvedRevision).toBe(2);
  });
  it('removes approval and editing controls for archived sources and unsupported capabilities', () => {
    component.mappings = crosswalk().revisions[0].mappings;
    component.sources = [{ ...source, archived: true }];
    expect(component.canEdit).toBeFalse();
    expect(component.canApprove).toBeFalse();
    component.sources = [];
    expect(component.canEdit).toBeFalse();
    expect(component.canApprove).toBeFalse();
    component.sources = [source];
    component.capabilities = { snapshotImport: false, figshareScopes: [], editMappings: false, approve: false };
    expect(component.canEdit).toBeFalse();
    expect(component.canApprove).toBeFalse();
  });
  it('keeps exact-case codes and URI values when reviewing a snapshot; reserved Figshare snapshots fail', () => {
    const snapshot = {
      ...source,
      terms: [{ value: 'https://example.org/Math', sourceId: 'CaseSensitive', label: 'Math', selectable: true }],
    };
    const parsed = parsePublicationSnapshot(JSON.stringify(snapshot));
    expect(parsed.terms[0].id).toBe('subjects:https%3A%2F%2Fexample.org%2FMath');
    expect(parsed.terms[0].sourceId).toBe('CaseSensitive');
    expect(() => parsePublicationSnapshot(JSON.stringify({ ...snapshot, provider: 'figshare' }))).toThrow();
    expect(() =>
      parsePublicationSnapshot(JSON.stringify({ ...snapshot, terms: [{ ...snapshot.terms[0], value: 42 }] }))
    ).toThrow();
  });
  it('invalidates snapshot review on editing and preserves import identity across a failed retry', async () => {
    component.editSnapshot(JSON.stringify({ ...source, terms: [target] }));
    component.reviewSnapshot();
    expect(component.reviewedImport?.expectedVersion).toBe(2);
    const id = component.reviewedImport?.importId;
    api.importSnapshot.and.rejectWith({ status: 503 });
    await component.importSnapshot();
    expect(component.reviewedImport?.importId).toBe(id);
    component.editSnapshot('{}');
    expect(component.reviewedImport).toBeNull();
  });
  it('does not let a late picker response populate a different crosswalk', async () => {
    let resolveLocals: (value: Awaited<ReturnType<PublicationVocabularyApiService['localEntries']>>) => void = () => {};
    api.localEntries.and.returnValue(
      new Promise(resolve => {
        resolveLocals = resolve;
      })
    );
    api.targets.and.resolveTo({ data: [target], meta: { total: 1, offset: 0, limit: 50 } });
    const pending = component.searchPicker();
    component.showTab('sources');
    resolveLocals({
      data: [{ id: 'foreign', label: 'Stale', value: 'stale', codes: ['stale'] }],
      meta: { total: 1, offset: 0, limit: 50 },
    });
    await pending;
    expect(component.localPage.data).toEqual([]);
    expect(component.targetPage.data).toEqual([]);
  });
  it('filters crosswalks by both provider and source without changing saved references', () => {
    component.sources.push({ ...source, id: 'other', provider: 'figshare' });
    component.crosswalks = [crosswalk(), { ...crosswalk(), id: 'other-crosswalk', sourceId: 'other' }];
    component.changeProvider('test');
    component.sourceFilter = 'source';
    expect(component.filteredCrosswalks.map(row => row.id)).toEqual(['crosswalk']);
    expect(component.active?.id).toBe('crosswalk');
  });
});
