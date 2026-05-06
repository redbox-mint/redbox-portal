import { Component, inject, signal, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { Editor, type AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Link from '@tiptap/extension-link';
import { TiptapEditorDirective } from 'ngx-tiptap';
import { TranslationService as PortalTranslationService } from '@researchdatabox/portal-ng-common';

type TranslationEntry = {
  key: string;
  value: any;
  description?: string;
  category?: string;
};

type TranslationEditorMode = 'rich' | 'text' | 'html';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, TiptapEditorDirective],
  templateUrl: './translation.component.html',
  styles: [`
    :host { display: block; }

    /* PANEL CARD — mirrors vocab-panel-card */
    .tx-panel-card {
      background-color: #fff;
      border-color: #d6dbe1;
    }
    .tx-panel-card .panel-heading {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .tx-panel-card .panel-heading .text-muted {
      color: inherit !important;
      opacity: 0.9;
    }
    .tx-panel-card .btn {
      border-radius: 0;
    }
    .tx-panel-card .btn .fa {
      margin-right: 0.4rem;
    }
    .tx-action-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    /* FILTER ROW */
    .tx-filters { margin-bottom: 1rem; }
    .tx-filters label {
      margin-top: 0;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0;
    }
    .tx-filters .form-control {
      min-height: 44px;
      height: auto;
      padding: 0.55rem 0.75rem;
      font-size: 16px;
      line-height: 1.35;
    }
    .tx-editing-language {
      display: flex;
      align-items: stretch;
      gap: 0.75rem;
    }
    .tx-editing-language select {
      min-width: 0;
      flex: 1 1 260px;
    }
    .tx-display-name-btn {
      flex: 0 0 auto;
      white-space: nowrap;
      min-height: 44px;
      padding-left: 0.85rem;
      padding-right: 0.85rem;
    }
    .tx-filters .btn-group .btn-light {
      border-color: #ced4da;
    }

    /* SEARCH INPUT WITH ICON */
    .tx-search-wrap { position: relative; }
    .tx-search-wrap .fa-search {
      position: absolute;
      left: 0.8rem;
      top: 50%;
      transform: translateY(-50%);
      color: #6c757d;
      font-size: 0.95rem;
      pointer-events: none;
    }
    .tx-search-wrap input.form-control {
      padding-left: 2.25rem;
      padding-right: 2.2rem;
    }
    .tx-search-wrap .tx-search-clear {
      position: absolute;
      right: 0.35rem;
      top: 50%;
      transform: translateY(-50%);
      width: 22px;
      height: 22px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: #6c757d;
      cursor: pointer;
      border-radius: 50%;
      padding: 0;
    }
    .tx-search-wrap .tx-search-clear:hover {
      background: #e9ecef;
      color: #212529;
    }

    /* STATS BADGES */
    .tx-stat-badges .badge-light {
      border: 1px solid #d4d9de;
    }

    /* LANGUAGE CHIPS */
    .tx-lang-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 0.7rem;
    }
    .tx-lang-chip {
      position: relative;
      display: flex;
      align-items: center;
      gap: 0.55rem;
      min-height: 48px;
      padding: 0.65rem 0.85rem;
      border: 1px solid #ced4da;
      border-radius: 4px;
      cursor: pointer;
      background: #fff;
      transition: border-color 120ms ease, background 120ms ease;
      user-select: none;
      margin: 0;
    }
    .tx-lang-chip:hover {
      border-color: #6c757d;
      background: #f8f9fa;
    }
    .tx-lang-chip__input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
      width: 1px;
      height: 1px;
    }
    .tx-lang-chip__input:focus-visible + .tx-lang-chip__code {
      outline: 2px solid #b1101a;
      outline-offset: 2px;
    }
    .tx-lang-chip .badge {
      min-width: 48px;
      padding: 0.35rem 0.6rem;
      font-size: 13px;
      letter-spacing: 0;
    }
    .tx-lang-chip__name {
      flex: 1 1 auto;
      font-size: 16px;
      color: #2f353a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tx-lang-chip__check {
      color: #b1101a;
      opacity: 0;
      transition: opacity 120ms ease;
      font-size: 1rem;
    }
    .tx-lang-chip--on {
      border-color: #b1101a;
      background: #fff5f5;
    }
    .tx-lang-chip--on .tx-lang-chip__check { opacity: 1; }
    .tx-lang-chip--on .tx-lang-chip__name { color: #1f1f1f; font-weight: 600; }

    /* DATA TABLE — mirrors vocab-data-table */
    .tx-table-wrap {
      width: 100%;
      overflow-x: auto;
      border: 1px solid #d6dbe1;
      border-radius: 4px;
      background: #fff;
    }
    .tx-data-table {
      width: 100%;
      min-width: 720px;
      border-collapse: collapse;
      border-spacing: 0;
      table-layout: fixed;
    }
    .tx-data-table .tx-col-cat { width: 18%; }
    .tx-data-table .tx-col-key { width: 28%; }
    .tx-data-table .tx-col-val { width: auto; }
    .tx-data-table .tx-col-act { width: 110px; }
    .tx-data-table thead { background: #f8f9fa; }
    .tx-data-table th,
    .tx-data-table td {
      padding: 0.65rem 0.7rem;
      border-bottom: 1px solid #e5e8eb;
      vertical-align: middle;
      color: #2f353a;
    }
    .tx-data-table th {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0;
      color: #59626b;
      text-align: left;
    }
    .tx-data-table tbody tr:hover { background: #f8fbff; }
    .tx-data-table .text-right { text-align: right; }
    .tx-data-table code {
      color: #4b5560;
      background: transparent;
      padding: 0;
      font-size: 0.92em;
    }
    .tx-data-table .action-button + .action-button { margin-left: 0.5rem; }
    .tx-data-table .action-button {
      border-radius: 0;
    }
    .tx-data-table .action-button .fa {
      margin-right: 0.35rem;
    }
    .tx-data-table .tx-cell-val {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
      word-break: break-word;
      line-height: 1.45;
    }
    .tx-data-table .tx-empty-cell {
      text-align: center;
      padding: 1.5rem 0.6rem;
    }

    /* SORT BUTTONS */
    .tx-sort {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0;
      font: inherit;
      letter-spacing: inherit;
      text-transform: inherit;
      color: inherit;
      background: none;
      border: none;
      cursor: pointer;
    }
    .tx-sort:hover { color: #212529; }
    .tx-sort__icon { font-size: 0.7rem; color: #adb5bd; }
    .tx-sort[aria-sort] { color: #212529; }
    .tx-sort[aria-sort] .tx-sort__icon { color: #b1101a; }

    @media (max-width: 767.98px) {
      .tx-editing-language {
        flex-direction: column;
      }
      .tx-display-name-btn {
        width: 100%;
      }
    }

    /* KEY HELP ICON */
    .tx-key-help {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      margin-left: 0.4rem;
      font-size: 0.75rem;
      color: #6c757d;
      text-decoration: none;
      vertical-align: middle;
      border-radius: 50%;
    }
    .tx-key-help:hover { color: #b1101a; background: #f5e7e8; }

    /* MODALS — Bootstrap variants. Custom additions only. */
    .tx-modal-key {
      font-family: 'Consolas', 'Menlo', monospace;
      font-size: 0.95rem;
      background: #f1f3f5;
      padding: 0.15rem 0.45rem;
      border-radius: 3px;
      color: #1f1f1f;
    }
    .tx-modal-desc {
      margin: 0;
      padding: 0.6rem 0.85rem;
      background: #fdf2f3;
      border-left: 3px solid #b1101a;
      border-radius: 3px;
      font-size: 0.92rem;
      color: #2f353a;
      line-height: 1.5;
    }

    /* RICH TEXT EDITOR */
    .tx-editor-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.4rem;
    }
    .tx-editor-mode-group {
      display: inline-flex;
      gap: 0.35rem;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .tx-editor-mode-group .btn {
      border-radius: 0;
      font-size: 0.85rem;
    }
    .tx-editor-mode-group .btn .fa {
      margin-right: 0.35rem;
    }
    .tx-toolbar-rich {
      display: flex;
      align-items: center;
      gap: 0.15rem;
      padding: 0.4rem 0.5rem;
      background: #f8f9fa;
      border: 1px solid #ced4da;
      border-bottom: none;
      border-radius: 4px 4px 0 0;
      flex-wrap: wrap;
    }
    .tx-toolbar-rich--off { opacity: 0.5; pointer-events: none; }
    .tx-toolbar-rich__divider {
      width: 1px;
      height: 18px;
      background: #ced4da;
      margin: 0 0.25rem;
    }
    .tx-tb-btn {
      width: 30px;
      height: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid transparent;
      border-radius: 3px;
      background: transparent;
      color: #2f353a;
      cursor: pointer;
      font-size: 0.9rem;
      padding: 0;
    }
    .tx-tb-btn:hover:not(:disabled) {
      background: #fff;
      border-color: #ced4da;
      color: #b1101a;
    }
    .tx-tb-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .tx-tb-btn:focus-visible {
      outline: 2px solid #b1101a;
      outline-offset: 1px;
    }
    .tx-rich {
      border: 1px solid #ced4da;
      border-radius: 0 0 4px 4px;
      background: #fff;
    }
    :host ::ng-deep .tx-rich .ProseMirror {
      min-height: 220px;
      max-height: 50vh;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 0.85rem 1rem;
      outline: none;
      font-size: 1rem;
      line-height: 1.55;
      color: #212529;
    }
    :host ::ng-deep .tx-rich .ProseMirror > *:first-child { margin-top: 0; }
    :host ::ng-deep .tx-rich .ProseMirror > *:last-child { margin-bottom: 0; }
    :host ::ng-deep .tx-rich .ProseMirror p { margin: 0 0 0.55rem; }
    :host ::ng-deep .tx-rich .ProseMirror h1,
    :host ::ng-deep .tx-rich .ProseMirror h2,
    :host ::ng-deep .tx-rich .ProseMirror h3 {
      font-weight: 700;
      margin: 0.85rem 0 0.45rem;
      color: #1f1f1f;
    }
    :host ::ng-deep .tx-rich .ProseMirror h2 { font-size: 1.25rem; }
    :host ::ng-deep .tx-rich .ProseMirror ul,
    :host ::ng-deep .tx-rich .ProseMirror ol {
      padding-left: 1.4rem;
      margin: 0 0 0.55rem;
    }
    :host ::ng-deep .tx-rich .ProseMirror li { margin: 0.1rem 0; }
    :host ::ng-deep .tx-rich .ProseMirror table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin: 0.6rem 0;
    }
    :host ::ng-deep .tx-rich .ProseMirror th,
    :host ::ng-deep .tx-rich .ProseMirror td {
      border: 1px solid #ced4da;
      padding: 0.45rem 0.55rem;
      vertical-align: top;
    }
    :host ::ng-deep .tx-rich .ProseMirror th {
      background: #f1f3f5;
      font-weight: 600;
      text-align: left;
    }
    :host ::ng-deep .tx-rich .ProseMirror a {
      color: #b1101a;
      text-decoration: underline;
    }
    :host ::ng-deep .tx-rich .ProseMirror blockquote {
      margin: 0.6rem 0;
      padding-left: 0.85rem;
      border-left: 3px solid #ced4da;
      color: #495057;
    }
    :host ::ng-deep .tx-rich .ProseMirror code {
      background: #f1f3f5;
      padding: 0.05rem 0.3rem;
      border-radius: 3px;
      font-size: 0.9em;
      font-family: 'Consolas', 'Menlo', monospace;
    }
    .tx-input-source {
      width: 100%;
      min-height: 220px;
      padding: 0.65rem 0.85rem;
      font-family: 'Consolas', 'Menlo', monospace;
      font-size: 0.9rem;
      line-height: 1.55;
      color: #212529;
      border: 1px solid #ced4da;
      border-radius: 0 0 4px 4px;
      border-top: none;
      resize: vertical;
    }
    .tx-input-source--plain {
      font-family: inherit;
      font-size: 1rem;
    }
    .tx-input-source:focus {
      outline: none;
      border-color: #b1101a;
      box-shadow: 0 0 0 0.15rem rgba(177, 16, 26, 0.18);
    }
  `]
})
export class AppComponent implements OnInit, OnDestroy {
  private svc = inject(PortalTranslationService);

