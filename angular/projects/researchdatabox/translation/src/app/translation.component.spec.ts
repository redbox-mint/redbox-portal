import { TestBed } from '@angular/core/testing';
import { AppComponent } from './translation.component';
import { FormBuilder } from '@angular/forms';
import { APP_BASE_HREF } from '@angular/common';
import { CSP_NONCE, signal } from '@angular/core';
import { Subject } from 'rxjs';
// Portal common services / stubs
import {
  ConfigService,
  getStubConfigService,
  getStubUserService,
  LoggerService,
  TranslationService,
  UserService,
  UtilityService
} from '@researchdatabox/portal-ng-common';

// Custom richer mock translation service implementing the API used by the component
class RichMockTranslationService {
  translationChanges$ = new Subject<void>();
  isInitializing() { return false; }
  t(key: string) {
    return ({ 'admin-tx-plain-text': 'Plain text', 'admin-tx-rich-text': 'Rich text', 'admin-tx-html-source': 'HTML source' })[key] || key;
  }
  languages = [
    { code: 'en', displayName: 'English', enabled: true },
    { code: 'fr', displayName: 'French', enabled: true },
    { code: 'de', displayName: 'German', enabled: false }
  ];
  entriesMap: Record<string, any[]> = {
    'en:translation': [
      { key: 'app.title', value: 'Title EN', category: 'meta' },
      { key: 'greet.hello', value: 'Hello', category: 'greetings' },
      { key: 'greet.bye', value: 'Bye', category: 'greetings' }
    ]
  };

  translationExportUrl(code: string, ns: string) { return `/admin/translation/${code}/${ns}/export`; }
  async previewTranslationImport(_code: string, _ns: string, _json: string, _keepUnknown: boolean) {
    return { previewToken: 'a'.repeat(64), counts: { added: 1, changed: 1, unchanged: 1, unknown: 1, ignored: 1 },
      sample: [{ key: 'label', before: 'Before', after: '<img src=x onerror=alert(1)>', action: 'changed' }] };
  }
  async applyTranslationImport(_code: string, _ns: string, _json: string, _keepUnknown: boolean, _token: string) {
    return { applied: 2, failed: 1, counts: { ignored: 1 }, results: [{ key: 'failed-key', status: 'failed' }] };
  }

  async revertEntry(code: string, ns: string, key: string) {
    const entry = this.entriesMap[`${code}:${ns}`].find(e => e.key === key);
    Object.assign(entry, { value: 'Default value', provenance: 'default' });
    return entry;
  }

  // Spies counters
  listLanguagesCalls = 0;
  getBundleCalls: string[] = [];
  listEntriesCalls: string[] = [];
  setEntryCalls: any[] = [];
  createLanguageCalls: any[] = [];
  updateLanguageDisplayNameCalls: any[] = [];
  updateBundleEnabledCalls: any[] = [];

  async waitForInit() { /* no-op */ }
  async listLanguages() { this.listLanguagesCalls++; return this.languages.slice(); }
  async getBundle(code: string, ns: string) {
    this.getBundleCalls.push(`${code}:${ns}`);
    // Return metadata bundle including enabled state & displayName
    const lang = this.languages.find(l => l.code === code);
    return { displayName: lang?.displayName || code, enabled: lang?.enabled !== false };
  }
  async listEntries(code: string, ns: string) {
    this.listEntriesCalls.push(`${code}:${ns}`);
    return this.entriesMap[`${code}:${ns}`] || [];
  }
  async setEntry(code: string, ns: string, key: string, payload: any) {
    this.setEntryCalls.push({ code, ns, key, payload });
    const list = this.entriesMap[`${code}:${ns}`] || (this.entriesMap[`${code}:${ns}`] = []);
    const idx = list.findIndex(e => e.key === key);
    if (idx >= 0) list[idx] = { ...list[idx], value: payload.value, contentFormat: payload.contentFormat };
    else list.push({ key, value: payload.value, contentFormat: payload.contentFormat });
    return { success: true } as any;
  }
  async createLanguage(newCode: string, fromCode: string, ns: string, displayName?: string) {
    this.createLanguageCalls.push({ newCode, fromCode, ns, displayName });
    if (!this.languages.find(l => l.code === newCode)) {
      this.languages.push({ code: newCode, displayName: displayName || newCode, enabled: true });
      // Copy entries
      const src = this.entriesMap[`${fromCode}:${ns}`] || [];
      this.entriesMap[`${newCode}:${ns}`] = src.map(e => ({ ...e }));
    }
    return { success: true } as any;
  }
  async updateLanguageDisplayName(code: string, ns: string, displayName: string) {
    this.updateLanguageDisplayNameCalls.push({ code, ns, displayName });
    const lang = this.languages.find(l => l.code === code);
    if (lang) lang.displayName = displayName;
    return { success: true } as any;
  }
  async updateBundleEnabled(code: string, ns: string, enabled: boolean) {
    this.updateBundleEnabledCalls.push({ code, ns, enabled });
    const lang = this.languages.find(l => l.code === code);
    if (lang) lang.enabled = enabled;
    return { success: true } as any;
  }
}

