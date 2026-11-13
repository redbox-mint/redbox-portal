import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { Store } from '@ngrx/store';
import { EMPTY, Subject } from 'rxjs';
import { GenerationQuestion, GenerationRunView } from '@researchdatabox/sails-ng-common';
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
    const provenance = jasmine.createSpyObj<GenerationProvenanceStoreService>(
      'GenerationProvenanceStoreService',
      ['clear', 'setPending', 'markReviewed', 'markEdited', 'load'],
      { byPointer: signal({}) },
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
      reviewedFieldIds: [],
    });
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
