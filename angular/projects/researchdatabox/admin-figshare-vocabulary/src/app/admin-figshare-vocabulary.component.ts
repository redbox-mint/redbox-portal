import { Component, Inject } from '@angular/core';
import { BaseComponent, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import {
  FigshareCrosswalkMapping,
  FigshareCrosswalkSummary,
  FigshareLocalVocabulary,
  FigsharePagedPreview,
  FigshareScope,
  FigshareSourceSummary,
  FigshareSyncRunSummary,
  FigshareTaxonomySummary,
  FigshareVocabularyApiService
} from './services/figshare-vocabulary-api.service';
import { formatFigshareTimestamp } from './figshare-format';
import { FigshareImportRequest } from './import/figshare-import-wizard.component';
import { PreviewFilterState } from './sync-preview/figshare-sync-preview.component';
import { MappingChangeRequest, MappingSearchState } from './crosswalks/figshare-crosswalk-editor.component';

type FigshareView = 'sources' | 'crosswalks' | 'history' | 'import' | 'preview' | 'crosswalk-editor';

const MAPPING_PAGE_SIZE = 50;

@Component({
  selector: 'admin-figshare-vocabulary',
  templateUrl: './admin-figshare-vocabulary.component.html',
  standalone: false
})
export class AdminFigshareVocabularyComponent extends BaseComponent {
  public view: FigshareView = 'sources';
  public message = '';
  public error = '';

  public sources: FigshareSourceSummary[] = [];
  public sourceTotal = 0;
  public scopeFilter: '' | 'public' | 'account' = '';
  public sourcesLoading = false;
  /** Id of the source whose row action is running, so that row can show progress. */
  public busySourceId = '';

  public crosswalks: FigshareCrosswalkSummary[] = [];
  public crosswalkTotal = 0;
  public crosswalkStatusFilter = '';
  public crosswalksLoading = false;

  public syncRuns: FigshareSyncRunSummary[] = [];
  public historySourceId = '';
  public historyLoading = false;

  public taxonomies: FigshareTaxonomySummary[] = [];
  public localVocabularies: FigshareLocalVocabulary[] = [];
  public discovering = false;
  public generating = false;
  public wizardError = '';

  public preview: FigsharePagedPreview | null = null;
  public previewLoading = false;
  public applying = false;
  public previewError = '';
  public approvedProposalIds: string[] = [];
  public previewFilters: PreviewFilterState = {
    view: 'proposals',
    q: '',
    changeClass: '',
    unresolvedOnly: false,
    historicalOnly: false,
    offset: 0
  };

  public activeCrosswalk: FigshareCrosswalkSummary | null = null;
  public mappings: FigshareCrosswalkMapping[] = [];
  public mappingTotal = 0;
  public mappingPageSize = MAPPING_PAGE_SIZE;
  public mappingSearch: MappingSearchState = { q: '', status: '', offset: 0 };
  public crosswalkUsage: Array<{ brandName: string; configKey: string; bindingPath: string; outputs?: string }> = [];
  public mappingsLoading = false;
  public crosswalkSaving = false;
  public crosswalkError = '';
  public crosswalkMessage = '';

  constructor(
    @Inject(LoggerService) private logger: LoggerService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(FigshareVocabularyApiService) private api: FigshareVocabularyApiService
  ) {
    super();
    this.initDependencies = [this.translationService, this.api];
  }

  protected override async initComponent(): Promise<void> {
    await Promise.all([this.loadSources(), this.loadCrosswalks()]);
  }

  get totalSources(): number {
    return this.sourceTotal;
  }

  get approvedCrosswalkCount(): number {
    return this.crosswalks.filter((crosswalk) => crosswalk.status === 'approved').length;
  }

  get syncWarningCount(): number {
    return this.sources.reduce((total, source) => total + source.historicalCount, 0);
  }

  // ── Navigation ────────────────────────────────────────────────────

  async showTab(view: FigshareView): Promise<void> {
    this.view = view;
    this.message = '';
    this.error = '';
    if (view === 'sources') {
      await this.loadSources();
    } else if (view === 'crosswalks') {
      await this.loadCrosswalks();
    } else if (view === 'history') {
      await this.loadSyncRuns();
    }
  }

  async startImport(): Promise<void> {
    this.wizardError = '';
    this.taxonomies = [];
    this.view = 'import';
    try {
      this.localVocabularies = await this.api.listLocalVocabularies();
    } catch (err) {
      this.wizardError = this.errorText('figshare-vocab-error-load-vocabularies', err);
    }
  }

  cancelImport(): void {
    this.view = 'sources';
    this.wizardError = '';
  }

  // ── Sources ───────────────────────────────────────────────────────

  async onScopeFilterChanged(scope: '' | 'public' | 'account'): Promise<void> {
    this.scopeFilter = scope;
    await this.loadSources();
  }

  private async loadSources(): Promise<void> {
    this.sourcesLoading = true;
    try {
      const result = await this.api.listSources(this.scopeFilter || undefined);
      this.sources = result.records;
      this.sourceTotal = result.total;
    } catch (err) {
      this.error = this.errorText('figshare-vocab-error-load-sources', err);
      this.logger.error(this.error);
    } finally {
      this.sourcesLoading = false;
    }
  }

  async resyncSource(source: FigshareSourceSummary): Promise<void> {
    this.clearAlerts();
    this.previewError = '';
    this.applying = false;
    this.busySourceId = source.id;
    try {
      const preview = await this.api.createSourcePreview(source.id, {});
      await this.openPreview(preview.runId);
    } catch (err) {
      this.error = this.errorText('figshare-vocab-error-preview', err);
      this.logger.error(this.error);
    } finally {
      this.busySourceId = '';
    }
  }

  async cloneSource(source: FigshareSourceSummary): Promise<void> {
    this.clearAlerts();
    const name = this.t('figshare-vocab-clone-name-suffix', '{{name}} (local copy)', { name: source.displayName });
    this.busySourceId = source.id;
    try {
      const clone = await this.api.cloneSource(source.id, { name });
      this.message = this.t('figshare-vocab-clone-created', 'Editable clone created with {{count}} terms.', {
        count: clone.entries
      });
      await this.loadCrosswalks();
      this.view = 'crosswalks';
    } catch (err) {
      this.error = this.errorText('figshare-vocab-error-clone', err);
      this.logger.error(this.error);
    } finally {
      this.busySourceId = '';
    }
  }

  async showHistoryFor(source: FigshareSourceSummary): Promise<void> {
    this.historySourceId = source.id;
    this.view = 'history';
    await this.loadSyncRuns();
  }

  private async loadSyncRuns(): Promise<void> {
    this.historyLoading = true;
    try {
      const result = await this.api.listSyncRuns(this.historySourceId || undefined);
      this.syncRuns = result.records;
    } catch (err) {
      this.error = this.errorText('figshare-vocab-error-load-history', err);
      this.logger.error(this.error);
    } finally {
      this.historyLoading = false;
    }
  }

  // ── Import wizard ─────────────────────────────────────────────────

  async discoverTaxonomies(scope: FigshareScope): Promise<void> {
    this.discovering = true;
    this.wizardError = '';
    try {
      this.taxonomies = await this.api.discoverTaxonomies(scope);
    } catch (err) {
      this.taxonomies = [];
      this.wizardError = this.errorText('figshare-vocab-error-discover', err);
      this.logger.error(this.wizardError);
    } finally {
      this.discovering = false;
    }
  }

  async generatePreview(request: FigshareImportRequest): Promise<void> {
    this.generating = true;
    this.wizardError = '';
    try {
      const preview = await this.api.createPreview(request);
      await this.openPreview(preview.runId);
    } catch (err) {
      this.wizardError = this.errorText('figshare-vocab-error-preview', err);
      this.logger.error(this.wizardError);
    } finally {
      this.generating = false;
    }
  }

  // ── Preview review ────────────────────────────────────────────────

  private async openPreview(runId: string): Promise<void> {
    this.previewFilters = {
      view: 'proposals',
      q: '',
      changeClass: '',
      unresolvedOnly: false,
      historicalOnly: false,
      offset: 0
    };
    this.approvedProposalIds = [];
    this.view = 'preview';
    await this.loadPreview(runId, true);
  }

  private async loadPreview(runId: string, seedApprovals = false): Promise<void> {
    this.previewLoading = true;
    try {
      const preview = await this.api.getPreview(runId, {
        view: this.previewFilters.view,
        q: this.previewFilters.q || undefined,
        changeClass: this.previewFilters.changeClass || undefined,
        unresolvedOnly: this.previewFilters.unresolvedOnly || undefined,
        historicalOnly: this.previewFilters.historicalOnly || undefined,
        offset: this.previewFilters.offset,
        limit: 50
      });
      this.preview = preview;
      if (seedApprovals || this.approvedProposalIds.length === 0) {
        // Exact-code and identity proposals arrive preselected; label suggestions do not.
        this.approvedProposalIds = (preview.page.records as Array<{ proposalId?: string; preselected?: boolean }>)
          .filter((record) => record.preselected === true && !!record.proposalId)
          .map((record) => String(record.proposalId));
      }
      this.previewError = '';
    } catch (err) {
      this.previewError = this.errorText('figshare-vocab-error-preview', err);
      this.logger.error(this.previewError);
    } finally {
      this.previewLoading = false;
    }
  }

  async onPreviewFiltersChanged(filters: PreviewFilterState): Promise<void> {
    this.previewFilters = filters;
    if (this.preview) {
      await this.loadPreview(this.preview.runId);
    }
  }

  onProposalToggled(event: { proposalId: string; approved: boolean }): void {
    const current = new Set(this.approvedProposalIds);
    if (event.approved) {
      current.add(event.proposalId);
    } else {
      current.delete(event.proposalId);
    }
    this.approvedProposalIds = Array.from(current);
  }

  async applyPreview(): Promise<void> {
    if (!this.preview) {
      return;
    }
    this.applying = true;
    this.previewError = '';
    try {
      const result = await this.api.applyPreview(this.preview.runId, {
        remoteHash: this.preview.remoteHash,
        approvedProposalIds: this.approvedProposalIds
      });
      this.message = this.t(
        'figshare-vocab-apply-complete',
        'Applied: {{created}} added, {{updated}} changed, {{historical}} historical, {{mappings}} mappings.',
        {
          created: result.categories.created,
          updated: result.categories.updated,
          historical: result.categories.historical,
          mappings: result.mappings.created
        }
      );
      this.preview = null;
      this.view = 'sources';
      await Promise.all([this.loadSources(), this.loadCrosswalks()]);
    } catch (err) {
      this.previewError = this.errorText('figshare-vocab-error-apply', err);
      this.logger.error(this.previewError);
    } finally {
      this.applying = false;
    }
  }

  cancelPreview(): void {
    this.preview = null;
    this.view = 'sources';
  }

  // ── Crosswalks ────────────────────────────────────────────────────

  async onCrosswalkStatusFilterChanged(status: string): Promise<void> {
    this.crosswalkStatusFilter = status;
    await this.loadCrosswalks();
  }

  private async loadCrosswalks(): Promise<void> {
    this.crosswalksLoading = true;
    try {
      const result = await this.api.listCrosswalks({ status: this.crosswalkStatusFilter || undefined });
      this.crosswalks = result.records;
      this.crosswalkTotal = result.total;
    } catch (err) {
      this.error = this.errorText('figshare-vocab-error-load-crosswalks', err);
      this.logger.error(this.error);
    } finally {
      this.crosswalksLoading = false;
    }
  }

  async openCrosswalk(crosswalk: FigshareCrosswalkSummary): Promise<void> {
    this.activeCrosswalk = crosswalk;
    this.mappingSearch = { q: '', status: '', offset: 0 };
    this.crosswalkError = '';
    this.crosswalkMessage = '';
    this.view = 'crosswalk-editor';
    await Promise.all([this.loadMappings(), this.loadCrosswalkUsage(crosswalk.id)]);
  }

  private async loadCrosswalkUsage(crosswalkId: string): Promise<void> {
    try {
      this.crosswalkUsage = await this.api.getCrosswalkUsage(crosswalkId);
    } catch (_err) {
      this.crosswalkUsage = [];
    }
  }

  private async loadMappings(): Promise<void> {
    if (!this.activeCrosswalk) {
      return;
    }
    this.mappingsLoading = true;
    try {
      const result = await this.api.listMappings(this.activeCrosswalk.id, {
        q: this.mappingSearch.q || undefined,
        status: this.mappingSearch.status || undefined,
        offset: this.mappingSearch.offset,
        limit: this.mappingPageSize
      });
      this.mappings = result.records;
      this.mappingTotal = result.total;
    } catch (err) {
      this.crosswalkError = this.errorText('figshare-vocab-error-load-mappings', err);
      this.logger.error(this.crosswalkError);
    } finally {
      this.mappingsLoading = false;
    }
  }

  async onMappingSearchChanged(search: MappingSearchState): Promise<void> {
    this.mappingSearch = search;
    await this.loadMappings();
  }

  async onMappingAdded(change: MappingChangeRequest): Promise<void> {
    await this.saveMappingChange(change, this.t(
      'figshare-vocab-mapping-added',
      'Target added to the working revision.'
    ));
  }

  async onMappingRemoved(change: MappingChangeRequest): Promise<void> {
    await this.saveMappingChange(change, this.t(
      'figshare-vocab-mapping-removed',
      'Mapping removed from the working revision.'
    ));
  }

  /**
   * One edge at a time: the first edit of an approved crosswalk forks a new working
   * revision server-side, so the returned summary replaces the cached crosswalk before
   * the mapping page is reloaded.
   */
  private async saveMappingChange(change: MappingChangeRequest, successMessage: string): Promise<void> {
    if (!this.activeCrosswalk) {
      return;
    }
    this.crosswalkSaving = true;
    this.crosswalkError = '';
    this.crosswalkMessage = '';
    try {
      const updated = await this.api.saveMappings(this.activeCrosswalk.id, {
        revision: this.activeCrosswalk.workingRevision,
        changes: [change]
      });
      this.activeCrosswalk = updated;
      this.crosswalkMessage = successMessage;
      await this.loadMappings();
    } catch (err) {
      this.crosswalkError = this.errorText('figshare-vocab-error-save-mappings', err);
      this.logger.error(this.crosswalkError);
    } finally {
      this.crosswalkSaving = false;
    }
  }

  async approveCrosswalk(revision: number): Promise<void> {
    if (!this.activeCrosswalk) {
      return;
    }
    this.crosswalkSaving = true;
    this.crosswalkError = '';
    try {
      this.activeCrosswalk = await this.api.approveCrosswalk(this.activeCrosswalk.id, revision);
      this.crosswalkMessage = this.t('figshare-vocab-crosswalk-approved', 'Revision {{revision}} approved.', {
        revision
      });
      await this.loadCrosswalks();
    } catch (err) {
      this.crosswalkError = this.errorText('figshare-vocab-error-approve', err);
      this.logger.error(this.crosswalkError);
    } finally {
      this.crosswalkSaving = false;
    }
  }

  async deleteCrosswalk(crosswalk: FigshareCrosswalkSummary): Promise<void> {
    this.error = '';
    try {
      await this.api.deleteCrosswalk(crosswalk.id);
      this.message = this.t(
        'figshare-vocab-crosswalk-deleted',
        'Crosswalk removed. Both vocabularies were left intact.'
      );
      await this.loadCrosswalks();
    } catch (err) {
      this.error = this.errorText('figshare-vocab-error-delete-crosswalk', err);
      this.logger.error(this.error);
    }
  }

  closeCrosswalkEditor(): void {
    this.activeCrosswalk = null;
    this.view = 'crosswalks';
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private t(key: string, defaultValue: string, options?: Record<string, unknown>): string {
    return String(this.translationService.t(key, defaultValue, options));
  }

  /** Drop any banner left over from a previous action before starting a new one. */
  private clearAlerts(): void {
    this.message = '';
    this.error = '';
  }

  public formatDate(value?: string | null): string {
    return formatFigshareTimestamp(value);
  }

  public scopeLabelKey(scope: string): string {
    return scope === 'account' ? 'figshare-vocab-scope-account' : 'figshare-vocab-scope-public';
  }

  private errorText(key: string, err: unknown): string {
    this.logger.error(`Figshare vocabulary request failed (${key})`, err);

    const status = this.asHttpStatus(err);
    if (status === 0) {
      return this.t(
        'figshare-vocab-error-server-unreachable',
        'ReDBox could not be reached. Check your connection, refresh the page, and try again.'
      );
    }
    if (status === 401) {
      return this.t('figshare-vocab-error-session-expired', 'Your session has expired. Sign in again, then retry this action.');
    }

    const detail = this.asErrorMessage(err).toLowerCase();
    const isFigshareConnectionError =
      status === 502 ||
      detail.includes('not configured') ||
      detail.includes('api token') ||
      detail.includes('figshare unavailable');
    if (isFigshareConnectionError) {
      return this.t(
        'figshare-vocab-error-figshare-connection',
        'ReDBox could not connect to Figshare. Go to Admin → Navigation → Figshare publishing configuration, check the settings for this brand, then try again.'
      );
    }

    return this.t(key, 'The request could not be completed. Please try again.');
  }

  private asHttpStatus(err: unknown): number | undefined {
    if (typeof err !== 'object' || err === null || !('status' in err)) {
      return undefined;
    }
    const status = (err as { status?: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }

  private asErrorMessage(err: unknown): string {
    if (typeof err === 'string') {
      return err;
    }
    if (typeof err !== 'object' || err === null) {
      return String(err);
    }
    const payload = err as {
      message?: string;
      error?: { message?: string; errors?: Array<{ detail?: string; title?: string; message?: string }> };
      errors?: Array<{ detail?: string; title?: string; message?: string }>;
    };
    const candidates = [payload.error?.errors?.[0], payload.errors?.[0]];
    for (const candidate of candidates) {
      const detail = candidate?.detail || candidate?.message || candidate?.title;
      if (detail) {
        return detail;
      }
    }
    return payload.error?.message || payload.message || String(err);
  }
}
