import { NO_ERRORS_SCHEMA, Pipe, PipeTransform, signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { EMPTY, Subject } from 'rxjs';
import { GenerationCandidatePatch, GenerationFieldProvenanceView, GenerationQuestion, GenerationRunView } from '@researchdatabox/sails-ng-common';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import {
  createFormSaveSuccessEvent,
  FormComponentEventType,
} from '../form-state/events/form-component-event.types';
import { GenerationApiService } from './generation-api.service';
import { GenerationPatchApplierService } from './generation-patch-applier.service';
import { GenerationProvenanceStoreService } from './generation-provenance-store.service';
import { GenerationSidePanelComponent } from './generation-side-panel.component';

describe('GenerationSidePanelComponent', () => {
  let fixture: ComponentFixture<GenerationSidePanelComponent>;
  let component: GenerationSidePanelComponent;
  let api: jasmine.SpyObj<GenerationApiService>;
  let eventBus: jasmine.SpyObj<FormComponentEventBus>;
  let applier: jasmine.SpyObj<GenerationPatchApplierService>;
  let provenance: jasmine.SpyObj<GenerationProvenanceStoreService>;
  let provenanceFields: WritableSignal<Record<string, GenerationFieldProvenanceView>>;
  let saveSuccess$: Subject<ReturnType<typeof createFormSaveSuccessEvent>>;

  const question: GenerationQuestion = {
    id: 'objective',
    labelKey: 'objective',
    type: 'text',
    required: true,
    defaultValue: 'Default objective',
  };

  const run = (runId: string, status: GenerationRunView['status'], questions: GenerationQuestion[] = [question]): GenerationRunView => ({
    runId,
    status,
    phase: status === 'failed' ? 'provider' : 'context',
    attemptCount: status === 'failed' ? 1 : 0,
    retryable: false,
    questions,
    result: null,
    ...(status === 'failed' ? {
      error: {
        code: 'GENERATION_PROVIDER_UNAVAILABLE',
        messageKey: 'generation-error-generation-provider-unavailable',
        retryable: false,
      },
    } : {}),
  });

  beforeEach(async () => {
    api = jasmine.createSpyObj<GenerationApiService>('GenerationApiService', [
      'launch', 'getRun', 'execute', 'cancel', 'commit', 'addDocument', 'removeDocument',
    ]);
    saveSuccess$ = new Subject<ReturnType<typeof createFormSaveSuccessEvent>>();
    eventBus = jasmine.createSpyObj<FormComponentEventBus>('FormComponentEventBus', ['select$', 'publish']);
    eventBus.select$.and.callFake(((eventType: string) => (
      eventType === FormComponentEventType.FORM_SAVE_SUCCESS ? saveSuccess$.asObservable() : EMPTY
    )) as typeof eventBus.select$);
    applier = jasmine.createSpyObj<GenerationPatchApplierService>('GenerationPatchApplierService', ['applyInitialValues', 'apply']);
    applier.apply.and.returnValue({ changedFieldIds: [], conflictFieldIds: [] });
    provenanceFields = signal<Record<string, GenerationFieldProvenanceView>>({});
    provenance = jasmine.createSpyObj<GenerationProvenanceStoreService>(
      'GenerationProvenanceStoreService',
      ['clear', 'setPending', 'markReviewed', 'markEdited', 'load'],
      { byPointer: provenanceFields },
    );
    const store = jasmine.createSpyObj<Store>('Store', ['selectSignal', 'dispatch']);
    store.selectSignal.and.returnValue(signal(true));

    await TestBed.configureTestingModule({
      declarations: [GenerationSidePanelComponent],
      providers: [
        { provide: GenerationApiService, useValue: api },
        { provide: GenerationPatchApplierService, useValue: applier },
        { provide: GenerationProvenanceStoreService, useValue: provenance },
        { provide: FormComponentEventBus, useValue: eventBus },
        { provide: Store, useValue: store },
      ],
    })
      .overrideComponent(GenerationSidePanelComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(GenerationSidePanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('form', new FormGroup({ researchActivity: new FormControl('activity-1') }));
    fixture.componentRef.setInput('recordType', 'rdmp');
    fixture.componentRef.setInput('formName', 'edit');
    fixture.componentRef.setInput('launches', [{ bindingKey: 'rdmp-from-activity', sourcePointer: '/researchActivity' }]);
    fixture.detectChanges();
  });

  it('launches a fresh run after failure and preserves questionnaire answers', async () => {
    component.activeSession.set({
      runId: 'failed-run',
      bindingKey: 'rdmp-from-activity',
      autoOpen: true,
      initialValues: [{ metadataPointer: '/researchActivity', value: 'activity-1' }],
    });
    component.run.set(run('failed-run', 'failed'));
    component.questions.set([question]);
    component.questionForm.addControl('objective', new FormControl('Researcher supplied objective'));
    api.launch.and.resolveTo({ runId: 'replacement-run', targetUrl: '/unused' });
    api.getRun.and.resolveTo(run('replacement-run', 'draft'));
    api.execute.and.resolveTo(run('replacement-run', 'completed'));

    await component.generate();

    expect(api.launch).toHaveBeenCalledOnceWith({ bindingKey: 'rdmp-from-activity', sourceOid: 'activity-1' });
    expect(api.execute).toHaveBeenCalledOnceWith('replacement-run', jasmine.objectContaining({
      answers: [{ id: 'objective', value: 'Researcher supplied objective' }],
    }));
    expect(component.effectiveSession()?.runId).toBe('replacement-run');
    expect(String(component.questionForm.get('objective')?.value)).toBe('Researcher supplied objective');
    expect(component.error()).toBeNull();
  });

  it('commits the candidate run after the inline panel is closed', async () => {
    component.activeSession.set({
      runId: 'candidate-run',
      bindingKey: 'rdmp-from-activity',
      autoOpen: true,
      initialValues: [],
    });
    component.candidate.set({
      runId: 'candidate-run',
      candidateDigest: 'candidate-digest',
      baseTargetDigest: 'base-digest',
      items: [],
    });
    api.commit.and.resolveTo({
      runId: 'candidate-run',
      targetOid: 'record-1',
      committed: true,
      provenanceCount: 0,
    });

    component.close();
    expect(component.effectiveSession()).toBeNull();
    saveSuccess$.next(createFormSaveSuccessEvent({ oid: 'record-1' }));
    await fixture.whenStable();

    expect(api.commit).toHaveBeenCalledOnceWith('candidate-run', {
      targetOid: 'record-1',
      candidateDigest: 'candidate-digest',
      appliedFieldIds: [],
      reviewedFieldIds: [],
    });
  });

  it('does not resend an acknowledged receipt when persisted review state changes on a later save', async () => {
    const patch: GenerationCandidatePatch = {
      runId: 'review-run', candidateDigest: 'review-digest', baseTargetDigest: 'base',
      items: [{ fieldId: 'summary', metadataPointer: '/summary', value: 'Generated', operation: 'fill',
        valueHash: 'hash', groundingState: 'requiresReview', reviewRequired: true, rationale: 'Review', evidence: [] }],
    };
    component.activeSession.set({ runId: patch.runId, bindingKey: 'documents', autoOpen: true, initialValues: [] });
    component.run.set(run(patch.runId, 'draft', []));
    applier.apply.and.returnValue({ changedFieldIds: ['summary'], conflictFieldIds: [] });
    api.execute.and.resolveTo({ ...run(patch.runId, 'completed', []), result: patch });
    api.commit.and.resolveTo({ runId: patch.runId, targetOid: 'saved-record', committed: true, provenanceCount: 1 });
    await component.generate();
    saveSuccess$.next(createFormSaveSuccessEvent({ oid: 'saved-record' }));
    await fixture.whenStable();
    provenanceFields.set({ '/summary': {
      id: 'saved-provenance', runId: patch.runId, profileFieldId: 'summary', metadataPointer: '/summary',
      displayState: 'generated', groundingState: 'requiresReview', reviewRequired: false,
      rationale: 'Review', evidence: [], generatedAt: '2026-11-13T00:00:00Z',
    } });
    saveSuccess$.next(createFormSaveSuccessEvent({ oid: 'saved-record' }));
    await fixture.whenStable();

    expect(api.commit).toHaveBeenCalledOnceWith(patch.runId, {
      targetOid: 'saved-record', candidateDigest: patch.candidateDigest, appliedFieldIds: ['summary'], reviewedFieldIds: [],
    });
    expect(component.candidate()).toBe(patch);
    expect(component.completed()).toBeTrue();
  });

  it('shares an in-flight commit across simultaneous save events', async () => {
    component.candidate.set({ runId: 'pending-run', candidateDigest: 'digest', baseTargetDigest: 'base', items: [] });
    let acknowledge = () => {};
    api.commit.and.returnValue(new Promise((resolve) => {
      acknowledge = () => resolve({ runId: 'pending-run', targetOid: 'saved-record', committed: true, provenanceCount: 0 });
    }));
    saveSuccess$.next(createFormSaveSuccessEvent({ oid: 'saved-record' }));
    saveSuccess$.next(createFormSaveSuccessEvent({ oid: 'saved-record' }));
    expect(api.commit.calls.count()).toBe(1);
    acknowledge();
    await fixture.whenStable();
    expect(api.commit.calls.count()).toBe(1);
  });

  it('does not resend a durable receipt when refreshing provenance fails after acknowledgment', async () => {
    const patch: GenerationCandidatePatch = { runId: 'refresh-run', candidateDigest: 'digest', baseTargetDigest: 'base', items: [] };
    component.candidate.set(patch);
    api.commit.and.resolveTo({ runId: patch.runId, targetOid: 'saved-record', committed: true, provenanceCount: 0 });
    provenance.load.and.rejectWith(new Error('Temporary provenance read failure'));
    saveSuccess$.next(createFormSaveSuccessEvent({ oid: 'saved-record' }));
    await new Promise<void>((resolve) => setTimeout(resolve, 550));
    saveSuccess$.next(createFormSaveSuccessEvent({ oid: 'saved-record' }));
    await Promise.resolve();

    expect(api.commit.calls.count()).toBe(1);
    expect(component.candidate()).toBe(patch);
    expect(component.completed()).toBeTrue();
    fixture.destroy();
  });

  it('does not let an old in-flight commit block or acknowledge a replacement form receipt', async () => {
    component.candidate.set({ runId: 'old-commit', candidateDigest: 'old-digest', baseTargetDigest: 'base', items: [] });
    let acknowledgeOld = () => {};
    api.commit.and.returnValue(new Promise((resolve) => {
      acknowledgeOld = () => resolve({ runId: 'old-commit', targetOid: 'old-record', committed: true, provenanceCount: 0 });
    }));
    saveSuccess$.next(createFormSaveSuccessEvent({ oid: 'old-record' }));
    fixture.componentRef.setInput('form', new FormGroup({ title: new FormControl('Replacement') }));
    fixture.detectChanges();
    const replacement: GenerationCandidatePatch = { runId: 'new-commit', candidateDigest: 'new-digest', baseTargetDigest: 'base', items: [] };
    component.candidate.set(replacement);
    api.commit.and.resolveTo({ runId: replacement.runId, targetOid: 'new-record', committed: true, provenanceCount: 0 });
    saveSuccess$.next(createFormSaveSuccessEvent({ oid: 'new-record' }));
    await fixture.whenStable();
    acknowledgeOld();
    await fixture.whenStable();
    saveSuccess$.next(createFormSaveSuccessEvent({ oid: 'new-record' }));
    await fixture.whenStable();

    expect(api.commit.calls.count()).toBe(2);
    expect(provenance.load).toHaveBeenCalledOnceWith('new-record');
    expect(component.candidate()).toBe(replacement);
    expect(component.completed()).toBeTrue();
  });

  it('starts a document-only run in the same target form without a source record', async () => {
    fixture.componentRef.setInput('form', new FormGroup({ title: new FormControl('My draft') }));
    fixture.componentRef.setInput('launches', [{ bindingKey: 'documents', allowDocumentsOnly: true }]);
    api.launch.and.resolveTo({ runId: 'documents-run', targetUrl: '/unused' });
    api.getRun.and.resolveTo(run('documents-run', 'draft'));

    await component.startWithDocuments();

    expect(api.launch).toHaveBeenCalledOnceWith({ bindingKey: 'documents' });
    expect(component.effectiveSession()?.initialValues).toEqual([]);
    expect(component.form()?.get('title')?.value).toBe('My draft');
  });

  it('includes the selected record when starting with documents', async () => {
    fixture.componentRef.setInput('launches', [{ bindingKey: 'combined', sourcePointer: '/researchActivity', allowDocumentsOnly: true }]);
    api.launch.and.resolveTo({ runId: 'combined-run', targetUrl: '/unused' });
    api.getRun.and.resolveTo(run('combined-run', 'draft'));

    await component.startWithDocuments();

    expect(api.launch).toHaveBeenCalledOnceWith({ bindingKey: 'combined', sourceOid: 'activity-1' });
  });

  it('requires document review and sends corrections with server-issued document identifiers', async () => {
    component.activeSession.set({ runId: 'documents-run', bindingKey: 'documents', autoOpen: true, initialValues: [] });
    component.run.set(run('documents-run', 'draft', []));
    component.documents.set([{ id: 'document-1', name: 'grant.pdf', contentHash: 'hash', passages: [{ location: 'Page 1', text: 'Proposed research' }] }]);
    component.documentNotes.setValue('Approval remains pending.');
    api.execute.and.resolveTo(run('documents-run', 'completed', []));

    await component.generate();
    expect(api.execute).not.toHaveBeenCalled();
    component.documentsReviewed.set(true);
    await component.generate();

    expect(api.execute).toHaveBeenCalledOnceWith('documents-run', jasmine.objectContaining({
      documentIds: ['document-1'], documentsReviewed: true, documentNotes: 'Approval remains pending.',
    }));
  });

  it('retries a provider credential failure without abandoning uploaded documents or corrections', async () => {
    component.activeSession.set({ runId: 'documents-run', bindingKey: 'documents', autoOpen: true, initialValues: [] });
    component.run.set({
      ...run('documents-run', 'failed', []), retryable: true,
      error: {
        code: 'GENERATION_PROVIDER_AUTH_FAILED',
        messageKey: 'generation-error-generation-provider-auth-failed', retryable: true,
      },
    });
    component.documents.set([{ id: 'document-1', name: 'grant.txt', contentHash: 'hash', passages: [{ location: 'Paragraph 1', text: 'Research' }] }]);
    component.documentsReviewed.set(true);
    component.documentNotes.setValue('Ethics approval remains pending.');
    api.execute.and.resolveTo(run('documents-run', 'completed', []));

    await component.generate();

    expect(api.launch).not.toHaveBeenCalled();
    expect(api.execute).toHaveBeenCalledOnceWith('documents-run', jasmine.objectContaining({
      documentIds: ['document-1'], documentsReviewed: true, documentNotes: 'Ethics approval remains pending.',
    }));
  });

  it('uses the current source selection when a record is added after documents', async () => {
    component.activeSession.set({ runId: 'documents-run', bindingKey: 'rdmp-from-activity', autoOpen: true, initialValues: [] });
    component.run.set(run('documents-run', 'draft', []));
    component.documents.set([{ id: 'document-1', name: 'grant.txt', contentHash: 'hash', passages: [{ location: 'Paragraph 1', text: 'Research' }] }]);
    component.documentsReviewed.set(true);
    component.form()?.get('researchActivity')?.setValue('activity-2');
    api.execute.and.resolveTo(run('documents-run', 'completed', []));

    await component.generate();

    expect(api.execute).toHaveBeenCalledOnceWith('documents-run', jasmine.objectContaining({ sourceOid: 'activity-2', documentIds: ['document-1'] }));
  });

  it('asks for re-upload when a failed document run cannot be retried', async () => {
    component.activeSession.set({ runId: 'documents-run', bindingKey: 'rdmp-from-activity', autoOpen: true, initialValues: [] });
    component.run.set(run('documents-run', 'failed', []));
    component.documents.set([{ id: 'document-1', name: 'grant.txt', contentHash: 'hash', passages: [{ location: 'Paragraph 1', text: 'Research' }] }]);
    component.documentsReviewed.set(true);

    await component.generate();

    expect(api.launch).not.toHaveBeenCalled();
    expect(api.execute).not.toHaveBeenCalled();
    expect(component.error()).toBe('generation-document-reupload');
  });

  it('cancels an abandoned document draft and clears its inputs', async () => {
    component.activeSession.set({ runId: 'documents-run', bindingKey: 'rdmp-from-activity', autoOpen: true, initialValues: [] });
    component.run.set(run('documents-run', 'draft', []));
    component.documents.set([{ id: 'document-1', name: 'grant.txt', contentHash: 'hash', passages: [{ location: 'Paragraph 1', text: 'Research' }] }]);
    api.cancel.and.resolveTo(run('documents-run', 'cancelled', []));

    await component.cancel();

    expect(api.cancel).toHaveBeenCalledOnceWith('documents-run');
    expect(component.effectiveSession()).toBeNull();
    expect(component.documents()).toEqual([]);
  });
  it('creates pending provenance only for applied fields while retaining the original commit candidate', async () => {
    const patch = {
      runId: 'provenance-run', candidateDigest: 'original-digest', baseTargetDigest: 'base',
      items: ['applied', 'conflicted'].map((fieldId) => ({
        fieldId, metadataPointer: `/${fieldId}`, value: `Generated ${fieldId}`, operation: 'fill' as const,
        valueHash: `hash-${fieldId}`, groundingState: 'sourceBacked' as const,
        reviewRequired: false, rationale: 'Evidence', evidence: [],
      })),
    };
    component.activeSession.set({ runId: patch.runId, bindingKey: 'rdmp-from-activity', initialValues: [], autoOpen: true });
    component.run.set(run(patch.runId, 'draft', []));
    applier.apply.and.returnValue({ changedFieldIds: ['applied'], conflictFieldIds: ['conflicted'] });
    api.execute.and.resolveTo({ ...run(patch.runId, 'completed', []), result: patch });

    await component.generate();

    expect(provenance.setPending).toHaveBeenCalledOnceWith({ ...patch, items: [patch.items[0]] });
    expect(component.candidate()).toBe(patch);
    expect(component.candidate()?.candidateDigest).toBe('original-digest');
    expect(component.conflicts()).toEqual(['conflicted']);
  });

  it('commits only applied fields, retains edited applied fields, and never infers review from missing provenance', async () => {
    const patch: GenerationCandidatePatch = {
      runId: 'receipt-run', candidateDigest: 'original-digest', baseTargetDigest: 'base',
      items: ['applied', 'edited', 'missing', 'conflicted'].map((fieldId) => ({
        fieldId, metadataPointer: `/${fieldId}`, value: `Generated ${fieldId}`, operation: 'fill',
        valueHash: `hash-${fieldId}`, groundingState: 'requiresReview',
        reviewRequired: true, rationale: 'Evidence', evidence: [],
      })),
    };
    const form = new FormGroup({ edited: new FormControl('Generated edited') });
    fixture.componentRef.setInput('form', form);
    fixture.detectChanges();
    component.activeSession.set({ runId: patch.runId, bindingKey: 'rdmp-from-activity', initialValues: [], autoOpen: true });
    component.run.set(run(patch.runId, 'draft', []));
    applier.apply.and.returnValue({ changedFieldIds: ['applied', 'edited', 'missing'], conflictFieldIds: ['conflicted'] });
    api.execute.and.resolveTo({ ...run(patch.runId, 'completed', []), result: patch });
    api.commit.and.resolveTo({ runId: patch.runId, targetOid: 'saved-record', committed: true, provenanceCount: 3 });

    await component.generate();
    form.get('edited')?.setValue('Researcher edited after generation');
    provenanceFields.set(Object.fromEntries(patch.items.slice(0, 2).map((item) => [item.metadataPointer, {
      id: `pending:${patch.runId}:${item.fieldId}`, runId: patch.runId,
      profileFieldId: item.fieldId, metadataPointer: item.metadataPointer,
      displayState: item.fieldId === 'edited' ? 'edited' : 'generated',
      groundingState: item.groundingState, reviewRequired: false,
      rationale: item.rationale, evidence: item.evidence, generatedAt: '2026-11-13T00:00:00Z',
    } satisfies GenerationFieldProvenanceView])));
    component.close();
    saveSuccess$.next(createFormSaveSuccessEvent({ oid: 'saved-record' }));
    await fixture.whenStable();

    expect(api.commit).toHaveBeenCalledOnceWith(patch.runId, {
      targetOid: 'saved-record', candidateDigest: 'original-digest',
      appliedFieldIds: ['applied', 'edited', 'missing'], reviewedFieldIds: ['applied', 'edited'],
    });
    expect(component.candidate()).toBe(patch);
    expect(form.get('edited')?.value).toBe('Researcher edited after generation');
  });

  it('pauses exhausted status checks and resumes reads without re-executing or replacing the edit baseline', async () => {
    const form = new FormGroup({ summary: new FormControl('') });
    fixture.componentRef.setInput('form', form);
    fixture.detectChanges();
    const patch: GenerationCandidatePatch = {
      runId: 'slow-run', candidateDigest: 'digest', baseTargetDigest: 'base',
      items: [{ fieldId: 'summary', metadataPointer: '/summary', value: 'Generated summary', operation: 'fill',
        valueHash: 'hash', groundingState: 'sourceBacked', reviewRequired: false, rationale: 'Source', evidence: [] }],
    };
    component.activeSession.set({ runId: patch.runId, bindingKey: 'documents', autoOpen: true, initialValues: [] });
    component.run.set(run(patch.runId, 'draft', []));
    spyOn(component as unknown as { waitForPoll(delayMs: number): Promise<void> }, 'waitForPoll').and.resolveTo();
    api.execute.and.resolveTo(run(patch.runId, 'running', []));
    api.getRun.and.resolveTo(run(patch.runId, 'running', []));
    applier.apply.and.callFake((...args) => new GenerationPatchApplierService().apply(...args));

    await component.generate();

    expect(api.getRun.calls.count()).toBe(80);
    expect(component.busy()).toBeFalse();
    expect(component.statusChecksPaused()).toBeTrue();
    form.get('summary')?.setValue('Researcher edit after waiting');
    api.getRun.and.resolveTo({ ...run(patch.runId, 'completed', []), result: patch });
    await component.resumeStatusChecks();

    expect(api.execute.calls.count()).toBe(1);
    expect(api.getRun.calls.count()).toBe(81);
    expect(component.statusChecksPaused()).toBeFalse();
    expect(component.busy()).toBeFalse();
    expect(applier.apply).toHaveBeenCalledWith(patch, form, { summary: '' }, eventBus, []);
    expect(form.get('summary')?.value).toBe('Researcher edit after waiting');
    expect(component.conflicts()).toEqual(['summary']);
  });

  it('can cancel an active run after automatic status checks pause', async () => {
    component.activeSession.set({ runId: 'cancel-paused', bindingKey: 'documents', autoOpen: true, initialValues: [] });
    component.run.set(run('cancel-paused', 'draft', []));
    spyOn(component as unknown as { waitForPoll(delayMs: number): Promise<void> }, 'waitForPoll').and.resolveTo();
    api.execute.and.resolveTo(run('cancel-paused', 'running', []));
    api.getRun.and.resolveTo(run('cancel-paused', 'running', []));
    api.cancel.and.resolveTo(run('cancel-paused', 'cancelled', []));
    await component.generate();
    expect(component.statusChecksPaused()).toBeTrue();

    await component.cancel();

    expect(api.cancel).toHaveBeenCalledOnceWith('cancel-paused');
    expect(component.statusChecksPaused()).toBeFalse();
    expect(component.run()?.status).toBe('cancelled');
    expect(component.effectiveSession()).toBeNull();
  });

  it('ignores a resumed status response after its form is replaced', async () => {
    component.activeSession.set({ runId: 'old-paused', bindingKey: 'documents', autoOpen: true, initialValues: [] });
    component.run.set(run('old-paused', 'draft', []));
    spyOn(component as unknown as { waitForPoll(delayMs: number): Promise<void> }, 'waitForPoll').and.resolveTo();
    api.execute.and.resolveTo(run('old-paused', 'running', []));
    api.getRun.and.resolveTo(run('old-paused', 'running', []));
    await component.generate();
    let finish = (_run: GenerationRunView) => {};
    api.getRun.and.returnValue(new Promise((resolve) => { finish = resolve; }));
    const resume = component.resumeStatusChecks();
    await Promise.resolve();
    fixture.componentRef.setInput('form', new FormGroup({ summary: new FormControl('Replacement form') }));
    fixture.detectChanges();
    finish({ ...run('old-paused', 'completed', []), result: {
      runId: 'old-paused', candidateDigest: 'digest', baseTargetDigest: 'base', items: [],
    } });
    await resume;

    expect(applier.apply).not.toHaveBeenCalled();
    expect(component.candidate()).toBeNull();
    expect(component.statusChecksPaused()).toBeFalse();
    expect(api.execute.calls.count()).toBe(1);
  });

  it('applies a candidate returned directly by a fast execution', async () => {
    const form = component.form();
    if (!form) throw new Error('Expected a test form');
    const candidate = { runId: 'fast-run', candidateDigest: 'digest', baseTargetDigest: 'base', items: [] };
    component.activeSession.set({ runId: 'fast-run', bindingKey: 'documents', autoOpen: true, initialValues: [] });
    component.run.set(run('fast-run', 'draft', []));
    api.execute.and.resolveTo({ ...run('fast-run', 'completed', []), result: candidate });

    await component.generate();

    expect(applier.apply).toHaveBeenCalledOnceWith(candidate, form, { researchActivity: 'activity-1' }, eventBus, []);
    expect(component.candidate()).toEqual(candidate);
    expect(api.getRun).not.toHaveBeenCalled();
  });

  for (const status of ['queued', 'running', 'validating'] as const) {
    it(`resumes a reopened ${status} run and applies its completed candidate`, async () => {
      const form = component.form();
      if (!form) throw new Error('Expected a test form');
      const candidate = { runId: 'resumed-run', candidateDigest: 'digest', baseTargetDigest: 'base', items: [] };
      api.getRun.and.returnValues(
        Promise.resolve(run('resumed-run', status, [])),
        Promise.resolve({ ...run('resumed-run', 'completed', []), result: candidate }),
      );
      fixture.componentRef.setInput('session', { runId: 'resumed-run', bindingKey: 'documents', autoOpen: true, initialValues: [] });
      fixture.detectChanges();
      await new Promise<void>((resolve) => setTimeout(resolve, 800));

      expect(api.getRun).toHaveBeenCalledTimes(2);
      expect(applier.apply).toHaveBeenCalledOnceWith(candidate, form, { researchActivity: 'activity-1' }, eventBus, []);
      expect(component.completed()).toBeTrue();
      expect(component.busy()).toBeFalse();
      expect(api.execute).not.toHaveBeenCalled();
    });
  }

  it('ignores a polled result after the component is destroyed', async () => {
    const candidate = { runId: 'resumed-run', candidateDigest: 'digest', baseTargetDigest: 'base', items: [] };
    let finish!: (value: GenerationRunView) => void;
    const polled = new Promise<GenerationRunView>((resolve) => { finish = resolve; });
    api.getRun.and.returnValues(Promise.resolve(run('resumed-run', 'running', [])), polled);
    fixture.componentRef.setInput('session', { runId: 'resumed-run', bindingKey: 'documents', autoOpen: true, initialValues: [] });
    fixture.detectChanges();
    // Allow initialization and its first poll to enter the deferred API request.
    await new Promise<void>((resolve) => setTimeout(resolve, 800));
    expect(component.busy()).toBeTrue();
    expect(api.getRun).toHaveBeenCalledTimes(2);
    await component.generate();
    expect(api.execute).not.toHaveBeenCalled();
    fixture.destroy();
    finish({ ...run('resumed-run', 'completed', []), result: candidate });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(applier.apply).not.toHaveBeenCalled();
    expect(component.candidate()).toBeNull();
  });

  it('clears a scheduled poll when the component is destroyed', async () => {
    api.getRun.and.resolveTo(run('resumed-run', 'queued', []));
    fixture.componentRef.setInput('session', { runId: 'resumed-run', bindingKey: 'documents', autoOpen: true, initialValues: [] });
    fixture.detectChanges();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(component.busy()).toBeTrue();
    fixture.destroy();
    await new Promise<void>((resolve) => setTimeout(resolve, 800));

    expect(api.getRun).toHaveBeenCalledTimes(1);
    expect(applier.apply).not.toHaveBeenCalled();
  });

  it('does not apply a pending poll to a replacement form or reuse its old session', async () => {
    const candidate = { runId: 'old-run', candidateDigest: 'digest', baseTargetDigest: 'base', items: [] };
    let finish!: (value: GenerationRunView) => void;
    api.getRun.and.returnValues(
      Promise.resolve(run('old-run', 'running', [])),
      new Promise<GenerationRunView>((resolve) => { finish = resolve; }),
    );
    fixture.componentRef.setInput('session', { runId: 'old-run', bindingKey: 'documents', autoOpen: true, initialValues: [] });
    fixture.detectChanges();
    await new Promise<void>((resolve) => setTimeout(resolve, 800));
    const replacement = new FormGroup({ title: new FormControl('Replacement record') });
    fixture.componentRef.setInput('form', replacement);
    fixture.detectChanges();
    finish({ ...run('old-run', 'completed', []), result: candidate });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await component.generate();

    expect(applier.apply).not.toHaveBeenCalled();
    expect(replacement.getRawValue()).toEqual({ title: 'Replacement record' });
    expect(component.effectiveSession()).toBeNull();
    expect(component.candidate()).toBeNull();
    expect(component.run()).toBeNull();
    expect(api.execute).not.toHaveBeenCalled();
  });

  it('clears inline session state when external session inputs are cleared during a poll', async () => {
    const candidate = { runId: 'old-run', candidateDigest: 'digest', baseTargetDigest: 'base', items: [] };
    let finish!: (value: GenerationRunView) => void;
    api.getRun.and.returnValues(
      Promise.resolve(run('old-run', 'running', [])),
      new Promise<GenerationRunView>((resolve) => { finish = resolve; }),
    );
    const session = { runId: 'old-run', bindingKey: 'documents', autoOpen: true, initialValues: [] };
    fixture.componentRef.setInput('session', session);
    fixture.detectChanges();
    await new Promise<void>((resolve) => setTimeout(resolve, 800));
    component.activeSession.set(session);
    const clearsBeforeReset = (component.provenance.clear as jasmine.Spy).calls.count();
    fixture.componentRef.setInput('session', null);
    fixture.detectChanges();
    finish({ ...run('old-run', 'completed', []), result: candidate });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(applier.apply).not.toHaveBeenCalled();
    expect(component.effectiveSession()).toBeNull();
    expect(component.run()).toBeNull();
    expect(component.candidate()).toBeNull();
    expect(component.provenance.clear).toHaveBeenCalledTimes(clearsBeforeReset);
  });

  it('ignores a completed execution after the form is replaced', async () => {
    const candidate = { runId: 'old-run', candidateDigest: 'digest', baseTargetDigest: 'base', items: [] };
    component.activeSession.set({ runId: 'old-run', bindingKey: 'documents', autoOpen: true, initialValues: [] });
    component.run.set(run('old-run', 'draft', []));
    let finish!: (value: GenerationRunView) => void;
    api.execute.and.returnValue(new Promise<GenerationRunView>((resolve) => { finish = resolve; }));
    const generating = component.generate();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.componentRef.setInput('form', new FormGroup({ title: new FormControl('New record') }));
    fixture.detectChanges();
    finish({ ...run('old-run', 'completed', []), result: candidate });
    await generating;

    expect(applier.apply).not.toHaveBeenCalled();
    expect(component.effectiveSession()).toBeNull();
    expect(component.run()).toBeNull();
  });

  it('does not reactivate a document launch after its form is replaced', async () => {
    fixture.componentRef.setInput('launches', [{ bindingKey: 'documents', allowDocumentsOnly: true }]);
    let finish!: (value: { runId: string; targetUrl: string }) => void;
    api.launch.and.returnValue(new Promise((resolve) => { finish = resolve; }));
    const starting = component.startWithDocuments();
    fixture.componentRef.setInput('form', new FormGroup({ title: new FormControl('New record') }));
    fixture.detectChanges();
    finish({ runId: 'old-run', targetUrl: '/unused' });
    await starting;

    expect(api.getRun).not.toHaveBeenCalled();
    expect(component.effectiveSession()).toBeNull();
    expect(component.run()).toBeNull();
  });

  it('ignores an old cancellation response after a replacement session opens', async () => {
    component.activeSession.set({ runId: 'old-run', bindingKey: 'documents', autoOpen: true, initialValues: [] });
    component.run.set(run('old-run', 'draft', []));
    let finish!: (value: GenerationRunView) => void;
    api.cancel.and.returnValue(new Promise((resolve) => { finish = resolve; }));
    const cancelling = component.cancel();
    api.getRun.and.resolveTo(run('new-run', 'draft', []));
    fixture.componentRef.setInput('session', { runId: 'new-run', bindingKey: 'documents', autoOpen: true, initialValues: [] });
    fixture.detectChanges();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    finish(run('old-run', 'cancelled', []));
    await cancelling;

    expect(component.effectiveSession()?.runId).toBe('new-run');
    expect(component.run()?.runId).toBe('new-run');
  });

  it('ignores an old document response after the form is replaced', async () => {
    component.activeSession.set({ runId: 'old-run', bindingKey: 'documents', autoOpen: true, initialValues: [] });
    component.run.set({ ...run('old-run', 'draft', []), documentPolicy: {
      formats: ['txt'], maxFiles: 1, maxFileBytes: 1000, maxTextBytes: 1000,
    } });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [new File(['Project'], 'project.txt')] });
    let finish!: (value: GenerationRunView) => void;
    api.addDocument.and.returnValue(new Promise((resolve) => { finish = resolve; }));
    const uploading = component.uploadDocument({ target: input } as unknown as Event);
    fixture.componentRef.setInput('form', new FormGroup({ title: new FormControl('New record') }));
    fixture.detectChanges();
    finish({ ...run('old-run', 'draft', []), documents: [{ id: 'document-1', name: 'project.txt', contentHash: 'hash', passages: [] }] });
    await uploading;

    expect(component.run()).toBeNull();
    expect(component.documents()).toEqual([]);
    expect(component.effectiveSession()).toBeNull();
  });

});

@Pipe({ name: 'i18next', standalone: true })
class StatusTestTranslationPipe implements PipeTransform {
  transform(value: string): string { return value; }
}

describe('Generation paused-status rendering', () => {
  it('renders paused feedback and a resume button that reads status while generation remains disabled', async () => {
    const api = jasmine.createSpyObj<GenerationApiService>('GenerationApiService', ['getRun', 'execute']);
    api.getRun.and.resolveTo({ runId: 'paused-render', status: 'completed', phase: 'population',
      attemptCount: 1, retryable: false, questions: [], result: null });
    const eventBus = jasmine.createSpyObj<FormComponentEventBus>('FormComponentEventBus', ['select$', 'publish']);
    eventBus.select$.and.returnValue(EMPTY);
    const store = jasmine.createSpyObj<Store>('Store', ['selectSignal', 'dispatch']);
    store.selectSignal.and.returnValue(signal(true));
    const applier = jasmine.createSpyObj<GenerationPatchApplierService>('GenerationPatchApplierService', ['applyInitialValues', 'apply']);
    const provenance = jasmine.createSpyObj<GenerationProvenanceStoreService>('GenerationProvenanceStoreService', ['clear'], { byPointer: signal({}) });
    await TestBed.configureTestingModule({
      declarations: [GenerationSidePanelComponent],
      imports: [ReactiveFormsModule, StatusTestTranslationPipe],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: GenerationApiService, useValue: api },
        { provide: FormComponentEventBus, useValue: eventBus },
        { provide: Store, useValue: store },
        { provide: GenerationPatchApplierService, useValue: applier },
        { provide: GenerationProvenanceStoreService, useValue: provenance },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(GenerationSidePanelComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('form', new FormGroup({ summary: new FormControl('') }));
    fixture.detectChanges();
    component.activeSession.set({ runId: 'paused-render', bindingKey: 'documents', initialValues: [], autoOpen: true });
    component.run.set({ runId: 'paused-render', status: 'running', phase: 'provider',
      attemptCount: 1, retryable: false, questions: [], result: null });
    component.statusChecksPaused.set(true);
    spyOn(component as unknown as { waitForPoll(delayMs: number): Promise<void> }, 'waitForPoll').and.resolveTo();
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const resume = host.querySelector<HTMLButtonElement>('.alert-info button');
    const generate = host.querySelector<HTMLButtonElement>('button[type="submit"]');

    expect(host.querySelector('.alert-info')?.textContent).toContain('generation-status-checks-paused');
    expect(resume?.textContent).toContain('generation-resume-status-checks');
    expect(resume?.disabled).toBeFalse();
    expect(generate?.disabled).toBeTrue();
    resume?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.getRun).toHaveBeenCalledOnceWith('paused-render');
    expect(api.execute).not.toHaveBeenCalled();
    expect(host.querySelector('.alert-info')).toBeNull();
    fixture.destroy();
  });
});
