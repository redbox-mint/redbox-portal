import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { IntegrationStatusComponent } from './integration-status.component';
import { SimpleInputComponent } from './simple-input.component';
import { RecordService, IntegrationStatusItem } from '@researchdatabox/portal-ng-common';

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
});
