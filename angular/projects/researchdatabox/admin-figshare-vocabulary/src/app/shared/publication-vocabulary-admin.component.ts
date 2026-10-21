import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { KeyValuePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BaseComponent,
  I18NextPipe,
  TranslationService,
  PublicationVocabularyApiService,
  PublicationVocabularyCapabilities,
  PublicationVocabularySource,
  PublicationCrosswalkSummary,
  PublicationVocabularyCrosswalk,
  PublicationCrosswalkRevision,
  PublicationCrosswalkMapping,
  PublicationVocabularyEntry,
  PublicationTargetTerm,
  PublicationVocabularyPage,
  PublicationSourceSnapshot,
  PublicationSourceImport,
  PublicationImportHistory,
  PublicationLocalVocabulary,
  vocabularyOperationId,
} from '@researchdatabox/portal-ng-common';
import {
  FigshareTaxonomySummary,
  FigshareVocabularyApiService,
  FigshareSyncRunSummary,
  FigsharePagedPreview,
} from '../services/figshare-vocabulary-api.service';
import { formatFigshareTimestamp } from '../figshare-format';

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Required string');
  return value;
}
/** Import only reviewed catalogue fields. Never accept actor/brand/approval data from a snapshot. */
export function parsePublicationSnapshot(json: string): PublicationSourceSnapshot {
  const value: unknown = JSON.parse(json);
  if (!record(value) || !Array.isArray(value['terms']) || value['terms'].length > 20000)
    throw new Error('Invalid terms');
  const namespace = text(value['namespace']);
  const terms = value['terms'].map((term: unknown) => {
    if (!record(term) || typeof term['selectable'] !== 'boolean') throw new Error('Invalid term');
    const targetValue = text(term['value']);
    const id = `${encodeURIComponent(namespace)}:${encodeURIComponent(targetValue)}`;
    if (term['id'] !== undefined && term['id'] !== id) throw new Error('Invalid identity');
    if (term['namespace'] !== undefined && term['namespace'] !== namespace) throw new Error('Invalid namespace');
    return {
      id,
      namespace,
      value: targetValue,
      sourceId: text(term['sourceId']),
      label: text(term['label']),
      selectable: term['selectable'],
      ...(term['parentId'] ? { parentId: text(term['parentId']) } : {}),
    };
  });
  if (new Set(terms.map(term => term.id)).size !== terms.length) throw new Error('Duplicate term');
  const provider = text(value['provider']);
  if (provider === 'figshare' || namespace.startsWith('figshare:'))
    throw new Error('Configured Figshare import required');
  return {
    provider,
    namespace,
    scope: text(value['scope']),
    catalogueId: text(value['catalogueId']),
    displayName: text(value['displayName']),
    terms,
  };
}
const emptyPage = <T>(): PublicationVocabularyPage<T> => ({ data: [], meta: { total: 0, offset: 0, limit: 50 } });

