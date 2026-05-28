import { Component, Inject, OnDestroy } from '@angular/core';
import { BaseComponent, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import { NamedQueryApiService, NamedQueryDefinition } from './named-query-api.service';
import { NamedQueryListQueryState } from './nq-list/nq-list.component';

@Component({
  selector: 'named-query-editor',
  templateUrl: './named-query-editor.component.html',
  styleUrls: ['./named-query-editor.component.scss'],
  standalone: false
})
export class NamedQueryEditorComponent extends BaseComponent implements OnDestroy {
  queries: NamedQueryDefinition[] = [];
  filteredQueries: NamedQueryDefinition[] = [];
  listQuery: NamedQueryListQueryState = { searchTerm: '' };

  selectedQuery: NamedQueryDefinition | null = null;
  draft: NamedQueryDefinition = this.emptyDraft();
  isNew = false;

  message = '';
  error = '';

  isEditModalOpen = false;
  isDeleteModalOpen = false;
  pendingDeleteName: string | null = null;

  private editModalTrigger: HTMLElement | null = null;
  private deleteModalTrigger: HTMLElement | null = null;
  private messageTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    @Inject(LoggerService) private logger: LoggerService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(NamedQueryApiService) private api: NamedQueryApiService
  ) {
    super();
    this.initDependencies = [this.translationService, this.api];
  }

  protected override async initComponent(): Promise<void> {
    await this.loadQueries();
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.messageTimer) {
      clearTimeout(this.messageTimer);
      this.messageTimer = null;
    }
  }

  get totalQueries(): number {
    return this.queries.length;
  }

  get uniqueCollections(): number {
    const set = new Set<string>();
    for (const q of this.queries) {
      if (q.collectionName) set.add(q.collectionName);
    }
    return set.size;
  }

  get canSave(): boolean {
    if (!this.isEditModalOpen) return false;
    if (this.isNew && !this.draft.name?.trim()) return false;
    return !!this.draft.collectionName?.trim();
  }

  get pendingDeleteDisplayName(): string {
    return this.pendingDeleteName ?? '';
  }

  async loadQueries(): Promise<void> {
    this.error = '';
    try {
      this.queries = await this.api.list();
      this.applyFilter();
    } catch (err) {
      this.error = this.t('named-query-error-load', 'Failed to load named queries: {{error}}', { error: this.asErrorMessage(err) });
      this.logger.error(this.error);
    }
  }

  onListQueryChanged(query: NamedQueryListQueryState): void {
    this.listQuery = { searchTerm: String(query.searchTerm ?? '') };
    this.applyFilter();
  }

  private applyFilter(): void {
    const term = this.listQuery.searchTerm.trim().toLowerCase();
    if (!term) {
      this.filteredQueries = [...this.queries];
      return;
    }
    this.filteredQueries = this.queries.filter(q => {
      const name = (q.name || '').toLowerCase();
      const collection = (q.collectionName || '').toLowerCase();
      return name.includes(term) || collection.includes(term);
    });
  }

  newQuery(): void {
    this.clearMessage();
    this.error = '';
    this.rememberEditModalTrigger();
    this.selectedQuery = null;
    this.isNew = true;
    this.draft = this.emptyDraft();
    this.isEditModalOpen = true;
  }

  async openQuery(name: string): Promise<void> {
    this.clearMessage();
    this.error = '';
    this.rememberEditModalTrigger();
    try {
      const result = await this.api.get(name);
      this.selectedQuery = result;
      this.isNew = false;
      this.draft = this.cloneQuery(result);
      this.isEditModalOpen = true;
    } catch (err) {
      this.error = this.t('named-query-error-load-one', 'Failed to load named query: {{error}}', { error: this.asErrorMessage(err) });
      this.logger.error(this.error);
    }
  }

  closeEditModal(): void {
    this.isEditModalOpen = false;
    this.restoreEditModalTrigger();
  }

  async save(): Promise<void> {
    if (!this.canSave) {
      if (this.isNew && !this.draft.name?.trim()) {
        this.error = this.t('named-query-error-name-required', 'Named query name is required');
      } else {
        this.error = this.t('named-query-error-collection-required', 'Collection name is required');
      }
      return;
    }
    this.error = '';
    this.clearMessage();
    const payload = this.sanitizeQuery(this.draft);
    try {
      if (this.isNew) {
        await this.api.create(payload);
        this.setMessage(this.t('named-query-message-created', 'Named query "{{name}}" created', { name: payload.name ?? '' }));
      } else {
        await this.api.update(payload.name as string, payload);
        this.setMessage(this.t('named-query-message-updated', 'Named query "{{name}}" updated', { name: payload.name ?? '' }));
      }
      await this.loadQueries();
      this.closeEditModal();
    } catch (err) {
      const key = this.isNew ? 'named-query-error-create' : 'named-query-error-update';
      const fallback = this.isNew ? 'Failed to create named query: {{error}}' : 'Failed to update named query: {{error}}';
      this.error = this.t(key, fallback, { error: this.asErrorMessage(err) });
      this.logger.error(this.error);
    }
  }

  requestDelete(name: string): void {
    if (!name) return;
    this.rememberDeleteModalTrigger();
    this.pendingDeleteName = name;
    this.isDeleteModalOpen = true;
  }

  cancelDelete(): void {
    this.closeDeleteModal();
  }

  async confirmDelete(): Promise<void> {
    if (!this.pendingDeleteName) {
      this.closeDeleteModal();
      return;
    }
    const name = this.pendingDeleteName;
    this.closeDeleteModal(false);
    this.error = '';
    this.clearMessage();
    try {
      await this.api.delete(name);
      this.setMessage(this.t('named-query-message-deleted', 'Named query "{{name}}" deleted', { name }));
      if (this.selectedQuery?.name === name) {
        this.selectedQuery = null;
        if (this.isEditModalOpen) {
          this.closeEditModal();
        }
      }
      await this.loadQueries();
    } catch (err) {
      this.error = this.t('named-query-error-delete', 'Failed to delete named query: {{error}}', { error: this.asErrorMessage(err) });
      this.logger.error(this.error);
    } finally {
      this.restoreDeleteModalTrigger();
    }
  }

  private closeDeleteModal(restoreFocus: boolean = true): void {
    this.isDeleteModalOpen = false;
    this.pendingDeleteName = null;
    if (restoreFocus) {
      this.restoreDeleteModalTrigger();
    }
  }

  private emptyDraft(): NamedQueryDefinition {
    return {
      name: '',
      collectionName: '',
      mongoQuery: {},
      queryParams: {},
      resultObjectMapping: {},
      sort: [],
      expandRelations: false,
      relatedRecordFilters: []
    };
  }

  private cloneQuery(q: NamedQueryDefinition): NamedQueryDefinition {
    const cloned = JSON.parse(JSON.stringify(q)) as NamedQueryDefinition;
    cloned.mongoQuery = cloned.mongoQuery || {};
    cloned.queryParams = cloned.queryParams || {};
    cloned.resultObjectMapping = cloned.resultObjectMapping || {};
    cloned.sort = cloned.sort || [];
    cloned.relatedRecordFilters = cloned.relatedRecordFilters || [];
    return cloned;
  }

  private sanitizeQuery(q: NamedQueryDefinition): NamedQueryDefinition {
    return {
      name: q.name?.trim() || undefined,
      collectionName: q.collectionName?.trim() || '',
      brandIdFieldPath: 'metaMetadata.brandId',
      mongoQuery: q.mongoQuery || {},
      queryParams: q.queryParams || {},
      resultObjectMapping: q.resultObjectMapping || {},
      sort: q.sort && q.sort.length > 0 ? q.sort : undefined,
      expandRelations: !!q.expandRelations,
      relatedRecordFilters: q.relatedRecordFilters && q.relatedRecordFilters.length > 0 ? q.relatedRecordFilters : undefined
    };
  }

  private setMessage(text: string, durationMs = 5000): void {
    this.message = text;
    if (this.messageTimer) {
      clearTimeout(this.messageTimer);
    }
    this.messageTimer = setTimeout(() => {
      this.message = '';
      this.messageTimer = null;
    }, durationMs);
  }

  private clearMessage(): void {
    if (this.messageTimer) {
      clearTimeout(this.messageTimer);
      this.messageTimer = null;
    }
    this.message = '';
  }

  private rememberEditModalTrigger(): void {
    const el = document.activeElement;
    this.editModalTrigger = el instanceof HTMLElement ? el : null;
  }

  private rememberDeleteModalTrigger(): void {
    const el = document.activeElement;
    this.deleteModalTrigger = el instanceof HTMLElement ? el : null;
  }

  private restoreEditModalTrigger(): void {
    if (!this.editModalTrigger) return;
    const target = this.editModalTrigger;
    this.editModalTrigger = null;
    if (!document.contains(target)) return;
    setTimeout(() => target.focus(), 0);
  }

  private restoreDeleteModalTrigger(): void {
    if (!this.deleteModalTrigger) return;
    const target = this.deleteModalTrigger;
    this.deleteModalTrigger = null;
    if (!document.contains(target)) return;
    setTimeout(() => target.focus(), 0);
  }

  private asErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && err !== null) {
      const maybe = err as { message?: string; error?: { message?: string } };
      if (typeof maybe.message === 'string' && maybe.message) return maybe.message;
      if (maybe.error && typeof maybe.error.message === 'string') return maybe.error.message;
    }
    return String(err);
  }

  private t(key: string, defaultValue: string, options?: Record<string, unknown>): string {
    return String(this.translationService.t(key, defaultValue, options));
  }
}
