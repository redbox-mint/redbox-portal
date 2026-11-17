import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18NextPipe } from '@researchdatabox/portal-ng-common';
import type { GenerationAdminConnectionDraft, GenerationAdminConnectionHealth, GenerationAdminOverview } from '@researchdatabox/sails-ng-common';
import { adapterLabels, validateConnection, Issues } from './model-settings';

export interface ProviderDraft {
  id?: string;
  draft: GenerationAdminConnectionDraft;
  savedJson: string;
  keyEdited: boolean;
  health?: GenerationAdminConnectionHealth;
  error?: string;
  testing?: boolean;
  invalidHeaders?: boolean;
  savedHealth?: string;
  secretConfigured?: boolean;
}
@Component({
  selector: 'ai-provider-card', standalone: true, imports: [FormsModule, I18NextPipe],
  templateUrl: './provider-card.component.html',
})
export class ProviderCardComponent implements OnChanges {
  @Input({ required: true }) item!: ProviderDraft;
  @Input({ required: true }) overview!: GenerationAdminOverview;
  @Input() cooldown = 0;
  @Input() busy = false;
  @Input() keyConflict = false;
  @Output() changed = new EventEmitter<void>();
  @Output() test = new EventEmitter<void>();
  @Output() nameChange = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();
  readonly adapterLabels = adapterLabels;
  readonly JSON = JSON;
  headers: { name: string; value: string }[] = [];
  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['item']) return;
    this.headers = Object.entries(this.item.draft.nonSecretHeaders ?? {}).map(([name, value]) => ({ name, value }));
  }
  get draft(): GenerationAdminConnectionDraft { return this.item.draft; }
  get issues(): Issues {
    const issues = validateConnection(this.draft, this.overview);
    if (this.keyConflict) issues['key'] = 'ai-models-validation-key-used';
    return issues;
  }
  get scheme(): string { return (this.draft.secretRef ?? '').split(':')[0] || this.overview.secretSchemes[0] || ''; }
  get reference(): string { return (this.draft.secretRef ?? '').split(':').slice(1).join(':'); }
  setReference(scheme: string, reference: string): void { this.draft.secretRef = `${scheme}:${reference}`; this.edit(); }
  edit(): void { this.item.health = undefined; this.item.error = ''; this.changed.emit(); }
  adapterChange(adapter: string): void {
    this.draft.adapterId = adapter;
    this.draft.authStrategy = adapter === 'openrouter' ? 'bearer' : adapter === 'bedrock' ? 'aws-default-chain' : 'none';
    this.draft.region = adapter === 'bedrock' ? this.overview.bedrockRegions.includes('ap-southeast-2') ? 'ap-southeast-2' : this.overview.bedrockRegions[0] : undefined;
    delete this.draft.secretRef;
    this.edit();
  }
  authChange(): void { if (this.draft.authStrategy !== 'bearer') delete this.draft.secretRef; this.edit(); }
  updateHeaders(): void {
    this.item.invalidHeaders = this.duplicateHeaders;
    this.draft.nonSecretHeaders = Object.fromEntries(this.headers.map(header => [header.name, header.value]));
    this.edit();
  }
  addHeader(): void { this.headers.push({ name: '', value: '' }); this.updateHeaders(); }
  removeHeader(index: number): void { this.headers.splice(index, 1); this.updateHeaders(); }
  get duplicateHeaders(): boolean { return new Set(this.headers.map(h => h.name.toLowerCase())).size !== this.headers.length; }
  get invalid(): boolean { return this.duplicateHeaders || Object.keys(this.issues).length > 0; }
}
