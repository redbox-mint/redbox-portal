import { APP_BASE_HREF } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ConfigService,
  getStubConfigService,
  getStubTranslationService,
  LoggerService,
  RecordService,
  TranslationService,
  UtilityService,
  I18NextPipe,
} from '@researchdatabox/portal-ng-common';
import { RecordAuditComponent } from './record-audit.component';

describe('RecordAuditComponent', () => {
  let fixture: ComponentFixture<RecordAuditComponent>;
  let component: RecordAuditComponent;
  let recordService: jasmine.SpyObj<RecordService>;

  beforeEach(async () => {
    recordService = jasmine.createSpyObj<RecordService>('RecordService', [
      'waitForInit',
      'isInitializing',
      'getRecordAuditTab',
      'getRecordPermissionsTab',
      'getRecordIntegrationAuditTab',
    ]);
    recordService.waitForInit.and.resolveTo(recordService);
    recordService.isInitializing.and.returnValue(false);
    recordService.getRecordAuditTab.and.resolveTo({
      summary: { returnedCount: 2 },
      rawAuditUrl: '/default/rdmp/api/records/audit/oid-1',
      records: [
        {
          id: 'audit-1',
          timestamp: '2026-03-01T00:00:00Z',
          action: 'updated',
          actionLabelKey: '@record-audit-action-updated',
          workflowStageLabel: 'Draft',
          actor: { username: '', name: '', email: '', displayName: 'Unknown' },
          changeSummary: {
            available: true,
            count: 1,
            changes: [{
              kind: 'change',
              path: ['metadata', 'contributors', 0, 'name'],
              pathText: 'metadata.contributors[0].name',
              displayPath: 'contributors[0].name',
              displayName: 'Contributor Name',
              original: 'Old',
              changed: 'New',
            }],
          },
          rawRecord: { metadata: { title: 'Example' } },
        },
        {
          id: 'audit-2',
          timestamp: '2026-02-28T00:00:00Z',
          action: 'created',
          actionLabelKey: '@record-audit-action-created',
          workflowStageLabel: '',
          actor: { username: 'creator', name: 'Creator', email: '', displayName: 'Creator' },
          changeSummary: { available: false, count: 0, changes: [], note: '@record-audit-note-update-only' },
          rawRecord: { metadata: { title: 'Example' } },
        },
      ],
    });
    recordService.getRecordPermissionsTab.and.resolveTo({
      edit: [{ username: 'editor', name: 'Editor', email: 'editor@example.com' }],
      view: [{ username: 'viewer', name: 'Viewer', email: 'viewer@example.com' }],
      editPending: ['pending-editor'],
      viewPending: ['pending-viewer'],
      editRoles: ['Admin'],
      viewRoles: ['Researcher'],
    });
    recordService.getRecordIntegrationAuditTab.and.resolveTo({
      summary: { numFound: 2, page: 1, pageSize: 20, totalPages: 2 },
      records: [{
        id: 'trace-1',
        traceId: 'trace-1',
        startedAt: '2026-03-01T10:00:00Z',
        completedAt: '2026-03-01T10:01:00Z',
        durationMs: 60000,
        status: 'success',
        triggeredBy: 'admin',
        integrationName: 'figshare',
        actions: ['syncRecordWithFigshare', 'publishAfterUploadFilesJob'],
        eventCount: 2,
        rootSpanId: 'span-1',
        events: [
          {
            id: 'event-1',
            redboxOid: 'oid-1',
            startedAt: '2026-03-01T10:00:00Z',
            completedAt: '2026-03-01T10:00:30Z',
            durationMs: 30000,
            status: 'success',
            integrationAction: 'syncRecordWithFigshare',
            traceId: 'trace-1',
            spanId: 'span-1',
            depth: 0,
            hasChildren: true,
          },
          {
            id: 'event-2',
            redboxOid: 'oid-1',
            startedAt: '2026-03-01T10:00:31Z',
            completedAt: '2026-03-01T10:01:00Z',
            durationMs: 29000,
            status: 'success',
            integrationAction: 'publishAfterUploadFilesJob',
            traceId: 'trace-1',
            spanId: 'span-2',
            parentSpanId: 'span-1',
            message: 'Publish completed',
            depth: 1,
            hasChildren: false,
          },
        ],
      }],
    } as any);

    await TestBed.configureTestingModule({
      declarations: [RecordAuditComponent],
      imports: [I18NextPipe],
      providers: [
        LoggerService,
        UtilityService,
        { provide: APP_BASE_HREF, useValue: 'base' },
        { provide: ConfigService, useValue: getStubConfigService() },
        {
          provide: TranslationService,
          useValue: getStubTranslationService({
            '@record-audit-tab-audit-history': 'Audit History',
            '@record-audit-tab-permissions': 'Permissions',
            '@record-audit-tab-integration-audit': 'Integration Audit',
            '@record-audit-action-updated': 'Updated',
            '@record-audit-action-created': 'Created',
            '@record-audit-loading': 'Loading...',
            '@record-audit-error': 'An error occurred loading this tab.',
            '@record-audit-empty': 'No records found.',
            '@record-audit-show-technical-data': 'Show',
            '@record-audit-hide-technical-data': 'Hide',
            '@record-audit-note-update-only': 'Field changes are shown for update events only.',
            '@record-audit-changed-fields-count': '{{count}} field(s) changed',
            '@record-audit-col-updated': 'Updated',
            '@record-audit-col-action': 'Action',
            '@record-audit-col-workflow-state': 'Workflow State',
            '@record-audit-col-updated-by': 'Updated By',
            '@record-audit-col-changed-fields': 'Changed Fields',
            '@record-audit-col-technical-data': 'Technical Data',
            '@record-audit-diff-col-field': 'Field',
            '@record-audit-diff-col-change-type': 'Change Type',
            '@record-audit-diff-col-previous-value': 'Previous Value',
            '@record-audit-diff-col-new-value': 'New Value',
            '@record-audit-diff-col-path': 'Path',
            '@record-audit-permissions-heading-edit': 'Edit Access',
            '@record-audit-permissions-heading-view': 'View Access',
            '@record-audit-permissions-heading-roles': 'Roles',
            '@record-audit-permissions-heading-pending': 'Pending',
            '@record-audit-integration-col-started': 'Started',
            '@record-audit-integration-col-completed': 'Completed',
            '@record-audit-integration-col-duration': 'Duration',
            '@record-audit-integration-col-status': 'Status',
            '@record-audit-integration-col-trace': 'Trace',
            '@record-audit-integration-col-action': 'Action',
            '@record-audit-integration-col-actions': 'Actions',
            '@record-audit-integration-col-event-count': 'Events',
            '@record-audit-integration-col-triggered-by': 'Triggered By',
            '@record-audit-integration-col-message': 'Message',
            '@record-audit-integration-trace-events': 'Trace Events',
            '@tab-nav-previous': 'Previous',
            '@tab-nav-next': 'Next',
          }),
        },
        { provide: RecordService, useValue: recordService },
      ],
    }).compileComponents();
  });

  async function createComponent(attributes: Record<string, string> = {}) {
    fixture = TestBed.createComponent(RecordAuditComponent);
    component = fixture.componentInstance;
    Object.entries(attributes).forEach(([key, value]) => fixture.nativeElement.setAttribute(key, value));
    component.oid = fixture.nativeElement.getAttribute('oid') || component.oid;
    component.branding = fixture.nativeElement.getAttribute('branding') || component.branding;
    component.portal = fixture.nativeElement.getAttribute('portal') || component.portal;
    component.isAdmin = fixture.nativeElement.getAttribute('is-admin') === 'true';
    fixture.detectChanges();
    await component.waitForInit();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('boots from host attributes and loads the audit tab', async () => {
    await createComponent({ oid: 'oid-1', branding: 'default', portal: 'rdmp', 'is-admin': 'false' });

    expect(component.oid).toBe('oid-1');
    expect(component.branding).toBe('default');
    expect(component.portal).toBe('rdmp');
    expect(component.isAdmin).toBeFalse();
    expect(recordService.getRecordAuditTab).toHaveBeenCalledWith('oid-1');
  });

  it('shows only the audit tab for non-admin users', async () => {
    await createComponent({ oid: 'oid-1', 'is-admin': 'false' });

    const navText = fixture.nativeElement.querySelector('.rb-audit-tabs').textContent;
    expect(navText).toContain('Audit History');
    expect(navText).not.toContain('Permissions');
    expect(navText).not.toContain('Integration Audit');
  });

  it('shows admin tabs and lazy-loads them when opened', async () => {
    await createComponent({ oid: 'oid-1', 'is-admin': 'true' });

    await component.activateTab('permissions');
    await component.activateTab('integration');
    fixture.detectChanges();

    expect(recordService.getRecordPermissionsTab).toHaveBeenCalledWith('oid-1');
    expect(recordService.getRecordIntegrationAuditTab).toHaveBeenCalledWith('oid-1', { page: 1, pageSize: 20 });
  });

  it('renders updated entries with change counts and supports expanding diff rows', async () => {
    await createComponent({ oid: 'oid-1', 'is-admin': 'false' });

    expect(fixture.nativeElement.textContent).toContain('1 field(s) changed');
    component.toggleDiff('audit-1');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Contributor Name');
  });

  it('renders actor fallback display names', async () => {
    await createComponent({ oid: 'oid-1', 'is-admin': 'false' });
    expect(fixture.nativeElement.textContent).toContain('Unknown');
  });

  it('loads the next integration page when requested', async () => {
    await createComponent({ oid: 'oid-1', 'is-admin': 'true' });
    recordService.getRecordIntegrationAuditTab.calls.reset();

    await component.loadIntegrationTab(2);

    expect(recordService.getRecordIntegrationAuditTab).toHaveBeenCalledWith('oid-1', { page: 2, pageSize: 20 });
  });

  it('renders trace summaries and expands trace events', async () => {
    await createComponent({ oid: 'oid-1', 'is-admin': 'true' });
    await component.activateTab('integration');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('trace-1');
    expect(fixture.nativeElement.textContent).toContain('syncRecordWithFigshare, publishAfterUploadFilesJob');
    expect(fixture.nativeElement.textContent).toContain('2');

    component.toggleIntegrationTrace('trace-1');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Trace Events');
    expect(fixture.nativeElement.textContent).toContain('publishAfterUploadFilesJob');
  });

  it('shows technical details for an expanded integration event', async () => {
    await createComponent({ oid: 'oid-1', 'is-admin': 'true' });
    await component.activateTab('integration');
    component.toggleIntegrationTrace('trace-1');
    fixture.detectChanges();

    component.toggleIntegrationTechnical('event-2');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Publish completed');
    expect(fixture.nativeElement.textContent).toContain('span-2');
  });

  it('does not issue duplicate integration requests while a tab load is in flight', async () => {
    let resolveIntegration: (value: any) => void;
    const integrationPromise = new Promise(resolve => {
      resolveIntegration = resolve;
    });

    await createComponent({ oid: 'oid-1', 'is-admin': 'true' });
    recordService.getRecordIntegrationAuditTab.calls.reset();
    recordService.getRecordIntegrationAuditTab.and.returnValue(integrationPromise as Promise<any>);

    const firstLoad = component.activateTab('integration');
    const secondLoad = component.activateTab('integration');

    expect(recordService.getRecordIntegrationAuditTab).toHaveBeenCalledTimes(1);

    resolveIntegration!({
      summary: { numFound: 1, page: 1, pageSize: 20, totalPages: 1 },
      records: [],
    });

    await Promise.all([firstLoad, secondLoad]);
  });
});
