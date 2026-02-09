import { Component, Inject } from '@angular/core';
import { BaseComponent, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import { VocabularyApiService, VocabularyDetail, VocabularyEntry, VocabularySummary } from './vocabulary-api.service';

@Component({
  selector: 'admin-vocabulary',
  templateUrl: './admin-vocabulary.component.html',
  styleUrls: ['./admin-vocabulary.component.scss'],
  standalone: false
})
export class AdminVocabularyComponent extends BaseComponent {
  vocabularies: VocabularySummary[] = [];
  selectedVocabulary: VocabularyDetail | null = null;
  selectedEntries: VocabularyEntry[] = [];
  message = '';
  error = '';
  isEditModalOpen = false;
  isImportModalOpen = false;

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
    return this.vocabularies.length;
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
    return this.isEditModalOpen && !!this.selectedVocabulary?.id && this.draft.source === 'rva';
  }

  protected override async initComponent(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.vocabularies = await this.vocabularyApi.list();
  }

  async openVocabulary(id: string): Promise<void> {
    const result = await this.vocabularyApi.get(id);
    const flattenedEntries = this.flattenEntries(result.entries);
    this.selectedVocabulary = result.vocabulary;
    this.selectedEntries = flattenedEntries;
    this.draft = {
      ...result.vocabulary,
      entries: flattenedEntries
    };
    this.isEditModalOpen = true;
    this.isImportModalOpen = false;
  }

  newVocabulary(): void {
    this.message = '';
    this.error = '';
    this.selectedVocabulary = null;
    this.selectedEntries = [];
    this.draft = {
      name: '',
      description: '',
      type: 'flat',
      source: 'local',
      entries: []
    };
    this.isEditModalOpen = true;
    this.isImportModalOpen = false;
  }

  showImport(): void {
    this.message = '';
    this.error = '';
    this.isImportModalOpen = true;
    this.isEditModalOpen = false;
  }

  closeEditModal(): void {
    this.isEditModalOpen = false;
  }

  closeImportModal(): void {
    this.isImportModalOpen = false;
  }

  async save(): Promise<void> {
    if (!this.canSave) {
      this.error = 'Vocabulary name is required';
      return;
    }

    this.message = '';
    this.error = '';
    try {
      if (this.selectedVocabulary?.id) {
        await this.vocabularyApi.update(this.selectedVocabulary.id, this.draft);
        this.message = 'Vocabulary updated';
      } else {
        await this.vocabularyApi.create(this.draft);
        this.message = 'Vocabulary created';
      }
      await this.refresh();
      this.isEditModalOpen = false;
    } catch (err) {
      this.error = `Failed to save vocabulary: ${this.asErrorMessage(err)}`;
      this.logger.error(this.error);
    }
  }

  async deleteVocabulary(id: string): Promise<void> {
    if (typeof globalThis.confirm === 'function' && !globalThis.confirm('Delete this vocabulary? This action cannot be undone.')) {
      return;
    }

    this.message = '';
    this.error = '';
    try {
      await this.vocabularyApi.delete(id);
      this.message = 'Vocabulary deleted';
      if (this.selectedVocabulary?.id === id) {
        this.selectedVocabulary = null;
        this.selectedEntries = [];
        this.isEditModalOpen = false;
      }
      await this.refresh();
    } catch (err) {
      this.error = `Failed to delete vocabulary: ${this.asErrorMessage(err)}`;
      this.logger.error(this.error);
    }
  }

  async importRva(rvaId: string): Promise<void> {
    this.message = '';
    this.error = '';
    try {
      const trimmedId = rvaId.trim();
      if (!trimmedId) {
        this.error = 'RVA ID is required';
        return;
      }
      await this.vocabularyApi.importRva(trimmedId);
      this.message = 'RVA vocabulary imported';
      await this.refresh();
      this.isImportModalOpen = false;
    } catch (err) {
      this.error = `Failed to import RVA vocabulary: ${this.asErrorMessage(err)}`;
      this.logger.error(this.error);
    }
  }

  async syncSelected(): Promise<void> {
    this.message = '';
    this.error = '';
    try {
      if (!this.selectedVocabulary?.id) {
        this.error = 'No vocabulary selected';
        return;
      }
      const result = await this.vocabularyApi.sync(this.selectedVocabulary.id);
      this.message = `Sync complete (created=${result.created}, updated=${result.updated}, skipped=${result.skipped})`;
      await this.openVocabulary(this.selectedVocabulary.id);
      await this.refresh();
    } catch (err) {
      this.error = `Failed to sync vocabulary: ${this.asErrorMessage(err)}`;
      this.logger.error(this.error);
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
        return firstError.message || firstError.detail || firstError.title || 'Unknown error';
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
}
