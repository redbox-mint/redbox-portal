import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { TranslationService as PortalTranslationService } from '@researchdatabox/portal-ng-common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './translation.component.html',
  styles: [`
    .table th { cursor: pointer; user-select: none; }
    /* Align key text and help badge */
    td > span.text-truncate { vertical-align: middle; }
    a.key-help { vertical-align: middle; padding-top: 0 !important; line-height: 1.2; display: inline-block; }
  `]
})
export class AppComponent implements OnInit {
  private svc = inject(PortalTranslationService);

  // Simple state
  languages = signal<string[]>([]);
  availableLanguages = signal<string[]>([]); // Languages that can be shown
  selectedLang: string = '';
  namespace = 'translation';

  // Entries loaded from the webservice API (include metadata)
  entries = signal<Array<{ key: string; value: any; description?: string; category?: string }>>([]);
  // Distinct categories from entries and current selection
  categories = signal<string[]>([]);
  selectedCategory: string = '';
  // View model: filtered + sorted entries for display
  viewEntries = signal<Array<{ key: string; value: any; description?: string; category?: string }>>([]);
  sortBy: 'key' | 'value' | 'category' = 'key';
  sortAsc = true;

  // Modal state for editing entries
  modalOpen = signal(false);
  editKey = '';
  editValue: any = '';
  editDescription: string | undefined;

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

  async ngOnInit() {
    await this.svc.waitForInit();
    await this.loadLanguages();
    // Initialize available languages to show all by default
    this.availableLanguages.set([...this.languages()]);
  }

  private async loadLanguages() {
    try {
      const list = await this.svc.listLanguages();
      this.languages.set(Array.isArray(list) ? list : []);
      if (!this.selectedLang && this.languages().length > 0) {
        this.selectedLang = this.languages()[0];
        await this.onLangChange();
      }
    } catch (e) {
      console.error('Failed to load languages', e);
      this.languages.set([]);
    }
  }  async onLangChange() {
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

  openEdit(entry: { key: string; value: any; description?: string }) {
    this.editKey = entry.key;
    this.editValue = entry.value;
    this.editDescription = entry.description;
    this.modalOpen.set(true);
  }

  async saveEdit() {
    if (!this.selectedLang || !this.editKey) return;
    try {
  this.saving.set(true);
  this.saveSuccess.set(false);
  this.saveError.set(false);
  await this.svc.setEntry(this.selectedLang, this.namespace, this.editKey, { value: this.editValue });
      // Update local state
  const updated = this.entries().map(e => e.key === this.editKey ? { ...e, value: this.editValue } : e);
  this.entries.set(updated);
  this.refreshDerived();
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

  closeModal() { this.modalOpen.set(false); }

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
      
      // Update available languages to include the new one
      const currentAvailable = this.availableLanguages();
      if (!currentAvailable.includes(this.newLanguageCode.trim())) {
        this.availableLanguages.set([...currentAvailable, this.newLanguageCode.trim()]);
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

  // Check if a language is available for display
  isLanguageAvailable(lang: string): boolean {
    return this.availableLanguages().includes(lang);
  }

  // Get filtered languages for dropdown
  getFilteredLanguages(): string[] {
    return this.languages().filter(lang => this.isLanguageAvailable(lang));
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
