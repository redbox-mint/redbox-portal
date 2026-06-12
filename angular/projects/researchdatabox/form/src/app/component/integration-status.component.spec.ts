import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { IntegrationStatusComponent } from './integration-status.component';
import { SimpleInputComponent } from './simple-input.component';
import { RecordService, IntegrationStatusItem } from '@researchdatabox/portal-ng-common';
import { FormComponentEventBus, FormComponentEventType } from '../form-state';

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
            config: {
              value: 'hello world default!'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        },
        {
          name: 'integration_status',
          component: {
            class: 'IntegrationStatusComponent',
            config: {
              integrationNames: ['doi'],
              pollIntervalMs: 5000,
              maxPollAttempts: 60
            }
          }
        }
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

  it('should fetch status on save success with oid', async () => {
    mockRecordService.getRecordIntegrationStatus.and.returnValue(
      Promise.resolve({ integrations: [{ integrationName: 'doi', status: 'success', startedAt: new Date().toISOString(), traceId: 't1' }] })
    );

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const eventBus = TestBed.inject(FormComponentEventBus);

    const testOid = 'oid-save-test';
    eventBus.emit({ type: FormComponentEventType.FORM_SAVE_SUCCESS, oid: testOid } as any);

    await new Promise(resolve => setTimeout(resolve, 1600));

    expect(mockRecordService.getRecordIntegrationStatus).toHaveBeenCalled();
  });

  it('should start grace polling on save success even when no items are in flight', fakeAsync(() => {
    mockRecordService.getRecordIntegrationStatus.and.returnValue(
      Promise.resolve({ integrations: [] })
    );

    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    const component = fixture.componentInstance;
    const eventBus = TestBed.inject(FormComponentEventBus);

    component.oid.set('test-oid');
    eventBus.emit({ type: FormComponentEventType.FORM_SAVE_SUCCESS, oid: 'test-oid' } as any);

    tick(1600);

    expect(mockRecordService.getRecordIntegrationStatus).toHaveBeenCalled();
    expect(component.gracePollActive()).toBe(true);

    tick(5000);
    expect(mockRecordService.getRecordIntegrationStatus).toHaveBeenCalledTimes(2);
  }));

  it('should stop polling after maxPollAttempts', fakeAsync(() => {
    let callCount = 0;
    mockRecordService.getRecordIntegrationStatus.and.callFake(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ integrations: [{ integrationName: 'doi', status: 'started', startedAt: new Date().toISOString(), traceId: 't1' }] });
      }
      return Promise.resolve({ integrations: [] });
    });

    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    const component = fixture.componentInstance;
    component.oid.set('test-oid');
    component.fetchStatus();

    tick(0);

    expect(component.isPolling()).toBe(true);

    for (let i = 0; i < 65; i++) {
      tick(5000);
    }

    expect(component.isPolling()).toBe(false);
    expect(callCount).toBeLessThanOrEqual(62);
  }));

  it('should show error state on fetch failure', async () => {
    mockRecordService.getRecordIntegrationStatus.and.rejectWith(new Error('network error'));

    const { fixture } = await createFormAndWaitForReady(formConfig);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    await new Promise(resolve => setTimeout(resolve, 100));

    const errorText = fixture.nativeElement.querySelector('.text-danger');
    expect(errorText).toBeTruthy();
  });
});
