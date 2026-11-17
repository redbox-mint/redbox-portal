import { By } from '@angular/platform-browser';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import english from '../../../../../../language-defaults/en/translation.json';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import { AdminAiModelsComponent } from './admin-ai-models.component';
import { ModelApiError, ModelApiService } from './model-api.service';
import { ProviderCardComponent } from './provider-card.component';
import { clone, modelDraft } from './model-settings';
import { model, overview } from './test-fixtures';

const wording: Record<string, string> = {
  'ai-models-check-key-found': english['ai-models-check-key-found'],
  'ai-models-check-key-missing': english['ai-models-check-key-missing'],
  'ai-models-check-settings-accepted': english['ai-models-check-settings-accepted'],
  'ai-models-test-hint': english['ai-models-test-hint'],
  'ai-models-adapter-openrouter': english['ai-models-adapter-openrouter'],
};

describe('AI models overview and editor', () => {
  let fixture: ComponentFixture<AdminAiModelsComponent>;
  let component: AdminAiModelsComponent;
  let api: jasmine.SpyObj<ModelApiService>;
  let originalUrl: string;
  const changes = new Subject<void>();
  const t = (key: string, options?: Record<string, unknown> | string): string => (typeof options === 'string' ? options : wording[key] || key).replace(/{{(\w+)}}/g, (_, name) => String(typeof options === 'object' ? options?.[name] ?? '' : ''));
  beforeEach(async () => {
    originalUrl = location.pathname + location.search + location.hash;
    history.replaceState(null, '', location.pathname);
    api = jasmine.createSpyObj<ModelApiService>('api', ['waitForInit', 'overview', 'saveConnection', 'testConnection', 'createModel', 'saveModel', 'version', 'publish', 'retire', 'tryPrompt']);
    api.brandingAndPortalUrl = '/brand/portal'; api.waitForInit.and.resolveTo(api);
    api.overview.and.callFake(async () => clone(overview));
    api.saveModel.and.callFake(async (_id, body) => ({ ...clone(model), ...modelDraft(body) }));
    api.createModel.and.callFake(async body => ({ ...clone(model), ...body, version: 1 }));
    api.version.and.resolveTo({ ...clone(model), id: 'model-v3', version: 3 });
    api.publish.and.resolveTo({ ...clone(model), status: 'published' });
    api.testConnection.and.resolveTo({ ok: true, secretConfigured: true, checkedAt: '2026-11-17T00:00:00Z', capabilities: { structuredOutput: true } });
    api.tryPrompt.and.resolveTo({ output: '<img src=x onerror=alert(1)>', requestedModel: model.modelId, actualModel: 'actual', actualProvider: 'provider', finishReason: 'stop', usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5, cost: 0.001 }, latencyMs: 15 });
    await TestBed.configureTestingModule({ imports: [AdminAiModelsComponent], providers: [{ provide: TranslationService, useValue: { t, waitForInit: async () => undefined, isInitializing: () => false, translationChanges$: changes } }] })
      .overrideComponent(AdminAiModelsComponent, { set: { providers: [{ provide: ModelApiService, useValue: api }] } }).compileComponents();
    fixture = TestBed.createComponent(AdminAiModelsComponent); component = fixture.componentInstance;
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); history.replaceState(null, '', originalUrl); });
  const query = <T extends HTMLElement = HTMLElement>(selector: string): T => fixture.nativeElement.querySelector(selector);
  const text = (): string => fixture.nativeElement.textContent;
  const open = (): void => { component.openModel(model.key); fixture.detectChanges(); };

  it('fetches once and switches views through the hash without another read', () => {
    expect(query('#ai-providers')).toBeTruthy(); open();
    expect(query('#ai-model')).toBeTruthy(); expect(location.hash).toContain('model=rdmp');
    component.openOverview(); fixture.detectChanges(); expect(query('#ai-providers')).toBeTruthy();
    expect(api.overview).toHaveBeenCalledTimes(1); expect(fixture.nativeElement.querySelectorAll('h1')).toHaveSize(1);
  });
  it('shows first-run states and disables adding a model with a visible reason', () => {
    component.overview!.connections = []; component.overview!.models = []; component.providers = []; fixture.detectChanges();
    expect(text()).toContain('ai-models-providers-empty'); expect(text()).toContain('ai-models-models-empty');
    expect(query<HTMLButtonElement>('header button.btn-primary').disabled).toBeTrue();
    expect(query('#ai-add-model-hint').textContent).toContain('ai-models-no-enabled-connection');
    component.newModel(); expect(component.editor).toBeFalse();
  });
  it('shows the disabled-generation empty state', () => {
    component.overview!.enabled = false; fixture.detectChanges(); expect(text()).toContain('ai-models-disabled-title'); expect(query('#ai-providers')).toBeNull();
  });
  it('adds an expanded provider at the top with installed adapter choices and derived keys', () => {
    component.addProvider(); fixture.detectChanges(); const card = query<HTMLDetailsElement>('[data-provider="new"]');
    expect(card.open).toBeTrue(); expect(card.querySelectorAll('input[type=radio]')).toHaveSize(3);
    component.providerName(component.providers[0], 'My provider'); expect(component.providers[0].draft.key).toBe('my-provider');
    component.providers[0].keyEdited = true; component.providerName(component.providers[0], 'Changed'); expect(component.providers[0].draft.key).toBe('my-provider');
  });
  it('locks saved provider keys', () => expect(query<HTMLInputElement>('#provider-key-connection-or').readOnly).toBeTrue());
  it('creates a model with an editable derived key and local suggestions', () => {
    component.newModel(); component.modelName('A new model'); fixture.detectChanges();
    expect(component.modelKey).toBe('a-new-model'); expect(query<HTMLInputElement>('#ai-model-key').readOnly).toBeFalse();
    expect(query('datalist').querySelectorAll('option').length).toBeGreaterThan(0); expect(api.overview).toHaveBeenCalledTimes(1);
  });
  it('saves a new model, locks the key and refreshes the overview', async () => {
    component.newModel(); component.modelName('A new model'); component.draft!.modelId = model.modelId;
    await component.saveDraft(); fixture.detectChanges();
    expect(api.createModel).toHaveBeenCalledWith(jasmine.objectContaining({ key: 'a-new-model' }));
    expect(component.isNew).toBeFalse(); expect(query<HTMLInputElement>('#ai-model-key').readOnly).toBeTrue(); expect(api.overview).toHaveBeenCalledTimes(2);
  });
  it('shows published versions as read-only and copies them to a new draft', async () => {
    component.openModel('rdmp', 1); fixture.detectChanges(); expect(component.readOnly).toBeTrue();
    expect(query<HTMLFieldSetElement>('#ai-model fieldset').disabled).toBeTrue(); expect(query('.rb-admin-save-bar')).toBeNull();
    await component.newVersion(); expect(api.version).toHaveBeenCalledWith('model-v1'); expect(component.selected?.version).toBe(3); expect(component.readOnly).toBeFalse();
  });
  it('saves only editable fields with the exact concurrency hash', async () => {
    open(); component.modelName('Edited'); await component.saveDraft();
    expect(api.saveModel).toHaveBeenCalledWith('model-v2', { ...modelDraft(component.draft!), expectedContentHash: model.contentHash }); expect(component.isDirty).toBeFalse();
  });
  it('publishes only saved valid drafts', async () => {
    open(); component.modelName('Unsaved'); expect(component.canPublish).toBeFalse(); await component.publish(); expect(api.publish).not.toHaveBeenCalled();
    await component.saveDraft(); await component.publish(); expect(api.publish).toHaveBeenCalledWith('model-v2'); expect(component.readOnly).toBeTrue();
  });
  it('disables save and publish and shows validation inline', () => {
    open(); component.setNumber('temperature', 3); fixture.detectChanges();
    expect(query('#ai-temperature-error').textContent).toContain('ai-models-validation-range');
    expect(query<HTMLButtonElement>('.rb-admin-save-bar .btn-primary').disabled).toBeTrue(); expect(component.canPublish).toBeFalse();
  });
  it('clears unsupported settings when switching to Bedrock and hides routing and penalties', async () => {
    open(); component.draft!.connectionId = 'connection-br'; component.changeConnection(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(component.draft!.parameters?.seed).toBeUndefined(); expect(component.draft!.parameters?.presencePenalty).toBeUndefined();
    expect(component.draft!.routingPolicy).toEqual({}); expect(query('#ai-routing')).toBeNull(); expect(query('#ai-setting-presencePenalty')).toBeNull();
    expect(query('#ai-setting-seed')).toBeNull(); expect(query('.ai-support-matrix').textContent).toContain('ai-models-support-hint');
  });
  it('updates SDK code from the unsaved draft', () => {
    open(); component.setNumber('maxOutputTokens', 99); fixture.detectChanges(); expect(query('.ai-sdk-code').textContent).toContain('"max_tokens": 99');
  });
  it('blocks view and external hash changes when discard is rejected', () => {
    open(); component.modelName('Keep me'); spyOn(window, 'confirm').and.returnValue(false); component.openOverview(); expect(component.draft!.name).toBe('Keep me');
    const accepted = location.hash; history.pushState(null, '', location.pathname + '#model=other'); component.onHashChange();
    expect(location.hash).toBe(accepted); expect(component.draft!.name).toBe('Keep me');
  });
  it('permits section anchors without discarding and tracks the current rail link', () => {
    open(); component.modelName('Keep me'); const confirm = spyOn(window, 'confirm'); component.goSection('response'); fixture.detectChanges();
    expect(component.draft!.name).toBe('Keep me'); expect(confirm).not.toHaveBeenCalled();
    expect(query('nav.rb-admin-section-rail a[aria-current]').textContent).toContain('ai-models-section-response'); expect(location.hash).toContain('section=response');
  });
  it('restores the saved draft after discard confirmation', () => {
    open(); component.modelName('Discard me'); spyOn(window, 'confirm').and.returnValue(true); component.discard(); expect(component.draft!.name).toBe(model.name); expect(component.isDirty).toBeFalse();
  });
  it('guards unload and same-tab external navigation', () => {
    open(); component.modelName('Unsaved'); const event = { preventDefault: jasmine.createSpy(), returnValue: undefined } as unknown as BeforeUnloadEvent;
    component.beforeUnload(event); expect(event.preventDefault).toHaveBeenCalled();
    const anchor = document.createElement('a'); anchor.href = '/elsewhere'; fixture.nativeElement.appendChild(anchor);
    spyOn(window, 'confirm').and.returnValue(false); const click = new MouseEvent('click', { bubbles: true, cancelable: true }); anchor.dispatchEvent(click); expect(click.defaultPrevented).toBeTrue();
  });
  it('keeps local edits after 409 and reloads the remote version for comparison', async () => {
    open(); component.modelName('My edits'); api.saveModel.and.rejectWith(new ModelApiError(409, 'ai-models-error-generation-target-conflict'));
    await component.saveDraft(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); expect(query('#ai-conflict')).toBeTruthy(); expect(query<HTMLInputElement>('#ai-model-name').value).toBe('My edits');
    await component.reloadConflict(); fixture.detectChanges(); expect(component.draft!.name).toBe('My edits'); expect(component.remote?.name).toBe(model.name);
    component.resolveConflict(true); expect(component.draft!.name).toBe('My edits'); expect(component.conflict).toBeFalse();
  });
  it('renders separate readiness checks in a live region without claiming a provider response', async () => {
    await component.testProvider(component.providers[0]); fixture.detectChanges(); const results = query('.ai-connection-results');
    expect(results.getAttribute('aria-live')).toBe('polite'); expect(results.textContent).toContain('Key found on server');
    expect(results.textContent).toContain('Settings accepted by the OpenRouter adapter'); expect(text()).toContain('Try a prompt in a model is the live check');
    expect(results.textContent).not.toMatch(/Provider responded|latency|\d+ ms/);
  });
  it('clears edited provider results and ignores stale in-flight results', async () => {
    let resolve!: (value: any) => void; api.testConnection.and.returnValue(new Promise(done => resolve = done));
    const item = component.providers[0]; const pending = component.testProvider(item); item.draft.name = 'Changed during check';
    resolve({ ok: true, secretConfigured: true, checkedAt: 'now', capabilities: {} }); await pending; expect(item.health).toBeUndefined();
    const provider = fixture.debugElement.query(By.directive(ProviderCardComponent)).componentInstance as ProviderCardComponent;
    item.health = { ok: true, secretConfigured: true, checkedAt: 'now', capabilities: {} }; provider.edit(); expect(item.health).toBeUndefined();
  });
  it('shares cooldown between connection tests and prompt trials', async () => {
    await component.testProvider(component.providers[0]); open(); component.prompt = 'Synthetic prompt'; expect(component.cooldown).toBeGreaterThan(0);
    await component.runPrompt(); expect(api.tryPrompt).not.toHaveBeenCalled();
  });
  it('renders prompt output as text with metadata and clears it when the draft changes', async () => {
    open(); component.prompt = 'Synthetic prompt'; await component.runPrompt(); fixture.detectChanges(); const result = query('[data-testid="prompt-result"]');
    expect(result.querySelector('pre')!.textContent).toBe('<img src=x onerror=alert(1)>'); expect(result.querySelector('img')).toBeNull();
    expect(result.textContent).toContain('actual'); expect(result.textContent).toContain('provider'); expect(result.textContent).toContain('stop');
    expect(api.tryPrompt).toHaveBeenCalledWith({ draft: modelDraft(model), prompt: 'Synthetic prompt', mode: 'sample' });
    component.setNumber('temperature', 0.4); expect(component.promptResult).toBeUndefined();
  });
  it('supports plain text mode and enforces the character limit', async () => {
    open(); component.mode = 'text'; component.prompt = 'a'.repeat(2001); expect(component.canRun).toBeFalse(); component.prompt = 'Synthetic'; fixture.detectChanges();
    expect(query<HTMLTextAreaElement>('#ai-prompt').maxLength).toBe(2000); await component.runPrompt(); expect(api.tryPrompt.calls.mostRecent().args[0].mode).toBe('text');
  });
  it('ignores results if the prompt changes while running', async () => {
    let resolve!: (value: any) => void; api.tryPrompt.and.returnValue(new Promise(done => resolve = done));
    open(); component.prompt = 'before'; const pending = component.runPrompt(); component.prompt = 'after'; component.changed(); resolve({ output: 'old' }); await pending; expect(component.promptResult).toBeUndefined();
  });
  it('shows server message keys inline on prompt failure', async () => {
    api.tryPrompt.and.rejectWith(new ModelApiError(503, 'ai-models-error-generation-provider-auth-failed'));
    open(); component.prompt = 'Synthetic'; await component.runPrompt(); fixture.detectChanges(); expect(text()).toContain('ai-models-error-generation-provider-auth-failed'); expect(component.promptResult).toBeUndefined();
  });
  it('preserves provider edits when reloading a save conflict', async () => {
    component.providers[0].draft.name = 'My provider edits';
    api.saveConnection.and.rejectWith(new ModelApiError(409, 'ai-models-error-generation-target-conflict'));
    await component.saveProviders(); expect(component.conflict).toBeTrue();
    await component.reloadConflict(); expect(component.providers[0].draft.name).toBe('My provider edits');
    expect(component.isDirty).toBeTrue();
  });
  it('reports duplicate non-secret headers and prevents saving', () => {
    const provider = fixture.debugElement.query(By.directive(ProviderCardComponent)).componentInstance as ProviderCardComponent;
    provider.headers = [{ name: 'X-Title', value: 'one' }, { name: 'x-title', value: 'two' }];
    provider.updateHeaders(); expect(component.providersInvalid).toBeTrue(); expect(provider.invalid).toBeTrue();
  });
  it('reports whether SDK code was copied', async () => {
    open(); const clipboard = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
    await component.copyCode(); expect(clipboard).toHaveBeenCalledWith(component.code); expect(component.copyStatus).toBe('ai-models-copied');
    clipboard.and.rejectWith(new Error('Unavailable')); await component.copyCode(); expect(component.copyStatus).toBe('ai-models-copy-failed');
  });

  it('derives provider keys through actual input events until the key is edited', async () => {
    component.addProvider(); fixture.detectChanges(); await fixture.whenStable();
    const name = query<HTMLInputElement>('#provider-name-new');
    const key = query<HTMLInputElement>('#provider-key-new');
    name.value = 'Sydney research'; name.dispatchEvent(new Event('input')); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(key.value).toBe('sydney-research');
    key.value = 'custom-key'; key.dispatchEvent(new Event('input')); fixture.detectChanges(); await fixture.whenStable();
    name.value = 'Renamed'; name.dispatchEvent(new Event('input')); fixture.detectChanges(); await fixture.whenStable();
    expect(component.providers[0].draft.key).toBe('custom-key');
  });
  it('waits for blur or a save attempt before showing provider validation', async () => {
    component.addProvider(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(query('#provider-name-error-new').textContent).toBe('');
    query('#provider-name-new').dispatchEvent(new Event('blur')); fixture.detectChanges();
    expect(query('#provider-name-error-new').textContent).toContain('ai-models-validation-name');
    expect(query('#provider-key-error-new').textContent).toBe('');
    await component.saveProviders(); fixture.detectChanges();
    expect(query('#provider-key-error-new').textContent).toContain('ai-models-validation-key');
    expect(api.saveConnection).not.toHaveBeenCalled();
  });
  it('displays connection limits in seconds and submits milliseconds with Sydney as the Bedrock default', async () => {
    component.overview!.adapters = ['bedrock']; component.overview!.bedrockRegions = ['us-east-1', 'ap-southeast-2'];
    component.addProvider(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(component.providers[0].draft.region).toBe('ap-southeast-2');
    const timeout = query<HTMLInputElement>('#timeout-new'); expect(timeout.value).toBe('90');
    timeout.value = '12.5'; timeout.dispatchEvent(new Event('input')); fixture.detectChanges(); await fixture.whenStable();
    expect(component.providers[0].draft.timeoutMs).toBe(12500);
  });
  it('uses setup status before tests and readiness status only for healthy enabled connections', () => {
    expect(component.statusKey).toBe('ai-models-status-untested');
    component.overview!.connections[0].lastHealthStatus = 'healthy'; expect(component.statusKey).toBe('ai-models-status-ready');
    expect(component.readyConnections.length).toBe(1); component.overview!.connections[0].enabled = false;
    expect(component.readyConnections.length).toBe(0);
  });
  it('replaces demo controls and SDK code with concise notes without changing fixed answers', () => {
    const fixtureResponse = { answers: { title: { value: 'Fixed answer' } } };
    component.overview!.connections[0].adapterId = 'fake'; open(); component.draft!.parameters = { fixtureResponse }; fixture.detectChanges();
    expect(query('#ai-response .alert-info').textContent).toContain('ai-models-demo-settings');
    expect(query('#ai-response input')).toBeNull(); expect(query('.ai-sdk-code')).toBeNull();
    expect(component.fixtureFieldCount).toBe(1); expect(component.draft!.parameters.fixtureResponse).toEqual(fixtureResponse);
  });
  it('keeps published trials usable with styled segments and a cooldown label', async () => {
    component.openModel('rdmp', 1); component.prompt = 'Synthetic'; fixture.detectChanges();
    expect(query('#ai-try .rb-admin-segmented .btn[aria-pressed="true"]')).toBeTruthy();
    const run = query<HTMLButtonElement>('#ai-try button.btn-outline-secondary:not([aria-pressed])');
    expect(run.disabled).toBeFalse(); await component.runPrompt(); fixture.detectChanges();
    expect(run.disabled).toBeTrue(); expect(run.textContent).toContain('ai-models-cooldown');
  });
  it('formats publication dates and identifies the publisher and current version', () => {
    const version = component.overview!.models[0].versions[1]; version.publishedAt = '2026-11-17T00:00:00Z'; version.publishedBy = 'bootstrap';
    component.openModel('rdmp', 1); fixture.detectChanges();
    expect(query('#ai-versions').textContent).toContain('17/11/2026');
    expect(query('#ai-versions').textContent).toContain('ai-models-published-by');
    expect(query('#ai-versions [aria-current="true"]')).toBeTruthy();
    expect(query('.ai-current-version')).toBeTruthy();
  });
  it('requires modal confirmation before retiring and permits cancellation', async () => {
    open(); await component.retire(); expect(api.retire).not.toHaveBeenCalled();
    query<HTMLButtonElement>('#ai-versions button.btn-outline-danger').click(); fixture.detectChanges();
    const modal = query('[role="alertdialog"]'); expect(modal).toBeTruthy();
    modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); fixture.detectChanges();
    expect(query('[role="alertdialog"]')).toBeNull(); expect(api.retire).not.toHaveBeenCalled();
    query<HTMLButtonElement>('#ai-versions button.btn-outline-danger').click(); fixture.detectChanges();
    api.retire.and.resolveTo({ ...clone(model), status: 'retired' });
    query<HTMLButtonElement>('[role="alertdialog"] .rb-admin-danger-confirm').click(); await fixture.whenStable(); fixture.detectChanges();
    expect(api.retire).toHaveBeenCalledOnceWith(model.id); expect(query('[role="alertdialog"]')).toBeNull();
  });

});
