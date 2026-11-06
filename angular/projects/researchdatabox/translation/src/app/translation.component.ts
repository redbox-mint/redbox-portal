import { AdminCountPipe, AdminModalDirective } from '@researchdatabox/portal-ng-common';
import { Component, CSP_NONCE, inject, signal, OnDestroy, OnInit } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { Editor, type AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import Link from '@tiptap/extension-link';
import { TiptapEditorDirective } from 'ngx-tiptap';
import { DomSanitizer } from '@angular/platform-browser';
import { ConfigService, I18NextPipe, TranslationService as PortalTranslationService } from '@researchdatabox/portal-ng-common';
import { getTranslationHtmlClasses } from '@researchdatabox/sails-ng-common';
import { restoreTranslationTableSections, sanitizeTranslationEditorHtml, translationPresentationExtensions, translationTableView,
  TranslationTableHeader, TranslationTableCell } from './translation-html';

type TranslationContentFormat = 'plain' | 'html';

type TranslationEntry = {
  key: string;
  value: any;
  description?: string;
  category?: string;
  contentFormat?: TranslationContentFormat;
  provenance?: 'default' | 'override' | 'missing';
  hasDefault?: boolean;
};

type ReadKind = 'languages' | 'entries' | 'bundles' | 'displayName';

type TranslationEditorMode = 'rich' | 'text' | 'html';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AdminCountPipe, AdminModalDirective, CommonModule, FormsModule, HttpClientModule, A11yModule, I18NextPipe, TiptapEditorDirective],
  templateUrl: './translation.component.html',
  styleUrls: ['./translation.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  private svc = inject(PortalTranslationService);
  private configService = inject(ConfigService);
  private sanitizer = inject(DomSanitizer);
  private cspNonce = inject(CSP_NONCE, { optional: true });
  private allowedClasses = getTranslationHtmlClasses();

  readWarnings = signal<Partial<Record<ReadKind, string>>>({});
  readPending = signal<Partial<Record<ReadKind, boolean>>>({});
  private readRequests: Record<ReadKind, number> = { languages: 0, entries: 0, bundles: 0, displayName: 0 };
  private destroyed = false;
  private entriesContext = '';
  private editedAvailability = new Set<string>();

  // Read errors are advisory only. Retries use the current context and never write data.
  private async read(kind: ReadKind, relevant: () => boolean, load: () => Promise<() => boolean | void>, warning: string) {
    const request = ++this.readRequests[kind];
    this.readPending.update(state => ({ ...state, [kind]: true }));
    const current = () => !this.destroyed && request === this.readRequests[kind] && relevant();
    try {
      const apply = await load();
      if (!current()) return;
      const complete = apply() !== false;
      this.readWarnings.update(state => ({ ...state, [kind]: complete ? undefined : warning }));
    } catch (error) {
      console.error(`Failed to load translation ${kind}`, error);
      if (current()) this.readWarnings.update(state => ({ ...state, [kind]: warning }));
    } finally {
      if (request === this.readRequests[kind]) this.readPending.update(state => ({ ...state, [kind]: false }));
    }
  }

  async retryLanguages() {
    await this.ngOnInit();
  }

  // Simple state
  languages = signal<any[]>([]);
  availableLanguages = signal<string[]>([]); // Language codes that can be shown
  selectedLang: string = '';
  namespace = 'translation';
  brandingAndPortalUrl = '';
  defaultLanguage = 'en';
  displayNameLanguage = '';
  availabilityDirty = signal(false);

  // Entries loaded from the webservice API (include metadata)
  entries = signal<TranslationEntry[]>([]);
  // Distinct categories from entries and current selection
  categories = signal<string[]>([]);
  selectedCategory: string = '';
  filterText = '';
  show: 'all' | 'missing' | 'override' = 'all';
  // View model: filtered + sorted entries for display
  viewEntries = signal<TranslationEntry[]>([]);
  sortBy: 'key' | 'value' | 'category' = 'key';
  sortAsc = true;
  page = 1;
  pageSize = 50;
  pageEntries = signal<TranslationEntry[]>([]);

  get totalPages(): number { return Math.max(1, Math.ceil(this.viewEntries().length / this.pageSize)); }
  get rangeStart(): number { return this.viewEntries().length ? (this.page - 1) * this.pageSize + 1 : 0; }
  get rangeEnd(): number { return Math.min(this.page * this.pageSize, this.viewEntries().length); }
  get visiblePages(): number[] {
    const start = Math.max(1, Math.min(this.page - 2, this.totalPages - 4));
    return Array.from({ length: Math.min(5, this.totalPages) }, (_, index) => start + index);
  }

  setPage(page: number) {
    this.page = Math.max(1, Math.min(page, this.totalPages));
    this.pageEntries.set(this.viewEntries().slice((this.page - 1) * this.pageSize, this.page * this.pageSize));
  }

  onPageSizeChange() { this.setPage(1); }
  keySegments(key: string): string[] {
    return key.split(/(?<=[.-])/);
  }

  trackByKey(_index: number, entry: TranslationEntry): string { return entry.key; }

  // Modal state for editing entries
  modalOpen = signal(false);
  editKey = '';
  editValue = '';
  editDescription: string | undefined;
  richTextEditor: Editor | null = null;
  editorMode: TranslationEditorMode = 'rich';
  editContentFormat: TranslationContentFormat = 'plain';
  htmlSourceValue = '';
  plainTextValue = '';

  // Modal state for language management
  languageModalOpen = signal(false);
  newLanguageCode = '';
  newLanguageDisplayName = '';
  sourceLanguage = 'en';

  // Save status signals
  saving = signal(false);
  saveSuccess = signal(false);
  saveError = signal(false);

  // Language creation status
  creatingLanguage = signal(false);
  languageCreateSuccess = signal(false);
  languageCreateError = signal(false);

  // Modal state for display name editing
  displayNameModalOpen = signal(false);
  editDisplayName = '';
  displayNameEdited = false;

  // Display name update status
  updatingDisplayName = signal(false);
  displayNameUpdateSuccess = signal(false);
  displayNameUpdateError = signal(false);

  // Language availability save status
  savingLanguages = signal(false);
  saveLanguagesSuccess = signal(false);
  saveLanguagesError = signal(false);

  async ngOnInit() {
    try {
      await this.svc.waitForInit();
      const config = await this.configService.getConfig();
      this.allowedClasses = getTranslationHtmlClasses(config?.translationEditor?.allowedClasses);
      this.brandingAndPortalUrl = `${config.baseUrl || ''}/${config.branding}/${config.portal}`;
      const fallback = config.i18NextOpts?.fallbackLng;
      this.defaultLanguage = (Array.isArray(fallback) ? fallback[0] : fallback) || 'en';
      await this.loadLanguages();
      if (!this.readWarnings().languages) await this.loadAvailableLanguagesFromBundles();
    } catch (error) {
      console.error('Failed to initialise translation reads', error);
      if (!this.destroyed) this.readWarnings.update(state => ({ ...state,
        languages: 'Languages could not be loaded. The list may be incomplete; retry to load the current configuration.' }));
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.destroyRichTextEditor();
  }

  private async loadLanguages() {
    await this.read('languages', () => true, async () => {
      const list = await this.svc.listLanguages(true);
      return () => this.languages.set(Array.isArray(list) ? list : []);
    }, 'Languages could not be loaded. The list may be incomplete; an empty list does not confirm that no languages exist.');
    if (!this.destroyed && !this.selectedLang && this.languages().length > 0) {
      this.selectedLang = this.languages()[0].code;
      await this.onLangChange();
    }
  }

  async loadAvailableLanguagesFromBundles() {
    const namespace = this.namespace;
    const codes = this.languages().map(lang => lang.code);
    await this.read('bundles', () => namespace === this.namespace &&
      JSON.stringify(codes) === JSON.stringify(this.languages().map(lang => lang.code)), async () => {
      const enabled: string[] = [];
      const failed: string[] = [];
      for (const code of codes) {
        try {
          const bundle = await this.svc.getBundle(code, namespace);
          if (bundle && bundle.enabled !== false) enabled.push(code);
        } catch (error) {
          console.warn(`Could not load bundle for ${code}`, error);
          failed.push(code);
          // Preserve the safe default, or the previously loaded setting.
          if (this.availableLanguages().includes(code) || !this.bundleContexts.has(JSON.stringify([namespace, code]))) enabled.push(code);
        }
      }
      return () => {
        this.availableLanguages.set(codes.filter(code => this.editedAvailability.has(code)
          ? this.availableLanguages().includes(code) : enabled.includes(code)));
        for (const code of codes) this.bundleContexts.add(JSON.stringify([namespace, code]));
        return failed.length === 0;
      };
    }, 'Language availability could not be fully loaded. Previous settings or enabled defaults are shown and may be inaccurate.');
  }
  private bundleContexts = new Set<string>();

  async onLangChange() {
    this.page = 1;
    await this.loadEntries();
  }

  async loadEntries() {
    const lang = this.selectedLang;
    const namespace = this.namespace;
    const context = JSON.stringify([lang, namespace]);
    if (context !== this.entriesContext) {
      this.entriesContext = context;
      this.entries.set([]);
      this.selectedCategory = '';
      this.refreshDerived();
      this.readWarnings.update(state => ({ ...state, entries: undefined }));
    }
    await this.read('entries', () => lang === this.selectedLang && namespace === this.namespace, async () => {
      const data = lang ? await this.svc.listEntries(lang, namespace) : [];
      return () => {
        this.entries.set(Array.isArray(data) ? data : []);
        this.refreshDerived();
      };
    }, 'Translation entries could not be loaded. The list may be incomplete; an empty list does not confirm that no entries exist.');
  }

  setSort(col: 'key' | 'value' | 'category') {
    if (this.sortBy === col) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortBy = col;
      this.sortAsc = true;
    }
    this.page = 1;
    this.refreshDerived();
  }

  private refreshDerived() {
    const data = this.entries();
    // Update categories
    const catSet = new Set<string>();
    for (const e of data) {
      if (e.category && e.category.trim().length > 0) catSet.add(e.category);
    }
    const cats = Array.from(catSet).sort((a, b) => a.localeCompare(b));
    this.categories.set(cats);

    // Filter by category
    let filtered = data;
    if (this.selectedCategory) {
      filtered = data.filter(e => (e.category || '') === this.selectedCategory);
    }

    if (this.show !== 'all') filtered = filtered.filter(e => e.provenance === this.show);

    const filter = this.filterText.trim().toLowerCase();
    if (filter) {
      filtered = filtered.filter(e => {
        const key = String(e.key ?? '').toLowerCase();
        const value = String(e.value ?? '').toLowerCase();
        return key.includes(filter) || value.includes(filter);
      });
    }

    // Sort
    const dir = this.sortAsc ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      let av: string;
      let bv: string;
      if (this.sortBy === 'key') {
        av = String(a.key);
        bv = String(b.key);
      } else if (this.sortBy === 'value') {
        av = String(a.value ?? '');
        bv = String(b.value ?? '');
      } else { // category
        av = String(a.category ?? '');
        bv = String(b.category ?? '');
      }
      return av.localeCompare(bv) * dir;
    });
    this.viewEntries.set(sorted);
    this.setPage(this.page);
  }

  importModalOpen = signal(false);
  importBusy = signal(false);
  importError = signal('');
  importPreview = signal<any>(null);
  importResult = signal<any>(null);
  importJson = '';
  importFileName = '';
  keepUnknown = false;
  importLanguage = '';
  private importNamespace = '';
  private importRead = 0;

  get exportUrl(): string { return this.svc.translationExportUrl(this.selectedLang, this.namespace); }

  openImport() {
    if (!this.selectedLang) return;
    this.importLanguage = this.selectedLang;
    this.importNamespace = this.namespace;
    this.importJson = '';
    this.importFileName = '';
    this.keepUnknown = false;
    this.importError.set('');
    this.importPreview.set(null);
    this.importResult.set(null);
    this.importModalOpen.set(true);
  }

  closeImport() {
    if (this.importBusy()) return;
    ++this.importRead;
    this.importModalOpen.set(false);
  }

  invalidateImportPreview() {
    this.importPreview.set(null);
    this.importResult.set(null);
    this.importError.set('');
  }

  async readImportFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    const request = ++this.importRead;
    this.invalidateImportPreview();
    this.importJson = '';
    this.importFileName = file?.name || '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { this.importError.set('admin-tx-import-size-error'); return; }
    this.importBusy.set(true);
    try {
      const json = await file.text();
      if (request === this.importRead && this.importModalOpen()) this.importJson = json;
    } catch (_error) { this.importError.set('admin-tx-import-file-error'); }
    finally { this.importBusy.set(false); }
  }

  async previewImport() {
    if (!this.importJson || this.importBusy()) return;
    this.importBusy.set(true);
    this.importError.set('');
    this.importPreview.set(null);
    this.importResult.set(null);
    try {
      this.importPreview.set(await this.svc.previewTranslationImport(this.importLanguage, this.importNamespace, this.importJson, this.keepUnknown));
    } catch (_error) { this.importError.set('admin-tx-import-preview-error'); }
    finally { this.importBusy.set(false); }
  }

  async applyImport() {
    const preview = this.importPreview();
    if (!preview || this.importBusy()) return;
    this.importBusy.set(true);
    this.importError.set('');
    try {
      this.importResult.set(await this.svc.applyTranslationImport(this.importLanguage, this.importNamespace, this.importJson, this.keepUnknown, preview.previewToken));
      this.importPreview.set(null);
      await this.loadEntries();
      await this.loadLanguages();
    } catch (error) {
      this.importPreview.set(null);
      this.importError.set((error as { status?: number }).status === 409 ? 'admin-tx-import-stale' : 'admin-tx-import-apply-error');
    } finally { this.importBusy.set(false); }
  }

  setShow(show: 'all' | 'missing' | 'override') {
    this.show = show;
    this.page = 1;
    this.refreshDerived();
  }

  async revertEntry(entry: TranslationEntry) {
    if (this.saving() || entry.provenance !== 'override' || !entry.hasDefault) return;
    this.saving.set(true);
    this.saveError.set(false);
    try {
      await this.svc.revertEntry(this.selectedLang, this.namespace, entry.key);
      await this.loadEntries();
      await this.loadLanguages();
      this.saveSuccess.set(true);
    } catch (_error) { this.saveError.set(true); }
    finally { this.saving.set(false); }
  }

  onCategoryChange() {
    this.page = 1;
    this.refreshDerived();
  }

  onFilterTextChange() {
    this.page = 1;
    this.refreshDerived();
  }

  clearFilter() {
    this.page = 1;
    this.filterText = '';
    this.refreshDerived();
  }

  clearAllFilters() {
    this.page = 1;
    this.filterText = '';
    this.selectedCategory = '';
    this.show = 'all';
    this.refreshDerived();
  }

  openEdit(entry: TranslationEntry) {
    this.destroyRichTextEditor();
    this.saveError.set(false);
    this.editKey = entry.key;
    this.editContentFormat = this.normalizeContentFormat(entry.contentFormat);
    const rawValue = String(entry.value ?? '');
    const value = this.editContentFormat === 'html' ? this.normalizeHtmlValue(this.sanitizeHtml(rawValue)) : rawValue;
    this.editValue = value;
    this.editDescription = entry.description;
    this.htmlSourceValue = value;
    this.plainTextValue = value;
    this.editorMode = this.editContentFormat === 'html' ? 'rich' : 'text';
    this.richTextEditor = this.createRichTextEditor(this.editContentFormat === 'html' ? value : this.escapeHtml(value));
    this.modalOpen.set(true);
  }

  setEditorMode(mode: TranslationEditorMode) {
    if (this.editorMode === mode) {
      return;
    }
    const previousMode = this.editorMode;
    this.syncValueFromCurrentEditor();
    this.editorMode = mode;
    this.editContentFormat = mode === 'text' ? 'plain' : 'html';
    if (mode === 'rich' && this.richTextEditor) {
      const source = previousMode === 'text' ? this.escapeHtml(this.editValue) : this.sanitizeHtml(this.editValue);
      this.richTextEditor.commands.setContent(source);
    }
  }

  toggleHtmlSourceMode() {
    this.setEditorMode(this.editorMode === 'html' ? 'rich' : 'html');
  }

  onHtmlSourceChange(value: string) {
    this.htmlSourceValue = value;
    this.editValue = value;
  }

  onPlainTextChange(value: string) {
    this.plainTextValue = value;
    this.editValue = value;
  }

  toggleBold() { this.richTextEditor?.chain().focus().toggleBold().run(); }
  toggleItalic() { this.richTextEditor?.chain().focus().toggleItalic().run(); }
  toggleHeading() { this.richTextEditor?.chain().focus().toggleHeading({ level: 2 }).run(); }
  toggleBulletList() { this.richTextEditor?.chain().focus().toggleBulletList().run(); }
  toggleOrderedList() { this.richTextEditor?.chain().focus().toggleOrderedList().run(); }
  insertTable() { this.richTextEditor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); }
  undoRichText() { this.richTextEditor?.chain().focus().undo().run(); }
  redoRichText() { this.richTextEditor?.chain().focus().redo().run(); }

  toggleLink() {
    if (!this.richTextEditor) return;
    const previous = this.richTextEditor.getAttributes('link')?.['href'] ?? '';
    const url = window.prompt('Enter URL (leave blank to remove the link)', previous);
    if (url === null) return;
    const validatedUrl = this.normalizeAndValidateLinkUrl(url);
    if (validatedUrl === null) {
      window.alert('Invalid URL. Only http, https, and mailto links are allowed.');
      return;
    }

    if (validatedUrl === '') {
      this.richTextEditor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      this.richTextEditor.chain().focus().extendMarkRange('link').setLink({ href: validatedUrl }).run();
    }
  }

  async saveEdit() {
    if (!this.selectedLang || !this.editKey || this.saving()) return;
    try {
      this.saving.set(true);
      this.saveSuccess.set(false);
      this.saveError.set(false);
      const value = this.getEditorValueForSave();
      const contentFormat = this.editContentFormat;
      const saved: unknown = await this.svc.setEntry(this.selectedLang, this.namespace, this.editKey, { value, contentFormat });
      const savedValue = saved && typeof saved === 'object' && 'value' in saved ? saved.value : value;
      // Update local state
      const provenance = saved && typeof saved === 'object' && 'provenance' in saved ? (saved as TranslationEntry).provenance : undefined;
      const updated = this.entries().map(e => e.key === this.editKey ? { ...e, value: savedValue, contentFormat, ...(provenance ? { provenance } : {}) } : e);
      this.entries.set(updated);
      this.refreshDerived();
      await this.loadLanguages();
      this.destroyRichTextEditor();
      this.modalOpen.set(false);
      this.saving.set(false);
      this.saveSuccess.set(true);
      // Auto-hide success after a short delay
      setTimeout(() => this.saveSuccess.set(false), 5000);
    } catch (e) {
      console.error('Failed to save entry', e);
      this.saving.set(false);
      this.saveError.set(true);
      // Auto-hide error after delay (leave longer than success)
      setTimeout(() => this.saveError.set(false), 8000);
    }
  }

  closeModal() {
    if (this.saving()) return;
    this.modalOpen.set(false);
    this.destroyRichTextEditor();
    this.editorMode = 'rich';
    this.editContentFormat = 'plain';
    this.htmlSourceValue = '';
    this.plainTextValue = '';
    this.editValue = '';
  }

  // Language management methods
  openLanguageModal() {
    this.languageModalOpen.set(true);
    this.newLanguageCode = '';
    this.sourceLanguage = 'en';
    this.languageCreateSuccess.set(false);
    this.languageCreateError.set(false);
  }

  closeLanguageModal() {
    this.languageModalOpen.set(false);
    // Reset form fields
    this.newLanguageCode = '';
    this.newLanguageDisplayName = '';
    this.sourceLanguage = 'en';
    // Reset status signals
    this.creatingLanguage.set(false);
    this.languageCreateSuccess.set(false);
    this.languageCreateError.set(false);
  }

  async createNewLanguage() {
    if (!this.newLanguageCode.trim()) {
      return;
    }

    try {
      this.creatingLanguage.set(true);
      this.languageCreateSuccess.set(false);
      this.languageCreateError.set(false);

      // Create the new language by copying from source, with optional display name
      const displayName = this.newLanguageDisplayName.trim() || undefined;
      await this.svc.createLanguage(this.newLanguageCode.trim(), this.sourceLanguage, this.namespace, displayName);

      // Refresh the language list
      await this.loadLanguages();

      // Update available languages to include the new one (new languages are enabled by default)
      const currentAvailable = this.availableLanguages();
      const newLangCode = this.newLanguageCode.trim();
      if (!currentAvailable.includes(newLangCode)) {
        this.availableLanguages.set([...currentAvailable, newLangCode]);
      }

      this.creatingLanguage.set(false);
      this.languageCreateSuccess.set(true);

      // Auto-hide success after delay
      setTimeout(() => {
        this.languageCreateSuccess.set(false);
        this.closeLanguageModal();
      }, 3000);

    } catch (e) {
      console.error('Failed to create language', e);
      this.creatingLanguage.set(false);
      this.languageCreateError.set(true);
      setTimeout(() => this.languageCreateError.set(false), 8000);
    }
  }

  openDisplayNameModal(code = this.selectedLang) {
    if (!code) return;

    // Load current display name for the language
    this.displayNameLanguage = code;
    this.displayNameEdited = false;
    this.editDisplayName = code; // Default to language code
    this.displayNameModalOpen.set(true);

    // Try to get the current display name from the bundle
    this.loadCurrentDisplayName();
  }

  closeDisplayNameModal() {
    ++this.readRequests.displayName;
    this.readPending.update(state => ({ ...state, displayName: false }));
    this.readWarnings.update(state => ({ ...state, displayName: undefined }));
    this.displayNameModalOpen.set(false);
    // Reset form fields
    this.editDisplayName = '';
    // Reset status signals
    this.updatingDisplayName.set(false);
    this.displayNameUpdateSuccess.set(false);
    this.displayNameUpdateError.set(false);
  }

  async loadCurrentDisplayName() {
    const lang = this.displayNameLanguage;
    const namespace = this.namespace;
    const value = this.editDisplayName;
    await this.read('displayName', () => this.displayNameModalOpen() && lang === this.displayNameLanguage && namespace === this.namespace, async () => {
      const bundle = await this.svc.getBundle(lang, namespace);
      return () => {
        if (!this.displayNameEdited && this.editDisplayName === value && bundle?.displayName) this.editDisplayName = bundle.displayName;
      };
    }, 'The current display name could not be loaded. The language code or your existing text is shown.');
  }

  async updateDisplayName() {
    if (!this.editDisplayName.trim() || !this.displayNameLanguage) {
      return;
    }

    try {
      this.updatingDisplayName.set(true);
      this.displayNameUpdateSuccess.set(false);
      this.displayNameUpdateError.set(false);

      // Update the display name
      await this.svc.updateLanguageDisplayName(this.displayNameLanguage, this.namespace, this.editDisplayName.trim());
      this.languages.update(languages => languages.map(language => language.code === this.displayNameLanguage
        ? { ...language, displayName: this.editDisplayName.trim() } : language));

      this.updatingDisplayName.set(false);
      this.displayNameUpdateSuccess.set(true);

      // Auto-hide success after delay
      setTimeout(() => {
        this.displayNameUpdateSuccess.set(false);
        this.closeDisplayNameModal();
      }, 3000);

    } catch (e) {
      console.error('Failed to update display name', e);
      this.updatingDisplayName.set(false);
      this.displayNameUpdateError.set(true);
      setTimeout(() => this.displayNameUpdateError.set(false), 8000);
    }
  }

  onAvailableLanguagesChange() {
    if (!this.availableLanguages().includes(this.selectedLang)) {
      this.selectedLang = this.availableLanguages()[0] || '';
      this.onLangChange();
    }
  }

  toggleAvailableLanguage(code: string, checked: boolean) {
    this.editedAvailability.add(code);
    this.availabilityDirty.set(true);
    const current = this.availableLanguages();
    if (checked) {
      if (!current.includes(code)) {
        this.availableLanguages.set([...current, code]);
      }
    } else {
      this.availableLanguages.set(current.filter(c => c !== code));
    }
    this.onAvailableLanguagesChange();
  }

  async saveLanguages() {
    if (this.savingLanguages()) return;

    try {
      this.savingLanguages.set(true);
      this.saveLanguagesSuccess.set(false);
      this.saveLanguagesError.set(false);

      // Update enabled status for each language bundle
      const updatePromises = this.languages().map(lang => {
        const enabled = this.isLanguageAvailable(lang.code);
        return this.svc.updateBundleEnabled(lang.code, 'translation', enabled);
      });

      await Promise.all(updatePromises);

      this.savingLanguages.set(false);
      this.saveLanguagesSuccess.set(true);
      this.editedAvailability.clear();
      this.availabilityDirty.set(false);
      // Auto-hide success after a short delay
      setTimeout(() => this.saveLanguagesSuccess.set(false), 5000);

      // Refresh the languages list and available languages to get updated data
      await this.loadLanguages();
      await this.loadAvailableLanguagesFromBundles();

    } catch (e) {
      console.error('Failed to save language settings', e);
      this.savingLanguages.set(false);
      this.saveLanguagesError.set(true);
      // Auto-hide error after delay
      setTimeout(() => this.saveLanguagesError.set(false), 8000);
    }
  }

  // Check if a language is available for display
  isLanguageAvailable(langCode: string): boolean {
    return this.availableLanguages().includes(langCode);
  }

  // Get filtered languages for dropdown
  getFilteredLanguages(): { code: string; displayName: string; }[] {
    return this.languages().filter(lang => this.isLanguageAvailable(lang.code));
  }

  // URL builder not needed; handled in service

  // Utilities
  private flatten(obj: any, prefix = '', out: any = {}): any {
    for (const key of Object.keys(obj || {})) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        this.flatten(value, newKey, out);
      } else {
        out[newKey] = value;
      }
    }
    return out;
  }

  private createRichTextEditor(content: string): Editor | null {
    try {
      const editor = new Editor({
        extensions: this.buildRichTextExtensions(),
        content: content || '',
        editable: true,
        editorProps: { attributes: { cdkFocusInitial: '', role: 'textbox', 'aria-multiline': 'true', 'aria-labelledby': 'tx-translation-value-label' } },
        injectNonce: this.cspNonce || undefined,
        onUpdate: ({ editor }) => this.onRichTextUpdateFromEditor(editor),
      });
      return editor;
    } catch (e) {
      console.error('Failed to create translation rich text editor', e);
      return null;
    }
  }

  private onRichTextUpdateFromEditor(editor: Editor) {
    this.htmlSourceValue = this.normalizeHtmlValue(this.exportEditorHtml(editor));
    this.plainTextValue = editor.getText();
    this.editValue = this.htmlSourceValue;
  }

  private syncValueFromCurrentEditor() {
    if (this.editorMode === 'rich' && this.richTextEditor) {
      this.htmlSourceValue = this.normalizeHtmlValue(this.exportEditorHtml(this.richTextEditor));
      this.plainTextValue = this.richTextEditor.getText();
      this.editValue = this.htmlSourceValue;
      return;
    }
    if (this.editorMode === 'html') {
      this.editValue = this.htmlSourceValue;
      return;
    }
    this.editValue = this.plainTextValue;
  }

  private getEditorValueForSave() {
    this.syncValueFromCurrentEditor();
    if (this.editorMode === 'rich') {
      return this.normalizeHtmlValue(this.richTextEditor ? this.exportEditorHtml(this.richTextEditor) : this.sanitizeHtml(this.editValue));
    }
    if (this.editorMode === 'html') {
      return this.sanitizeHtml(this.htmlSourceValue);
    }
    return this.plainTextValue;
  }

  private buildRichTextExtensions(): AnyExtension[] {
    return [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: false }),
      Table.configure({ resizable: true, View: translationTableView(this.allowedClasses) }),
      TableRow,
      TranslationTableHeader,
      TranslationTableCell,
      ...translationPresentationExtensions(this.allowedClasses),
    ];
  }

  private sanitizeHtml(value: string): string {
    return sanitizeTranslationEditorHtml(value, this.sanitizer, this.allowedClasses);
  }

  private exportEditorHtml(editor: Editor): string {
    return this.sanitizeHtml(restoreTranslationTableSections(editor.getHTML()));
  }

  private destroyRichTextEditor() {
    const destroy = this.richTextEditor?.destroy;
    if (typeof destroy === 'function') {
      destroy.call(this.richTextEditor);
    }
    this.richTextEditor = null;
  }

  private normalizeAndValidateLinkUrl(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    try {
      const parsed = new URL(trimmed);
      const protocol = parsed.protocol.toLowerCase();
      if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:') {
        return trimmed;
      }
      return null;
    } catch {
      return null;
    }
  }

  private normalizeHtmlValue(value: string) {
    return value === '<p></p>' ? '' : value;
  }

  private normalizeContentFormat(value: unknown): TranslationContentFormat {
    return value === 'html' || value === 'plain' ? value : 'plain';
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private unflatten(flatObj: any): any {
    const result: any = {};
    for (const flatKey of Object.keys(flatObj || {})) {
      const parts = flatKey.split('.');
      let cursor = result;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (i === parts.length - 1) {
          cursor[p] = flatObj[flatKey];
        } else {
          if (cursor[p] == null || typeof cursor[p] !== 'object') cursor[p] = {};
          cursor = cursor[p];
        }
      }
    }
    return result;
  }

}
