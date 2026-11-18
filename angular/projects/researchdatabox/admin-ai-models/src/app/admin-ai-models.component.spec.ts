import { By } from '@angular/platform-browser';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import english from '../../../../../../language-defaults/en/translation.json';
import { TranslationService } from '../../../portal-ng-common/src/lib/translation.service';
import { AdminAiModelsComponent } from './admin-ai-models.component';
import { ModelApiError, ModelApiService } from './model-api.service';
import { ProviderCardComponent } from './provider-card.component';
import { clone, modelDraft } from './model-settings';
import { model, overview } from './test-fixtures';

describe('AI models overview and editors', () => {
  let fixture: ComponentFixture<AdminAiModelsComponent>;
  let component: AdminAiModelsComponent;
  let api: jasmine.SpyObj<ModelApiService>;
  let originalUrl: string;
  const changes = new Subject<void>();
  const t = (key: string, options?: Record<string, unknown> | string): string => {
    const value = typeof options === 'string' ? options : (english as Record<string, string>)[key] || key;
    return value.replace(/{{(\w+)}}/g, (_, name) => String(typeof options === 'object' ? options?.[name] ?? '' : ''));
  };
  beforeEach(async () => {
    originalUrl = location.pathname + location.search + location.hash; history.replaceState(null, '', location.pathname);
    api = jasmine.createSpyObj<ModelApiService>('api', ['waitForInit', 'overview', 'saveConnection', 'testConnection', 'createModel', 'saveModel', 'version', 'publish', 'retire', 'tryPrompt', 'deleteConnection', 'discardDraft', 'deleteModel']);
    api.brandingAndPortalUrl = '/brand/portal'; api.waitForInit.and.resolveTo(api);
    api.overview.and.callFake(async () => clone(overview));
    api.saveModel.and.callFake(async (_id, body) => ({ ...clone(model), ...modelDraft(body) }));
    api.createModel.and.callFake(async body => ({ ...clone(model), ...body, version: 1 }));
    api.version.and.resolveTo({ ...clone(model), id: 'model-v3', version: 3 });
    api.publish.and.resolveTo({ ...clone(model), status: 'published' });
    api.retire.and.resolveTo({ ...clone(model), status: 'retired' });
    api.testConnection.and.resolveTo({ ok: true, secretConfigured: true, checkedAt: '2026-11-17T00:00:00Z', capabilities: {}, latencyMs: 15 });
    api.tryPrompt.and.resolveTo({ output: '<img src=x onerror=alert(1)>', requestedModel: model.modelId, latencyMs: 15 });
    api.deleteModel.and.resolveTo({ deleted: true, uses: [] }); api.deleteConnection.and.resolveTo({ deleted: true, uses: [] }); api.discardDraft.and.resolveTo({ deleted: true, uses: [] });
    await TestBed.configureTestingModule({ imports: [AdminAiModelsComponent], providers: [{ provide: TranslationService, useValue: { t, waitForInit: async () => undefined, isInitializing: () => false, translationChanges$: changes } }] })
      .overrideComponent(AdminAiModelsComponent, { set: { providers: [{ provide: ModelApiService, useValue: api }] } }).compileComponents();
    fixture = TestBed.createComponent(AdminAiModelsComponent); component = fixture.componentInstance;
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); history.replaceState(null, '', originalUrl); });
  const query = <T extends HTMLElement = HTMLElement>(selector: string): T => fixture.nativeElement.querySelector(selector);
  const text = (): string => fixture.nativeElement.textContent;
  const open = (): void => { component.openModel(model.key); fixture.detectChanges(); };
  const provider = (): ProviderCardComponent => fixture.debugElement.query(By.directive(ProviderCardComponent)).componentInstance;

  it('switches between overview and model using the hash without fetching again', () => {
    expect(query('#ai-providers')).toBeTruthy(); open(); expect(location.hash).toContain('model=rdmp');
    component.openOverview(); fixture.detectChanges(); expect(query('#ai-providers')).toBeTruthy();
    expect(api.overview).toHaveBeenCalledTimes(1); expect(fixture.nativeElement.querySelectorAll('h1')).toHaveSize(1);
  });
  it('guides first-time setup and has no overview save bar or section rail', () => {
    component.overview!.connections = []; component.overview!.models = []; component.providers = []; fixture.detectChanges();
    expect(text()).toContain('Add a provider first'); expect(query<HTMLButtonElement>('header button.btn-primary').disabled).toBeTrue();
    expect(query('.rb-admin-save-bar')).toBeNull(); expect(query('.rb-admin-section-rail')).toBeNull();
    component.newModel(); expect(component.editor).toBeFalse();
  });
  it('renders disabled generation without configuration forms', () => {
    component.overview!.enabled = false; fixture.detectChanges(); expect(text()).toContain('AI-assisted drafting is turned off'); expect(query('#ai-providers')).toBeNull();
  });
  it('opens the dedicated provider editor with installed types and a generated key', () => {
    component.addProvider(); fixture.detectChanges(); expect(location.hash).toBe('#provider=new');
    expect(query('ai-provider-card').querySelectorAll('input[type=radio]')).toHaveSize(3);
    provider().changeName('My provider'); fixture.detectChanges(); expect(component.activeProvider!.draft.key).toBe('my-provider');
    expect(query('.rb-admin-save-bar')).toBeTruthy(); expect(query('#ai-models')).toBeNull();
  });
  it('keeps saved keys hidden, supports replacement and preserves the reference', () => {
    component.openProvider('connection-or'); fixture.detectChanges(); const card = provider();
    expect(query<HTMLInputElement>('#provider-key').readOnly).toBeTrue(); expect(query('#provider-api-key')).toBeNull();
    expect(text()).toContain('Set by the server administrator'); card.replaceKey(); fixture.detectChanges();
    expect(query<HTMLInputElement>('#provider-api-key').type).toBe('password'); expect(query<HTMLInputElement>('#provider-api-key').autocomplete).toBe('off');
    card.draft.apiKey = 'replacement'; expect(card.draft.secretRef).toBe('env:OPENROUTER_API_KEY');
  });
  it('requires a key for new API-key providers and uses whole-second time limits', () => {
    component.addProvider(); fixture.detectChanges(); const card = provider(); card.changeName('New');
    card.adapterChange('openrouter'); expect(card.issues['secretRef']).toBeTruthy(); card.draft.apiKey = 'new-key'; expect(card.issues['secretRef']).toBeFalsy();
    card.setTimeoutSeconds(1.5); expect(card.issues['timeoutMs']).toBeTruthy(); card.setTimeoutSeconds(10); expect(card.draft.timeoutMs).toBe(10000);
  });
  it('resets key replacement and validation when switching providers', () => {
    component.openProvider('connection-or'); fixture.detectChanges();
    const card = provider(); card.replaceKey(); card.touch('name');
    spyOn(window, 'confirm').and.returnValue(true);
    component.openProvider('connection-or'); fixture.detectChanges();
    expect(provider()).toBe(card); expect(card.replacing).toBeFalse();
    expect(card.touched.size).toBe(0); expect(query('#provider-api-key')).toBeNull();
  });
  it('submits a replacement once and removes plaintext from local state after save', async () => {
    component.openProvider('connection-or'); component.activeProvider!.draft.apiKey = 'PRIVATE';
    api.saveConnection.and.resolveTo({ ...clone(overview.connections[0]), secretRef: 'appconfig:brand:openrouter' });
    await component.saveProvider(); expect(api.saveConnection).toHaveBeenCalledWith(jasmine.objectContaining({ apiKey: 'PRIVATE' }), 'connection-or');
    expect(component.activeProvider!.draft.apiKey).toBeUndefined(); expect(component.isDirty).toBeFalse();
  });
  it('tests an unsaved provider and displays translated failures', async () => {
    component.openProvider('connection-or'); component.activeProvider!.draft.apiKey = 'DRAFT';
    api.testConnection.and.resolveTo({ ok: false, errorCode: 'GENERATION_PROVIDER_AUTH_FAILED', secretConfigured: true, checkedAt: 'now', capabilities: {}, latencyMs: 12 });
    await component.testProvider(component.activeProvider!); fixture.detectChanges();
    expect(api.testConnection).toHaveBeenCalledWith(jasmine.objectContaining({ apiKey: 'DRAFT' }), 'connection-or');
    expect(text()).toContain('The API key was rejected'); expect(api.saveConnection).not.toHaveBeenCalled();
  });
  it('guards provider navigation with unsaved changes', () => {
    component.openProvider('connection-or'); component.activeProvider!.draft.name = 'Changed';
    spyOn(window, 'confirm').and.returnValue(false); component.openOverview(); expect(component.providerEditor).toBeTrue();
    (window.confirm as jasmine.Spy).and.returnValue(true); component.openOverview(); expect(component.providerEditor).toBeFalse();
  });
  it('preserves dirty provider drafts when navigating the browser hash is refused', () => {
    component.openProvider('connection-or'); component.activeProvider!.draft.name = 'Local'; spyOn(window, 'confirm').and.returnValue(false);
    history.replaceState(null, '', location.pathname); component.onHashChange(); expect(location.hash).toContain('provider=connection-or'); expect(component.activeProvider!.draft.name).toBe('Local');
  });
  it('offers curated friendly model choices and Other for custom identifiers', () => {
    component.newModel(); component.modelName('A new model'); fixture.detectChanges();
    expect(component.modelKey).toBe('a-new-model'); expect(query('#ai-model-picker').textContent).toContain('Claude Haiku 4.5');
    component.pickModel('other'); fixture.detectChanges(); expect(query('#ai-model-id')).toBeTruthy();
  });
  it('uses an explicit provider-default checkbox for creativity', () => {
    open(); component.useDefaultTemperature(true); fixture.detectChanges();
    expect(query('#ai-temperature')).toBeNull(); expect(component.draft!.parameters!.temperature).toBeUndefined();
    component.useDefaultTemperature(false); fixture.detectChanges(); expect(query('#ai-temperature')).toBeTruthy();
  });
  it('shows published settings as a definition list and creates a new editable version', async () => {
    component.openModel('rdmp', 1); fixture.detectChanges(); expect(component.readOnly).toBeTrue();
    expect(query('#ai-model dl')).toBeTruthy(); expect(query('#ai-model input')).toBeNull(); expect(query('.rb-admin-save-bar')).toBeNull();
    await component.newVersion(); expect(api.version).toHaveBeenCalledWith('model-v1'); expect(component.selected?.version).toBe(3);
  });
  it('publishes a locally clean model with the hash the administrator reviewed and reports a stale conflict', async () => {
    open();
    api.publish.and.rejectWith(new ModelApiError(409, 'ai-models-provider-error-generation-target-conflict'));
    await component.publish();
    expect(api.saveModel).not.toHaveBeenCalled();
    expect(api.publish).toHaveBeenCalledWith(model.id, { expectedContentHash: model.contentHash });
    expect(component.conflict).toBeTrue();
  });
  it('saves dirty settings before publishing and stops when the save fails', async () => {
    open(); component.modelName('Updated'); await component.publish(); expect(api.saveModel).toHaveBeenCalled(); expect(api.publish).toHaveBeenCalledWith('model-v2', { expectedContentHash: component.selected!.contentHash });
    component.openModel(model.key); component.modelName('Another'); api.publish.calls.reset(); api.saveModel.and.rejectWith(new ModelApiError(409, 'ai-models-provider-error-generation-target-conflict'));
    await component.publish(); expect(api.publish).not.toHaveBeenCalled(); expect(component.conflict).toBeTrue();
  });
  it('publishes a new model by creating its draft first', async () => {
    component.newModel(); component.modelName('New model'); await component.publish(); expect(api.createModel).toHaveBeenCalled(); expect(api.publish).toHaveBeenCalled();
  });
  it('keeps stale edits and can adopt a fresh content hash explicitly', async () => {
    open(); component.modelName('Local'); api.saveModel.and.rejectWith(new ModelApiError(409, 'ai-models-provider-error-generation-target-conflict'));
    await component.saveDraft(); expect(component.draft!.name).toBe('Local'); await component.reloadConflict(); component.resolveConflict(true);
    expect(component.draft!.name).toBe('Local'); expect(component.conflict).toBeFalse();
  });
  it('shows linked models and blocks deletion of a provider in use', async () => {
    component.askDeleteProvider('connection-or'); fixture.detectChanges(); expect(query('[role=alertdialog] a').getAttribute('href')).toContain('model=rdmp');
    expect(query('.rb-admin-danger-confirm')).toBeNull(); await component.confirmDelete(); expect(api.deleteConnection).not.toHaveBeenCalled();
  });
  it('deletes an unused provider only after the confirmation action', async () => {
    component.askDeleteProvider('connection-br'); expect(api.deleteConnection).not.toHaveBeenCalled(); await component.confirmDelete(); expect(api.deleteConnection).toHaveBeenCalledWith('connection-br'); expect(component.deleteConfirmation).toBeUndefined();
  });
  it('lists profile usage and offers retirement when model deletion is blocked', () => {
    component.overview!.models[0].uses = [{ key: 'profile', name: 'Drafting profile' }]; component.askDeleteModel('rdmp'); fixture.detectChanges();
    expect(query('[role=alertdialog] a').getAttribute('href')).toBe('/brand/portal/admin/ai-profiles#profile=profile');
    expect(query('[role=alertdialog]').textContent).toContain('Drafting profile'); expect(query('.rb-admin-danger-confirm')).toBeNull();
    component.offerRetire(); expect(component.selected?.status).toBe('published'); expect(component.retireConfirmation).toBeTrue();
  });
  it('replaces deletion confirmation with newly discovered server usage', async () => {
    component.askDeleteModel('rdmp'); api.deleteModel.and.resolveTo({ deleted: false, uses: [{ key: 'new', name: 'New profile' }] });
    await component.confirmDelete(); expect(component.deleteConfirmation?.uses[0].name).toBe('New profile');
  });
  it('discards a draft version through its delete route', async () => {
    open(); component.askDiscardDraft(); await component.confirmDelete(); expect(api.discardDraft).toHaveBeenCalledWith('model-v2'); expect(component.editor).toBeFalse();
  });
  it('hides retired-only models from the overview', () => {
    component.overview!.models[0].versions.forEach(v => v.status = 'retired'); fixture.detectChanges(); expect(component.visibleModels).toHaveSize(0); expect(query('[data-model]')).toBeNull();
  });
  it('prefills a synthetic test and renders provider output as text', async () => {
    open(); expect(component.prompt).toContain('synthetic'); await component.runPrompt(); fixture.detectChanges();
    expect(api.tryPrompt).toHaveBeenCalledWith(jasmine.objectContaining({ mode: 'sample' })); expect(query('.ai-prompt-output').textContent).toContain('<img'); expect(query('.ai-prompt-output img')).toBeNull();
    expect(query('#ai-code')).toBeNull(); expect(component.rail.some(s => s.id === 'code')).toBeFalse();
  });
  it('shares the visible cooldown across provider tests and model tests', async () => {
    component.openProvider('connection-or'); await component.testProvider(component.activeProvider!); component.openModel('rdmp'); await component.runPrompt(); expect(api.tryPrompt).not.toHaveBeenCalled();
  });
  it('drops incompatible parameters and routing when changing provider', () => {
    open(); component.draft!.connectionId = 'connection-br'; component.changeConnection(); expect(component.draft!.parameters!.seed).toBeUndefined(); expect(component.draft!.routingPolicy).toEqual({});
  });
  it('warns before leaving a dirty editor', () => {
    open(); component.modelName('Changed'); const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent; component.beforeUnload(event); expect(event.defaultPrevented).toBeTrue();
  });
});
