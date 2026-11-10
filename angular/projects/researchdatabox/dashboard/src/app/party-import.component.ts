import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RedboxPortalCoreModule } from '@researchdatabox/portal-ng-common';
import { PartyImportApiService } from './party-import-api.service';

@Component({ selector: 'party-csv-import', standalone: true, imports: [CommonModule, FormsModule, RedboxPortalCoreModule], templateUrl: './party-import.component.html' })
export class PartyImportComponent {
  readonly fields = ['fullName', 'givenName', 'surname', 'email', 'orcid'];
  content = ''; filename = ''; headers: string[] = []; sample: string[][] = []; total = 0;
  mapping: Record<string, number | null> = {}; preview: any = null; results: any = null; busy = false; error = '';
  page = 0; readonly pageSize = 50;
  constructor(private api: PartyImportApiService) {}
  get rows(): any[] { return (this.results?.rows ?? this.preview?.rows ?? []).slice(this.page * this.pageSize, (this.page + 1) * this.pageSize); }
  get rowCount(): number { return (this.results?.rows ?? this.preview?.rows ?? []).length; }
  clearPreview() { this.preview = null; this.results = null; this.page = 0; }
  async chooseFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.clearPreview(); this.headers = []; this.error = ''; this.content = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024 || !/\.csv$/i.test(file.name)) { this.error = 'admin-parties-import-file-error'; return; }
    this.filename = file.name; this.busy = true;
    try {
      this.content = await file.text();
      const result = await this.api.request('inspect', { csv: this.content });
      this.headers = result.headers; this.sample = result.sample; this.total = result.total;
      this.mapping = Object.fromEntries(this.fields.map(field => [field, null]));
      this.headers.forEach((header, index) => {
        const normalized = header.toLowerCase().replace(/[ _-]/g, '');
        const field = this.fields.find(name => name.toLowerCase() === normalized) ?? (normalized === 'name' ? 'fullName' : undefined);
        if (field && this.mapping[field] === null) this.mapping[field] = index;
      });
    } catch { this.error = 'admin-parties-import-file-error'; } finally { this.busy = false; }
  }
  async run(action: 'preview' | 'apply') {
    if (this.busy || (action === 'apply' && !this.preview?.token)) return;
    this.busy = true; this.error = '';
    const mapping = Object.fromEntries(Object.entries(this.mapping).filter(([, value]) => value !== null && value !== undefined));
    const token = this.preview?.token;
    if (action === 'apply') this.preview.token = null;
    try {
      const result = await this.api.request(action, { csv: this.content, mapping, ...(action === 'apply' ? { token } : {}) });
      this.page = 0;
      if (action === 'preview') this.preview = result; else this.results = result;
    } catch { this.error = action === 'apply' ? 'admin-parties-import-apply-error' : 'admin-parties-import-preview-error'; } finally { this.busy = false; }
  }
}
