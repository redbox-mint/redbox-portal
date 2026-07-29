import { APP_BASE_HREF } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { LoggerService, RedboxPortalCoreModule, TranslationService, getStubTranslationService } from '@researchdatabox/portal-ng-common';
import { SiemAdminApiService, SiemConfiguration } from './siem-admin-api.service';
import { SiemAdminComponent } from './siem-admin.component';

function buildConfig(overrides: Partial<SiemConfiguration> = {}): SiemConfiguration {
  return {
    enabled: false,
    destinations: [],
    events: { categories: { authentication: true, authorization: true, userManagement: true, recordLifecycle: true, integrationAudit: true, attachmentAccess: true }, severity: {} },
    redaction: { denylistedPaths: ['password'], maxPayloadBytes: 65536, includeActorEmail: false, includeIpAddress: false, includeUserAgent: false },
    delivery: { batchSize: 50, maxAttempts: 3, retryDelayMs: 60000, retryBackoffMultiplier: 2, deadLetterRetentionDays: 30, nonBlocking: true },
    ...overrides
  };
}

describe('SiemAdminComponent', () => {
  let fixture: ComponentFixture<SiemAdminComponent>;
  let component: SiemAdminComponent;
  let apiService: jasmine.SpyObj<SiemAdminApiService>;

  beforeEach(async () => {
    apiService = jasmine.createSpyObj<SiemAdminApiService>('SiemAdminApiService', ['waitForInit', 'getSiemConfig', 'saveSiemConfig', 'getEvents', 'getDeliveryStatus', 'testDestination', 'getBrandingAndPortalUrl']);
    apiService.waitForInit.and.resolveTo(apiService);
    apiService.getBrandingAndPortalUrl.and.returnValue('base/default/rdmp');
    apiService.getSiemConfig.and.resolveTo(buildConfig());
    apiService.saveSiemConfig.and.callFake((config) => Promise.resolve(config));
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
            'siem-destination-remove-confirm': 'Remove destination "{name}"?'
          })
        },
        { provide: SiemAdminApiService, useValue: apiService }
      ]
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

  it('keeps masked secret values unchanged unless the user edits them', async () => {
    apiService.getSiemConfig.and.resolveTo(buildConfig({
      destinations: [{ id: 'dest-1', name: 'Splunk', enabled: true, adapterType: 'splunk-hec-json', endpointUrl: 'https://splunk.example', token: '__REDACTED__' }]
    }));

    await init();

    expect(component.buildConfig().destinations[0].token).toBe('__REDACTED__');

    component.selectedDestination!.token = 'a-new-token';
    expect(component.buildConfig().destinations[0].token).toBe('a-new-token');
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

    expect(component.showsFormatOptionsField('leef')).toBeTrue();
    expect(component.showsFormatOptionsField('splunk-hec-json')).toBeFalse();
  });

  it('tests the selected unsaved destination draft and stores the result', async () => {
    apiService.getSiemConfig.and.resolveTo(buildConfig({
      destinations: [{ id: 'dest-1', name: 'Splunk', enabled: true, adapterType: 'splunk-hec-json', endpointUrl: 'https://splunk.example' }]
    }));
    apiService.testDestination.and.resolveTo({ status: 'success', httpStatusCode: 200, durationMs: 120, responseSummary: { code: 0 } });

    await init();

    component.selectedDestination!.endpointUrl = 'https://changed.example';
    await component.testDestination('dest-1');

    const arg = apiService.testDestination.calls.mostRecent().args[0];
    expect(arg.destination.endpointUrl).toBe('https://changed.example');
    expect(component.testStateById['dest-1'].status).toBe('success');
    expect(component.testStateById['dest-1'].responseSummary).toContain('"code":0');
  });

  it('strips the stack trace from a failed test error summary', async () => {
    apiService.getSiemConfig.and.resolveTo(buildConfig({
      destinations: [{ id: 'dest-1', name: 'Splunk', enabled: true, adapterType: 'splunk-hec-json', endpointUrl: 'https://bad.example' }]
    }));
    apiService.testDestination.and.resolveTo({
      status: 'failed',
      errorSummary: { message: '(FiberFailure) Error: getaddrinfo ENOTFOUND bad.example\n    at catch (/opt/redbox/x.ts:110:16)\n    at body (/opt/redbox/y.ts:786:14)' }
    });

    await init();
    await component.testDestination('dest-1');

    const summary = component.testStateById['dest-1'].errorSummary;
    expect(summary).toBe('(FiberFailure) Error: getaddrinfo ENOTFOUND bad.example');
    expect(summary).not.toContain('at catch');
    expect(summary).not.toContain('/opt/redbox');
  });

  it('records a test error when testing fails', async () => {
    apiService.getSiemConfig.and.resolveTo(buildConfig({
      destinations: [{ id: 'dest-1', name: 'Splunk', enabled: true, adapterType: 'splunk-hec-json', endpointUrl: 'https://splunk.example' }]
    }));
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
      skip: 0
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
      skip: 0
    });
  });

  it('flags invalid formatOptions JSON and blocks saving', async () => {
    apiService.getSiemConfig.and.resolveTo(buildConfig({
      destinations: [{ id: 'dest-1', name: 'Syslog', enabled: true, adapterType: 'cef', endpointUrl: 'https://syslog.example' }]
    }));

    await init();

    component.updateFormatOptionsText('dest-1', '{ not valid');
    expect(component.hasFormatOptionsError()).toBeTrue();
    expect(component.canSave()).toBeFalse();

    component.updateFormatOptionsText('dest-1', '{ "facility": 1 }');
    expect(component.hasFormatOptionsError()).toBeFalse();
    expect(component.buildConfig().destinations[0].formatOptions).toEqual({ facility: 1 });
  });
});
