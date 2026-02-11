import { Component, Inject, OnDestroy } from '@angular/core';
import { BaseComponent, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import { VocabularyApiService, VocabularyDetail, VocabularyEntry, VocabularySummary } from './vocabulary-api.service';

type SourceFilter = 'all' | 'local' | 'rva';
type TypeFilter = 'all' | 'flat' | 'tree';
type VocabularyListQueryState = {
  searchTerm: string;
  sourceFilter: SourceFilter;
  typeFilter: TypeFilter;
};

@Component({
  selector: 'admin-vocabulary',
  templateUrl: './admin-vocabulary.component.html',
  styleUrls: ['./admin-vocabulary.component.scss'],
  standalone: false
})
export class AdminVocabularyComponent extends BaseComponent implements OnDestroy {
  vocabularies: VocabularySummary[] = [];
  totalVocabularyCount = 0;
  listLimit = 25;
  listOffset = 0;
  listQuery: VocabularyListQueryState = {
    searchTerm: '',
    sourceFilter: 'all',
    typeFilter: 'all'
  };
  selectedVocabulary: VocabularyDetail | null = null;
  selectedEntries: VocabularyEntry[] = [];
  message = '';
  error = '';
  importStatusMessage = '';
  importStatusVariant: '' | 'info' | 'success' | 'danger' = '';
  isImportInProgress = false;
  syncStatusMessage = '';
  syncStatusVariant: '' | 'info' | 'success' | 'warning' | 'danger' = '';
  isSyncInProgress = false;
  isSyncConfirmationOpen = false;
  isEditModalOpen = false;
  isImportModalOpen = false;
  private editModalTrigger: HTMLElement | null = null;
  private syncStatusTimer: ReturnType<typeof setTimeout> | null = null;

  draft: VocabularyDetail = {
    name: '',
    type: 'flat',
    source: 'local',
    entries: []
  };

  constructor(
    @Inject(LoggerService) private logger: LoggerService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(VocabularyApiService) private vocabularyApi: VocabularyApiService
  ) {
    super();
    this.initDependencies = [this.translationService, this.vocabularyApi];
  }

  get totalVocabularies(): number {
    return this.totalVocabularyCount;
  }

  get localVocabularies(): number {
    return this.vocabularies.filter((vocabulary: VocabularySummary) => vocabulary.source === 'local').length;
  }

  get rvaVocabularies(): number {
    return this.vocabularies.filter((vocabulary: VocabularySummary) => vocabulary.source === 'rva').length;
  }

  get canSave(): boolean {
    return this.isEditModalOpen && !!this.draft.name?.trim();
  }

  get canSyncSelected(): boolean {
    return this.isEditModalOpen && !!this.selectedVocabulary?.id && this.draft.source === 'rva' && !this.isSyncInProgress && !this.isSyncConfirmationOpen;
  }

  protected override async initComponent(): Promise<void> {
    await this.refresh();
  }

  ngOnDestroy(): void {
    this.clearSyncStatusTimer();
    this.syncStatusTimer = null;
  }

  async refresh(): Promise<void> {
    await this.loadVocabularyPage();
  }

  async onListQueryChanged(query: VocabularyListQueryState): Promise<void> {
    this.listQuery = {
      ...query,
      searchTerm: String(query.searchTerm ?? '')
    };
    this.listOffset = 0;
    await this.loadVocabularyPage();
  }

  async onListPageChanged(offset: number): Promise<void> {
    this.listOffset = Math.max(0, Number(offset) || 0);
    await this.loadVocabularyPage();
  }

  private async loadVocabularyPage(): Promise<void> {
    try {
      const response = await this.vocabularyApi.list({
        q: this.listQuery.searchTerm.trim() || undefined,
        source: this.listQuery.sourceFilter === 'all' ? undefined : this.listQuery.sourceFilter,
        type: this.listQuery.typeFilter === 'all' ? undefined : this.listQuery.typeFilter,
        limit: this.listLimit,
        offset: this.listOffset
      });
      this.vocabularies = response.data;
      this.totalVocabularyCount = Number(response.meta?.total ?? response.data.length);
      this.listLimit = Number(response.meta?.limit ?? this.listLimit);
      this.listOffset = Number(response.meta?.offset ?? this.listOffset);
    } catch (err) {
      this.error = this.t('admin-vocabulary-error-load-vocabularies', 'Failed to load vocabularies: {{error}}', { error: this.asErrorMessage(err) });
      this.logger.error(this.error);
    }
  }

  async openVocabulary(id: string): Promise<void> {
    this.message = '';
    this.error = '';
    this.rememberEditModalTrigger();
    try {
      const result = await this.vocabularyApi.get(id);
      const flattenedEntries = this.flattenEntries(result.entries);
      this.selectedVocabulary = result.vocabulary;
      this.selectedEntries = flattenedEntries;
      this.draft = {
        ...result.vocabulary,
        entries: flattenedEntries
      };
      this.clearSyncStatus();
      this.isSyncInProgress = false;
      this.isSyncConfirmationOpen = false;
      this.isEditModalOpen = true;
      this.isImportModalOpen = false;
    } catch (err) {
      this.error = this.t('admin-vocabulary-error-load-vocabulary', 'Failed to load vocabulary: {{error}}', { error: this.asErrorMessage(err) });
      this.logger.error(this.error);
    }
  }

  newVocabulary(): void {
    this.message = '';
    this.error = '';
    this.rememberEditModalTrigger();
    this.selectedVocabulary = null;
    this.selectedEntries = [];
    this.draft = {
      name: '',
      description: '',
      type: 'flat',
      source: 'local',
      entries: []
    };
    this.clearSyncStatus();
    this.isSyncInProgress = false;
    this.isSyncConfirmationOpen = false;
    this.isEditModalOpen = true;
    this.isImportModalOpen = false;
  }

  showImport(): void {
    this.message = '';
    this.error = '';
    this.importStatusMessage = '';
    this.importStatusVariant = '';
    this.isImportInProgress = false;
    this.isImportModalOpen = true;
    this.isEditModalOpen = false;
  }

  closeEditModal(): void {
    this.isEditModalOpen = false;
    this.restoreEditModalTrigger();
  }

  closeImportModal(): void {
    this.isImportModalOpen = false;
  }

  async save(): Promise<void> {
    if (!this.canSave) {
      this.error = this.t('admin-vocabulary-error-name-required', 'Vocabulary name is required');
      return;
    }

    this.message = '';
    this.error = '';
    try {
      if (this.selectedVocabulary?.id) {
        await this.vocabularyApi.update(this.selectedVocabulary.id, this.draft);
        this.message = this.t('admin-vocabulary-message-updated', 'Vocabulary updated');
      } else {
        await this.vocabularyApi.create(this.draft);
        this.message = this.t('admin-vocabulary-message-created', 'Vocabulary created');
      }
      await this.refresh();
      this.closeEditModal();
    } catch (err) {
      this.error = this.t('admin-vocabulary-error-save-vocabulary', 'Failed to save vocabulary: {{error}}', { error: this.asErrorMessage(err) });
      this.logger.error(this.error);
    }
  }

  async deleteVocabulary(id: string): Promise<void> {
    if (typeof globalThis.confirm === 'function' && !globalThis.confirm(this.t('admin-vocabulary-confirm-delete', 'Delete this vocabulary? This action cannot be undone.'))) {
      return;
    }

    this.message = '';
    this.error = '';
    try {
      await this.vocabularyApi.delete(id);
      this.message = this.t('admin-vocabulary-message-deleted', 'Vocabulary deleted');
      if (this.selectedVocabulary?.id === id) {
        this.selectedVocabulary = null;
        this.selectedEntries = [];
        this.closeEditModal();
      }
      if (this.listOffset > 0 && this.vocabularies.length <= 1) {
        this.listOffset = Math.max(0, this.listOffset - this.listLimit);
      }
      await this.refresh();
    } catch (err) {
      this.error = this.t('admin-vocabulary-error-delete-vocabulary', 'Failed to delete vocabulary: {{error}}', { error: this.asErrorMessage(err) });
      this.logger.error(this.error);
    }
  }

  async importRva(rvaId: string): Promise<void> {
    this.message = '';
    this.error = '';
    this.importStatusMessage = '';
    this.importStatusVariant = '';
    try {
      const trimmedId = String(rvaId ?? '').trim();
      if (!trimmedId) {
        this.error = this.t('admin-vocabulary-error-rva-id-required', 'RVA ID is required');
        this.importStatusMessage = this.error;
        this.importStatusVariant = 'danger';
        return;
      }

      this.isImportInProgress = true;
      this.importStatusMessage = this.t('admin-vocabulary-import-in-progress', 'Import in progress...');
      this.importStatusVariant = 'info';
      await this.vocabularyApi.importRva(trimmedId);
      this.message = this.t('admin-vocabulary-message-rva-imported', 'RVA vocabulary imported');
      this.importStatusMessage = this.t('admin-vocabulary-import-success', 'RVA vocabulary imported successfully.');
      this.importStatusVariant = 'success';
      await this.refresh();
      this.isImportModalOpen = false;
    } catch (err) {
      this.error = this.t('admin-vocabulary-error-import-rva', 'Failed to import RVA vocabulary: {{error}}', { error: this.asErrorMessage(err) });
      this.importStatusMessage = this.error;
      this.importStatusVariant = 'danger';
      this.logger.error(this.error);
    } finally {
      this.isImportInProgress = false;
    }
  }

  async syncSelected(): Promise<void> {
    this.message = '';
    this.error = '';
    if (!this.selectedVocabulary?.id) {
      this.error = this.t('admin-vocabulary-error-no-selection', 'No vocabulary selected');
      return;
    }

    this.isSyncConfirmationOpen = true;
    this.clearSyncStatusTimer();
    this.syncStatusMessage = this.t('admin-vocabulary-sync-warning', 'Syncing will replace local changes for this vocabulary.');
    this.syncStatusVariant = 'warning';
  }

  cancelSyncConfirmation(): void {
    if (this.isSyncInProgress) {
      return;
    }
    this.isSyncConfirmationOpen = false;
    this.clearSyncStatus();
  }

  async confirmSyncSelected(): Promise<void> {
    this.message = '';
    this.error = '';
    try {
      if (!this.selectedVocabulary?.id) {
        this.error = this.t('admin-vocabulary-error-no-selection', 'No vocabulary selected');
        return;
      }
      this.isSyncConfirmationOpen = false;
      this.isSyncInProgress = true;
      this.clearSyncStatusTimer();
      this.syncStatusMessage = this.t('admin-vocabulary-sync-in-progress', 'Sync in progress...');
      this.syncStatusVariant = 'info';
      const result = await this.vocabularyApi.sync(this.selectedVocabulary.id);
      this.message = this.t(
        'admin-vocabulary-sync-complete',
        'Sync complete (created={{created}}, updated={{updated}}, skipped={{skipped}})',
        { created: result.created, updated: result.updated, skipped: result.skipped }
      );
      await this.openVocabulary(this.selectedVocabulary.id);
      await this.refresh();
      this.syncStatusMessage = this.t('admin-vocabulary-sync-success', 'Sync completed successfully.');
      this.syncStatusVariant = 'success';
      this.scheduleSyncStatusClear();
    } catch (err) {
      this.error = this.t('admin-vocabulary-error-sync-vocabulary', 'Failed to sync vocabulary: {{error}}', { error: this.asErrorMessage(err) });
      this.syncStatusMessage = this.error;
      this.syncStatusVariant = 'danger';
      this.logger.error(this.error);
    } finally {
      this.isSyncInProgress = false;
    }
  }

  private asErrorMessage(err: unknown): string {
    if (err instanceof Error) {
      return err.message;
    }
    if (typeof err === 'object' && err !== null) {
      const maybe = err as {
        message?: string;
        detail?: string;
        userMessage?: string;
        errors?: Array<{ message?: string; detail?: string; title?: string }>;
      };
      if (typeof maybe.message === 'string' && maybe.message.trim()) {
        return maybe.message;
      }
      if (typeof maybe.detail === 'string' && maybe.detail.trim()) {
        return maybe.detail;
      }
      if (typeof maybe.userMessage === 'string' && maybe.userMessage.trim()) {
        return maybe.userMessage;
      }
      const firstError = maybe.errors?.[0];
      if (firstError) {
        return firstError.message || firstError.detail || firstError.title || this.t('admin-vocabulary-error-unknown', 'Unknown error');
      }
    }
    return String(err);
  }

  private flattenEntries(entries: VocabularyEntry[]): VocabularyEntry[] {
    if (!Array.isArray(entries) || entries.length === 0) {
      return [];
    }

    const flattened: VocabularyEntry[] = [];
    const visit = (entry: VocabularyEntry, parentId?: string): void => {
      const normalized: VocabularyEntry = {
        ...entry,
        parent: entry.parent ?? parentId,
        children: []
      };
      flattened.push(normalized);

      if (Array.isArray(entry.children) && entry.children.length > 0) {
        entry.children.forEach((child: VocabularyEntry) => visit(child, entry.id));
      }
    };

    entries.forEach((entry: VocabularyEntry) => visit(entry));

    return flattened.map((entry: VocabularyEntry, index: number) => ({
      ...entry,
      order: index
    }));
  }

  private rememberEditModalTrigger(): void {
    const activeElement = document.activeElement;
    this.editModalTrigger = activeElement instanceof HTMLElement ? activeElement : null;
  }

  private restoreEditModalTrigger(): void {
    if (!this.editModalTrigger) {
      return;
    }
    const target = this.editModalTrigger;
    this.editModalTrigger = null;
    setTimeout(() => target.focus(), 0);
  }

  private clearSyncStatus(): void {
    this.clearSyncStatusTimer();
    this.syncStatusMessage = '';
    this.syncStatusVariant = '';
  }

  private clearSyncStatusTimer(): void {
    if (this.syncStatusTimer) {
      clearTimeout(this.syncStatusTimer);
      this.syncStatusTimer = null;
    }
  }

  private scheduleSyncStatusClear(delayMs: number = 5000): void {
    this.clearSyncStatusTimer();
    this.syncStatusTimer = setTimeout(() => {
      this.syncStatusMessage = '';
      this.syncStatusVariant = '';
      this.syncStatusTimer = null;
    }, delayMs);
  }

  private t(key: string, defaultValue: string, options?: Record<string, unknown>): string {
    return String(this.translationService.t(key, defaultValue, options));
  }

}
