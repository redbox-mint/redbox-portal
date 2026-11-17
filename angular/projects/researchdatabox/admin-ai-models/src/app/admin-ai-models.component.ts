import { Component, ElementRef, HostListener, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { I18NextPipe, TranslationService } from '@researchdatabox/portal-ng-common';
import type {
  GenerationAdminOverview, GenerationAdminModelDraft, GenerationAdminModelVersion,
  GenerationAdminConnection, GenerationAdminPromptResult,
} from '@researchdatabox/sails-ng-common';
import { ModelApiService, ModelApiError } from './model-api.service';
import { ProviderCardComponent, ProviderDraft } from './provider-card.component';
import { ChipsComponent } from './chips.component';
import { accepts, adapterLabels, clone, connectionDraft, curatedModels, Issues, modelDraft, numericSettings, NumericSetting, sdkCode, slug, validateConnection, validateModel, validKey } from './model-settings';

type RailSection = { id: string; key: string };
@Component({
  selector: 'admin-ai-models', standalone: true,
  imports: [CommonModule, FormsModule, I18NextPipe, ProviderCardComponent, ChipsComponent],
  providers: [ModelApiService], templateUrl: './admin-ai-models.component.html',
  // Styles intentionally scope under the existing EJS .rb-admin shell, including child controls.
  encapsulation: ViewEncapsulation.None,
})
export class AdminAiModelsComponent implements OnInit, OnDestroy {
  overview?: GenerationAdminOverview;
  providers: ProviderDraft[] = [];
  draft?: GenerationAdminModelDraft;
  selected?: GenerationAdminModelVersion;
  modelKey = '';
  keyEdited = false;
  isNew = false;
  savedModelJson = '';
  error = '';
  notice = '';
  loading = true;
  busy = false;
  conflict = false;
  remote?: GenerationAdminModelVersion;
  prompt = '';
  mode: 'sample' | 'text' = 'sample';
  promptResult?: GenerationAdminPromptResult;
  promptError = '';
  running = false;
  copyStatus = '';
  cooldown = 0;
  activeSection = 'providers';
  private cooldownUntil = 0;
  private timer?: ReturnType<typeof setInterval>;
  private acceptedHash = '';
  private allowLeave = false;
  private disposed = false;
  private scrollFrame = 0;
  readonly adapterLabels = adapterLabels;
  readonly numericSettings = numericSettings;
  readonly routingLists = ['only', 'ignore', 'order'] as const;
  readonly allSettings = ['temperature', ...numericSettings, 'stopSequences'];
  readonly otherProviders = [
    { key: 'compatible', package: '@ai-sdk/openai-compatible', status: 'adapter-needed' },
    { key: 'openai', package: '@ai-sdk/openai', status: 'not-installed' },
    { key: 'anthropic', package: '@ai-sdk/anthropic', status: 'not-installed' },
    { key: 'azure', package: '@ai-sdk/azure', status: 'not-installed' },
    { key: 'vertex', package: '@ai-sdk/google-vertex', status: 'not-installed' },
  ];
  readonly fixedRows = ['schema', 'streaming', 'tools', 'telemetry', 'redirects', 'retries'];

  constructor(public api: ModelApiService, private i18n: TranslationService, private host: ElementRef<HTMLElement>) {}
  async ngOnInit(): Promise<void> {
    try {
      await Promise.all([this.api.waitForInit(), this.i18n.waitForInit()]);
      await this.refresh();
      this.applyHash(window.location.hash);
      const section = new URLSearchParams(window.location.hash.slice(1)).get('section');
      if (section) requestAnimationFrame(() => this.goSection(section, false));
    } catch (error) { this.handle(error); }
    finally { this.loading = false; }
  }
  ngOnDestroy(): void {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    cancelAnimationFrame(this.scrollFrame);
  }
  get baseUrl(): string { return this.api.brandingAndPortalUrl; }
  get editor(): boolean { return !!this.draft; }
  get readOnly(): boolean { return !!this.selected && this.selected.status !== 'draft'; }
  get connection(): GenerationAdminConnection | undefined { return this.overview?.connections.find(c => c.id === this.draft?.connectionId); }
  get adapter(): string { return this.connection?.adapterId ?? ''; }
  get modelOptions(): string[] { return curatedModels[this.adapter] ?? []; }
  get enabledConnections(): GenerationAdminConnection[] { return this.overview?.connections.filter(c => c.enabled) ?? []; }
  get versions(): GenerationAdminModelVersion[] { return this.overview?.models.find(m => m.key === this.modelKey)?.versions ?? []; }
  get modelIssues(): Issues {
    if (!this.draft) return {};
    const issues = validateModel(this.draft, this.connection);
    if (this.isNew && !validKey(this.modelKey)) issues['key'] = 'ai-models-validation-key';
    if (this.isNew && this.overview?.models.some(m => m.key === this.modelKey)) issues['key'] = 'ai-models-validation-key-used';
    return issues;
  }
  get providersInvalid(): boolean {
    return this.providers.some(p => p.invalidHeaders || this.providerKeyUsed(p) || !this.overview || Object.keys(validateConnection(p.draft, this.overview)).length > 0) ||
      new Set(this.providers.map(p => p.draft.key)).size !== this.providers.length;
  }
  get modelJson(): string { return JSON.stringify({ key: this.modelKey, draft: this.draft }); }
  get isDirty(): boolean {
    return this.editor ? this.modelJson !== this.savedModelJson : this.providers.some(p => !p.id || JSON.stringify(p.draft) !== p.savedJson);
  }
  get code(): string { return this.draft ? sdkCode(this.draft, this.connection) : ''; }
  get rail(): RailSection[] {
    const ids = this.editor ? ['model', 'response', ...(this.adapter === 'openrouter' ? ['routing'] : []), 'try', 'code', 'versions'] : ['providers', 'models', 'limits', 'fixed'];
    return ids.map(id => ({ id, key: 'ai-models-section-' + id }));
  }
  get canRun(): boolean { return !!this.draft && !Object.keys(this.modelIssues).length && !!this.prompt.trim() && this.prompt.length <= (this.overview?.limits.maxPromptChars ?? 2000); }
  get canPublish(): boolean { return !!this.selected && !this.readOnly && !this.isDirty && !this.conflict && !Object.keys(this.modelIssues).length; }
  accepts(setting: string): boolean { return accepts(this.adapter, setting); }
  supported(adapter: string, setting: string): boolean { return accepts(adapter, setting); }
  healthKey(id: string): string {
    const connection = this.overview?.connections.find(c => c.id === id);
    return !connection?.enabled ? 'ai-models-disabled' : 'ai-models-health-' + (connection.lastHealthStatus || 'untested');
  }
  connectionName(id: string): string { return this.overview?.connections.find(c => c.id === id)?.name ?? id; }
  firstVersion(key: string): GenerationAdminModelVersion | undefined { return this.overview?.models.find(m => m.key === key)?.versions[0]; }
  private resetProviders(): void {
    this.providers = (this.overview?.connections ?? []).map(c => {
      const draft = connectionDraft(c);
      return { id: c.id, draft, savedJson: JSON.stringify(draft), keyEdited: true, savedHealth: c.lastHealthStatus || 'untested', secretConfigured: c.secretConfigured };
    });
  }
  async refresh(): Promise<void> { this.overview = await this.api.overview(); this.resetProviders(); }
  async retryLoad(): Promise<void> { this.loading = true; this.error = ''; await this.ngOnInit(); }
  private handle(error: unknown): void {
    this.error = error instanceof ModelApiError ? error.messageKey : 'ai-models-error-generation-provider-unavailable';
    if (error instanceof ModelApiError && error.status === 409) { this.conflict = true; this.remote = undefined; }
  }
  private confirmDiscard(): boolean { return !this.isDirty || window.confirm(this.i18n.t('ai-models-discard-confirm')); }
  hash(key?: string, version?: number, section?: string): string {
    const state = new URLSearchParams();
    if (key) state.set('model', key);
    if (version) state.set('version', String(version));
    if (section) state.set('section', section);
    return window.location.pathname + window.location.search + (state.size ? '#' + state.toString() : '');
  }
  sectionHref(section: string): string {
    const state = new URLSearchParams(this.acceptedHash.slice(1)); state.set('section', section);
    return window.location.pathname + window.location.search + '#' + state.toString();
  }
  private setHash(hash: string): void { history.pushState(null, '', hash); this.acceptedHash = window.location.hash; }
  private applyHash(hash: string): void {
    const params = new URLSearchParams(hash.slice(1));
    const key = params.get('model');
    this.draft = undefined; this.selected = undefined; this.isNew = false;
    this.error = ''; this.notice = ''; this.conflict = false; this.remote = undefined;
    this.promptResult = undefined; this.promptError = ''; this.prompt = '';
    if (params.has('new')) this.initNewModel();
    else if (key) {
      const versions = this.overview?.models.find(m => m.key === key)?.versions;
      const version = params.get('version');
      const selected = version ? versions?.find(v => String(v.version) === version) : versions?.[0];
      if (selected) this.selectVersion(selected);
      else this.error = 'ai-models-error-generation-action-not-available';
    }
    this.activeSection = params.get('section') || (this.editor ? 'model' : 'providers');
    this.acceptedHash = hash;
    this.savedModelJson = this.modelJson;
  }
  @HostListener('window:hashchange')
  onHashChange(): void {
    const next = window.location.hash;
    if (next === this.acceptedHash) return;
    const previousState = new URLSearchParams(this.acceptedHash.slice(1));
    const state = new URLSearchParams(next.slice(1));
    const sameView = ['model', 'version', 'new'].every(key => previousState.get(key) === state.get(key));
    if (!sameView && (this.busy || !this.confirmDiscard())) {
      history.replaceState(null, '', window.location.pathname + window.location.search + this.acceptedHash); return;
    }
    if (sameView) { this.acceptedHash = next; this.goSection(state.get('section') || this.rail[0].id, false); }
    else { this.resetProviders(); this.applyHash(next); this.focusEditor(); }
  }
  openOverview(): void {
    if (this.busy || !this.confirmDiscard()) return;
    this.resetProviders(); this.setHash(this.hash()); this.applyHash(''); this.focusEditor();
  }
  openModel(key: string, version?: number): void {
    if (this.busy || !this.confirmDiscard()) return;
    this.resetProviders(); this.setHash(this.hash(key, version)); this.applyHash(window.location.hash); this.focusEditor();
  }
  newModel(): void {
    if (this.busy || !this.enabledConnections.length || !this.confirmDiscard()) return;
    this.resetProviders(); this.setHash(this.hash() + '#new=1'); this.applyHash('#new=1'); this.focusEditor();
  }
  private initNewModel(): void {
    if (!this.enabledConnections.length) { this.error = 'ai-models-no-enabled-connection'; return; }
    this.isNew = true; this.modelKey = ''; this.keyEdited = false;
    this.draft = { name: '', modelId: '', connectionId: this.enabledConnections[0].id, parameters: {}, routingPolicy: {} };
  }
  private selectVersion(version: GenerationAdminModelVersion): void {
    this.selected = clone(version); this.modelKey = version.key; this.keyEdited = true;
    this.draft = modelDraft(version); this.savedModelJson = this.modelJson;
  }
  private focusEditor(): void { requestAnimationFrame(() => this.host.nativeElement.querySelector<HTMLElement>('h1')?.focus()); }
  goSection(id: string, updateHash = true): void {
    this.activeSection = id;
    const element = this.host.nativeElement.querySelector<HTMLElement>('#ai-' + id);
    element?.scrollIntoView({ block: 'start' });
    if (updateHash) {
      const state = new URLSearchParams(window.location.hash.slice(1)); state.set('section', id);
      this.setHash(window.location.pathname + window.location.search + '#' + state.toString());
    }
  }
  @HostListener('window:scroll')
  onScroll(): void {
    if (this.scrollFrame) return;
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = 0;
      const sections = this.rail.filter(section => (this.host.nativeElement.querySelector('#ai-' + section.id)?.getBoundingClientRect().top ?? Infinity) <= 160);
      this.activeSection = sections.at(-1)?.id ?? this.rail[0].id;
    });
  }
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if ((this.isDirty || this.busy) && !this.allowLeave) { event.preventDefault(); event.returnValue = ''; }
  }
  @HostListener('document:click', ['$event'])
  guardLink(event: MouseEvent): void {
    if (!this.isDirty || this.allowLeave || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
    const url = new URL(anchor.href);
    if (url.pathname === location.pathname && url.search === location.search) return;
    if (!this.confirmDiscard()) event.preventDefault();
    else this.allowLeave = true;
  }
  providerKeyUsed(item: ProviderDraft): boolean { return this.providers.some(p => p !== item && p.draft.key === item.draft.key) || !!this.overview?.connections.some(c => c.id !== item.id && c.key === item.draft.key); }
  providerName(item: ProviderDraft, name: string): void { if (!item.keyEdited) item.draft.key = slug(name); }
  addProvider(): void {
    if (this.busy || !this.overview?.adapters.length) return;
    if (this.editor && !this.confirmDiscard()) return;
    if (this.editor) { this.setHash(this.hash()); this.applyHash(''); }
    if (!this.providers.some(p => !p.id)) {
      const adapterId = this.overview.adapters[0];
      this.providers.unshift({ draft: { key: '', name: '', adapterId, enabled: true,
        authStrategy: adapterId === 'openrouter' ? 'bearer' : adapterId === 'bedrock' ? 'aws-default-chain' : 'none',
        ...(adapterId === 'bedrock' ? { region: this.overview.bedrockRegions[0] } : {}),
        timeoutMs: this.overview.limits.provider.timeoutMs }, savedJson: '', keyEdited: false });
    }
    this.goSection('providers');
    requestAnimationFrame(() => this.host.nativeElement.querySelector<HTMLElement>('[data-provider="new"] input')?.focus());
  }
  cancelProvider(item: ProviderDraft): void {
    if (!window.confirm(this.i18n.t('ai-models-discard-confirm'))) return;
    this.providers = this.providers.filter(p => p !== item);
  }
  modelName(name: string): void { if (this.draft) this.draft.name = name; if (!this.keyEdited) this.modelKey = slug(name); this.changed(); }
  changed(): void { this.promptResult = undefined; this.promptError = ''; this.copyStatus = ''; this.notice = ''; }
  changeConnection(): void {
    if (!this.draft) return;
    if (this.adapter !== 'openrouter') this.draft.routingPolicy = {};
    // Keep unsupported settings visible in the support matrix, but remove them from this adapter's draft.
    for (const name of this.allSettings) if (!this.accepts(name)) delete (this.draft.parameters as Record<string, unknown>)[name];
    if (this.adapter !== 'fake') delete this.draft.parameters?.fixtureResponse;
    this.changed();
  }
  setNumber(name: NumericSetting, value: number | null): void {
    if (!this.draft?.parameters) return;
    if (value === null) delete this.draft.parameters[name]; else this.draft.parameters[name] = value;
    this.changed();
  }
  setRouting(name: 'zdr' | 'allow_fallbacks' | 'data_collection' | 'sort', value: unknown): void {
    if (!this.draft) return;
    const routing = this.draft.routingPolicy ??= {};
    if (value === '') delete routing[name]; else (routing as Record<string, unknown>)[name] = value;
    this.changed();
  }
  setRoutingList(name: 'only' | 'ignore' | 'order', values: string[]): void {
    if (!this.draft) return;
    (this.draft.routingPolicy ??= {})[name] = values; this.changed();
  }
  setStops(values: string[]): void { if (this.draft?.parameters) this.draft.parameters.stopSequences = values; this.changed(); }
  private startCooldown(): void {
    this.cooldownUntil = Date.now() + (this.overview?.limits.cooldownMs ?? 5000);
    const tick = (): void => {
      this.cooldown = Math.max(0, Math.ceil((this.cooldownUntil - Date.now()) / 1000));
      if (!this.cooldown && this.timer) { clearInterval(this.timer); this.timer = undefined; }
    };
    tick(); if (this.timer) clearInterval(this.timer); this.timer = setInterval(tick, 250);
  }
  async testProvider(item: ProviderDraft): Promise<void> {
    if (this.cooldown || this.busy || item.invalidHeaders || this.providerKeyUsed(item) || item.testing || !this.overview || Object.keys(validateConnection(item.draft, this.overview)).length) return;
    const snapshot = JSON.stringify(item.draft); item.testing = true; item.health = undefined; item.error = '';
    this.startCooldown();
    try {
      const health = await this.api.testConnection(connectionDraft(item.draft), item.id);
      if (snapshot === JSON.stringify(item.draft)) {
        item.health = health;
        if (item.id && snapshot === item.savedJson) {
          item.savedHealth = health.ok ? 'healthy' : 'unhealthy'; item.secretConfigured = health.secretConfigured;
          const connection = this.overview?.connections.find(c => c.id === item.id);
          if (connection) { connection.lastHealthStatus = item.savedHealth; connection.lastHealthCheckedAt = health.checkedAt; }
        }
      }
    } catch (error) {
      if (snapshot === JSON.stringify(item.draft)) item.error = error instanceof ModelApiError ? error.messageKey : 'ai-models-error-generation-provider-unavailable';
      if (error instanceof ModelApiError && error.status === 429) this.startCooldown();
    } finally { item.testing = false; }
  }
  async saveProviders(): Promise<void> {
    if (this.busy || this.providersInvalid) return;
    this.busy = true; this.error = ''; this.notice = '';
    try {
      for (const item of this.providers) {
        if (item.id && item.savedJson === JSON.stringify(item.draft)) continue;
        const saved = await this.api.saveConnection(connectionDraft(item.draft), item.id);
        item.id = saved.id; item.draft = connectionDraft(saved); item.savedJson = JSON.stringify(item.draft);
      }
      await this.refresh(); this.notice = 'ai-models-saved';
    } catch (error) { this.handle(error); }
    finally { this.busy = false; }
  }
  async saveDraft(): Promise<void> {
    if (!this.draft || this.busy || this.readOnly || this.conflict || Object.keys(this.modelIssues).length) return;
    this.busy = true; this.error = ''; this.notice = '';
    try {
      const saved = this.isNew
        ? await this.api.createModel({ ...modelDraft(this.draft), key: this.modelKey })
        : await this.api.saveModel(this.selected!.id, { ...modelDraft(this.draft), expectedContentHash: this.selected!.contentHash });
      this.selectVersion(saved); this.isNew = false;
      this.setHash(this.hash(saved.key, saved.version));
      await this.refresh(); this.notice = 'ai-models-saved';
    } catch (error) { this.handle(error); }
    finally { this.busy = false; }
  }
  async publish(): Promise<void> {
    if (!this.canPublish || this.busy) return;
    this.busy = true; this.error = '';
    try { const saved = await this.api.publish(this.selected!.id); this.selectVersion(saved); await this.refresh(); this.notice = 'ai-models-published'; }
    catch (error) { this.handle(error); } finally { this.busy = false; }
  }
  async newVersion(): Promise<void> {
    if (!this.selected || this.busy || !this.confirmDiscard()) return;
    this.busy = true; this.error = '';
    try {
      const version = await this.api.version(this.selected.id); await this.refresh();
      this.selectVersion(version); this.setHash(this.hash(version.key, version.version));
      this.conflict = false; this.promptResult = undefined; this.focusEditor();
    } catch (error) { this.handle(error); } finally { this.busy = false; }
  }
  async retire(): Promise<void> {
    if (!this.selected || this.busy || this.isDirty || !window.confirm(this.i18n.t('ai-models-retire-confirm'))) return;
    this.busy = true;
    try { const version = await this.api.retire(this.selected.id); this.selectVersion(version); await this.refresh(); }
    catch (error) { this.handle(error); } finally { this.busy = false; }
  }
  discard(): void {
    if (this.busy || !this.confirmDiscard()) return;
    if (this.editor) {
      const saved = JSON.parse(this.savedModelJson) as { key: string; draft: GenerationAdminModelDraft };
      this.draft = saved.draft; this.modelKey = saved.key;
    } else this.resetProviders();
    this.changed(); this.error = ''; this.conflict = false; this.remote = undefined;
  }
  async reloadConflict(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      // Reload server data without replacing any local provider or model drafts.
      this.overview = await this.api.overview();
      this.remote = this.versions.find(v => v.id === this.selected?.id);
      if (!this.editor) this.conflict = false;
    }
    catch (error) { this.handle(error); } finally { this.busy = false; }
  }
  resolveConflict(keepEdits: boolean): void {
    if (!this.remote || keepEdits && this.remote.status !== 'draft') return;
    if (keepEdits) {
      this.selected = clone(this.remote);
      this.savedModelJson = JSON.stringify({ key: this.remote.key, draft: modelDraft(this.remote) });
    }
    else this.selectVersion(this.remote);
    this.remote = undefined; this.conflict = false; this.error = '';
  }
  async runPrompt(): Promise<void> {
    if (!this.canRun || this.running || this.cooldown || !this.draft) return;
    const snapshot = this.modelJson + this.prompt + this.mode;
    this.running = true; this.promptResult = undefined; this.promptError = ''; this.startCooldown();
    try {
      const result = await this.api.tryPrompt({ draft: modelDraft(this.draft), prompt: this.prompt, mode: this.mode });
      if (!this.disposed && snapshot === this.modelJson + this.prompt + this.mode) this.promptResult = result;
    } catch (error) {
      if (snapshot === this.modelJson + this.prompt + this.mode) this.promptError = error instanceof ModelApiError ? error.messageKey : 'ai-models-error-generation-provider-unavailable';
      if (error instanceof ModelApiError && error.status === 429) this.startCooldown();
    } finally { this.running = false; }
  }
  testModel(): void { this.goSection('try'); requestAnimationFrame(() => this.host.nativeElement.querySelector<HTMLElement>('#ai-prompt')?.focus()); }
  async copyCode(): Promise<void> {
    try { await navigator.clipboard.writeText(this.code); this.copyStatus = 'ai-models-copied'; }
    catch { this.copyStatus = 'ai-models-copy-failed'; }
  }
  json(value: unknown): string { return JSON.stringify(value, null, 2); }
  parameterMin(name: string): number | null { return name === 'maxOutputTokens' ? 1 : name === 'topP' ? 0 : name.includes('Penalty') ? -2 : null; }
  parameterMax(name: string): number | null { return name === 'topP' ? 1 : name.includes('Penalty') ? 2 : null; }
}
