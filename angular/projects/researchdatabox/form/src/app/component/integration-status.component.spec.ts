import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { IntegrationStatusComponent } from './integration-status.component';
import { SimpleInputComponent } from './simple-input.component';
import { RecordService } from '@researchdatabox/portal-ng-common';
import { FormComponentEventBus, createFormSaveSuccessEvent } from '../form-state';

const componentConfig = {
  name: 'integration_status',
  component: {
    class: 'IntegrationStatusComponent' as const,
    config: { integrationNames: ['doi'], pollIntervalMs: 100, maxPollAttempts: 60 }
  }
};

let formConfig: FormConfigFrame;

describe('IntegrationStatusComponent', () => {
  let mockRecordService: jasmine.SpyObj<RecordService>;

  beforeEach(async () => {
    mockRecordService = jasmine.createSpyObj('RecordService', ['getRecordIntegrationStatus']);
    mockRecordService.getRecordIntegrationStatus.and.returnValue(Promise.resolve({ integrations: [] }));

    await createTestbedModule({
      declarations: {
        "SimpleInputComponent": SimpleInputComponent,
        "IntegrationStatusComponent": IntegrationStatusComponent,
      },
      providers: [
        { provide: RecordService, useValue: mockRecordService }
      ]
    });
    formConfig = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      enabledValidationGroups: ['none'],
      componentDefinitions: [
        {
          name: 'text_1_event',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'hello world default!' }
          },
          component: { class: 'SimpleInputComponent' }
        },
        componentConfig
      ]
    };
  });

  it('should create IntegrationStatusComponent', () => {
    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    expect(fixture.componentInstance).toBeDefined();
  });

  it('should not fetch status when there is no oid', async () => {
    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(mockRecordService.getRecordIntegrationStatus).not.toHaveBeenCalled();
  });

  it('should show empty state when no integrations are returned', async () => {
    const { fixture } = await createFormAndWaitForReady(formConfig);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const emptyText = fixture.nativeElement.querySelector('.card-body');
    expect(emptyText).toBeTruthy();
  });

  it('should fetch status on save success with oid', fakeAsync(() => {
    mockRecordService.getRecordIntegrationStatus.and.returnValue(
      Promise.resolve({ integrations: [{ integrationName: 'doi', status: 'success', startedAt: new Date().toISOString(), traceId: 't1' }] })
    );

    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    const component = fixture.componentInstance as any;
    const eventBus = TestBed.inject(FormComponentEventBus);

    component.componentDefinition = componentConfig.component;
    component.oid.set('test-oid');
    fixture.detectChanges();

    eventBus.publish(createFormSaveSuccessEvent({ oid: 'test-oid' }));
    fixture.detectChanges();

    tick(1550);
    fixture.detectChanges();

    expect(mockRecordService.getRecordIntegrationStatus).toHaveBeenCalled();
  }));

  it('should start grace polling on save success even when no items are in flight', fakeAsync(() => {
    mockRecordService.getRecordIntegrationStatus.and.returnValue(
      Promise.resolve({ integrations: [] })
    );

    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    const component = fixture.componentInstance as any;
    const eventBus = TestBed.inject(FormComponentEventBus);

    component.componentDefinition = componentConfig.component;
    component.oid.set('test-oid');
    fixture.detectChanges();

    eventBus.publish(createFormSaveSuccessEvent({ oid: 'test-oid' }));
    fixture.detectChanges();

    tick(1550);
    fixture.detectChanges();

    expect(component.gracePollActive()).toBe(true);
    expect(mockRecordService.getRecordIntegrationStatus).toHaveBeenCalled();
  }));

  it('should stop polling when grace is exhausted and no items are started', fakeAsync(() => {
    mockRecordService.getRecordIntegrationStatus.and.returnValue(
      Promise.resolve({ integrations: [] })
    );

    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    const component = fixture.componentInstance as any;

    component.componentDefinition = componentConfig.component;
    component.oid.set('test-oid');
    component.graceRemaining = 1;
    component.gracePollActive.set(true);
    fixture.detectChanges();

    component.fetchStatus();
    tick(0);
    fixture.detectChanges();

    expect(component.isPolling()).toBe(true);

    tick(300);
    fixture.detectChanges();

    expect(component.isPolling()).toBe(false);
  }));

  it('should stop grace polling early when a started item appears', fakeAsync(() => {
    let callCount = 0;
    mockRecordService.getRecordIntegrationStatus.and.callFake(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ integrations: [] });
      }
      return Promise.resolve({ integrations: [{ integrationName: 'doi', status: 'started', startedAt: new Date().toISOString(), traceId: 't1' }] });
    });

    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    const component = fixture.componentInstance as any;

    component.componentDefinition = componentConfig.component;
    component.oid.set('test-oid');
    component.graceRemaining = 3;
    component.gracePollActive.set(true);
    fixture.detectChanges();

    component.fetchStatus();
    tick(200);
    fixture.detectChanges();

    expect(component.gracePollActive()).toBe(false);
    expect(component.graceRemaining).toBe(0);
    expect(component.isPolling()).toBe(true);
  }));

  it('should show error state on fetch failure', fakeAsync(() => {
    mockRecordService.getRecordIntegrationStatus.and.rejectWith(new Error('network error'));

    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    const component = fixture.componentInstance as any;

    component.componentDefinition = componentConfig.component;
    component.oid.set('test-oid');
    fixture.detectChanges();

    component.fetchStatus();
    tick(0);
    fixture.detectChanges();

    expect(component.hasError()).toBe(true);
  }));
});
