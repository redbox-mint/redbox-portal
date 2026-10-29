import { Component, Inject, OnDestroy, HostListener } from '@angular/core';
import type {
  ContextSchemaField,
  EditorDiagnostic,
  NamedQueryDescription,
  NamedQueryPreview,
  NamedQueryDraftRequest,
  NamedQueryFieldDescription,
  NamedQuerySchemaSelection,
  SchemaTarget,
} from '@researchdatabox/sails-ng-common';
import { storedRecordPath } from '@researchdatabox/sails-ng-common';
import { LatestRequest, type FieldNode } from '@researchdatabox/portal-ng-common';
import { BaseComponent, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import { NamedQueryApiService, NamedQueryDefinition } from './named-query-api.service';
import { NamedQueryListQueryState } from './nq-list/nq-list.component';

@Component({
  selector: 'named-query-editor',
  templateUrl: './named-query-editor.component.html',
  styleUrls: ['./named-query-editor.component.scss'],
  standalone: false,
})
export class NamedQueryEditorComponent extends BaseComponent implements OnDestroy {
  queries: NamedQueryDefinition[] = [];
  filteredQueries: NamedQueryDefinition[] = [];
  collections: string[] = [];
  listQuery: NamedQueryListQueryState = { searchTerm: '' };

  selectedQuery: NamedQueryDefinition | null = null;
  draft: NamedQueryDefinition = this.emptyDraft();
  isNew = false;

  message = '';
  error = '';

  isEditing = false;
  isDeleteModalOpen = false;
  pendingDeleteName: string | null = null;

  targets: SchemaTarget[] = [];
  guidance: NamedQuerySchemaSelection | null = null;
  relatedGuidance: Record<string, NamedQuerySchemaSelection> = {};
  foreignFields: Record<string, ContextSchemaField[]> = {};
  fieldDescription: NamedQueryFieldDescription | null = null;
  diagnostics: EditorDiagnostic[] = [];
  private validationBlocking = false;
  private invalidTestParameters = new Map<string, string>();
  description: NamedQueryDescription | null = null;
  previewResult: NamedQueryPreview | null = null;
  testParameters: Record<string, unknown> = {};
  assistanceError = '';
  validating = false;
  previewing = false;
  saving = false;
  helpOpen = true;
  pendingInput = false;
  private baseline = '';
  private inputDirty = false;
  private itemRequests = new LatestRequest();
  private fieldsRequests = new LatestRequest();
  private validationRequests = new LatestRequest();
  private previewRequests = new LatestRequest();
  private targetRequests = new LatestRequest();
  private foreignRequests = new LatestRequest();
  private validationTimer: ReturnType<typeof setTimeout> | null = null;
  fieldPath = (node: FieldNode): string | null => storedRecordPath(node.path);

  fields: ContextSchemaField[] = [];
  parameterKey(_index: number, param: { key: string }): string {
    return param.key;
  }
  get mappingFields(): ContextSchemaField[] {
    return this.fieldDescription?.mappingFields || [];
  }
  get dirty(): boolean {
    return this.isEditing && (this.inputDirty || JSON.stringify(this.draft) !== this.baseline);
  }
  get parameterEntries() {
    return Object.entries(this.draft.queryParams || {}).map(([key, param]) => ({ key, ...param }));
  }
  get previewColumns(): string[] {
    return [
      ...new Set(
        (this.previewResult?.records || []).flatMap(row => (row && typeof row === 'object' ? Object.keys(row) : []))
      ),
    ];
  }
  cell(row: unknown, key: string): string {
    const value = (row as Record<string, unknown>)?.[key];
    return typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  @HostListener('document:click', ['$event'])
  guardExternalNavigation(event: MouseEvent): void {
    const anchor = (event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (anchor && anchor.getAttribute('href') !== '#' && this.dirty && !this.confirmDiscard()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private confirmDiscard(): boolean {
    return !this.dirty || window.confirm(this.t('named-query-discard-confirm', 'Discard unsaved query changes?'));
  }

  private invalidateAssistance(): void {
    this.fieldsRequests.invalidate();
    this.validationRequests.invalidate();
    this.previewRequests.invalidate();
    this.foreignRequests.invalidate();
    if (this.validationTimer) clearTimeout(this.validationTimer);
    this.validationTimer = null;
    this.validating = false;
    this.previewing = false;
    this.previewResult = null;
    this.description = null;
    this.diagnostics = [];
    this.validationBlocking = false;
  }

  private startDraft(): void {
    this.invalidateAssistance();
    this.targetRequests.invalidate();
    this.baseline = JSON.stringify(this.draft);
    this.inputDirty = false;
    this.pendingInput = false;
    this.relatedGuidance = {};
    this.foreignFields = {};
    this.testParameters = {};
    this.invalidTestParameters.clear();
    this.guidance = this.inferGuidance();
    this.fieldDescription = null;
    this.fields = [];
    this.assistanceError = '';
    this.targets = [];
    void this.loadTargets();
    void this.refreshFields();
    if (this.draft.relatedRecordFilters?.length) void this.foreignContextChanged({ index: -1, collectionName: '' });
    this.scheduleValidation();
    // Focus the workspace heading after Angular has rendered the new item.
    setTimeout(() => document.getElementById('named-query-workspace-title')?.focus(), 0);
  }

  private inferGuidance(): NamedQuerySchemaSelection | null {
    if (this.draft.collectionName !== 'record') return null;
    const query = this.draft.mongoQuery || {};
    const type = query['metaMetadata.type'];
    // Only the exact top-level, unparameterized constraint is unambiguous.
    if (
      typeof type !== 'string' ||
      !type ||
      Object.keys(query).some(k => k.startsWith('$') || k === 'metaMetadata') ||
      Object.values(this.draft.queryParams || {}).some(p => p.path === 'metaMetadata' || p.path === 'metaMetadata.type')
    )
      return null;
    return { recordType: type };
  }

  async loadTargets(): Promise<void> {
    const token = this.targetRequests.next();
    try {
      const result = await this.api.schemaTargets();
      if (this.targetRequests.isCurrent(token)) this.targets = result.recordTypes;
    } catch {
      if (this.targetRequests.isCurrent(token))
        this.assistanceError = this.t(
          'named-query-guidance-unavailable',
          'Guidance unavailable. Manual editing remains available.'
        );
    }
  }

  async chooseGuidance(selection: NamedQuerySchemaSelection | null): Promise<void> {
    this.guidance = this.draft.collectionName === 'record' ? selection : null;
    this.invalidateAssistance();
    await this.refreshFields();
    this.scheduleValidation();
  }

  async collectionChanged(): Promise<void> {
    this.guidance = null;
    this.fieldDescription = null;
    this.fields = [];
    this.relatedGuidance = {};
    this.foreignFields = {};
    this.invalidateAssistance();
    await this.refreshFields();
    this.draftChanged();
  }

  async refreshFields(): Promise<void> {
    const token = this.fieldsRequests.next();
    this.fieldDescription = null;
    this.fields = [];
    if (!this.draft.collectionName) return;
    try {
      const fields = await this.api.fields({ collectionName: this.draft.collectionName, ...this.guidance });
      if (this.fieldsRequests.isCurrent(token)) {
        this.fieldDescription = fields;
        this.fields = [...fields.envelopeFields, ...fields.fields];
        this.assistanceError = '';
      }
    } catch {
      if (this.fieldsRequests.isCurrent(token))
        this.assistanceError = this.t(
          'named-query-guidance-unavailable',
          'Guidance unavailable. Manual editing remains available.'
        );
    }
  }

  addTypeConstraint(): void {
    if (!this.guidance || this.draft.collectionName !== 'record' || this.pendingInput) return;
    const type = { 'metaMetadata.type': this.guidance.recordType };
    // Preserve every existing expression, including an existing or conflicting type constraint.
    this.draft.mongoQuery = Object.keys(this.draft.mongoQuery || {}).length
      ? { $and: [this.draft.mongoQuery, type] }
      : type;
    this.draftChanged();
  }

  async foreignContextChanged(context: {
    index: number;
    collectionName: string;
    selection?: NamedQuerySchemaSelection;
  }): Promise<void> {
    const key = String(context.index);
    if (context.index < 0) this.relatedGuidance = {};
    if (context.collectionName === 'record' && context.selection) this.relatedGuidance[key] = context.selection;
    else delete this.relatedGuidance[key];
    delete this.relatedGuidance['-1'];
    // Refresh all foreign descriptions together: removing/reordering filters cannot attach a late response to a different filter.
    const token = this.foreignRequests.next();
    this.foreignFields = {};
    this.validationRequests.invalidate();
    this.previewRequests.invalidate();
    this.previewResult = null;
    this.previewing = false;
    const filters = this.draft.relatedRecordFilters || [];
    await Promise.all(
      filters.map(async (filter, index) => {
        try {
          const result = await this.api.fields({
            collectionName: filter.collectionName,
            ...this.relatedGuidance[String(index)],
          });
          if (this.foreignRequests.isCurrent(token))
            this.foreignFields[String(index)] = [...result.envelopeFields, ...result.fields];
        } catch {
          /* Foreign guidance is optional; the path stays editable. */
        }
      })
    );
    if (this.foreignRequests.isCurrent(token)) this.scheduleValidation();
  }

  draftChanged(): void {
    // A removed or retyped parameter no longer owns its old control's error.
    for (const [key, definition] of this.invalidTestParameters) {
      if (definition !== this.testParameterDefinition(key)) this.invalidTestParameters.delete(key);
    }
    for (const key of Object.keys(this.testParameters)) {
      if (!Object.prototype.hasOwnProperty.call(this.draft.queryParams || {}, key)) delete this.testParameters[key];
    }
    this.inputDirty = true;
    this.previewRequests.invalidate();
    this.previewing = false;
    this.previewResult = null;
    this.description = null;
    this.diagnostics = [];
    this.validationBlocking = false;
    this.validationRequests.invalidate();
    this.scheduleValidation();
  }

  inputChanged(event?: Event): void {
    if ((event?.target as Element | undefined)?.closest?.('rb-field-tree, [data-nq-guidance]')) return;
    this.inputDirty = true;
    this.validationRequests.invalidate();
    this.validating = false;
    this.previewRequests.invalidate();
    this.previewing = false;
    this.previewResult = null;
  }
  validityChanged(valid: boolean): void {
    this.pendingInput = !valid;
    this.inputChanged();
  }

  private request(): NamedQueryDraftRequest {
    return {
      definition: JSON.parse(JSON.stringify(this.draft)),
      ...(this.guidance ? { guidance: { ...this.guidance } } : {}),
      relatedGuidance: JSON.parse(JSON.stringify(this.relatedGuidance)),
    };
  }
  scheduleValidation(): void {
    if (this.validationTimer) clearTimeout(this.validationTimer);
    if (!this.isEditing) return;
    this.validationTimer = setTimeout(() => {
      this.validationTimer = null;
      void this.validateDraft();
    }, 400);
  }
  async validateDraft(): Promise<void> {
    if (this.pendingInput) return;
    const token = this.validationRequests.next();
    this.validating = true;
    try {
      const result = await this.api.validate(this.request());
      if (this.validationRequests.isCurrent(token)) {
        this.diagnostics = result.diagnostics;
        this.validationBlocking = !result.valid;
      }
    } catch {
      if (this.validationRequests.isCurrent(token)) {
        this.diagnostics = [];
        this.validationBlocking = false;
        this.assistanceError = this.t(
          'named-query-validation-unavailable',
          'Validation unavailable. Your draft is retained.'
        );
      }
    } finally {
      if (this.validationRequests.isCurrent(token)) this.validating = false;
    }
  }
  testParameterChanged(key: string, value: unknown): void {
    this.testParameters = { ...this.testParameters, [key]: value };
    this.previewRequests.invalidate();
    this.previewResult = null;
    this.previewing = false;
  }
  testParameterValidity(key: string, valid: boolean): void {
    if (valid) this.invalidTestParameters.delete(key);
    else this.invalidTestParameters.set(key, this.testParameterDefinition(key));
    this.previewRequests.invalidate();
    this.previewResult = null;
    this.previewing = false;
  }
  private testParameterDefinition(key: string): string {
    const param = this.draft.queryParams?.[key];
    return JSON.stringify(param ? [param.type, param.template] : null);
  }
  get previewInputInvalid(): boolean {
    return this.pendingInput || this.invalidTestParameters.size > 0;
  }
  async preview(): Promise<void> {
    if (this.previewInputInvalid || this.previewing) return;
    if (this.validationTimer) clearTimeout(this.validationTimer);
    this.validationTimer = null;
    this.validationRequests.invalidate();
    this.validating = false;
    const token = this.previewRequests.next();
    this.previewing = true;
    this.previewResult = null;
    this.description = null;
    this.error = '';
    const request = { ...this.request(), parameters: JSON.parse(JSON.stringify(this.testParameters)) };
    try {
      const [result, description] = await Promise.all([this.api.preview(request), this.api.describe(request)]);
      if (this.previewRequests.isCurrent(token)) {
        this.validationRequests.invalidate();
        this.validating = false;
        this.previewResult = result;
        this.description = description;
        this.diagnostics = result.diagnostics;
      }
    } catch (err) {
      if (this.previewRequests.isCurrent(token))
        this.error = this.t('named-query-preview-error', 'Preview failed: {{error}}', {
          error: this.asErrorMessage(err),
        });
    } finally {
      if (this.previewRequests.isCurrent(token)) this.previewing = false;
    }
  }

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
    await Promise.all([this.loadQueries(), this.loadCollections()]);
  }

  async loadCollections(): Promise<void> {
    try {
      this.collections = await this.api.getCollections();
    } catch (err) {
      this.collections = [];
      this.logger.error(
        this.t('named-query-error-load-collections', 'Failed to load collections: {{error}}', {
          error: this.asErrorMessage(err),
        })
      );
    }
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    this.itemRequests.invalidate();
    this.targetRequests.invalidate();
    this.invalidateAssistance();
    if (this.messageTimer) clearTimeout(this.messageTimer);
    this.messageTimer = null;
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
    if (!this.isEditing || this.pendingInput || this.saving || this.validationBlocking) return false;
    if (this.isNew) {
      const trimmed = this.draft.name?.trim();
      if (!trimmed || !/^[A-Za-z0-9_-]+$/.test(trimmed)) return false;
      if (trimmed === 'collections') return false;
    }
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
      this.error = this.t('named-query-error-load', 'Failed to load named queries: {{error}}', {
        error: this.asErrorMessage(err),
      });
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
    if (this.saving || !this.confirmDiscard()) return;
    this.itemRequests.invalidate();
    this.clearMessage();
    this.error = '';
    this.rememberEditModalTrigger();
    this.selectedQuery = null;
    this.isNew = true;
    this.draft = this.emptyDraft();
    this.isEditing = true;
    this.startDraft();
  }

  async openQuery(name: string): Promise<void> {
    if (this.saving || !this.confirmDiscard()) return;
    const token = this.itemRequests.next();
    this.invalidateAssistance();
    this.clearMessage();
    this.error = '';
    this.rememberEditModalTrigger();
    try {
      const result = await this.api.get(name);
      if (!this.itemRequests.isCurrent(token)) return;
      this.selectedQuery = result;
      this.isNew = false;
      this.draft = this.cloneQuery(result);
      this.isEditing = true;
      this.startDraft();
    } catch (err) {
      if (!this.itemRequests.isCurrent(token)) return;
      this.error = this.t('named-query-error-load-one', 'Failed to load named query: {{error}}', {
        error: this.asErrorMessage(err),
      });
      this.logger.error(this.error);
    }
  }

  closeEditModal(): void {
    if (this.saving || !this.confirmDiscard()) return;
    this.itemRequests.invalidate();
    this.targetRequests.invalidate();
    this.invalidateAssistance();
    this.isEditing = false;
    this.restoreEditModalTrigger();
  }

  async save(): Promise<void> {
    if (!this.canSave) {
      if (this.isNew) {
        const trimmed = this.draft.name?.trim();
        if (!trimmed) {
          this.error = this.t('named-query-error-name-required', 'Named query name is required');
        } else if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
          this.error = this.t(
            'named-query-error-name-invalid',
            'Named query name must be URL safe (letters, numbers, underscores, hyphens only)'
          );
        } else if (trimmed === 'collections') {
          this.error = this.t('named-query-error-name-reserved', "'collections' is a reserved name and cannot be used");
        }
      } else {
        this.error = this.t('named-query-error-collection-required', 'Collection name is required');
      }
      return;
    }
    this.error = '';
    this.clearMessage();
    const draftAtSave = JSON.stringify(this.draft);
    const payload = this.sanitizeQuery(JSON.parse(draftAtSave));
    this.saving = true;
    try {
      await this.validateDraft();
      if (this.validationBlocking || this.pendingInput || JSON.stringify(this.draft) !== draftAtSave) return;
      if (this.isNew) {
        await this.api.create(payload);
        this.setMessage(
          this.t('named-query-message-created', 'Named query "{{name}}" created', { name: payload.name ?? '' })
        );
      } else {
        await this.api.update(payload.name as string, payload);
        this.setMessage(
          this.t('named-query-message-updated', 'Named query "{{name}}" updated', { name: payload.name ?? '' })
        );
      }
      await this.loadQueries();
      if (JSON.stringify(this.draft) === draftAtSave) {
        this.inputDirty = false;
        this.baseline = draftAtSave;
        this.saving = false;
        this.closeEditModal();
      }
    } catch (err) {
      const key = this.isNew ? 'named-query-error-create' : 'named-query-error-update';
      const fallback = this.isNew
        ? 'Failed to create named query: {{error}}'
        : 'Failed to update named query: {{error}}';
      this.error = this.t(key, fallback, { error: this.asErrorMessage(err) });
      this.logger.error(this.error);
    } finally {
      this.saving = false;
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
        if (this.isEditing) {
          this.closeEditModal();
        }
      }
      await this.loadQueries();
    } catch (err) {
      this.error = this.t('named-query-error-delete', 'Failed to delete named query: {{error}}', {
        error: this.asErrorMessage(err),
      });
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
      relatedRecordFilters: [],
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
      ...q,
      name: q.name?.trim() || undefined,
      collectionName: q.collectionName?.trim() || '',
      mongoQuery: q.mongoQuery || {},
      queryParams: q.queryParams || {},
      resultObjectMapping: q.resultObjectMapping || {},
      sort: q.sort && q.sort.length > 0 ? q.sort : undefined,
      expandRelations: !!q.expandRelations,
      relatedRecordFilters:
        q.relatedRecordFilters && q.relatedRecordFilters.length > 0 ? q.relatedRecordFilters : undefined,
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
    const target = this.editModalTrigger;
    const name = this.selectedQuery?.name;
    this.editModalTrigger = null;
    setTimeout(() => {
      const fallback = name ? document.querySelector<HTMLElement>(`[data-query-name="${CSS.escape(name)}"]`) : null;
      (target && document.contains(target)
        ? target
        : fallback || document.getElementById('named-query-create')
      )?.focus();
    }, 0);
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