let configService: any;
let userService: any;
let translationService: RichMockTranslationService;
const username = 'testUser';
const password = 'very-scary-password';

describe('AppComponent (translation)', () => {
  beforeEach(async () => {
    configService = getStubConfigService();
    translationService = new RichMockTranslationService();
    userService = getStubUserService(username, password);
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        FormBuilder,
        { provide: CSP_NONCE, useValue: 'translation-test-nonce' },
        { provide: APP_BASE_HREF, useValue: 'base' },
        LoggerService,
        UtilityService,
        { provide: TranslationService, useValue: translationService },
        { provide: ConfigService, useValue: configService },
        { provide: UserService, useValue: userService }
      ]
    }).compileComponents();
  });

  function create(): { fixture: any; comp: AppComponent } {
    const fixture = TestBed.createComponent(AppComponent);
    const comp = fixture.componentInstance;
    return { fixture, comp };
  }

  it('breaks keys at separators and keeps help with the final segment', async () => {
    const { comp, fixture } = create();
    translationService.entriesMap['en:translation'] = [
      { key: 'admin.report-long.title', value: 'Title', description: 'Help for title', category: 'admin' }
    ];
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(comp.keySegments('admin.report-long.title')).toEqual(['admin.', 'report-', 'long.', 'title']);
    const code = fixture.nativeElement.querySelector('.tx-data-table code');
    expect(code.querySelectorAll('wbr').length).toBe(3);
    expect(code.querySelector('.tx-key-tail').textContent.replace('\u2060', '').trim()).toBe('title');
    expect(code.querySelector('.tx-key-tail .tx-key-help')).toBeTruthy();
    expect(code.textContent.replace('\u2060', '').trim()).toBe('admin.report-long.title');
  });

  it('filters Missing and Changed with badges, counts and a revert menu', async () => {
    const { comp, fixture } = create();
    translationService.entriesMap['en:translation'] = [
      { key: 'default', value: 'Default value', provenance: 'default', hasDefault: true },
      { key: 'empty', value: '', provenance: 'missing', hasDefault: true },
      { key: 'custom', value: 'Custom value', provenance: 'override', hasDefault: true },
      { key: 'unknown', value: 'New', provenance: 'override', hasDefault: false }
    ];
    Object.assign(translationService.languages[0], { translated: 3, total: 4 });
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tx-translated').textContent).toContain('3 / 4');
    comp.setShow('missing'); fixture.detectChanges();
    expect(comp.pageEntries().map(e => e.key)).toEqual(['empty']);
    expect(fixture.nativeElement.querySelector('.tx-row-missing')).toBeTruthy();
    comp.setShow('override'); fixture.detectChanges();
    expect(comp.pageEntries().map(e => e.key)).toEqual(['custom', 'unknown']);
    expect(fixture.nativeElement.querySelectorAll('.rb-admin-badge-warning').length).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('.rb-admin-overflow').length).toBe(1);
    const revert = spyOn(translationService, 'revertEntry').and.callThrough();
    await comp.revertEntry(comp.pageEntries()[0]); fixture.detectChanges();
    expect(revert).toHaveBeenCalledWith('en', 'translation', 'custom');
    expect(comp.pageEntries().map(e => e.key)).toEqual(['unknown']);
    comp.clearAllFilters();
    expect(comp.show).toBe('all'); expect(comp.pageEntries().length).toBe(4);
  });

  it('makes the portal background inert while the import dialog is open', async () => {
    const background = document.createElement('button');
    document.body.appendChild(background);
    const { comp, fixture } = create();
    try {
      fixture.detectChanges(); await fixture.whenStable();
      comp.openImport(); fixture.detectChanges(); await fixture.whenStable();
      expect(background.inert).toBeTrue();
      expect(document.activeElement?.id).toBe('tx-import-file');
      comp.closeImport(); fixture.detectChanges(); await fixture.whenStable();
      expect(background.inert).toBeFalse();
    } finally {
      fixture.destroy();
      background.remove();
    }
  });

  it('previews a JSON file before applying and escapes the diff sample', async () => {
    const { comp, fixture } = create(); fixture.detectChanges(); await fixture.whenStable();
    const preview = spyOn(translationService, 'previewTranslationImport').and.callThrough();
    const apply = spyOn(translationService, 'applyTranslationImport').and.callThrough();
    comp.openImport();
    await comp.readImportFile({ target: { files: [new File(['{"label":"After"}'], 'translations.json', { type: 'application/json' })] } } as any);
    fixture.detectChanges();
    expect(apply).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[href="/admin/translation/en/translation/export"]')).toBeTruthy();
    await comp.previewImport(); fixture.detectChanges();
    expect(preview).toHaveBeenCalledWith('en', 'translation', '{"label":"After"}', false);
    expect(fixture.nativeElement.querySelectorAll('.tx-import-counts .rb-admin-stat').length).toBe(5);
    expect(fixture.nativeElement.querySelector('.tx-import-diff').textContent).toContain('<img src=x onerror=alert(1)>');
    expect(fixture.nativeElement.querySelector('.tx-import-diff img')).toBeNull();
    comp.selectedLang = 'fr';
    await comp.applyImport(); fixture.detectChanges();
    expect(apply).toHaveBeenCalledWith('en', 'translation', '{"label":"After"}', false, 'a'.repeat(64));
    expect(comp.importResult().failed).toBe(1);
    expect(comp.importPreview()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('failed-key');
  });
  it('rejects oversized files, invalidates preview on options/file changes and handles stale preview', async () => {
    const { comp, fixture } = create(); fixture.detectChanges(); await fixture.whenStable();
    comp.openImport();
    await comp.readImportFile({ target: { files: [new File(['x'.repeat(2 * 1024 * 1024 + 1)], 'large.json')] } } as any);
    expect(comp.importJson).toBe(''); expect(comp.importError()).toBe('admin-tx-import-size-error');
    comp.importJson = '{}'; await comp.previewImport();
    comp.keepUnknown = true; comp.invalidateImportPreview();
    expect(comp.importPreview()).toBeNull();
    await comp.applyImport(); expect(comp.importResult()).toBeNull();
    await comp.previewImport();
    spyOn(translationService, 'applyTranslationImport').and.rejectWith({ status: 409 });
    await comp.applyImport();
    expect(comp.importPreview()).toBeNull(); expect(comp.importError()).toBe('admin-tx-import-stale');
    comp.closeImport(); expect(comp.importModalOpen()).toBeFalse();
  });

  it('shows a warning for failed entries, preserves editor data, and retries to a real empty list', async () => {
    const { comp, fixture } = create();
    fixture.detectChanges();
    await fixture.whenStable();
    const previous = comp.entries();
    comp.openEdit(previous[0]);
    comp.onPlainTextChange('Unsaved editor text');
    comp.modalOpen.set(false);
    const spy = spyOn(translationService, 'listEntries').and.rejectWith(new Error('offline'));
    await comp.loadEntries();
    fixture.detectChanges();
    expect(comp.entries()).toEqual(previous);
    expect(comp.editValue).toBe('Unsaved editor text');
    expect(comp.readPending().entries).toBeFalse();
    const button = Array.from(fixture.nativeElement.querySelectorAll('[role="status"] button'))
      .find((element) => (element as HTMLButtonElement).textContent?.includes('Retry loading entries')) as HTMLButtonElement;
    expect(button).toBeTruthy();
    spy.and.resolveTo([]);
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(comp.entries()).toEqual([]);
    expect(comp.readWarnings().entries).toBeUndefined();
    expect(comp.editValue).toBe('Unsaved editor text');
    expect(translationService.setEntryCalls).toEqual([]);
  });

  it('warns for failed languages and recovers the language list and bundle settings on retry', async () => {
    const { comp } = create();
    const spy = spyOn(translationService, 'listLanguages').and.rejectWith(new Error('offline'));
    await comp.ngOnInit();
    expect(comp.languages()).toEqual([]);
    expect(comp.readWarnings().languages).toContain('does not confirm');
    expect(comp.readPending().languages).toBeFalse();
    spy.and.callThrough();
    await comp.retryLanguages();
    expect(comp.readWarnings().languages).toBeUndefined();
    expect(comp.availableLanguages()).toEqual(['en', 'fr']);
    expect(comp.entries().length).toBe(3);
  });

  it('identifies default bundle availability and recovers without overwriting user choices', async () => {
    const { comp } = create();
    const spy = spyOn(translationService, 'getBundle').and.rejectWith(new Error('offline'));
    await comp.ngOnInit();
    expect(comp.availableLanguages()).toEqual(['en', 'fr', 'de']);
    expect(comp.readWarnings().bundles).toContain('defaults');
    expect(comp.readPending().bundles).toBeFalse();
    comp.toggleAvailableLanguage('fr', false);
    spy.and.callThrough();
    await comp.loadAvailableLanguagesFromBundles();
    expect(comp.availableLanguages()).toEqual(['en']);
    expect(comp.readWarnings().bundles).toBeUndefined();
    expect(translationService.updateBundleEnabledCalls).toEqual([]);
  });

  it('ignores older entries after changing language, including stale failures', async () => {
    const { comp } = create();
    await comp.ngOnInit();
    let rejectOld!: (error: Error) => void;
    const spy = spyOn(translationService, 'listEntries').and.returnValue(new Promise((_, reject) => { rejectOld = reject; }));
    const old = comp.loadEntries();
    comp.selectedLang = 'fr';
    spy.and.resolveTo([{ key: 'fr', value: 'French' }]);
    await comp.onLangChange();
    rejectOld(new Error('stale'));
    await old;
    expect(comp.entries()).toEqual([{ key: 'fr', value: 'French' }]);
    expect(comp.readWarnings().entries).toBeUndefined();
    expect(comp.readPending().entries).toBeFalse();
  });

  it('retries display name reads without replacing text edited while the request is pending', async () => {
    const { comp } = create();
    await comp.ngOnInit();
    const spy = spyOn(translationService, 'getBundle').and.rejectWith(new Error('offline'));
    comp.displayNameModalOpen.set(true);
    comp.displayNameLanguage = 'en';
    comp.editDisplayName = 'en';
    await comp.loadCurrentDisplayName();
    expect(comp.readWarnings().displayName).toContain('could not be loaded');
    let resolve!: (value: { displayName: string; enabled: boolean }) => void;
    spy.and.returnValue(new Promise(done => { resolve = done; }));
    const retry = comp.loadCurrentDisplayName();
    comp.editDisplayName = 'My unsaved name';
    comp.displayNameEdited = true;
    resolve({ displayName: 'English', enabled: true });
    await retry;
    expect(comp.editDisplayName).toBe('My unsaved name');
    expect(comp.readWarnings().displayName).toBeUndefined();
    expect(comp.readPending().displayName).toBeFalse();
    spy.and.callThrough();
    await comp.loadCurrentDisplayName();
    expect(comp.editDisplayName).toBe('My unsaved name');
    expect(translationService.updateLanguageDisplayNameCalls).toEqual([]);
  });

  it('renders only a page from the full bundle, sorts all matches and resets filters to page one', async () => {
    const { comp, fixture } = create();
    const entries = Array.from({ length: 2093 }, (_, index) => ({
      key: `key-${String(index).padStart(4, '0')}`, value: `Value ${index}`, category: index % 2 ? 'menu' : 'admin'
    }));
    translationService.entriesMap['en:translation'] = entries;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(comp.viewEntries().length).toBe(2093);
    expect(fixture.nativeElement.querySelectorAll('.tx-data-table tbody tr').length).toBe(50);
    expect([comp.rangeStart, comp.rangeEnd, comp.totalPages]).toEqual([1, 50, 42]);
    comp.setPage(2);
    expect(comp.pageEntries()[0].key).toBe('key-0050');
    comp.setSort('key');
    expect(comp.page).toBe(1);
    expect(comp.pageEntries()[0].key).toBe('key-2092');
    comp.setPage(42);
    expect(comp.pageEntries().length).toBe(43);
    comp.selectedCategory = 'menu';
    comp.onCategoryChange();
    expect(comp.page).toBe(1);
    expect(comp.viewEntries().every(entry => entry.category === 'menu')).toBeTrue();
    comp.setPage(2);
    comp.filterText = 'VALUE 2091';
    comp.onFilterTextChange();
    expect([comp.page, comp.rangeStart, comp.rangeEnd]).toEqual([1, 1, 1]);
    expect(comp.pageEntries()[0].key).toBe('key-2091');
    comp.filterText = 'no-match';
    comp.onFilterTextChange();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rb-admin-empty')).toBeTruthy();
    expect([comp.rangeStart, comp.rangeEnd]).toEqual([0, 0]);
    comp.clearAllFilters();
    comp.pageSize = 100;
    comp.onPageSizeChange();
    expect(comp.pageEntries().length).toBe(100);
    comp.setPage(99);
    expect(comp.page).toBe(21);
    comp.selectedLang = 'fr';
    await comp.onLangChange();
    expect(comp.page).toBe(1);
    expect(comp.pageEntries().length).toBe(0);
  });

  it('renames an unavailable language without changing the language being edited', async () => {
    const { comp } = create();
    await comp.ngOnInit();
    comp.openDisplayNameModal('de');
    await comp.loadCurrentDisplayName();
    expect(comp.editDisplayName).toBe('German');
    comp.editDisplayName = 'Deutsch';
    await comp.updateDisplayName();
    expect(comp.selectedLang).toBe('en');
    expect(translationService.updateLanguageDisplayNameCalls).toEqual([{ code: 'de', ns: 'translation', displayName: 'Deutsch' }]);
    expect(comp.languages().find(language => language.code === 'de').displayName).toBe('Deutsch');
    expect(comp.isLanguageAvailable('de')).toBeFalse();
  });

  it('clears rows when the last available language is disabled and reloads when enabled', async () => {
    const { comp } = create();
    await comp.ngOnInit();
    comp.toggleAvailableLanguage('fr', false);
    comp.toggleAvailableLanguage('en', false);
    await comp.onLangChange();
    expect(comp.selectedLang).toBe('');
    expect(comp.pageEntries()).toEqual([]);
    expect(comp.availabilityDirty()).toBeTrue();
    comp.toggleAvailableLanguage('en', true);
    await comp.onLangChange();
    expect(comp.selectedLang).toBe('en');
    expect(comp.pageEntries().length).toBe(3);
    await comp.saveLanguages();
    expect(comp.availabilityDirty()).toBeFalse();
  });

  it('uses the Angular CSP nonce for the editor stylesheet', async () => {
    const { comp } = create();
    await comp.ngOnInit();
    comp.openEdit(comp.entries()[0]);
    expect(comp.richTextEditor?.options.injectNonce).toBe('translation-test-nonce');
    expect(comp.richTextEditor?.options.editorProps.attributes).toEqual({ cdkFocusInitial: '', role: 'textbox', 'aria-multiline': 'true', 'aria-labelledby': 'tx-translation-value-label' });
    comp.closeModal();
  });

  it('should create', async () => {
    const { comp } = create();
    expect(comp).toBeTruthy();
  });

  it('ngOnInit loads languages and sets selectedLang', async () => {
    const { comp, fixture } = create();
    await comp.ngOnInit();
    expect(translationService.listLanguagesCalls).toBeGreaterThan(0);
    expect(comp.languages().length).toBeGreaterThan(0);
    expect(comp.selectedLang).toBe('en');
    // availableLanguages derived from bundles (de enabled false filtered out)
    expect(comp.availableLanguages()).toContain('en');
    fixture.detectChanges();
  });

  it('setSort toggles direction when same column selected', async () => {
    const { comp } = create();
    comp.entries.set([
      { key: 'b.key', value: '2', category: 'c2' },
      { key: 'a.key', value: '1', category: 'c1' }
    ]);
    comp.setSort('key'); // initial -> asc
    const firstAsc = comp.viewEntries()[0].key;
    comp.setSort('key'); // toggle -> desc
    const firstDesc = comp.viewEntries()[0].key;
    expect(firstAsc).not.toEqual(firstDesc);
  });

  it('category filtering works', async () => {
    const { comp } = create();
    comp.entries.set([
      { key: 'x', value: '1', category: 'A' },
      { key: 'y', value: '2', category: 'B' }
    ]);
    // Trigger derived calc by sorting
    comp.setSort('key');
    comp.selectedCategory = 'A';
    comp.onCategoryChange();
    const list = comp.viewEntries();
    expect(list.length).toBe(1);
    expect(list[0].category).toBe('A');
  });

  it('filter matches key and value case-insensitively and combines with category', async () => {
    const { comp } = create();
    comp.entries.set([
      { key: 'app.title', value: 'Main Title', category: 'meta' },
      { key: 'app.subtitle', value: 'Secondary', category: 'meta' },
      { key: 'greet.hello', value: 'Hello', category: 'greetings' }
    ]);
    comp.selectedCategory = 'meta';
    comp.filterText = 'Main';
    (comp as any).refreshDerived();
    expect(comp.viewEntries().length).toBe(1);
    expect(comp.viewEntries()[0].key).toBe('app.title');

    comp.filterText = 'HELLO';
    (comp as any).refreshDerived();
    expect(comp.viewEntries().length).toBe(0);

    comp.selectedCategory = '';
    (comp as any).refreshDerived();
    expect(comp.viewEntries().length).toBe(1);
    expect(comp.viewEntries()[0].key).toBe('greet.hello');
  });

  it('sorting still applies after text filtering and clearFilter restores the list', async () => {
    const { comp } = create();
    comp.entries.set([
      { key: 'b.key', value: '2', category: 'c2' },
      { key: 'a.key', value: '1', category: 'c1' },
      { key: 'c.key', value: 'match', category: 'c3' }
    ]);
    comp.sortBy = 'value';
    comp.setSort('key');
    comp.filterText = 'key';
    (comp as any).refreshDerived();
    expect(comp.viewEntries().map(e => e.key)).toEqual(['a.key', 'b.key', 'c.key']);

    comp.filterText = 'match';
    (comp as any).refreshDerived();
    expect(comp.viewEntries().map(e => e.key)).toEqual(['c.key']);

    comp.clearFilter();
    expect(comp.viewEntries().map(e => e.key)).toEqual(['a.key', 'b.key', 'c.key']);
  });

  it('openEdit and saveEdit update entry value', async () => {
    const { comp } = create();
    comp.selectedLang = 'en';
    comp.entries.set([{ key: 'greet.hello', value: 'Hello', category: 'greetings' }]);
    const mockEditor = {
      getHTML: () => '<p>Hi</p>',
      destroy: jasmine.createSpy('destroy'),
      commands: { setContent: jasmine.createSpy('setContent') }
    } as any;
    spyOn<any>(comp, 'createRichTextEditor').and.returnValue(mockEditor);
    comp.openEdit({ key: 'greet.hello', value: 'Hello' });
    expect(comp.modalOpen()).toBeTrue();
    comp.toggleHtmlSourceMode();
    comp.htmlSourceValue = '<p>Hi</p>';
    await comp.saveEdit();
    const updated = comp.entries().find(e => e.key === 'greet.hello');
    expect(updated?.value).toBe('<p>Hi</p>');
    expect(translationService.setEntryCalls.length).toBe(1);
  });

  it('openEdit initializes rich text state and closeModal destroys editor', async () => {
    const { comp } = create();
    const mockEditor = {
      getHTML: () => '<p>Hello</p>',
      destroy: jasmine.createSpy('destroy'),
      commands: { setContent: jasmine.createSpy('setContent') }
    } as any;
    spyOn<any>(comp, 'createRichTextEditor').and.returnValue(mockEditor);
    comp.openEdit({ key: 'greet.hello', value: '<p>Hello</p>', description: 'desc', contentFormat: 'html' });
    expect(comp.modalOpen()).toBeTrue();
    expect(comp.editorMode).toBe('rich');
    expect(comp.htmlSourceValue).toBe('<p>Hello</p>');
    comp.closeModal();
    expect(mockEditor.destroy).toHaveBeenCalled();
    expect(comp.modalOpen()).toBeFalse();
  });

  it('ngOnDestroy destroys active editor', async () => {
    const { comp } = create();
    const editor = { destroy: jasmine.createSpy('destroy') } as any;
    comp.richTextEditor = editor;
    comp.ngOnDestroy();
    expect(editor.destroy).toHaveBeenCalled();
  });

  it('falls back to source editing if editor creation fails', async () => {
    const { comp } = create();
    spyOn<any>(comp, 'createRichTextEditor').and.returnValue(null);
    comp.openEdit({ key: 'greet.hello', value: '<p>Hello</p>', contentFormat: 'html' });
    expect(comp.richTextEditor).toBeNull();
    expect(comp.editorMode).toBe('rich');
    expect(comp.htmlSourceValue).toBe('<p>Hello</p>');
  });

  it('openEdit keeps plain text values unchanged when value is <p></p>', async () => {
    const { comp } = create();
    const mockEditor = {
      getHTML: () => '&lt;p&gt;&lt;/p&gt;',
      getText: () => '<p></p>',
      destroy: jasmine.createSpy('destroy'),
      commands: { setContent: jasmine.createSpy('setContent') }
    } as any;
    spyOn<any>(comp, 'createRichTextEditor').and.returnValue(mockEditor);

    comp.openEdit({ key: 'greet.hello', value: '<p></p>', contentFormat: 'plain' });

    expect(comp.editValue).toBe('<p></p>');
    expect(comp.editorMode).toBe('text');
  });

  it('toggleLink rejects unsafe protocols', async () => {
    const { comp } = create();
    const setLink = jasmine.createSpy('setLink').and.returnValue({ run: jasmine.createSpy('run') });
    const unsetLink = jasmine.createSpy('unsetLink').and.returnValue({ run: jasmine.createSpy('run') });
    const chain = {
      focus: () => chain,
      extendMarkRange: () => chain,
      setLink,
      unsetLink
    } as any;
    comp.richTextEditor = {
      getAttributes: () => ({ href: '' }),
      chain: () => chain
    } as any;
    spyOn(window, 'prompt').and.returnValue('javascript:alert(1)');
    spyOn(window, 'alert');

    comp.toggleLink();

    expect(window.alert).toHaveBeenCalled();
    expect(setLink).not.toHaveBeenCalled();
    expect(unsetLink).not.toHaveBeenCalled();
  });

  it('toggleLink allows safe protocols', async () => {
    const { comp } = create();
    const runSpy = jasmine.createSpy('run');
    const setLink = jasmine.createSpy('setLink').and.returnValue({ run: runSpy });
    const chain = {
      focus: () => chain,
      extendMarkRange: () => chain,
      setLink,
      unsetLink: jasmine.createSpy('unsetLink').and.returnValue({ run: jasmine.createSpy('run') })
    } as any;
    comp.richTextEditor = {
      getAttributes: () => ({ href: '' }),
      chain: () => chain
    } as any;
    spyOn(window, 'prompt').and.returnValue('https://example.com/path');

    comp.toggleLink();

    expect(setLink).toHaveBeenCalledWith({ href: 'https://example.com/path' });
    expect(runSpy).toHaveBeenCalled();
  });

  it('saveEdit preserves plain text values when plain text mode is active', async () => {
    const { comp } = create();
    comp.selectedLang = 'en';
    comp.entries.set([{ key: 'greet.hello', value: 'Hello', category: 'greetings' }]);
    const mockEditor = {
      getHTML: () => '<p>Edited</p>',
      getText: () => 'Edited',
      destroy: jasmine.createSpy('destroy'),
      commands: { setContent: jasmine.createSpy('setContent') }
    } as any;
    spyOn<any>(comp, 'createRichTextEditor').and.returnValue(mockEditor);
    comp.openEdit({ key: 'greet.hello', value: 'Hello' });
    await comp.saveEdit();
    expect(translationService.setEntryCalls[0].payload.value).toBe('Hello');
    expect(translationService.setEntryCalls[0].payload.contentFormat).toBe('plain');
  });

  it('uses developer class configuration through rich/source switches and the save API', async () => {
    configService.getConfig().translationEditor = { allowedClasses: { th: ['classification-public'] } };
    const { comp } = create();
    await comp.ngOnInit();
    comp.openEdit({ key: 'intro', contentFormat: 'html',
      value: '<table class="table table-bordered"><thead class="table-light"><tr><th>Level</th></tr></thead>'
        + '<tbody class="table-group-divider"><tr><th class="classification-public">Public</th></tr></tbody></table>' });
    expect(comp.richTextEditor).not.toBeNull();
    comp.setEditorMode('html');
    comp.onHtmlSourceChange(comp.htmlSourceValue.replace('Public', 'Official (Public)'));
    comp.setEditorMode('rich');
    comp.setEditorMode('html');
    await comp.saveEdit();
    const saved = translationService.setEntryCalls[0].payload;
    const doc = new DOMParser().parseFromString(saved.value, 'text/html');
    expect(saved.contentFormat).toBe('html');
    expect(doc.querySelector('table')?.className).toBe('table table-bordered');
    expect(doc.querySelector('thead')?.className).toBe('table-light');
    expect(doc.querySelector('tbody')?.className).toBe('table-group-divider');
    expect(doc.querySelector('tbody th')?.className).toBe('classification-public');
    expect(doc.querySelector('tbody th')?.textContent).toBe('Official (Public)');
  });

  it('uses the server value when save sanitisation changes the submitted HTML', async () => {
    const { comp } = create();
    comp.selectedLang = 'en';
    comp.entries.set([{ key: 'intro', value: '<p>Before</p>', contentFormat: 'html' }]);
    comp.openEdit(comp.entries()[0]);
    comp.setEditorMode('html');
    comp.onHtmlSourceChange('<p class="alert alert-info">After</p>');
    spyOn(translationService, 'setEntry').and.resolveTo({ value: '<p>After</p>' });
    await comp.saveEdit();
    expect(comp.entries()[0].value).toBe('<p>After</p>');
  });

  it('retains table widths through rich/source switches, saving and reopening', async () => {
    const { comp } = create();
    comp.selectedLang = 'en';
    comp.entries.set([{ key: 'intro', contentFormat: 'html',
      value: '<table><tr><th colwidth="220">Level</th><th colwidth="400">Description</th></tr></table>' }]);
    comp.openEdit(comp.entries()[0]);
    comp.setEditorMode('html');
    comp.onHtmlSourceChange(comp.htmlSourceValue.replace('Level', 'Classification'));
    comp.setEditorMode('rich');
    await comp.saveEdit();

    const saved = translationService.setEntryCalls[0].payload.value;
    expect(saved).toContain('width="220"');
    expect(saved).toContain('width="400"');
    expect(saved).not.toMatch(/style=|colwidth=/);
    comp.openEdit(comp.entries()[0]);
    const widths: number[][] = [];
    comp.richTextEditor!.state.doc.descendants(node => {
      if (node.type.name === 'tableHeader') widths.push(node.attrs['colwidth']);
    });
    expect(widths).toEqual([[220], [400]]);
    expect(comp.richTextEditor!.getText()).toContain('Classification');
    comp.closeModal();
  });

  it('saveEdit uses the active rich text editor HTML when rich text mode is active', async () => {
    const { comp } = create();
    comp.selectedLang = 'en';
    comp.entries.set([{ key: 'greet.hello', value: 'Hello', category: 'greetings' }]);
    const mockEditor = {
      getHTML: () => '<p>Edited</p>',
      getText: () => 'Edited',
      destroy: jasmine.createSpy('destroy'),
      commands: { setContent: jasmine.createSpy('setContent') }
    } as any;
    spyOn<any>(comp, 'createRichTextEditor').and.returnValue(mockEditor);
    comp.openEdit({ key: 'greet.hello', value: 'Hello', contentFormat: 'html' });
    comp.setEditorMode('rich');
    await comp.saveEdit();
    expect(translationService.setEntryCalls[0].payload.value).toBe('<p>Edited</p>');
    expect(translationService.setEntryCalls[0].payload.contentFormat).toBe('html');
  });

  it('opens plain content in text mode even when value contains tag-like text', async () => {
    const { comp } = create();
    const mockEditor = {
      getHTML: () => '&lt;strong&gt;Not HTML&lt;/strong&gt;',
      getText: () => '<strong>Not HTML</strong>',
      destroy: jasmine.createSpy('destroy'),
      commands: { setContent: jasmine.createSpy('setContent') }
    } as any;
    spyOn<any>(comp, 'createRichTextEditor').and.returnValue(mockEditor);

    comp.openEdit({ key: 'greet.hello', value: '<strong>Not HTML</strong>', contentFormat: 'plain' });

    expect(comp.editorMode).toBe('text');
    expect(comp.editContentFormat).toBe('plain');
  });

  it('shows only the plain text editor control for plain content', async () => {
    const { comp, fixture } = create();
    const mockEditor = {
      getHTML: () => 'Progress',
      getText: () => 'Progress',
      destroy: jasmine.createSpy('destroy'),
      commands: { setContent: jasmine.createSpy('setContent') }
    } as any;
    spyOn<any>(comp, 'createRichTextEditor').and.returnValue(mockEditor);

    comp.openEdit({ key: 'asynch-completion', value: 'Progress', contentFormat: 'plain' });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Plain text');
    expect(text).not.toContain('Rich text');
    expect(text).not.toContain('HTML source');
  });

  it('shows only rich text and HTML source controls for HTML content', async () => {
    const { comp, fixture } = create();
    const mockEditor = {
      getHTML: () => '<p>Progress</p>',
      getText: () => 'Progress',
      destroy: jasmine.createSpy('destroy'),
      commands: { setContent: jasmine.createSpy('setContent') }
    } as any;
    spyOn<any>(comp, 'createRichTextEditor').and.returnValue(mockEditor);

    comp.openEdit({ key: 'asynch-completion', value: '<p>Progress</p>', contentFormat: 'html' });
    comp.setEditorMode('html');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('Plain text');
    expect(text).toContain('Rich text');
    expect(text).toContain('HTML source');
  });

  it('saving updates local entry content format', async () => {
    const { comp } = create();
    comp.selectedLang = 'en';
    comp.entries.set([{ key: 'greet.hello', value: 'Hello', category: 'greetings', contentFormat: 'plain' }]);
    const mockEditor = {
      getHTML: () => '<p>Edited</p>',
      getText: () => 'Edited',
      destroy: jasmine.createSpy('destroy'),
      commands: { setContent: jasmine.createSpy('setContent') }
    } as any;
    spyOn<any>(comp, 'createRichTextEditor').and.returnValue(mockEditor);

    comp.openEdit({ key: 'greet.hello', value: '<p>Hello</p>', contentFormat: 'html' });
    await comp.saveEdit();

    const updated = comp.entries().find(e => e.key === 'greet.hello');
    expect(updated?.contentFormat).toBe('html');
  });

  it('createNewLanguage adds language and updates lists', async () => {
    const { comp } = create();
    await comp.ngOnInit();
    const prevCount = comp.languages().length;
    comp.openLanguageModal();
    comp.newLanguageCode = 'es';
    comp.newLanguageDisplayName = 'Spanish';
    comp.sourceLanguage = 'en';
    await comp.createNewLanguage();
    expect(translationService.createLanguageCalls.length).toBe(1);
    expect(comp.languages().length).toBe(prevCount + 1);
    expect(comp.availableLanguages()).toContain('es');
  });

  it('updateDisplayName updates bundle display name', async () => {
    const { comp } = create();
    await comp.ngOnInit();
    comp.selectedLang = 'en';
    comp.openDisplayNameModal();
    comp.editDisplayName = 'English (Updated)';
    await comp.updateDisplayName();
    expect(translationService.updateLanguageDisplayNameCalls.length).toBe(1);
    const lang = translationService.languages.find(l => l.code === 'en');
    expect(lang?.displayName).toContain('Updated');
  });

  it('toggleAvailableLanguage removes then re-adds a language', async () => {
    const { comp } = create();
    await comp.ngOnInit();
    expect(comp.availableLanguages()).toContain('fr');
    comp.toggleAvailableLanguage('fr', false);
    expect(comp.availableLanguages()).not.toContain('fr');
    comp.toggleAvailableLanguage('fr', true);
    expect(comp.availableLanguages()).toContain('fr');
  });

  it('saveLanguages calls updateBundleEnabled with correct enabled flags', async () => {
    const { comp } = create();
    await comp.ngOnInit();
    // Simulate availability only for en & fr
    comp.availableLanguages.set(['en', 'fr']);
    await comp.saveLanguages();
    // Expect calls for all languages
    const codesUpdated = translationService.updateBundleEnabledCalls.map(c => c.code);
    expect(codesUpdated).toContain('en');
    expect(codesUpdated).toContain('fr');
    expect(codesUpdated).toContain('de');
    // Verify enabled flag mapping
    const deCall = translationService.updateBundleEnabledCalls.find(c => c.code === 'de');
    expect(deCall?.enabled).toBeFalse();
    const enCall = translationService.updateBundleEnabledCalls.find(c => c.code === 'en');
    expect(enCall?.enabled).toBeTrue();
  });
});
