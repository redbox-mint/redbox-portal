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
    const applier = jasmine.createSpyObj<GenerationPatchApplierService>('GenerationPatchApplierService', ['applyInitialValues', 'apply']);
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
});