  // Simple state
  languages = signal<any[]>([]);
  availableLanguages = signal<string[]>([]); // Language codes that can be shown
  selectedLang: string = '';
  namespace = 'translation';

  // Entries loaded from the webservice API (include metadata)
  entries = signal<TranslationEntry[]>([]);
  // Distinct categories from entries and current selection
  categories = signal<string[]>([]);
  selectedCategory: string = '';
  filterText = '';
  // View model: filtered + sorted entries for display
  viewEntries = signal<TranslationEntry[]>([]);
  sortBy: 'key' | 'value' | 'category' = 'key';
  sortAsc = true;

  // Modal state for editing entries
  modalOpen = signal(false);
  editKey = '';
  editValue = '';
  editDescription: string | undefined;
  richTextEditor: Editor | null = null;
  editorMode: TranslationEditorMode = 'rich';
  isHtmlSourceMode = false;
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

  // Display name update status
  updatingDisplayName = signal(false);
  displayNameUpdateSuccess = signal(false);
  displayNameUpdateError = signal(false);

  // Language availability save status
  savingLanguages = signal(false);
  saveLanguagesSuccess = signal(false);
  saveLanguagesError = signal(false);

  async ngOnInit() {
    await this.svc.waitForInit();
    await this.loadLanguages();
    // Load the enabled state from bundles instead of showing all by default
    await this.loadAvailableLanguagesFromBundles();
  }

