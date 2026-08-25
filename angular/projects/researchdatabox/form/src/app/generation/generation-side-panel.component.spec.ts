import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { Store } from '@ngrx/store';
import { EMPTY } from 'rxjs';
import { GenerationQuestion, GenerationRunView } from '@researchdatabox/sails-ng-common';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import { GenerationApiService } from './generation-api.service';
import { GenerationPatchApplierService } from './generation-patch-applier.service';
import { GenerationProvenanceStoreService } from './generation-provenance-store.service';
import { GenerationSidePanelComponent } from './generation-side-panel.component';

describe('GenerationSidePanelComponent', () => {
  let fixture: ComponentFixture<GenerationSidePanelComponent>;
  let component: GenerationSidePanelComponent;
  let api: jasmine.SpyObj<GenerationApiService>;

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
      'launch', 'getRun', 'execute', 'cancel', 'commit',
    ]);
    const eventBus = jasmine.createSpyObj<FormComponentEventBus>('FormComponentEventBus', ['select$', 'publish']);
    eventBus.select$.and.returnValue(EMPTY);
    const applier = jasmine.createSpyObj<GenerationPatchApplierService>('GenerationPatchApplierService', ['applyInitialValues', 'apply']);
    const provenance = jasmine.createSpyObj<GenerationProvenanceStoreService>(
      'GenerationProvenanceStoreService',
      ['clear', 'setPending', 'markReviewed', 'markEdited'],
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
});
