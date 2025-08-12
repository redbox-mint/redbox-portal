import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './translation.component.html',
  styles: [``]
})
export class AppComponent implements OnInit {
  private http = inject(HttpClient);

  // Simple state
  languages = signal<string[]>([]);
  selectedLang: string = '';
  namespace = 'translation';
  values: Record<string, any> = {};

  keys = signal<string[]>([]);

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
    // fetch namespace json
    const url = this.buildBundleUrl(this.selectedLang, this.namespace);
    try {
      const bundle = await this.http.get<any>(url).toPromise();
      // flatten to key/value
      const flat = this.flatten(bundle || {});
      this.values = flat;
      this.keys.set(Object.keys(flat).sort());
    } catch (e) {
      console.error('Failed to load translations', e);
      this.values = {};
      this.keys.set([]);
    }
  }

  async save() {
    if (!this.selectedLang) return;
    const data = this.unflatten(this.values);
    const url = this.buildBundleApiUrl(this.selectedLang, this.namespace);
    // Save bundle and split into entries on server
    try {
      await this.http.post(url + '?splitToEntries=true&overwriteEntries=true', { data }).toPromise();
      alert('Saved');
    } catch (e) {
      console.error('Failed to save', e);
      alert('Save failed');
    }
  }

  cancel() {
    this.onLangChange();
  }

  private buildBundleUrl(lng: string, ns: string) {
    // Use same path as i18next-http-backend via server controller
    // NOTE: Branding/portal assumed default here; update if needed.
    return `/default/rdmp/locales/${lng}/${ns}.json`;
  }

  private buildBundleApiUrl(lng: string, ns: string) {
    return `/default/rdmp/api/i18n/bundles/${lng}/${ns}`;
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
}
