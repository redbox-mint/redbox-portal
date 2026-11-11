import { Component, Inject, OnDestroy, HostListener } from '@angular/core';
import type {
  ContextSchemaField,
  EditorDiagnostic,
  NamedQuerySourceDescription,
  NamedQuerySourcePreview,
  GraphqlNamedQueryDefinition,
  GraphqlNamedQueryDescription,
  NamedQueryUpdateReview,
  NamedQuerySource,
  NamedQueryDraftRequest,
  NamedQueryFieldDescription,
  NamedQuerySchemaSelection,
  SchemaTarget,
} from '@researchdatabox/sails-ng-common';
import { storedRecordPath } from '@researchdatabox/sails-ng-common';
import { LatestRequest, type FieldNode } from '@researchdatabox/portal-ng-common';
import { BaseComponent, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import { NamedQueryApiService, NamedQueryDefinition, NamedQueryDatabaseDefinition, NamedQueryCatalogueRow } from './named-query-api.service';
import { NamedQueryListQueryState } from './nq-list/nq-list.component';

@Component({
  selector: 'named-query-editor',
  templateUrl: './named-query-editor.component.html',
  styleUrls: ['./named-query-editor.component.scss'],
  standalone: false,
})
export class NamedQueryEditorComponent extends BaseComponent implements OnDestroy {
  queries: NamedQueryCatalogueRow[] = [];
  filteredQueries: NamedQueryCatalogueRow[] = [];
  collections: string[] = [];
  listQuery: NamedQueryListQueryState = { searchTerm: '' };

  selectedQuery: NamedQueryDefinition | null = null;
  draft: NamedQueryDefinition = this.emptyDraft();
  isNew = false;
  databaseBuffer: NamedQueryDatabaseDefinition = this.emptyDraft();
  graphqlBuffer: GraphqlNamedQueryDefinition = this.emptyGraphqlDraft();
  private sourceValidity: Record<NamedQuerySource, boolean> = { database: true, graphql: true };
  graphqlSdl = '';
  schemaLoading = false;
  schemaError = '';
  private schemaRequests = new LatestRequest();
  private draftVersion = 0;
  pendingReview: { review: NamedQueryUpdateReview; payload: NamedQueryDefinition; snapshot: string; version: number } | null = null;
  private reviewTrigger: HTMLElement | null = null;
  private editorDestroyed = false;
  capabilities: { lookup: boolean; diagnostics: EditorDiagnostic[] } | null = null;
  get activeDatabaseBuffer(): NamedQueryDatabaseDefinition { return this.draft.source === 'graphql' ? this.databaseBuffer : this.draft; }
  get activeGraphqlBuffer(): GraphqlNamedQueryDefinition { return this.draft.source === 'graphql' ? this.draft : this.graphqlBuffer; }
  get source(): NamedQuerySource { return this.draft.source === 'graphql' ? 'graphql' : 'database'; }
  get graphqlDescription(): GraphqlNamedQueryDescription | null { return this.description?.source === 'graphql' ? this.description : null; }
  get catalogueDiagnostics(): EditorDiagnostic[] { return this.queries.flatMap(query => query.valid === false ? query.diagnostics : []); }
  changeSource(source: NamedQuerySource): void {
    if (source === this.source || this.saving) return;
    if (this.draft.source === 'graphql') this.graphqlBuffer = this.draft;
    else this.databaseBuffer = this.draft;
    const identity = { name: this.draft.name, description: this.draft.description };
    const buffer = source === 'graphql' ? this.graphqlBuffer : this.databaseBuffer;
    Object.assign(buffer, identity);
    this.draft = buffer;
    this.pendingInput = !this.sourceValidity[source];
    this.invalidTestParameters.clear();
    this.testParameters = {};
    this.guidance = source === 'database' ? this.inferGuidance() : null;
    this.targetRequests.invalidate();
    this.schemaRequests.invalidate();
    this.schemaLoading = false;
    this.assistanceError = '';
    this.schemaError = '';
    this.error = '';
    this.invalidateAssistance();
    this.draftChanged();
    if (source === 'graphql') void this.loadGraphqlSchema();
    else { void this.loadTargets(); void this.refreshFields(); }
  }
  async loadGraphqlSchema(): Promise<void> {
    const token = this.schemaRequests.next();
    this.schemaLoading = true;
    this.schemaError = '';
    try { const result = await this.api.graphqlSchema(); if (this.schemaRequests.isCurrent(token)) this.graphqlSdl = result.sdl; }
    catch { if (this.schemaRequests.isCurrent(token)) this.schemaError = this.t('named-query-graphql-schema-error', 'Current GraphQL schema unavailable. Your draft is retained.'); }
    finally { if (this.schemaRequests.isCurrent(token)) this.schemaLoading = false; }
  }
  sourceValidityChanged(source: NamedQuerySource, valid: boolean): void {
    this.sourceValidity[source] = valid;
    if (this.source === source) this.validityChanged(valid);
  }
  private restoreReviewFocus(trigger: HTMLElement | null): void {
    this.requestRender();
    setTimeout(() => {
      if (this.editorDestroyed || this.saving || !this.isEditing || this.pendingReview) return;
      const target = trigger?.isConnected ? trigger : document.getElementById('named-query-save');
      (target && !target.matches(':disabled') ? target : document.getElementById('named-query-workspace-title'))?.focus();
    }, 0);
  }
  cancelSaveReview(): void {
    this.pendingReview = null;
    const trigger = this.reviewTrigger;
    this.reviewTrigger = null;
    this.restoreReviewFocus(trigger);
  }
  async confirmSaveReview(): Promise<void> {
    const pending = this.pendingReview;
    if (!pending || this.editorDestroyed) return;
    const trigger = this.reviewTrigger;
    this.pendingReview = null;
    this.reviewTrigger = null;
    if (this.pendingInput || this.draftVersion !== pending.version || JSON.stringify(this.draft) !== pending.snapshot) {
      this.error = this.t('named-query-review-changed', 'The draft changed. Save again to review the current changes.');
      this.restoreReviewFocus(trigger);
      return;
    }
    this.saving = true;
    let saved = false;
    try { await this.persist(pending.payload, pending.snapshot, pending.review.confirmation); saved = true; }
    catch (error) { if (!this.editorDestroyed) this.saveError(error); }
    finally { this.saving = false; if (!saved && !this.editorDestroyed) this.restoreReviewFocus(trigger); }
  }


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
  description: NamedQuerySourceDescription | null = null;
  previewResult: NamedQuerySourcePreview | null = null;
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
  get parameterEntries(): Array<{ key: string; path: string; type: string; format?: string; queryType?: string; template?: string }> {
    if (this.draft.source === 'graphql') return Object.entries(this.draft.graphql.variables).flatMap(([variable, binding]) =>
      binding?.ownership === 'consumer' ? [{ key: binding.parameter, path: '$' + variable, type: binding.inputType, format: undefined, queryType: undefined, template: undefined }] : []);
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
    return value !== null && typeof value === 'object' ? JSON.stringify(value, null, 1) : String(value ?? '');
  }
  isStructured(row: unknown, key: string): boolean {
    const value = (row as Record<string, unknown>)?.[key];
    return value !== null && typeof value === 'object';
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
    if (anchor && anchor.target.toLowerCase() !== '_blank' && anchor.getAttribute('href') !== '#' && this.dirty && !this.confirmDiscard()) {
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
    this.capabilities = null;
    this.validationBlocking = false;
  }

  private startDraft(): void {
    this.schemaRequests.invalidate();
    this.graphqlSdl = '';
    this.schemaError = '';
    this.sourceValidity = { database: true, graphql: true };
    this.databaseBuffer = this.draft.source === 'graphql' ? this.emptyDraft() : this.draft;
    this.graphqlBuffer = this.draft.source === 'graphql' ? this.draft : this.emptyGraphqlDraft();
    this.draftVersion++;
    this.pendingReview = null;
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
    if (this.source === 'graphql') void this.loadGraphqlSchema();
    else { void this.loadTargets(); void this.refreshFields(); }
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
    if (this.draft.source === 'graphql' || !this.draft.collectionName) return;
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
    this.draftVersion++;
    // Retain errors until their control disappears or changes its input kind.
    for (const [key, definition] of this.invalidTestParameters) {
      if (definition !== this.testParameterDefinition(key)) this.invalidTestParameters.delete(key);
    }
    for (const key of Object.keys(this.testParameters)) {
      if (!this.parameterEntries.some(parameter => parameter.key === key)) delete this.testParameters[key];
    }
    this.inputDirty = true;
    this.previewRequests.invalidate();
    this.previewing = false;
    this.previewResult = null;
    this.description = null;
    this.diagnostics = [];
    this.capabilities = null;
    this.validationBlocking = false;
    this.validationRequests.invalidate();
    this.scheduleValidation();
  }

  inputChanged(event?: Event): void {
    if ((event?.target as Element | undefined)?.closest?.('rb-field-tree, [data-nq-guidance]')) return;
    this.draftVersion++;
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
        this.capabilities = result.capabilities ?? null;
        if (this.source === 'graphql') {
          const description = await this.api.describe(this.request());
          if (this.validationRequests.isCurrent(token)) this.description = description;
        }
      }
    } catch {
      if (this.validationRequests.isCurrent(token)) {
        this.diagnostics = [];
        this.validationBlocking = this.source === 'graphql';
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
    // GraphQL always uses the same JSON control, tracked by consumer parameter name.
    // Binding defaults/types/ownership edits must not clear a still-mounted control's error.
    if (this.draft.source === 'graphql') return this.parameterEntries.some(parameter => parameter.key === key) ? 'graphql-json' : 'absent';
    const param = this.draft.queryParams?.[key];
    return JSON.stringify(param ? [param.type, param.template] : null);
  }
  get previewInputInvalid(): boolean {
    return this.pendingInput || this.invalidTestParameters.size > 0;
  }
  async preview(): Promise<void> {
    if (this.previewInputInvalid || this.previewing || this.pendingReview) return;
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
    this.brandingAndPortalUrl = this.api.brandingAndPortalUrl;
    await Promise.all([this.loadQueries(), this.loadCollections()]);
    const name = new URLSearchParams(window.location.hash.slice(1)).get('query');
    if (name && /^[A-Za-z0-9_-]{1,120}$/.test(name)) await this.openQuery(name);
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
    this.editorDestroyed = true;
    super.ngOnDestroy();
    this.itemRequests.invalidate();
    this.targetRequests.invalidate();
    this.schemaRequests.invalidate();
    this.invalidateAssistance();
    if (this.messageTimer) clearTimeout(this.messageTimer);
    this.messageTimer = null;
  }

  get totalQueries(): number {
    return this.queries.length;
  }

  get presentCollections(): string[] {
    return [...new Set(this.queries.map(query => query.valid === false ? undefined : query.collectionName).filter((collection): collection is string => !!collection))].sort();
  }

  get uniqueCollections(): number {
    const set = new Set<string>();
    for (const q of this.queries) {
      if (q.valid !== false && q.collectionName) set.add(q.collectionName);
    }
    return set.size;
  }

  get canSave(): boolean {
    if (!this.isEditing || this.pendingInput || this.saving || !!this.pendingReview || this.validationBlocking) return false;
    if (this.isNew) {
      const trimmed = this.draft.name?.trim();
      if (!trimmed || !/^[A-Za-z0-9_-]+$/.test(trimmed)) return false;
      if (trimmed === 'collections') return false;
    }
    return this.draft.source === 'graphql' ? !!this.draft.graphql.document.trim() : !!this.draft.collectionName?.trim();
  }

  get pendingDeleteDisplayName(): string {
    return this.pendingDeleteName ?? '';
  }

  get pendingDeleteConsumers() {
    return this.queries.find(query => query.name === this.pendingDeleteName)?.usedBy ?? [];
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
    this.listQuery = { searchTerm: String(query.searchTerm ?? ''), collection: query.collection || '' };
    this.applyFilter();
  }

  private applyFilter(): void {
    const term = this.listQuery.searchTerm.trim().toLowerCase();

    this.filteredQueries = this.queries.filter(q => {
      const name = (q.name || '').toLowerCase();
      const collectionName = q.valid === false ? '' : q.collectionName || '';
      const collection = (q.valid === false ? this.t('named-query-invalid-source', 'Unsupported source') : q.source === 'graphql' ? 'GraphQL' : collectionName).toLowerCase();
      return (!this.listQuery.collection || collectionName === this.listQuery.collection) &&
        (name.includes(term) || collection.includes(term));
    });
  }

  newQuery(): void {
    if (this.saving || this.pendingReview || !this.confirmDiscard()) return;
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
    if (this.saving || this.pendingReview || !this.confirmDiscard()) return;
    if (this.queries.some(query => query.name === name && query.valid === false)) { this.error = this.t('named-query-invalid-source-help', 'This saved source is unsupported. Review its diagnostics or delete it after removing known usages.'); return; }
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
    if (this.saving || this.pendingReview || !this.confirmDiscard()) return;
    this.itemRequests.invalidate();
    this.targetRequests.invalidate();
    this.schemaRequests.invalidate();
    this.invalidateAssistance();
    this.isEditing = false;
    this.restoreEditModalTrigger();
  }

  async save(): Promise<void> {
    if (this.saving || this.editorDestroyed) return;
    const trigger = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement : document.getElementById('named-query-save');
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
      } else if (this.source === 'graphql') {
        this.error = this.t('named-query-graphql-correct-before-save', 'Correct the GraphQL document and variable diagnostics before saving.');
      } else {
        this.error = this.t('named-query-error-collection-required', 'Collection name is required');
      }
      this.restoreReviewFocus(trigger);
      return;
    }
    this.error = '';
    this.clearMessage();
    const draftAtSave = JSON.stringify(this.draft);
    const versionAtSave = this.draftVersion;
    const payload = this.sanitizeQuery(JSON.parse(draftAtSave));
    let saved = false;
    this.saving = true;
    try {
      await this.validateDraft();
      if (this.editorDestroyed) return;
      if (this.pendingInput || this.draftVersion !== versionAtSave || JSON.stringify(this.draft) !== draftAtSave) {
        this.error = this.t('named-query-review-changed', 'The draft changed. Save again to review the current changes.');
        return;
      }
      if (this.validationBlocking) return;
      if (!this.isNew) {
        const review = await this.api.reviewUpdate(payload.name as string, payload);
        if (this.editorDestroyed) return;
        if (this.pendingInput || this.draftVersion !== versionAtSave || JSON.stringify(this.draft) !== draftAtSave) {
          this.error = this.t('named-query-review-changed', 'The draft changed. Save again to review the current changes.');
          return;
        }
        if (review.required) {
          this.reviewTrigger = trigger;
          this.pendingReview = { review, payload, snapshot: draftAtSave, version: this.draftVersion };
          return;
        }
      }
      await this.persist(payload, draftAtSave);
      saved = true;
    } catch (err) { if (!this.editorDestroyed) this.saveError(err);
    } finally {
      this.saving = false;
      if (!saved && !this.editorDestroyed) this.restoreReviewFocus(trigger);
    }
  }

  private async persist(payload: NamedQueryDefinition, snapshot: string, confirmation?: string): Promise<void> {
    if (this.isNew) await this.api.create(payload);
    else await this.api.update(payload.name as string, payload, confirmation);
    if (this.editorDestroyed) return;
    this.setMessage(this.t(this.isNew ? 'named-query-message-created' : 'named-query-message-updated',
      this.isNew ? 'Named query "{{name}}" created' : 'Named query "{{name}}" updated', { name: payload.name ?? '' }));
    await this.loadQueries();
    if (this.editorDestroyed) return;
    if (JSON.stringify(this.draft) === snapshot) {
      this.inputDirty = false; this.baseline = snapshot; this.saving = false; this.closeEditModal();
    }
  }
  private saveError(error: unknown): void {
    this.error = this.t(this.source === 'graphql' ? 'named-query-graphql-save-error' : (this.isNew ? 'named-query-error-create' : 'named-query-error-update'),
      'Failed to save named query: {{error}}', { error: this.asErrorMessage(error) });
  }
  graphqlTestValue(key: string, value: unknown): void {
    if (value === undefined) { const parameters = { ...this.testParameters }; delete parameters[key]; this.testParameters = parameters; }
    else this.testParameterChanged(key, value);
    this.previewRequests.invalidate(); this.previewResult = null; this.previewing = false;
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
    if (this.pendingDeleteConsumers.length) return;
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

  private emptyDraft(): NamedQueryDatabaseDefinition {
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

  private emptyGraphqlDraft(): GraphqlNamedQueryDefinition {
    return { name: '', source: 'graphql', graphql: { document: '', variables: {}, resultPath: [], mappings: {} } };
  }

  private cloneQuery(q: NamedQueryDefinition): NamedQueryDefinition {
    const cloned = JSON.parse(JSON.stringify(q)) as NamedQueryDefinition;
    if (cloned.source === 'graphql') {
      const operation = cloned.graphql;
      cloned.graphql = { ...operation,
        document: typeof operation?.document === 'string' ? operation.document : '',
        variables: operation?.variables && typeof operation.variables === 'object' && !Array.isArray(operation.variables) ? operation.variables : {},
        resultPath: Array.isArray(operation?.resultPath) ? operation.resultPath : [],
        mappings: operation?.mappings && typeof operation.mappings === 'object' && !Array.isArray(operation.mappings) ? operation.mappings : {},
        lookup: operation?.lookup && typeof operation.lookup === 'object' && !Array.isArray(operation.lookup) ? operation.lookup : undefined,
      };
      return cloned;
    }
    cloned.mongoQuery = cloned.mongoQuery || {};
    cloned.queryParams = cloned.queryParams || {};
    cloned.resultObjectMapping = cloned.resultObjectMapping || {};
    cloned.sort = cloned.sort || [];
    cloned.relatedRecordFilters = cloned.relatedRecordFilters || [];
    return cloned;
  }

  private sanitizeQuery(q: NamedQueryDefinition): NamedQueryDefinition {
    if (q.source === 'graphql') return { source: 'graphql', name: q.name?.trim() || undefined,
      ...(q.description !== undefined ? { description: q.description } : {}), graphql: q.graphql };
    const { graphql: inactiveGraphql, usedBy, ...databaseFields } = q;
    return {
      ...databaseFields,
      ...(q.source === 'database' ? { source: 'database' as const } : {}),
      ...(q.description !== undefined ? { description: q.description } : {}),
      ...(q.brandIdFieldPath !== undefined ? { brandIdFieldPath: q.brandIdFieldPath } : {}),
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
    this.deleteModalTrigger = el instanceof HTMLElement ? el.closest('details')?.querySelector('summary') ?? el : null;
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

    if (typeof err === 'object' && err !== null) {
      const maybe = err as { message?: string; error?: { message?: string; errors?: { detail?: string }[] } };
      if (maybe.error?.errors?.[0]?.detail) return maybe.error.errors[0].detail;
      if (typeof maybe.message === 'string' && maybe.message) return maybe.message;
      if (maybe.error && typeof maybe.error.message === 'string') return maybe.error.message;
    }
    return err instanceof Error ? err.message : String(err);
  }

  private t(key: string, defaultValue: string, options?: Record<string, unknown>): string {
    return String(this.translationService.t(key, defaultValue, options));
  }
}
