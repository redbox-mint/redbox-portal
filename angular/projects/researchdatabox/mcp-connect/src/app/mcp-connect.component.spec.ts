import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import {
  ConfigService,
  TranslationService,
  getStubConfigService,
  getStubTranslationService,
} from '@researchdatabox/portal-ng-common';
import { McpConnectComponent } from './mcp-connect.component';
import { McpConnectModule } from './mcp-connect.module';
import { McpConnectApiService, McpSetupStatus } from './mcp-connect-api.service';

describe('MCP connection setup', () => {
  let fixture: ComponentFixture<McpConnectComponent>;
  let component: McpConnectComponent;
  let api: jasmine.SpyObj<McpConnectApiService>;
  const ready: McpSetupStatus = {
    state: 'ready',
    isAdmin: false,
    brand: 'default',
    institutionalLoginUrl: '/default/rdmp/user/login',
    checks: { configuration: true, reporting: true, account: true, records: true },
    recordTypes: ['rdmp', 'dataRecord'],
    recordTypeLabels: { rdmp: '@plan-label', dataRecord: 'Data records' },
    connection: {
      brand: 'default',
      endpoint: 'https://redbox.example/default/mcp',
      issuer: 'https://id.example',
      scope: 'redbox.reporting',
      metadataUrl: 'https://redbox.example/.well-known/oauth-protected-resource/default/mcp',
      clients: {},
    },
  };
  const button = (id: string): HTMLButtonElement => fixture.nativeElement.querySelector(`[data-harness="${id}"]`);
  const renderStatus = async (status: McpSetupStatus) => {
    api.status.and.resolveTo(status);
    await component.refresh();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    localStorage.removeItem('redbox.mcp.assistant');
    api = jasmine.createSpyObj<McpConnectApiService>('McpConnectApiService', ['status', 'waitForInit']);
    api.waitForInit.and.resolveTo(api);
    api.status.and.resolveTo(structuredClone(ready));
    await TestBed.configureTestingModule({
      imports: [McpConnectModule],
      providers: [
        { provide: McpConnectApiService, useValue: api },
        { provide: ConfigService, useValue: getStubConfigService() },
        {
          provide: TranslationService,
          useValue: getStubTranslationService({
            'mcp-schema-verification-prompt':
              'Call get_reporting_schema with recordType {{recordType}} for {{recordTypeLabel}} without retrieving records.',
            '@plan-label': 'Data management plans',
            'rdmp-name-plural': 'Plans',
            'singularType-name': 'Single record',
            'mcp-verify-result': 'It worked if {{name}} lists fields for {{recordType}}.',
            'mcp-copy-command': 'Copy command',
            'mcp-copy-configuration': 'Copy configuration',
            'mcp-copy-field': 'Copy {{field}}',
            'mcp-remote-url': 'Remote MCP server URL',
            'mcp-problem-mcp.resourceUrl': 'Set the public HTTPS endpoint.',
            'mcp-problem-mcp.issuer': 'Set the institutional issuer.',
            'mcp-problem-mcp.jwksUrl': 'Set the signature verification URL.',
            'mcp-problem-mcp.algorithms': 'Allow a supported signing algorithm.',
            'mcp-problem-affects-mcp.jwksUrl': 'Access-token signature validation',
            'mcp-problem-mcpSetup.clients.codex.callbackPort': 'Use a valid local callback port.',
            'mcp-problem-affects-mcpSetup.clients.codex.callbackPort': 'Codex and ChatGPT desktop sign-in',
            'mcp-copied': 'Copied',
            'mcp-copy-failed': 'Select and copy manually',
          }),
        },
      ],
    }).compileComponents();
    TestBed.inject(TranslationService).getCurrentLanguage = () => 'en';
    fixture = TestBed.createComponent(McpConnectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    localStorage.removeItem('redbox.mcp.assistant');
  });

  it('offers six radios, attaches commands to each step and remembers selection', () => {
    expect(fixture.nativeElement.querySelectorAll('[role="radio"]').length).toBe(6);
    expect(button('claude-code').getAttribute('aria-checked')).toBe('true');
    expect(fixture.nativeElement.querySelectorAll('.mcp-stepper li pre').length).toBe(2);
    button('codex').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('[mcp_servers."redbox_reporting_default"]');
    expect(fixture.nativeElement.textContent).toContain("codex mcp login 'redbox_reporting_default'");
    expect(button('codex').tabIndex).toBe(0);
    expect(button('claude-code').tabIndex).toBe(-1);
    expect(localStorage.getItem('redbox.mcp.assistant')).toBe('codex');
    const second = TestBed.createComponent(McpConnectComponent);
    expect(second.componentInstance.selectedHarness).toBe('codex');
    second.destroy();
  });
  it('supports arrow keys, Home and End with focus following the selected radio', () => {
    button('claude-code').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(component.selectedHarness).toBe('codex');
    expect(document.activeElement).toBe(button('codex'));
    button('codex').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    fixture.detectChanges();
    expect(component.selectedHarness).toBe('generic');
    button('generic').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(component.selectedHarness).toBe('claude-code');
  });
  it('falls back safely when stored preferences are invalid or storage is blocked', () => {
    localStorage.setItem('redbox.mcp.assistant', 'invalid');
    const second = TestBed.createComponent(McpConnectComponent);
    expect(second.componentInstance.selectedHarness).toBe('claude-code');
    second.destroy();
    spyOn(Storage.prototype, 'setItem').and.throwError('Blocked');
    expect(() => component.selectHarness('claude')).not.toThrow();
    spyOn(Storage.prototype, 'getItem').and.throwError('Blocked');
    const third = TestBed.createComponent(McpConnectComponent);
    expect(third.componentInstance.selectedHarness).toBe('claude-code');
    third.destroy();
  });
  it('uses the selected authorized record type in a schema-only prompt and hides a redundant picker', async () => {
    const choices = fixture.nativeElement.querySelectorAll('.rb-admin-segmented button');
    choices[1].click();
    fixture.detectChanges();
    expect(component.verificationPrompt).toContain('dataRecord');
    expect(component.verificationPrompt).toContain('get_reporting_schema');
    expect(choices[1].getAttribute('aria-pressed')).toBe('true');
    await renderStatus({ ...ready, recordTypes: ['rdmp'] });
    expect(fixture.nativeElement.querySelector('.rb-admin-segmented')).toBeNull();
  });

  it('uses configured labels, brand translation names and ID fallbacks while preserving the prompt recordType', async () => {
    const choices = fixture.nativeElement.querySelectorAll('.rb-admin-segmented button');
    expect(choices[0].textContent.trim()).toBe('Data management plans');
    expect(component.verificationPrompt).toContain('recordType rdmp for Data management plans');
    expect(fixture.nativeElement.querySelector('.rb-admin-check-success').textContent).toContain(
      'Data management plans'
    );
    choices[1].click();
    fixture.detectChanges();
    expect(component.verificationPrompt).toContain('recordType dataRecord for Data records');
    await renderStatus({ ...ready, recordTypeLabels: {}, recordTypes: ['rdmp', 'customType'] });
    expect(component.recordTypeLabel('rdmp')).toBe('Plans');
    expect(component.recordTypeLabel('customType')).toBe('customType');
    expect(component.recordTypeLabel('singularType')).toBe('Single record');
    component.selectRecordType('customType');
    expect(component.verificationPrompt).toContain('recordType customType');
  });
  it('gives copy controls short contextual names without appending copied content', () => {
    const copyButtons = () =>
      Array.from(fixture.nativeElement.querySelectorAll('.mcp-code-header button')) as HTMLButtonElement[];
    expect(copyButtons()[0].getAttribute('aria-label')).toBe('Copy command');
    expect(copyButtons()[0].textContent).not.toContain('claude mcp add');
    button('codex').click();
    fixture.detectChanges();
    expect(copyButtons()[0].getAttribute('aria-label')).toBe('Copy configuration');
    button('claude').click();
    fixture.detectChanges();
    const row = fixture.nativeElement.querySelectorAll('.mcp-stepper tbody tr')[1];
    expect(row.querySelector('button').getAttribute('aria-label')).toBe('Copy Remote MCP server URL');
    expect(row.querySelector('button').textContent).not.toContain(ready.connection!.endpoint);
    expect(fixture.nativeElement.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
  it('stacks connection rows in narrow steps while retaining table labels and visible copy controls', () => {
    for (const harness of ['claude', 'generic']) {
      button(harness).click();
      fixture.detectChanges();
      const wrapper: HTMLElement = fixture.nativeElement.querySelector('.mcp-connection-fields');
      const table = wrapper.querySelector('table')!;
      expect(wrapper.hasAttribute('tabindex')).toBeFalse();
      expect(table.getAttribute('role')).toBe('table');
      for (const width of [330, 1440]) {
        fixture.nativeElement.style.width = `${width}px`;
        for (const row of Array.from(table.querySelectorAll('tbody tr'))) {
          const label = row.querySelector('th')!;
          const value = row.querySelector('td')!;
          const copy = row.querySelector('button')!;
          expect(label.scope).toBe('row');
          expect(value.getAttribute('headers')).toBe(label.id);
          expect(row.querySelectorAll('button').length).toBe(1);
          expect(copy.getAttribute('aria-label')).toBe(`Copy ${label.textContent!.trim()}`);
          expect(getComputedStyle(row).display).toBe(width === 330 ? 'grid' : 'table-row');
          expect(getComputedStyle(value).whiteSpace).toBe(width === 330 ? 'normal' : 'nowrap');
          if (width === 330) {
            expect(getComputedStyle(value).overflowWrap).toBe('anywhere');
            expect(copy.getBoundingClientRect().right).toBeLessThanOrEqual(wrapper.getBoundingClientRect().right);
          }
        }
        expect(wrapper.scrollWidth).toBe(wrapper.clientWidth);
      }
    }
  });
  it('shows preview and side guidance for the blocking state and administrator role', async () => {
    for (const state of [
      'needs-configuration',
      'reporting-disabled',
      'no-reporting-access',
      'oidc-required',
    ] as const) {
      for (const isAdmin of [true, false]) {
        await renderStatus({ ...ready, state, isAdmin, recordTypes: [] });
        const content = fixture.nativeElement.textContent;
        if (state === 'oidc-required') {
          expect(content).toContain('mcp-after-sign-in');
          expect(content).toContain('mcp-sign-in-help-title');
        } else {
          expect(content).not.toContain('mcp-after-sign-in');
          expect(content).not.toContain('mcp-sign-in-help-title');
          expect(content).toContain(state === 'no-reporting-access' ? 'mcp-after-access' : 'mcp-after-setup');
          expect(content).toContain(
            state === 'no-reporting-access'
              ? 'mcp-reporting-access-help-title'
              : isAdmin
                ? 'mcp-admin-setup-help-title'
                : 'mcp-pending-setup-help-title'
          );
        }
      }
    }
  });
  it('explains known setting paths and their effects, normalizes array indices and falls back for unknown settings', async () => {
    await renderStatus({
      ...ready,
      state: 'needs-configuration',
      isAdmin: true,
      configurationProblems: [
        'mcp.resourceUrl',
        'mcp.issuer',
        'mcp.jwksUrl',
        'mcp.algorithms.0',
        'mcpSetup.clients.codex.callbackPort',
        'mcp.futureSetting',
      ],
    });
    const rows = fixture.nativeElement.querySelectorAll('#mcp-admin-details tbody tr');
    expect(rows[0].textContent).toContain('Set the public HTTPS endpoint.');
    expect(rows[1].textContent).toContain('Set the institutional issuer.');
    expect(rows[2].textContent).toContain('Set the signature verification URL.');
    expect(rows[2].textContent).toContain('Access-token signature validation');
    expect(rows[3].textContent).toContain('Allow a supported signing algorithm.');
    expect(rows[4].textContent).toContain('Use a valid local callback port.');
    expect(rows[4].textContent).toContain('Codex and ChatGPT desktop sign-in');
    expect(rows[5].textContent).toContain('mcp-invalid-setting');
    expect(rows[5].textContent).toContain('mcp-server-setup');
  });
  it('retains content while refreshing, marks the button busy and replaces revoked access', async () => {
    let resolve!: (status: McpSetupStatus) => void;
    api.status.and.returnValue(
      new Promise(done => {
        resolve = done;
      })
    );
    const refreshing = component.refresh();
    fixture.detectChanges();
    expect(button('claude-code')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-busy="true"]').disabled).toBeTrue();
    resolve({ ...ready, state: 'no-reporting-access', recordTypes: [], checks: { ...ready.checks, records: false } });
    await refreshing;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="radiogroup"]')).toBeNull();
    expect(component.selectedRecordType).toBe('');
  });
  it('clears failed-refresh instructions and recovers on retry', async () => {
    api.status.and.rejectWith({ status: 403 });
    await component.refresh();
    fixture.detectChanges();
    expect(component.status).toBeUndefined();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    await renderStatus(ready);
    expect(button('claude-code')).not.toBeNull();
  });
  it('shows a merged Claude connector form and cloud warning; local clients have local help', () => {
    button('claude').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('mcp-cloud-warning');
    expect(fixture.nativeElement.querySelectorAll('.mcp-stepper table').length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('mcp-help-network-title');
    expect(fixture.nativeElement.textContent).not.toContain('mcp-help-local-tools-title');
    button('claude-code').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('mcp-help-local-tools-title');
    expect(fixture.nativeElement.textContent).not.toContain('mcp-cloud-warning');
  });
  it('shows a plugin prerequisite or the configured plugin action on its own step', async () => {
    button('chatgpt-web').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('mcp-plugin-admin-required');
    await renderStatus({
      ...ready,
      connection: { ...ready.connection!, chatgptPluginUrl: 'https://example.org/plugin' },
    });
    expect(fixture.nativeElement.querySelector('.mcp-stepper a.btn-primary').href).toBe('https://example.org/plugin');
  });
  it('gives independent copy feedback, resets it after two seconds and shows nearby failures', fakeAsync(() => {
    const write = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
    void component.copy('endpoint', ready.connection!.endpoint);
    tick();
    fixture.detectChanges();
    expect(component.copyStates['endpoint']).toBe('copied');
    expect(fixture.nativeElement.querySelectorAll('.mcp-copied').length).toBe(1);
    void component.copy('prompt', component.verificationPrompt);
    tick();
    expect(component.copyStates['endpoint']).toBe('copied');
    expect(component.copyStates['prompt']).toBe('copied');
    tick(2001);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.mcp-copied')).toBeNull();
    write.and.rejectWith(new Error('Permission denied'));
    void component.copy('endpoint', ready.connection!.endpoint);
    tick();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#copy-error-endpoint').textContent).toBe('Select and copy manually');
    expect(fixture.nativeElement.querySelector('[aria-live]').textContent).toBe('Select and copy manually');
  }));
  it('renders passed, action and not-checked states, sign-in action and admin-only diagnostics', async () => {
    const blocked: McpSetupStatus = {
      ...ready,
      state: 'oidc-required',
      recordTypes: [],
      checks: { ...ready.checks, account: false, records: false },
    };
    await renderStatus(blocked);
    expect(fixture.nativeElement.querySelectorAll('[data-check-state="passed"]').length).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('[data-check-state="action"]').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('[data-check-state="unchecked"]').length).toBe(1);
    expect(fixture.nativeElement.querySelector('a.btn-primary').getAttribute('href')).toBe(ready.institutionalLoginUrl);
    expect(fixture.nativeElement.querySelector('#mcp-admin-details')).toBeNull();
    await renderStatus({ ...blocked, isAdmin: true, configurationProblems: ['mcp.issuer'] });
    expect(fixture.nativeElement.querySelector('#mcp-admin-details').open).toBeTrue();
    expect(fixture.nativeElement.querySelector('#mcp-admin-details table').textContent).toContain('mcp.issuer');
    expect(fixture.nativeElement.querySelector('[role="radiogroup"]')).toBeNull();
  });
  it('keeps in-page links on the current page despite the layout <base href>', async () => {
    await renderStatus({ ...ready, state: 'needs-configuration', isAdmin: true, configurationProblems: ['mcp.issuer'] });
    const review = fixture.nativeElement.querySelector('a.btn-primary');
    expect(review.getAttribute('href')).toBe(window.location.pathname + window.location.search + '#mcp-admin-details');
    await renderStatus(ready);
    const help = fixture.nativeElement.querySelector('.rb-admin-check-warning a');
    expect(help.getAttribute('href')).toBe(window.location.pathname + window.location.search + '#mcp-help');
  });
  it('copies only allowlisted diagnostic fields and excludes client registrations', async () => {
    await renderStatus({
      ...ready,
      connection: { ...ready.connection!, clients: { claude: { clientId: 'private-registration' } } },
    });
    expect(component.diagnostics).toContain('https://redbox.example/default/mcp');
    expect(component.diagnostics).toContain('ready');
    expect(component.diagnostics).not.toContain('private-registration');
  });
});