@Component({
  selector: 'publication-vocabulary-admin',
  templateUrl: './publication-vocabulary-admin.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [FormsModule, KeyValuePipe, I18NextPipe],
})
export class PublicationVocabularyAdminComponent extends BaseComponent {
  tab: 'sources' | 'crosswalks' | 'import' | 'legacy-history' = 'sources';
  capabilities: PublicationVocabularyCapabilities | null = null;
  sources: PublicationVocabularySource[] = [];
  crosswalks: PublicationCrosswalkSummary[] = [];
  vocabularies: PublicationLocalVocabulary[] = [];
  busy = false;
  error = '';
  message = '';
  providerFilter = '';
  sourceFilter = '';
  statusFilter = '';
  active: PublicationVocabularyCrosswalk | null = null;
  revisionNumber = 0;
  mappings: PublicationCrosswalkMapping[] = [];
  dirty = false;
  confirmingApproval = false;
  mappingSearch = '';
  mappingOffset = 0;
  localSearch = '';
  targetSearch = '';
  includeHistorical = false;
  localPage = emptyPage<PublicationVocabularyEntry>();
  targetPage = emptyPage<PublicationTargetTerm>();
  selectedLocalId = '';
  selectedTargetId = '';
  pickerLoading = false;
  pickerUnavailable = false;
  private pickerRequest = 0;
  private knownTargets = new Map<string, PublicationTargetTerm>();
  name = '';
  newSourceId = '';
  localVocabularyId = '';
  normalizer: 'exact-v1' | 'figshare-code-v1' = 'exact-v1';
  historySource: PublicationVocabularySource | null = null;
  importHistory: PublicationImportHistory[] = [];
  historyLoading = false;
  private historyRequest = 0;
  legacyRuns: FigshareSyncRunSummary[] = [];
  legacyTotal = 0;
  legacyOffset = 0;
  legacyPreview: FigsharePagedPreview | null = null;
  snapshotText = '';
  reviewedImport: PublicationSourceImport | null = null;
  snapshotError = '';
  figshareScope: 'public' | 'account' = 'public';
  taxonomyId = '';
  taxonomies: FigshareTaxonomySummary[] = [];
  private figshareImport: {
    scope: 'public' | 'account';
    taxonomyId: string;
    importId: string;
    expectedVersion?: number;
  } | null = null;

