import { TestBed } from '@angular/core/testing';
import { AppComponent } from './translation.component';
import { FormBuilder } from '@angular/forms';
import { APP_BASE_HREF } from '@angular/common';
import { signal } from '@angular/core';
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
    if (idx >= 0) list[idx] = { ...list[idx], value: payload.value };
    else list.push({ key, value: payload.value });
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

  it('openEdit and saveEdit update entry value', async () => {
    const { comp } = create();
    comp.selectedLang = 'en';
    comp.entries.set([{ key: 'greet.hello', value: 'Hello', category: 'greetings' }]);
    comp.openEdit({ key: 'greet.hello', value: 'Hello' });
    expect(comp.modalOpen()).toBeTrue();
    comp.editValue = 'Hi';
    await comp.saveEdit();
    const updated = comp.entries().find(e => e.key === 'greet.hello');
    expect(updated?.value).toBe('Hi');
    expect(translationService.setEntryCalls.length).toBe(1);
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
