import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { IntegrationStatusComponent } from './integration-status.component';
import { SimpleInputComponent } from './simple-input.component';
import { RecordService, UserService } from '@researchdatabox/portal-ng-common';
import { FormComponentEventBus, createFormSaveSuccessEvent } from '../form-state';

const componentConfig = {
  name: 'integration_status',
  component: {
    class: 'IntegrationStatusComponent' as const,
    config: { integrationNames: ['doi'], pollIntervalMs: 100, maxPollAttempts: 60 }
  }
};

let formConfig: FormConfigFrame;

function createMockUserService(getInfoResult?: any) {
  return {
    waitForInit: () => Promise.resolve(),
    getInfo: () => Promise.resolve(getInfoResult ?? { user: { roles: [{ name: 'Researcher' }] } }),
    getInfoUrl: () => '',
    loginLocal: () => Promise.resolve({}),
    getUsers: () => Promise.resolve([]),
    updateUserDetails: () => Promise.resolve({ status: 'OK' }),
    addLocalUser: () => Promise.resolve({ status: 'OK' }),
    updateUserRoles: () => Promise.resolve({ status: 'OK' }),
    genKey: () => Promise.resolve({ status: true, message: 'generated-token' }),
    revokeKey: () => Promise.resolve({ status: true, message: 'revoked' }),
    searchLinkCandidates: () => Promise.resolve([]),
    getUserLinks: () => Promise.resolve({ primary: null, linkedAccounts: [] }),
    getUserAudit: () => Promise.resolve({ user: null, records: [], summary: { returnedCount: 0, truncated: false } }),
    linkAccounts: () => Promise.resolve({ primary: null, linkedAccounts: [], impact: { recordsRewritten: 0, rolesMerged: 0 } }),
    disableUser: () => Promise.resolve({ status: true, message: 'disabled' }),
    enableUser: () => Promise.resolve({ status: true, message: 'enabled' }),
  };
}

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
        { provide: RecordService, useValue: mockRecordService },
        { provide: UserService, useValue: createMockUserService() }
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

  it('renders outcome badge with severity class for doi published', fakeAsync(() => {
    mockRecordService.getRecordIntegrationStatus.and.returnValue(Promise.resolve({
      integrations: [{
        integrationName: 'doi', status: 'success', startedAt: '', traceId: 't1',
        outcome: { state: 'published', severity: 'success', labelKey: '@integration-status-outcome-doi-published' },
        keyResult: { doi: '10.1234/test' }
      }]
    }));

    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    const component = fixture.componentInstance as any;
    component.componentDefinition = componentConfig.component;
    component.oid.set('test-oid');
    fixture.detectChanges();
    component.fetchStatus();
    tick(0);
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('.badge');
    expect(badge).toBeTruthy();
    expect(badge.classList.contains('text-bg-success')).toBe(true);
    const link = fixture.nativeElement.querySelector('a[href*="doi.org"]');
    expect(link).toBeTruthy();
  }));

  it('renders outcome help text when helpKey is present', fakeAsync(() => {
    mockRecordService.getRecordIntegrationStatus.and.returnValue(Promise.resolve({
      integrations: [{
        integrationName: 'doi', status: 'success', startedAt: '', traceId: 't1',
        outcome: { state: 'draft-assigned', severity: 'pending', labelKey: '@integration-status-outcome-doi-draft-assigned', helpKey: '@integration-status-outcome-doi-draft-assigned-help' }
      }]
    }));

    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    const component = fixture.componentInstance as any;
    component.componentDefinition = componentConfig.component;
    component.oid.set('test-oid');
    fixture.detectChanges();
    component.fetchStatus();
    tick(0);
    fixture.detectChanges();

    const helpIcons = fixture.nativeElement.querySelectorAll('.rb-int-meta i.fa-info-circle');
    expect(helpIcons.length).toBeGreaterThan(0);
  }));

  it('technical toggle hidden for Researcher role', fakeAsync(async () => {
    const userService = TestBed.inject(UserService);
    spyOn(userService, 'getInfo').and.returnValue(Promise.resolve({ user: { roles: [{ name: 'Researcher' }] } } as any));

    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    const component = fixture.componentInstance as any;
    component.componentDefinition = componentConfig.component;
    fixture.detectChanges();
    await component.initRoleResolution();
    fixture.detectChanges();

    expect(component.canSeeTechnicalDetails()).toBe(false);
    const toggle = fixture.nativeElement.querySelector('button');
    expect(toggle).toBeFalsy();
  }));

  it('technical toggle shown for Admin role', fakeAsync(async () => {
    const userService = TestBed.inject(UserService);
    spyOn(userService, 'getInfo').and.returnValue(Promise.resolve({ user: { roles: [{ name: 'Admin' }] } } as any));

    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    const component = fixture.componentInstance as any;
    component.componentDefinition = componentConfig.component;
    fixture.detectChanges();
    await component.initRoleResolution();
    fixture.detectChanges();

    expect(component.canSeeTechnicalDetails()).toBe(true);
  }));

  it('getInfo rejection falls back to researcher view', fakeAsync(async () => {
    const userService = TestBed.inject(UserService);
    spyOn(userService, 'getInfo').and.rejectWith(new Error('fail'));

    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    const component = fixture.componentInstance as any;
    component.componentDefinition = componentConfig.component;
    fixture.detectChanges();
    await component.initRoleResolution();
    fixture.detectChanges();

    expect(component.canSeeTechnicalDetails()).toBe(false);
  }));

  it('reveals technical rows when toggle is clicked', fakeAsync(() => {
    const userService = TestBed.inject(UserService);
    spyOn(userService, 'getInfo').and.returnValue(Promise.resolve({ user: { roles: [{ name: 'Admin' }] } } as any));

    mockRecordService.getRecordIntegrationStatus.and.returnValue(Promise.resolve({
      integrations: [{
        integrationName: 'doi', status: 'success', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 100, traceId: 't1', message: 'completed ok'
      }]
    }));

    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    const component = fixture.componentInstance as any;
    component.componentDefinition = componentConfig.component;
    component.oid.set('test-oid');
    fixture.detectChanges();
    component.fetchStatus();
    tick(0);
    fixture.detectChanges();

    component.canSeeTechnicalDetails.set(true);
    fixture.detectChanges();

    const toggleBtn = fixture.nativeElement.querySelector('button');
    expect(toggleBtn).toBeTruthy();
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');

    toggleBtn.click();
    fixture.detectChanges();

    expect(component.technicalOpen()).toBe(true);
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
    const technicalItems = fixture.nativeElement.querySelectorAll('#integration-technical-details .list-group-item');
    expect(technicalItems.length).toBe(1);
  }));

  it('synthesized rows excluded from technical details section', fakeAsync(() => {
    const userService = TestBed.inject(UserService);
    spyOn(userService, 'getInfo').and.returnValue(Promise.resolve({ user: { roles: [{ name: 'Admin' }] } } as any));

    mockRecordService.getRecordIntegrationStatus.and.returnValue(Promise.resolve({
      integrations: [
        { integrationName: 'doi', status: 'none', startedAt: '', traceId: 'synthetic:doi', synthesized: true, outcome: { state: 'none', severity: 'none', labelKey: '@integration-status-outcome-doi-none' } },
        { integrationName: 'figshare', status: 'success', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 100, traceId: 't2' }
      ]
    }));

    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    const component = fixture.componentInstance as any;
    component.componentDefinition = componentConfig.component;
    component.oid.set('test-oid');
    fixture.detectChanges();
    component.fetchStatus();
    tick(0);
    fixture.detectChanges();

    component.canSeeTechnicalDetails.set(true);
    component.technicalOpen.set(true);
    fixture.detectChanges();

    const technicalItems = fixture.nativeElement.querySelectorAll('#integration-technical-details .list-group-item');
    expect(technicalItems.length).toBe(1);
    expect(technicalItems[0].textContent).toContain('figshare');
  }));

  it('synthesized status none does not trigger polling', fakeAsync(() => {
    mockRecordService.getRecordIntegrationStatus.and.returnValue(Promise.resolve({
      integrations: [{
        integrationName: 'doi', status: 'none', startedAt: '', traceId: 'synthetic:doi', synthesized: true,
        outcome: { state: 'none', severity: 'none', labelKey: '@integration-status-outcome-doi-none' }
      }]
    }));

    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    const component = fixture.componentInstance as any;
    component.componentDefinition = componentConfig.component;
    component.oid.set('test-oid');
    fixture.detectChanges();
    component.fetchStatus();
    tick(0);
    fixture.detectChanges();

    expect(component.isPolling()).toBe(false);
  }));

  it('custom technicalDetailRoles respected', fakeAsync(async () => {
    const userService = TestBed.inject(UserService);
    spyOn(userService, 'getInfo').and.returnValue(Promise.resolve({ user: { roles: [{ name: 'Manager' }] } } as any));

    const customConfig = {
      name: 'integration_status',
      component: {
        class: 'IntegrationStatusComponent' as const,
        config: { integrationNames: ['doi'], pollIntervalMs: 100, maxPollAttempts: 60, technicalDetailRoles: ['Manager'] }
      }
    };

    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    const component = fixture.componentInstance as any;
    component.componentDefinition = customConfig.component;
    fixture.detectChanges();
    await component.initRoleResolution();
    fixture.detectChanges();

    expect(component.canSeeTechnicalDetails()).toBe(true);
  }));

  it('bare shape getInfo response is handled correctly', fakeAsync(async () => {
    const userService = TestBed.inject(UserService);
    spyOn(userService, 'getInfo').and.returnValue(Promise.resolve({ id: 'u1', roles: [{ name: 'Admin' }] } as any));

    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    const component = fixture.componentInstance as any;
    component.componentDefinition = componentConfig.component;
    fixture.detectChanges();
    await component.initRoleResolution();
    fixture.detectChanges();

    expect(component.canSeeTechnicalDetails()).toBe(true);
  }));

  it('default Librarians role sees technical details', fakeAsync(async () => {
    const userService = TestBed.inject(UserService);
    spyOn(userService, 'getInfo').and.returnValue(Promise.resolve({ user: { roles: [{ name: 'Librarians' }] } } as any));

    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    const component = fixture.componentInstance as any;
    component.componentDefinition = componentConfig.component;
    fixture.detectChanges();
    await component.initRoleResolution();
    fixture.detectChanges();

    expect(component.canSeeTechnicalDetails()).toBe(true);
  }));
});
