import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';

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
  private http = inject(HttpClient);

  // Simple state
  languages = signal<string[]>([]);
  selectedLang: string = '';
  namespace = 'translation';

  // Entries loaded from the webservice API (include metadata)
  entries = signal<Array<{ key: string; value: any; description?: string; category?: string }>>([]);
  // Distinct categories from entries and current selection
  categories = signal<string[]>([]);
  selectedCategory: string = '';
  // View model: filtered + sorted entries for display
  viewEntries = signal<Array<{ key: string; value: any; description?: string; category?: string }>>([]);
  sortBy: 'key' | 'value' = 'key';
  sortAsc = true;

  // Modal state
  modalOpen = signal(false);
  editKey = '';
  editValue: any = '';
  editDescription: string | undefined;

  async ngOnInit() {
    await this.loadLanguages();
  }

  private async loadLanguages() {
    try {
      const list = await this.http.get<string[]>(`/default/rdmp/locales`).toPromise();
      this.languages.set(Array.isArray(list) ? list : []);
      if (!this.selectedLang && this.languages().length > 0) {
        this.selectedLang = this.languages()[0];
        await this.onLangChange();
      }
    } catch (e) {
      console.error('Failed to load languages', e);
      this.languages.set([]);
    }
  }

  async onLangChange() {
    if (!this.selectedLang) return;
    await this.loadEntries();
  }

  // Load individual entries with metadata for the selected language
  private async loadEntries() {
    try {
      const params = new URLSearchParams({ locale: this.selectedLang, namespace: this.namespace });
      const url = `/default/rdmp/api/i18n/entries?${params.toString()}`;
      const data = await this.http.get<Array<{ key: string; value: any; description?: string; category?: string }>>(url).toPromise();
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

  setSort(col: 'key' | 'value') {
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
      const av = (this.sortBy === 'key' ? String(a.key) : String(a.value ?? ''));
      const bv = (this.sortBy === 'key' ? String(b.key) : String(b.value ?? ''));
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
    const url = this.buildEntryApiUrl(this.selectedLang, this.namespace, this.editKey);
    try {
      await this.http.post(url, { value: this.editValue }).toPromise();
      // Update local state
  const updated = this.entries().map(e => e.key === this.editKey ? { ...e, value: this.editValue } : e);
  this.entries.set(updated);
  this.refreshDerived();
      this.modalOpen.set(false);
    } catch (e) {
      console.error('Failed to save entry', e);
      alert('Save failed');
    }
  }

  closeModal() { this.modalOpen.set(false); }

  private buildEntryApiUrl(lng: string, ns: string, key: string) {
    // Dotted keys supported via wildcard route
    return `/default/rdmp/api/i18n/entries/${lng}/${ns}/${encodeURIComponent(key)}`;
  }

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