  ngOnDestroy(): void {
    this.destroyRichTextEditor();
  }

  private async loadLanguages() {
    try {
      const list: any[] = await this.svc.listLanguages();
      this.languages.set(Array.isArray(list) ? list : []);
      if (!this.selectedLang && this.languages().length > 0) {
        this.selectedLang = this.languages()[0].code;
        await this.onLangChange();
      }
    } catch (e) {
      console.error('Failed to load languages', e);
      this.languages.set([]);
    }
  }

  private async loadAvailableLanguagesFromBundles() {
    try {
      const enabledLanguages: string[] = [];
      
      // Load bundle information for each language to check enabled status
      for (const lang of this.languages()) {
        try {
          const bundle = await this.svc.getBundle(lang.code, this.namespace);
          if (bundle && bundle.enabled !== false) { // Default to enabled if not specified
            enabledLanguages.push(lang.code);
          }
        } catch (e) {
          console.warn(`Could not load bundle for ${lang.code}, assuming enabled:`, e);
          // If we can't load the bundle, assume it's enabled (backward compatibility)
          enabledLanguages.push(lang.code);
        }
      }
      
      this.availableLanguages.set(enabledLanguages);
    } catch (e) {
      console.error('Failed to load available languages from bundles', e);
      // Fallback: show all languages if we can't load bundle info
      this.availableLanguages.set(this.languages().map(l => l.code));
    }
  }

