import { APP_BASE_HREF } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import {
  LoggerService,
  RedboxPortalCoreModule,
  TranslationService,
  getStubTranslationService,
} from '@researchdatabox/portal-ng-common';
import { SiemAdapterType, SiemAdminApiService, SiemConfiguration } from './siem-admin-api.service';
import { SiemAdminComponent } from './siem-admin.component';

function buildConfig(overrides: Partial<SiemConfiguration> = {}): SiemConfiguration {
  return {
    enabled: false,
    destinations: [],
    events: {
      categories: {
        authentication: true,
        authorization: true,
        userManagement: true,
        recordLifecycle: true,
        integrationAudit: true,
        attachmentAccess: true,
      },
      severity: {},
    },
    redaction: {
      denylistedPaths: ['password'],
      maxPayloadBytes: 65536,
      includeActorEmail: false,
      includeIpAddress: false,
      includeUserAgent: false,
    },
    delivery: {
      batchSize: 50,
      maxAttempts: 3,
      retryDelayMs: 60000,
      retryBackoffMultiplier: 2,
      deadLetterRetentionDays: 30,
      nonBlocking: true,
    },
    ...overrides,
  };
}

describe('SiemAdminComponent', () => {
  let fixture: ComponentFixture<SiemAdminComponent>;
  let component: SiemAdminComponent;
  let apiService: jasmine.SpyObj<SiemAdminApiService>;

  beforeEach(async () => {
    apiService = jasmine.createSpyObj<SiemAdminApiService>('SiemAdminApiService', [
      'waitForInit',
      'getSiemConfig',
      'saveSiemConfig',
      'getEvents',
      'getDeliveryStatus',
      'testDestination',
      'getBrandingAndPortalUrl',
    ]);
    apiService.waitForInit.and.resolveTo(apiService);
    apiService.getBrandingAndPortalUrl.and.returnValue('base/default/rdmp');
    apiService.getSiemConfig.and.resolveTo(buildConfig());
    apiService.saveSiemConfig.and.callFake(config => Promise.resolve(config));
    apiService.getEvents.and.resolveTo({ rows: [], total: 0 });
    apiService.getDeliveryStatus.and.resolveTo({ rows: [], total: 0 });

    await TestBed.configureTestingModule({
      declarations: [SiemAdminComponent],
      imports: [FormsModule, RedboxPortalCoreModule],
      providers: [
        LoggerService,
        { provide: APP_BASE_HREF, useValue: 'base' },
        {
          provide: TranslationService,
          useValue: getStubTranslationService({
            'siem-heading': 'SIEM Configuration',
            'siem-loading': 'Loading',
            'siem-no-destinations': 'No destinations configured.',
            'siem-destination-default-name': 'New destination',
            'siem-destination-remove-confirm': 'Remove destination "{name}"?',
          }),
        },
        { provide: SiemAdminApiService, useValue: apiService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SiemAdminComponent);
    component = fixture.componentInstance;
  });

  async function init(): Promise<void> {
    fixture.autoDetectChanges(true);
    await component.waitForInit();
    await fixture.whenStable();
  }

  it('loads the config, events and delivery status on init and renders the disabled default state', async () => {
    await init();

    expect(apiService.getSiemConfig).toHaveBeenCalled();
    expect(apiService.getEvents).toHaveBeenCalled();
    expect(apiService.getDeliveryStatus).toHaveBeenCalled();
    expect(component.draft.enabled).toBeFalse();
    expect(component.destinationCount).toBe(0);
    expect(component.isDirty()).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('No destinations configured.');
  });

  it('saves the full SiemConfiguration draft', async () => {
    await init();

    component.draft.enabled = true;
    expect(component.canSave()).toBeTrue();

    await component.save();

    expect(apiService.saveSiemConfig).toHaveBeenCalledTimes(1);
    const payload = apiService.saveSiemConfig.calls.mostRecent().args[0];
    expect(payload.enabled).toBeTrue();
    expect(payload.delivery.batchSize).toBe(50);
    expect(payload.events.categories.authentication).toBeTrue();
    expect(component.isDirty()).toBeFalse();
  });

  it('blocks the save button and public save after an initial config load failure', async () => {
    apiService.getSiemConfig.and.rejectWith(new Error('config unavailable'));
    await init();
    component.draft.enabled = true;
    expect(component.loadError).toBeTruthy();
    expect(component.canSave()).toBeFalse();
    fixture.detectChanges();
    const saveButton: HTMLButtonElement = fixture.nativeElement.querySelector('button.btn-primary');
    expect(saveButton.disabled).toBeTrue();
    await component.save();
    expect(apiService.saveSiemConfig).not.toHaveBeenCalled();

    apiService.getSiemConfig.and.resolveTo(buildConfig());
    await component.refresh();
    component.draft.enabled = true;
    expect(component.canSave()).toBeTrue();
    await component.save();
    expect(apiService.saveSiemConfig).toHaveBeenCalledTimes(1);
  });

  it('retains the loaded draft but blocks saves after a failed refresh', async () => {
    apiService.getSiemConfig.and.resolveTo(buildConfig({ enabled: true }));
    await init();
    component.draft.delivery.batchSize = 20;
    apiService.getSiemConfig.and.rejectWith(new Error('refresh unavailable'));
    await component.refresh();
    expect(component.draft.enabled).toBeTrue();
    expect(component.draft.delivery.batchSize).toBe(20);
    expect(component.canSave()).toBeFalse();
    await component.save();
    expect(apiService.saveSiemConfig).not.toHaveBeenCalled();
  });

  it('blocks public save before config loading completes', async () => {
    component.draft.enabled = true;
    await component.save();
    expect(apiService.saveSiemConfig).not.toHaveBeenCalled();
  });

  it('keeps masked secret values unchanged unless the user edits them', async () => {
    apiService.getSiemConfig.and.resolveTo(
      buildConfig({
        destinations: [
          {
            id: 'dest-1',
            name: 'Splunk',
            enabled: true,
            adapterType: 'splunk-hec-json',
            endpointUrl: 'https://splunk.example',
            token: '__REDACTED__',
          },
        ],
      })
    );

    await init();

    expect(component.buildConfig().destinations[0].token).toBe('__REDACTED__');

    component.selectedDestination!.token = 'a-new-token';
    expect(component.buildConfig().destinations[0].token).toBe('a-new-token');
  });

  async function changeAdapter(adapter: SiemAdapterType): Promise<void> {
    component.setActiveTab('destinations');
    fixture.detectChanges();
    await fixture.whenStable();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('#siem-dest-adapter');
    select.value = adapter;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function editCredential(field: string, value: string): Promise<void> {
    const input: HTMLInputElement = fixture.nativeElement.querySelector(`#siem-dest-${field}`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const adapters: SiemAdapterType[] = ['splunk-hec-json', 'otel-otlp-logs', 'syslog-rfc5424-json', 'cef', 'leef'];
  for (const adapter of adapters) {
    for (const credential of ['__REDACTED__', 'unsaved-secret']) {
      it(`clears hidden ${credential} credentials through the adapter selector and saves ${adapter}`, async () => {
        const usesToken = adapter === 'splunk-hec-json' || adapter === 'otel-otlp-logs';
        apiService.getSiemConfig.and.resolveTo(
          buildConfig({
            destinations: [
              {
                id: 'dest-1',
                name: 'Collector',
                enabled: true,
                adapterType: usesToken ? 'cef' : 'splunk-hec-json',
                endpointUrl: 'https://collector.example',
                token: credential,
                username: 'retained-user',
                password: credential,
              },
            ],
          })
        );
        await init();
        await changeAdapter(adapter);
        const destination = component.buildConfig().destinations[0];
        expect(destination.adapterType).toBe(adapter);
        if (usesToken) {
          expect(destination.username).toBeUndefined();
          expect(destination.password).toBeUndefined();
          expect(destination.token).toBe(credential);
          expect(fixture.nativeElement.querySelector('#siem-dest-password')).toBeNull();
          await editCredential('token', 'replacement-token');
        } else {
          expect(destination.token).toBeUndefined();
          expect(destination.username).toBe('retained-user');
          expect(destination.password).toBe(credential);
          expect(fixture.nativeElement.querySelector('#siem-dest-token')).toBeNull();
          await editCredential('username', 'replacement-user');
          await editCredential('password', 'replacement-password');
        }
        expect(component.canSave()).toBeTrue();
        await component.save();
        const payload = apiService.saveSiemConfig.calls.mostRecent().args[0].destinations[0];
        expect(payload.token).toBe(usesToken ? 'replacement-token' : undefined);
        expect(payload.username).toBe(usesToken ? undefined : 'replacement-user');
        expect(payload.password).toBe(usesToken ? undefined : 'replacement-password');
        expect(component.saveSuccess).toBeTrue();
      });
    }
  }

  it('retains the visible username and password when switching between text adapters', async () => {
    apiService.getSiemConfig.and.resolveTo(
      buildConfig({
        destinations: [
          {
            id: 'dest-1',
            name: 'Collector',
            enabled: true,
            adapterType: 'cef',
            endpointUrl: 'https://collector.example',
            username: 'collector-user',
            password: '__REDACTED__',
          },
        ],
      })
    );
    await init();
    await changeAdapter('leef');
    expect(component.buildConfig().destinations[0].username).toBe('collector-user');
    expect(component.buildConfig().destinations[0].password).toBe('__REDACTED__');
    await editCredential('password', '');
    const saveButton: HTMLButtonElement = fixture.nativeElement.querySelector('button.btn-primary');
    expect(saveButton.disabled).toBeFalse();
    saveButton.click();
    await fixture.whenStable();
    const payload = apiService.saveSiemConfig.calls.mostRecent().args[0].destinations[0];
    expect(payload.username).toBe('collector-user');
    expect(payload.password).toBe('');
    expect(component.saveSuccess).toBeTrue();
  });

  it('retains visible masks and custom headers across adapter changes until explicitly edited', async () => {
    apiService.getSiemConfig.and.resolveTo(
      buildConfig({
        destinations: [
          {
            id: 'dest-1',
            name: 'Collector',
            enabled: true,
            adapterType: 'splunk-hec-json',
            endpointUrl: 'https://collector.example',
            token: '__REDACTED__',
            headers: { 'X-Private': '__REDACTED__', Accept: 'application/json' },
          },
        ],
      })
    );
    await init();
    await changeAdapter('otel-otlp-logs');
    expect(component.buildConfig().destinations[0].token).toBe('__REDACTED__');
    expect(component.buildConfig().destinations[0].headers).toEqual({
      'X-Private': '__REDACTED__',
      Accept: 'application/json',
    });
    apiService.saveSiemConfig.and.rejectWith({
      error: {
        message: 'Replace or explicitly clear every masked credential',
      },
    });
    await component.save();
    expect(component.saveError).toContain('Replace or explicitly clear');
    expect(component.isDirty()).toBeTrue();
    await editCredential('token', '');
    const headerInput: HTMLInputElement = fixture.nativeElement.querySelectorAll('.siem-header-row input')[1];
    expect(headerInput).withContext(fixture.nativeElement.innerHTML).toBeDefined();
    headerInput.value = '';
    headerInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    apiService.saveSiemConfig.and.callFake(config => Promise.resolve(config));
    await component.save();
    const payload = apiService.saveSiemConfig.calls.mostRecent().args[0].destinations[0];
    expect(payload.token).toBe('');
    expect(payload.headers).toEqual({ 'X-Private': '', Accept: 'application/json' });
    expect(component.saveSuccess).toBeTrue();
  });

  it('adds, reorders and removes destinations in the draft', async () => {
    await init();

    component.addDestination();
    component.addDestination();
    expect(component.destinationCount).toBe(2);
    const firstId = component.draft.destinations[0].id;
    const secondId = component.draft.destinations[1].id;
    expect(component.selectedDestinationId).toBe(secondId);

    component.moveDestination(secondId, -1);
    expect(component.draft.destinations[0].id).toBe(secondId);
    expect(component.draft.destinations[1].id).toBe(firstId);

    spyOn(window, 'confirm').and.returnValue(true);
    component.removeDestination(secondId);
    expect(component.destinationCount).toBe(1);
    expect(component.draft.destinations[0].id).toBe(firstId);
  });

  it('does not remove a destination when removal is not confirmed', async () => {
    await init();
    component.addDestination();
    const id = component.draft.destinations[0].id;

    spyOn(window, 'confirm').and.returnValue(false);
    component.removeDestination(id);

    expect(component.destinationCount).toBe(1);
  });

  it('shows adapter-specific fields based on the selected adapter', () => {
    expect(component.showsTokenField('splunk-hec-json')).toBeTrue();
    expect(component.showsTokenField('otel-otlp-logs')).toBeTrue();
    expect(component.showsTokenField('cef')).toBeFalse();

    expect(component.showsUsernamePasswordFields('syslog-rfc5424-json')).toBeTrue();
    expect(component.showsUsernamePasswordFields('splunk-hec-json')).toBeFalse();
  });

  it('tests the selected unsaved destination draft and stores the result', async () => {
    apiService.getSiemConfig.and.resolveTo(
      buildConfig({
        destinations: [
          {
            id: 'dest-1',
            name: 'Splunk',
            enabled: true,
            adapterType: 'splunk-hec-json',
            endpointUrl: 'https://splunk.example',
          },
        ],
      })
    );
    apiService.testDestination.and.resolveTo({
      status: 'success',
      httpStatusCode: 200,
      durationMs: 120,
      responseSummary: { code: 0 },
    });

    await init();

    component.selectedDestination!.endpointUrl = 'https://changed.example';
    await component.testDestination('dest-1');

    const arg = apiService.testDestination.calls.mostRecent().args[0];
    expect(arg.destination.endpointUrl).toBe('https://changed.example');
    expect(component.testStateById['dest-1'].status).toBe('success');
    expect(component.testStateById['dest-1'].responseSummary).toContain('"code":0');
  });

  it('strips the stack trace from a failed test error summary', async () => {
    apiService.getSiemConfig.and.resolveTo(
      buildConfig({
        destinations: [
          {
            id: 'dest-1',
            name: 'Splunk',
            enabled: true,
            adapterType: 'splunk-hec-json',
            endpointUrl: 'https://bad.example',
          },
        ],
      })
    );
    apiService.testDestination.and.resolveTo({
      status: 'failed',
      errorSummary: {
        message:
          '(FiberFailure) Error: getaddrinfo ENOTFOUND bad.example\n    at catch (/opt/redbox/x.ts:110:16)\n    at body (/opt/redbox/y.ts:786:14)',
      },
    });

    await init();
    await component.testDestination('dest-1');

    const summary = component.testStateById['dest-1'].errorSummary;
    expect(summary).toBe('(FiberFailure) Error: getaddrinfo ENOTFOUND bad.example');
    expect(summary).not.toContain('at catch');
    expect(summary).not.toContain('/opt/redbox');
  });

  it('records a test error when testing fails', async () => {
    apiService.getSiemConfig.and.resolveTo(
      buildConfig({
        destinations: [
          {
            id: 'dest-1',
            name: 'Splunk',
            enabled: true,
            adapterType: 'splunk-hec-json',
            endpointUrl: 'https://splunk.example',
          },
        ],
      })
    );
    apiService.testDestination.and.rejectWith({ error: { detail: 'boom' } });

    await init();
    await component.testDestination('dest-1');

    expect(component.testErrorById['dest-1']).toBe('boom');
    expect(component.testStateById['dest-1']).toBeUndefined();
  });

  it('applies event filters using the supported backend params', async () => {
    await init();
    apiService.getEvents.calls.reset();

    component.eventFilters.category = 'authentication';
    component.eventFilters.deliveryState = 'failed';
    component.eventFilters.eventType = 'authentication.login.failure';
    await component.applyEventFilters();

    expect(apiService.getEvents).toHaveBeenCalledWith({
      eventType: 'authentication.login.failure',
      category: 'authentication',
      deliveryState: 'failed',
      limit: 25,
      offset: 0,
    });
  });

  it('applies delivery filters using the supported backend params', async () => {
    await init();
    apiService.getDeliveryStatus.calls.reset();

    component.deliveryFilters.destinationId = 'dest-1';
    component.deliveryFilters.status = 'failed';
    await component.applyDeliveryFilters();

    expect(apiService.getDeliveryStatus).toHaveBeenCalledWith({
      destinationId: 'dest-1',
      status: 'failed',
      limit: 25,
      offset: 0,
    });
  });

  it('fetches subsequent event and delivery pages using offset', async () => {
    await init();
    await component.loadEvents(25);
    await component.loadDelivery(50);
    expect(apiService.getEvents.calls.mostRecent().args[0]?.offset).toBe(25);
    expect(apiService.getDeliveryStatus.calls.mostRecent().args[0]?.offset).toBe(50);
  });

  it('retains edits after a rejected save, prevents duplicate saves and permits a successful retry', async () => {
    await init();
    component.draft.enabled = true;
    let rejectSave!: (error: unknown) => void;
    apiService.saveSiemConfig.and.returnValue(
      new Promise((_, reject) => {
        rejectSave = reject;
      })
    );
    const pendingSave = component.save();
    expect(component.saving).toBeTrue();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[name="enabled"]').matches(':disabled')).toBeTrue();
    expect(fixture.nativeElement.querySelector('button.btn-primary').disabled).toBeTrue();
    await component.save();
    expect(apiService.saveSiemConfig).toHaveBeenCalledTimes(1);
    rejectSave({ error: { message: 'Collector target changed: enter a new token' } });
    await pendingSave;
    fixture.detectChanges();
    expect(component.saving).toBeFalse();
    expect(fixture.nativeElement.querySelector('input[name="enabled"]').matches(':disabled')).toBeFalse();
    expect(component.draft.enabled).toBeTrue();
    expect(component.isDirty()).toBeTrue();
    expect(component.canSave()).toBeTrue();
    expect(component.saveSuccess).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Collector target changed: enter a new token');

    apiService.saveSiemConfig.and.callFake(config => Promise.resolve(config));
    await component.save();
    expect(component.saveError).toBe('');
    expect(component.saveSuccess).toBeTrue();
    expect(component.lastSavedAt).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    expect(component.isDirty()).toBeFalse();
    await component.save();
    expect(apiService.saveSiemConfig).toHaveBeenCalledTimes(2);
  });

  it('disables configuration editing until a pending save succeeds', async () => {
    await init();
    component.addDestination();
    component.setActiveTab('destinations');
    component.draft.destinations[0].endpointUrl = 'https://collector.example.test/logs';
    let finishSave!: (value: SiemConfiguration) => void;
    apiService.saveSiemConfig.and.returnValue(
      new Promise(resolve => {
        finishSave = resolve;
      })
    );
    const pendingSave = component.save();
    fixture.detectChanges();
    const controls: NodeListOf<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> =
      fixture.nativeElement.querySelectorAll('input, select, textarea');
    expect(controls.length).toBeGreaterThan(2);
    controls.forEach(control => expect(control.matches(':disabled')).toBeTrue());
    const submitted = apiService.saveSiemConfig.calls.mostRecent().args[0];
    finishSave(submitted);
    await pendingSave;
    fixture.detectChanges();
    expect(component.draft.destinations[0].endpointUrl).toBe(submitted.destinations[0].endpointUrl);
    expect(component.isDirty()).toBeFalse();
    expect(fixture.nativeElement.querySelector('input[name="enabled"]').matches(':disabled')).toBeFalse();
  });

  it('shows a translated save error when the rejection has no usable message', async () => {
    await init();
    component.draft.enabled = true;
    apiService.saveSiemConfig.and.rejectWith({ error: { detail: ' ', message: '' } });
    await component.save();
    expect(component.saveError).toBe(TestBed.inject(TranslationService).t('siem-save-error'));
    expect(component.canSave()).toBeTrue();
  });

  it('saves edited headers and redaction policy without blank header names or removed entries', async () => {
    apiService.getSiemConfig.and.resolveTo(
      buildConfig({
        destinations: [
          {
            id: 'dest-1',
            name: 'Collector',
            enabled: true,
            adapterType: 'otel-otlp-logs',
            endpointUrl: 'https://collector.example',
            headers: { Authorization: '__REDACTED__', 'X-Old': 'remove' },
          },
        ],
      })
    );
    await init();
    component.selectDestination('dest-1');
    component.removeHeader('dest-1', 1);
    component.addHeader('dest-1');
    Object.assign(component.getHeaderEntries('dest-1')[1], { key: ' X-Tenant ', value: 'team-a' });
    component.addHeader('dest-1');
    Object.assign(component.getHeaderEntries('dest-1')[2], { key: '   ', value: 'ignored' });
    component.setActiveTab('policy');
    component.addDenylistPath();
    component.draft.redaction.denylistedPaths[1] = 'actor.apiKey';
    component.removeDenylistPath(0);
    component.draft.redaction.includeIpAddress = true;
    await component.save();
    const payload = apiService.saveSiemConfig.calls.mostRecent().args[0];
    expect(payload.destinations[0].headers).toEqual({ Authorization: '__REDACTED__', 'X-Tenant': 'team-a' });
    expect(payload.redaction.denylistedPaths).toEqual(['actor.apiKey']);
    expect(payload.redaction.includeIpAddress).toBeTrue();
    expect(component.isDirty()).toBeFalse();

    component.removeHeader('dest-1', 1);
    component.removeHeader('dest-1', 0);
    await component.save();
    expect(apiService.saveSiemConfig.calls.mostRecent().args[0].destinations[0].headers).toBeUndefined();
  });

  it('preserves the selected destination on refresh and chooses a valid replacement when it disappears', async () => {
    await init();
    component.addDestination();
    component.addDestination();
    const [first, second] = component.draft.destinations;
    first.endpointUrl = 'https://first.example';
    second.endpointUrl = 'https://second.example';
    apiService.getSiemConfig.and.resolveTo(component.buildConfig());
    await component.refresh();
    expect(component.selectedDestinationId).toBe(second.id);
    component.setActiveTab('overview');
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.siem-dest-list__item').click();
    expect(component.selectedDestinationId).toBe(first.id);
    expect(component.activeTab).toBe('destinations');
    apiService.getSiemConfig.and.resolveTo(buildConfig({ destinations: [second] }));
    await component.refresh();
    expect(component.selectedDestinationId).toBe(second.id);
    apiService.getSiemConfig.and.resolveTo(buildConfig());
    await component.refresh();
    expect(component.selectedDestination).toBeNull();
    expect(component.selectedDestinationId).toBe('');
  });

  it('ignores moves outside the destination list and cleans up test results when the last destination is removed', async () => {
    await init();
    component.addDestination();
    const id = component.selectedDestinationId;
    component.moveDestination(id, -1);
    component.moveDestination(id, 1);
    component.moveDestination('missing', 1);
    expect(component.draft.destinations.map(d => d.id)).toEqual([id]);
    apiService.testDestination.and.resolveTo({ status: 'success' });
    await component.testDestination(id);
    spyOn(window, 'confirm').and.returnValue(true);
    component.removeDestination(id);
    expect(component.selectedDestination).toBeNull();
    expect(component.testStateById[id]).toBeUndefined();
    expect(component.testErrorById[id]).toBeUndefined();
    expect(component.testingById[id]).toBeUndefined();
    await component.testDestination(id);
    expect(apiService.testDestination).toHaveBeenCalledTimes(1);
  });

  it('clears a previous test result while retrying and sends edited headers and redaction with the test', async () => {
    await init();
    component.addDestination();
    const id = component.selectedDestinationId;
    apiService.testDestination.and.resolveTo({ status: 'failed', errorSummary: { code: 'TIMEOUT' } });
    await component.testDestination(id);
    expect(component.testStateById[id].errorSummary).toBe('{"code":"TIMEOUT"}');
    component.addHeader(id);
    Object.assign(component.getHeaderEntries(id)[0], { key: 'X-Tenant', value: 'team-a' });
    component.draft.redaction.includeActorEmail = true;
    let resolveTest!: (result: { status: 'success' }) => void;
    apiService.testDestination.and.returnValue(
      new Promise(resolve => {
        resolveTest = resolve;
      })
    );
    const pendingTest = component.testDestination(id);
    expect(component.testingById[id]).toBeTrue();
    expect(component.testStateById[id]).toBeUndefined();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.siem-dest-editor button.btn-default').disabled).toBeTrue();
    const input = apiService.testDestination.calls.mostRecent().args[0];
    expect(input.destination.headers).toEqual({ 'X-Tenant': 'team-a' });
    expect(input.redaction?.includeActorEmail).toBeTrue();
    resolveTest({ status: 'success' });
    await pendingTest;
    expect(component.testingById[id]).toBeFalse();
    expect(component.testErrorById[id]).toBe('');
    expect(component.testStateById[id].status).toBe('success');
    expect(component.testStateById[id].responseSummary).toBeUndefined();
    expect(component.testStateById[id].errorSummary).toBeUndefined();
  });

  it('navigates event pages to the last partial page and prevents requests beyond either boundary', async () => {
    apiService.getEvents.and.resolveTo({
      rows: [{ eventId: 'event-1', eventType: 'authentication.login.success' }],
      total: 51,
    });
    await init();
    apiService.getEvents.calls.reset();
    await component.onEventPagePrev();
    expect(apiService.getEvents).not.toHaveBeenCalled();
    await component.onEventPageNext();
    expect(component.eventSkip).toBe(25);
    await component.onEventPageNext();
    expect(component.eventSkip).toBe(50);
    await component.onEventPageNext();
    expect(apiService.getEvents).toHaveBeenCalledTimes(2);
    await component.onEventPagePrev();
    expect(apiService.getEvents.calls.mostRecent().args[0]?.offset).toBe(25);
    component.eventFilters = { eventType: 'login', category: 'authentication', deliveryState: 'failed' };
    const submit = new Event('submit', { cancelable: true });
    await component.applyEventFilters(submit);
    expect(submit.defaultPrevented).toBeTrue();
    expect(component.eventSkip).toBe(0);
    await component.clearEventFilters();
    expect(apiService.getEvents.calls.mostRecent().args[0]).toEqual({
      eventType: '',
      category: '',
      deliveryState: '',
      limit: 25,
      offset: 0,
    });
  });

  it('navigates delivery pages and resets pagination when filters are submitted or cleared', async () => {
    apiService.getDeliveryStatus.and.resolveTo({ rows: [{ eventId: 'event-1', status: 'success' }], total: 26 });
    await init();
    apiService.getDeliveryStatus.calls.reset();
    await component.onDeliveryPagePrev();
    expect(apiService.getDeliveryStatus).not.toHaveBeenCalled();
    await component.onDeliveryPageNext();
    expect(component.deliverySkip).toBe(25);
    await component.onDeliveryPageNext();
    expect(apiService.getDeliveryStatus).toHaveBeenCalledTimes(1);
    await component.onDeliveryPagePrev();
    expect(apiService.getDeliveryStatus.calls.mostRecent().args[0]?.offset).toBe(0);
    component.deliveryFilters = { destinationId: 'dest-1', status: 'failed' };
    await component.loadDelivery(25);
    const submit = new Event('submit', { cancelable: true });
    await component.applyDeliveryFilters(submit);
    expect(submit.defaultPrevented).toBeTrue();
    expect(component.deliverySkip).toBe(0);
    await component.clearDeliveryFilters();
    expect(apiService.getDeliveryStatus.calls.mostRecent().args[0]).toEqual({
      destinationId: '',
      status: '',
      limit: 25,
      offset: 0,
    });
  });

  it('clears stale monitoring rows on failure, displays errors independently, and recovers on refresh', async () => {
    apiService.getEvents.and.resolveTo({ rows: [{ eventId: 'stale', deliveryState: 'deadLetter' }], total: 1 });
    apiService.getDeliveryStatus.and.resolveTo({ rows: [{ eventId: 'stale', status: 'failed' }], total: 1 });
    await init();
    apiService.getEvents.and.rejectWith({ error: { detail: 'Event query unavailable' } });
    apiService.getDeliveryStatus.and.rejectWith(new Error('Delivery query unavailable'));
    await component.refresh();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Event query unavailable');
    expect(fixture.nativeElement.textContent).toContain('Delivery query unavailable');
    expect(component.eventResponse).toEqual({ rows: [], total: 0 });
    expect(component.deliveryResponse).toEqual({ rows: [], total: 0 });
    expect(component.loadingEvents).toBeFalse();
    expect(component.loadingDelivery).toBeFalse();
    expect(component.loadError).toBe('');
    apiService.getEvents.and.resolveTo({ rows: [{ eventId: 'new' }], total: 1 });
    apiService.getDeliveryStatus.and.resolveTo({ rows: [], total: 0 });
    await component.refresh();
    expect(component.eventsError).toBe('');
    expect(component.deliveryError).toBe('');
    expect(component.eventResponse.rows[0].eventId).toBe('new');
  });

  it('renders monitoring severity and delivery badges, counts and valid or unparseable timestamps', async () => {
    apiService.getEvents.and.resolveTo({
      rows: [
        {
          eventId: 'e1',
          eventType: 'login',
          severity: 'critical',
          deliveryState: 'deadLetter',
          occurredAt: '2026-10-14T10:15:00',
        },
        { eventId: 'e2', severity: 'error', deliveryState: 'failed', occurredAt: 'invalid-date' },
        { eventId: 'e3', severity: 'warning', deliveryState: 'partial' },
        { eventId: 'e4', severity: 'info', deliveryState: 'pending' },
        { eventId: 'e5', deliveryState: 'ignored' },
        { eventId: 'e6', deliveryState: 'delivered' },
        { eventId: 'e7' },
      ],
      total: 7,
    });
    apiService.getDeliveryStatus.and.resolveTo({
      rows: [
        { eventId: 'e1', status: 'success', adapterType: 'splunk-hec-json', startedAt: '2026-10-14T10:15:00' },
        { eventId: 'e2', status: 'failed', adapterType: 'cef' },
        { eventId: 'e3' },
      ],
      total: 3,
    });
    await init();
    expect(component.deliveredCount).toBe(1);
    expect(component.failedCount).toBe(1);
    expect(component.deadLetterCount).toBe(1);
    const rows: NodeListOf<HTMLTableRowElement> = fixture.nativeElement.querySelectorAll('table:last-of-type tbody tr');
    const loginRow = Array.from(rows).find(row => row.textContent.includes('login'))!;
    expect(loginRow.textContent).toContain('14/10/2026 10:15');
    expect(loginRow.querySelectorAll('.siem-status--danger').length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('invalid-date');
    expect(fixture.nativeElement.querySelector('.siem-status--warning')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.siem-status--info')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.siem-status--muted')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.siem-status--neutral')).not.toBeNull();
    component.setActiveTab('policy');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Splunk HEC JSON');
    expect(fixture.nativeElement.textContent).toContain('CEF');
  });
});