  constructor(
    @Inject(PublicationVocabularyApiService) public api: PublicationVocabularyApiService,
    @Inject(FigshareVocabularyApiService) private legacyApi: FigshareVocabularyApiService,
    @Inject(TranslationService) translations: TranslationService
  ) {
    super();
    this.initDependencies = [api, legacyApi, translations];
  }
  protected override async initComponent(): Promise<void> {
    await this.reload();
  }
  async reload(): Promise<void> {
    this.busy = true;
    this.error = '';
    this.active = null;
    this.dirty = false;
    this.historySource = null;
    this.reviewedImport = null;
    this.figshareImport = null;
    this.pickerRequest++;
    this.historyRequest++;
    try {
      this.capabilities = await this.api.capabilities();
      [this.sources, this.crosswalks, this.vocabularies] = await Promise.all([
        this.api.sources(),
        this.api.crosswalks(),
        this.api.localVocabularies(),
      ]);
      if (this.capabilities.figshareScopes.length) this.figshareScope = this.capabilities.figshareScopes[0];
    } catch (error) {
      this.capabilities = null;
      this.error = this.status(error) === 409 ? '@publication-vocabulary-conversion-required' : this.errorKey(error);
    } finally {
      this.busy = false;
    }
  }
  get providers(): string[] {
    return [...new Set(this.sources.map(source => source.provider))].sort();
  }
  get filteredSources(): PublicationVocabularySource[] {
    return this.sources.filter(source => !this.providerFilter || source.provider === this.providerFilter);
  }
  get filteredCrosswalks(): PublicationCrosswalkSummary[] {
    return this.crosswalks.filter(
      row =>
        (!this.providerFilter || this.source(row.sourceId)?.provider === this.providerFilter) &&
        (!this.sourceFilter || row.sourceId === this.sourceFilter) &&
        (!this.statusFilter || row.status === this.statusFilter)
    );
  }
  source(id: string): PublicationVocabularySource | undefined {
    return this.sources.find(source => source.id === id);
  }
  sourceLabel(id: string): string {
    const source = this.source(id);
    return source ? `${source.displayName} · ${source.provider} · ${source.scope} · ${source.catalogueId}` : id;
  }
  vocabularyName(id: string): string {
    return this.vocabularies.find(row => row.id === id)?.name ?? id;
  }
  changeProvider(provider: string): void {
    this.providerFilter = provider;
    this.sourceFilter = '';
  }
  showTab(tab: 'sources' | 'crosswalks' | 'import' | 'legacy-history'): void {
    if (this.busy || this.dirty) return;
    this.tab = tab;
    this.active = null;
    this.historySource = null;
    this.pickerRequest++;
    this.historyRequest++;
    this.error = '';
    this.message = '';
  }
  async showSourceHistory(source: PublicationVocabularySource): Promise<void> {
    const request = ++this.historyRequest;
    this.historySource = source;
    this.importHistory = [];
    this.historyLoading = true;
    this.error = '';
    try {
      const history = await this.api.sourceHistory(source.id);
      if (request === this.historyRequest) this.importHistory = history;
    } catch (error) {
      if (request === this.historyRequest) this.error = this.errorKey(error);
    } finally {
      if (request === this.historyRequest) this.historyLoading = false;
    }
  }
  async showLegacyHistory(offset = 0): Promise<void> {
    if (this.busy || this.dirty) return;
    this.showTab('legacy-history');
    this.busy = true;
    this.legacyPreview = null;
    try {
      const result = await this.legacyApi.listSyncRuns(undefined, { limit: 50, offset });
      this.legacyRuns = result.records;
      this.legacyTotal = result.total;
      this.legacyOffset = offset;
    } catch (error) {
      this.error = this.errorKey(error);
    } finally {
      this.busy = false;
    }
  }
  async showLegacyPreview(id: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    this.legacyPreview = null;
    try {
      this.legacyPreview = await this.legacyApi.getPreview(id, { view: 'diff', limit: 50 });
    } catch (error) {
      this.error = this.errorKey(error);
    } finally {
      this.busy = false;
    }
  }
  async createCrosswalk(): Promise<void> {
    if (
      this.busy ||
      !this.capabilities?.editMappings ||
      !this.name.trim() ||
      !this.newSourceId ||
      !this.localVocabularyId ||
      this.source(this.newSourceId)?.archived
    )
      return;
    this.busy = true;
    this.error = '';
    try {
      const row = await this.api.createCrosswalk({
        name: this.name.trim(),
        sourceId: this.newSourceId,
        localVocabularyId: this.localVocabularyId,
        normalizer: this.normalizer,
      });
      this.crosswalks = await this.api.crosswalks();
      this.name = '';
      await this.openCrosswalk(row.id);
    } catch (error) {
      this.error = this.errorKey(error);
    } finally {
      this.busy = false;
    }
  }
  async openCrosswalk(id: string): Promise<void> {
    if (this.dirty) return;
    this.busy = true;
    this.error = '';
    this.message = '';
    this.active = null;
    this.pickerRequest++;
    try {
      this.active = await this.api.crosswalk(id);
      this.tab = 'crosswalks';
      this.selectRevision(this.active.workingRevision);
      this.localSearch = '';
      this.targetSearch = '';
      this.includeHistorical = false;
      await this.searchPicker();
    } catch (error) {
      this.error = this.errorKey(error);
    } finally {
      this.busy = false;
    }
  }
  get revision(): PublicationCrosswalkRevision | undefined {
    return this.active?.revisions.find(row => row.revision === this.revisionNumber);
  }
  selectRevision(revision: number): void {
    if (this.dirty) return;
    this.revisionNumber = Number(revision);
    this.mappings = (this.revision?.mappings ?? []).map(row => ({ ...row }));
    this.knownTargets = new Map(this.revision?.targets.map(row => [row.id, row]) ?? []);
    this.mappingOffset = 0;
    this.mappingSearch = '';
    this.confirmingApproval = false;
    this.selectedLocalId = '';
    this.selectedTargetId = '';
  }
  get canEdit(): boolean {
    return (
      !!this.active &&
      !!this.capabilities?.editMappings &&
      !this.pickerUnavailable &&
      this.active.status !== 'archived' &&
      this.source(this.active.sourceId)?.archived === false &&
      this.revisionNumber === this.active.workingRevision
    );
  }
  get canApprove(): boolean {
    return (
      this.canEdit &&
      !!this.capabilities?.approve &&
      !this.dirty &&
      !this.busy &&
      this.active?.approvedRevision !== this.active?.workingRevision &&
      this.mappings.some(row => row.status !== 'rejected')
    );
  }
  async searchPicker(localOffset = 0, targetOffset = 0): Promise<void> {
    const row = this.active;
    const request = ++this.pickerRequest;
    this.selectedLocalId = '';
    this.selectedTargetId = '';
    this.localPage = emptyPage();
    this.targetPage = emptyPage();
    this.pickerUnavailable = false;
    if (!row || row.status === 'archived' || this.source(row.sourceId)?.archived !== false) return;
    this.pickerLoading = true;
    try {
      const [locals, targets] = await Promise.all([
        this.api.localEntries(row.id, this.localSearch, localOffset),
        this.api.targets(row.sourceId, this.targetSearch, targetOffset, this.includeHistorical),
      ]);
      if (request !== this.pickerRequest || this.active?.id !== row.id) return;
      this.localPage = locals;
      this.targetPage = targets;
      for (const target of targets.data) this.knownTargets.set(target.id, target);
    } catch (error) {
      if (request === this.pickerRequest) {
        this.pickerUnavailable = true;
        this.error = this.errorKey(error);
      }
    } finally {
      if (request === this.pickerRequest) this.pickerLoading = false;
    }
  }
  addMapping(): void {
    const local = this.localPage.data.find(row => row.id === this.selectedLocalId);
    const target = this.targetPage.data.find(row => row.id === this.selectedTargetId);
    if (!this.canEdit || this.busy || this.pickerLoading || !local || !target?.selectable || target.historical) return;
    if (this.mappings.some(row => row.localEntryId === local.id && row.targetId === target.id)) return;
    this.mappings = [
      ...this.mappings,
      {
        id: vocabularyOperationId(),
        localEntryId: local.id,
        targetId: target.id,
        status: 'proposed',
        matchType: 'manual',
      },
    ];
    this.dirty = true;
    this.confirmingApproval = false;
    this.message = '';
  }
  removeMapping(id: string): void {
    if (!this.canEdit || this.busy) return;
    this.mappings = this.mappings.filter(row => row.id !== id);
    this.dirty = true;
    this.confirmingApproval = false;
    this.message = '';
  }
  discardChanges(): void {
    this.dirty = false;
    this.selectRevision(this.revisionNumber);
  }
  get matchingMappings(): PublicationCrosswalkMapping[] {
    const q = this.mappingSearch.trim().toLowerCase();
    return this.mappings.filter(
      row =>
        !q ||
        `${this.localLabel(row.localEntryId)} ${this.targetLabel(row.targetId)} ${row.status}`.toLowerCase().includes(q)
    );
  }
  get visibleMappings(): PublicationCrosswalkMapping[] {
    return this.matchingMappings.slice(this.mappingOffset, this.mappingOffset + 50);
  }
  localLabel(id: string): string {
    const local = this.revision?.entries.find(row => row.id === id) ?? this.localPage.data.find(row => row.id === id);
    return local ? `${local.label} · ${local.value}` : id;
  }
  target(id: string): PublicationTargetTerm | undefined {
    return this.revision?.targets.find(row => row.id === id) ?? this.knownTargets.get(id);
  }
  targetLabel(id: string): string {
    const target = this.target(id);
    return target ? `${target.label} · ${target.value}` : id;
  }
  async saveDraft(): Promise<void> {
    if (!this.active || !this.canEdit || !this.dirty || this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      this.active = await this.api.saveMappings(this.active.id, this.active.version, this.mappings);
      this.dirty = false;
      this.selectRevision(this.active.workingRevision);
      this.message = '@publication-vocabulary-draft-saved';
      this.crosswalks = await this.api.crosswalks();
    } catch (error) {
      this.error = this.errorKey(error);
    } finally {
      this.busy = false;
    }
  }
  async approve(): Promise<void> {
    if (!this.active || !this.canApprove || !this.confirmingApproval) return;
    this.busy = true;
    this.error = '';
    try {
      this.active = await this.api.approve(this.active.id, this.active.version);
      this.selectRevision(this.active.workingRevision);
      this.message = '@publication-vocabulary-approved';
      this.crosswalks = await this.api.crosswalks();
    } catch (error) {
      this.error = this.errorKey(error);
    } finally {
      this.busy = false;
      this.confirmingApproval = false;
    }
  }
  editSnapshot(value: string): void {
    this.snapshotText = value;
    this.reviewedImport = null;
    this.snapshotError = '';
  }
  reviewSnapshot(): void {
    this.reviewedImport = null;
    try {
      const snapshot = parsePublicationSnapshot(this.snapshotText);
      const existing = this.sources.find(
        row =>
          row.provider === snapshot.provider && row.scope === snapshot.scope && row.catalogueId === snapshot.catalogueId
      );
      if (existing && existing.namespace !== snapshot.namespace) throw new Error('Source identity changed');
      this.reviewedImport = {
        ...snapshot,
        importId: vocabularyOperationId(),
        ...(existing ? { id: existing.id, expectedVersion: existing.version } : {}),
      };
    } catch {
      this.snapshotError = '@publication-vocabulary-invalid-snapshot';
    }
  }
  async importSnapshot(): Promise<void> {
    if (!this.reviewedImport || !this.capabilities?.snapshotImport || this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      await this.api.importSnapshot(this.reviewedImport);
      this.sources = await this.api.sources();
      this.reviewedImport = null;
      this.snapshotText = '';
      this.tab = 'sources';
      this.message = '@publication-vocabulary-imported';
    } catch (error) {
      this.error = this.errorKey(error);
    } finally {
      this.busy = false;
    }
  }
  async discoverFigshare(): Promise<void> {
    if (!this.capabilities?.figshareScopes.includes(this.figshareScope) || this.busy) return;
    this.busy = true;
    this.error = '';
    this.taxonomies = [];
    this.taxonomyId = '';
    this.figshareImport = null;
    try {
      this.taxonomies = await this.legacyApi.discoverTaxonomies(this.figshareScope);
    } catch {
      this.error = '@publication-vocabulary-figshare-unavailable';
    } finally {
      this.busy = false;
    }
  }
  resetFigshare(): void {
    this.taxonomies = [];
    this.taxonomyId = '';
    this.figshareImport = null;
  }
  async importFigshare(): Promise<void> {
    if (
      !this.capabilities?.figshareScopes.includes(this.figshareScope) ||
      !this.taxonomies.some(row => row.taxonomyId === this.taxonomyId) ||
      this.busy
    )
      return;
    this.busy = true;
    this.error = '';
    const existing = this.sources.find(
      row => row.provider === 'figshare' && row.scope === this.figshareScope && row.catalogueId === this.taxonomyId
    );
    if (
      !this.figshareImport ||
      this.figshareImport.scope !== this.figshareScope ||
      this.figshareImport.taxonomyId !== this.taxonomyId
    )
      this.figshareImport = {
        scope: this.figshareScope,
        taxonomyId: this.taxonomyId,
        importId: vocabularyOperationId(),
        ...(existing ? { expectedVersion: existing.version } : {}),
      };
    try {
      await this.api.importFigshare(this.figshareImport);
      this.sources = await this.api.sources();
      this.resetFigshare();
      this.tab = 'sources';
      this.message = '@publication-vocabulary-imported';
    } catch (error) {
      this.error = this.errorKey(error);
    } finally {
      this.busy = false;
    }
  }
  formatDate(value?: string): string {
    return formatFigshareTimestamp(value ?? null);
  }
  private status(error: unknown): number {
    return record(error) ? Number(error['status']) : 0;
  }
  private errorKey(error: unknown): string {
    const status = this.status(error);
    if (status === 409) return '@publication-vocabulary-conflict';
    if (status === 401 || status === 403) return '@publication-vocabulary-access-denied';
    if (status === 404) return '@publication-vocabulary-unavailable';
    return '@publication-vocabulary-request-failed';
  }
}