  async onLangChange() {
    if (!this.selectedLang) return;
    await this.loadEntries();
  }

  // Load individual entries with metadata for the selected language
  private async loadEntries() {
    try {
  const data = await this.svc.listEntries(this.selectedLang, this.namespace);
      this.entries.set(Array.isArray(data) ? data : []);
      // Reset category filter on language change
      this.selectedCategory = '';
      this.refreshDerived();
    } catch (e) {
      console.error('Failed to load entries', e);
      this.entries.set([]);
      this.viewEntries.set([]);
      this.categories.set([]);
    }
  }

  setSort(col: 'key' | 'value' | 'category') {
    if (this.sortBy === col) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortBy = col;
      this.sortAsc = true;
    }
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
  // Reinitialize tooltips after DOM updates
  this.initTooltipsAsync();
  }

  onCategoryChange() {
    this.refreshDerived();
  }

  onFilterTextChange() {
    this.refreshDerived();
  }

  clearFilter() {
    this.filterText = '';
    this.refreshDerived();
  }

  clearAllFilters() {
    this.filterText = '';
    this.selectedCategory = '';
    this.refreshDerived();
  }

  openEdit(entry: TranslationEntry) {
    this.destroyRichTextEditor();
    this.editKey = entry.key;
    const value = this.normalizeHtmlValue(String(entry.value ?? ''));
    this.editValue = value;
    this.editDescription = entry.description;
    this.htmlSourceValue = value;
    this.plainTextValue = value;
    this.editorMode = this.looksLikeHtml(value) ? 'rich' : 'text';
    this.isHtmlSourceMode = false;
    this.richTextEditor = this.createRichTextEditor(this.looksLikeHtml(value) ? value : this.escapeHtml(value));
    this.modalOpen.set(true);
  }

  setEditorMode(mode: TranslationEditorMode) {
    if (this.editorMode === mode) {
      return;
    }
    this.syncValueFromCurrentEditor();
    this.editorMode = mode;
    this.isHtmlSourceMode = mode === 'html';
    if (mode === 'rich' && this.richTextEditor) {
      const source = this.looksLikeHtml(this.editValue) ? this.editValue : this.escapeHtml(this.editValue);
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

  onRichTextUpdate() {
    if (!this.richTextEditor) {
      return;
    }
    this.htmlSourceValue = this.normalizeHtmlValue(this.richTextEditor.getHTML());
    this.plainTextValue = this.richTextEditor.getText();
    this.editValue = this.htmlSourceValue;
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
    if (url === '') {
      this.richTextEditor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      this.richTextEditor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  }

  async saveEdit() {
    if (!this.selectedLang || !this.editKey) return;
    try {
  this.saving.set(true);
  this.saveSuccess.set(false);
  this.saveError.set(false);
  const value = this.getEditorValueForSave();
  await this.svc.setEntry(this.selectedLang, this.namespace, this.editKey, { value });
      // Update local state
  const updated = this.entries().map(e => e.key === this.editKey ? { ...e, value } : e);
  this.entries.set(updated);
  this.refreshDerived();
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
    this.modalOpen.set(false);
    this.destroyRichTextEditor();
    this.isHtmlSourceMode = false;
    this.editorMode = 'rich';
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

  openDisplayNameModal() {
    if (!this.selectedLang) return;
    
    // Load current display name for the language
    this.editDisplayName = this.selectedLang; // Default to language code
    this.displayNameModalOpen.set(true);
    
    // Try to get the current display name from the bundle
    this.loadCurrentDisplayName();
  }

  closeDisplayNameModal() {
    this.displayNameModalOpen.set(false);
    // Reset form fields
    this.editDisplayName = '';
    // Reset status signals
    this.updatingDisplayName.set(false);
    this.displayNameUpdateSuccess.set(false);
    this.displayNameUpdateError.set(false);
  }

  async loadCurrentDisplayName() {
    try {
      const bundle = await this.svc.getBundle(this.selectedLang, this.namespace);
      if (bundle?.displayName) {
        this.editDisplayName = bundle.displayName;
      }
    } catch (e) {
      console.warn('Could not load current display name:', e);
      // Keep the default (language code)
    }
  }

  async updateDisplayName() {
    if (!this.editDisplayName.trim() || !this.selectedLang) {
      return;
    }

    try {
      this.updatingDisplayName.set(true);
      this.displayNameUpdateSuccess.set(false);
      this.displayNameUpdateError.set(false);

      // Update the display name
      await this.svc.updateLanguageDisplayName(this.selectedLang, this.namespace, this.editDisplayName.trim());
      
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
    // Filter the language dropdown to only show selected available languages
    // If current selected language is not in available list, reset selection
    if (this.selectedLang && !this.availableLanguages().includes(this.selectedLang)) {
      this.selectedLang = this.availableLanguages().length > 0 ? this.availableLanguages()[0] : '';
      if (this.selectedLang) {
        this.onLangChange();
      }
    }
  }

  toggleAvailableLanguage(code: string, checked: boolean) {
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
        onUpdate: ({ editor }) => this.onRichTextUpdateFromEditor(editor),
      });
      return editor;
    } catch (e) {
      console.error('Failed to create translation rich text editor', e);
      return null;
    }
  }

  private onRichTextUpdateFromEditor(editor: Editor) {
    this.htmlSourceValue = this.normalizeHtmlValue(editor.getHTML());
    this.plainTextValue = editor.getText();
    this.editValue = this.htmlSourceValue;
  }

  private syncValueFromCurrentEditor() {
    if (this.editorMode === 'rich' && this.richTextEditor) {
      this.htmlSourceValue = this.normalizeHtmlValue(this.richTextEditor.getHTML());
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
      return this.normalizeHtmlValue(this.richTextEditor?.getHTML() ?? this.editValue);
    }
    if (this.editorMode === 'html') {
      return this.htmlSourceValue;
    }
    return this.plainTextValue;
  }

  private buildRichTextExtensions(): AnyExtension[] {
    return [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ];
  }

  private destroyRichTextEditor() {
    this.richTextEditor?.destroy();
    this.richTextEditor = null;
  }

  private normalizeHtmlValue(value: string) {
    return value === '<p></p>' ? '' : value;
  }

  private looksLikeHtml(value: string) {
    return /<\/?[a-z][\s\S]*>/i.test(value);
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

  // Initialize Bootstrap tooltips (supports Bootstrap 3 and 5);
  // called after viewEntries updates to ensure DOM is ready.
  private initTooltipsAsync() {
    // Defer until after change detection paints
    setTimeout(() => this.initTooltipsSafe(), 0);
  }

  private initTooltipsSafe() {
    try {
      const w: any = window as any;
      // Bootstrap 5: instantiate Tooltip on elements with data-bs-toggle
      if (w.bootstrap && typeof w.bootstrap.Tooltip === 'function') {
        const els = Array.from(document.querySelectorAll('[data-bs-toggle="tooltip"]')) as HTMLElement[];
        els.forEach(el => {
          // If a tooltip instance already exists, skip
          try { new w.bootstrap.Tooltip(el, { container: 'body' }); } catch (_) { /* no-op */ }
        });
        return;
      }
      // Bootstrap 3: use jQuery plugin $('[data-toggle="tooltip"]').tooltip()
      const $: any = w.jQuery || w.$;
      if ($ && typeof $.fn?.tooltip === 'function') {
        $('[data-toggle="tooltip"]').tooltip({ container: 'body' });
      }
    } catch (_) {
      // ignore; native title still provides a fallback
    }
  }
}
