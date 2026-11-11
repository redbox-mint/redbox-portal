import type { NamedQueryPromotionDraft } from '@researchdatabox/sails-ng-common';
import { HttpErrorResponse } from '@angular/common/http';
import { parseQueryVariables } from './record-grid.protocol';
import { inspectCell, detailKeyboard, CellText, displayScalar } from './cell-detail';
import type { GraphQLSchema } from 'graphql';
import {
  cursorBinding,
  editorErrors,
  editorSchema,
  rawDefinition,
  rawRows,
  recordIdentityKey,
  resultArrays,
  schemaFields,
} from './graphql-query';
import { Component, ElementRef, HostListener, Inject, OnDestroy, ViewChild } from '@angular/core';
import { BaseComponent, TranslationService } from '@researchdatabox/portal-ng-common';
import { ClientSideRowModelModule, ColDef, GetRowIdParams, ModuleRegistry } from 'ag-grid-community';
import { DATA_GRID_SOURCE, DataGridSource, GridRequestError, GridSourceUnavailable } from './data-grid-source';
import {
  SavedQuery,
  RawDefinition,
  copyGrid,
  emptyGrid,
  GridCatalogue,
  GridDefinition,
  GridField,
  FieldType,
  GridFilter,
  GridRow,
  GridScope,
  LIMITS,
  Operator,
  PAGE_SIZES,
  queryFor,
  scopeFor,
  scalarTypeFor,
  validateGrid,
  validatePage,
} from './data-grid.model';

ModuleRegistry.registerModules([ClientSideRowModelModule]);

@Component({
  selector: 'data-grids',
  templateUrl: './data-grids.component.html',
  styleUrls: ['./data-grids.component.scss'],
  standalone: false,
})
export class DataGridsComponent extends BaseComponent implements OnDestroy {
  @ViewChild('schemaDetails') schemaDetails?: ElementRef<HTMLDetailsElement>;
  @ViewChild('saveDialog') saveDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('editorHeading') editorHeading?: ElementRef<HTMLElement>;
  @ViewChild('catalogueHeading') catalogueHeading?: ElementRef<HTMLElement>;
  @ViewChild('promotionButton') promotionButton?: ElementRef<HTMLButtonElement>;
  promotion: NamedQueryPromotionDraft | null = null;
  promotionOpening = false;
  promotionError = '';
  promotionSaved = false;
  catalogue: GridCatalogue | null = null;
  saved: SavedQuery[] = [];
  nextSaved: string | null = null;
  draft: GridDefinition | null = null;
  mode: 'visual' | 'graphql' = 'visual';
  rawDraft: RawDefinition = rawDefinition();
  variablesText = JSON.stringify(this.rawDraft.variables, null, 2);
  schema: GraphQLSchema | null = null;
  schemaLoading = false;
  schemaError = '';
  schemaType = 'Query';
  schemaSearch = '';
  editorOpen = true;
  pickerOpen = false;
  columnsOpen = false;
  saveOpen = false;
  saveName = '';
  savingAs = false;
  responseView: 'grid' | 'json' = 'grid';
  jsonResponse: Record<string, unknown> | null = null;
  resultPaths: string[][] = [];
  lastExecuted: SavedQuery | null = null;
  resultsStale = false;
  private rawBaseline = '';
  private rawInitialized = false;
  private schemaSequence = 0;
  private modeSequence = 0;
  busy = false;
  loadingPage = false;
  loadingFields = false;
  saving = false;
  unavailable = false;
  error = '';
  previewError = '';
  notice = '';
  search = '';
  fieldSearch = '';
  rows: GridRow[] = [];
  columnDefs: ColDef<GridRow>[] = [];
  page = 0;
  hasPreview = false;
  hasNext = false;
  readonly pageSizes = PAGE_SIZES;
  readonly limits = LIMITS;
  readonly defaultColDef: ColDef = {
    suppressKeyboardEvent: params => detailKeyboard(params.event),
    resizable: true,
    sortable: false,
    filter: false,
    suppressMovable: true,
    minWidth: 150,
    flex: 1,
  };
  readonly getRowId = (params: GetRowIdParams<GridRow>): string => params.data.oid;
  private baseline = '';
  private hasUnsavedDrafts(): boolean {
    return (
      (!!this.draft && JSON.stringify(this.draft) !== this.baseline) ||
      (this.rawInitialized && this.rawState() !== this.rawBaseline)
    );
  }
  private sequence = 0;
  private loadSequence = 0;
  private fieldSequence = 0;
  private cursors: (string | null)[] = [null];
  private endCursor: string | null = null;
  private disposed = false;

  constructor(
    @Inject(TranslationService) readonly i18n: TranslationService,
    @Inject(DATA_GRID_SOURCE) private source: DataGridSource,
    private host: ElementRef<HTMLElement>
  ) {
    super();
    this.initDependencies = [i18n];
  }

  protected async initComponent(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    const seq = ++this.loadSequence;
    this.busy = true;
    this.error = '';
    this.unavailable = false;
    try {
      const catalogue = await this.source.catalogue();
      const saved = catalogue.persistence ? await this.source.list() : { grids: [], next: null };
      if (seq !== this.loadSequence || this.disposed) return;
      this.catalogue = catalogue;
      this.saved = saved.grids;
      this.nextSaved = saved.next;
      const id = new URLSearchParams(window.location.hash.slice(1)).get('grid');
      if (!this.draft && id && /^[a-f0-9]{24}$/.test(id)) await this.reopen({ id }, true);
      else if (!this.draft) this.open();
    } catch (error) {
      if (seq !== this.loadSequence || this.disposed) return;
      this.catalogue = null;
      this.saved = [];
      this.unavailable = error instanceof GridSourceUnavailable;
      if (!this.unavailable) this.error = error instanceof GridRequestError ? error.key : 'load-failed';
    } finally {
      if (seq === this.loadSequence && !this.disposed) this.busy = false;
    }
  }

  async loadMore(): Promise<void> {
    if (!this.nextSaved || this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      const page = await this.source.list(this.nextSaved);
      if (this.disposed) return;
      this.saved = [...this.saved.filter(item => !page.grids.some(grid => grid.id === item.id)), ...page.grids];
      this.nextSaved = page.next;
    } catch (error) {
      if (!this.disposed) this.error = error instanceof GridRequestError ? error.key : 'load-failed';
    } finally {
      if (!this.disposed) this.busy = false;
    }
  }
  get visibleGrids(): SavedQuery[] {
    const search = this.search.toLocaleLowerCase().trim();
    return this.saved.filter(grid => grid.name.toLocaleLowerCase().includes(search));
  }
  get scope(): GridScope | undefined {
    return this.draft ? scopeFor(this.draft, this.catalogue?.scopes ?? []) : undefined;
  }
  get issues() {
    return this.draft
      ? validateGrid({ ...this.draft, name: this.draft.name || this.text('untitled') }, this.scope)
      : [];
  }
  get dirty(): boolean {
    return this.mode === 'graphql'
      ? this.rawState() !== this.rawBaseline
      : !!this.draft && JSON.stringify(this.draft) !== this.baseline;
  }
  get visibleFields(): GridField[] {
    return (this.scope?.fields ?? []).filter(field =>
      this.fieldLabel(field.id).toLocaleLowerCase().includes(this.fieldSearch.toLocaleLowerCase().trim())
    );
  }
  get filterFields(): GridField[] {
    return this.scope?.fields.filter(field => !field.repeating && field.operators.length) ?? [];
  }
  get sortFields(): GridField[] {
    return this.scope?.fields.filter(field => !field.repeating && field.sortable) ?? [];
  }
  get canPreview(): boolean {
    return (
      !!this.catalogue &&
      (this.mode === 'graphql' ? !!this.source.raw && !this.rawErrors.length : !!this.draft && !this.issues.length) &&
      !this.loadingPage &&
      !this.loadingFields
    );
  }
  get canPromote(): boolean {
    return this.host.nativeElement.getAttribute('can-create-named-query') === 'true' && !!this.source.prepareNamedQuery &&
      !!this.activeDefinition && !this.promotionOpening && !this.promotion && !this.busy && !this.saving && !this.loadingFields &&
      (this.mode === 'graphql' ? !this.rawErrors.length : !this.issues.length);
  }
  async createNamedQuery(): Promise<void> {
    if (!this.canPromote || !this.activeDefinition || !this.source.prepareNamedQuery) return;
    const snapshot = structuredClone(this.activeDefinition);
    if (snapshot.mode === 'graphql') {
      try { snapshot.variables = parseQueryVariables(JSON.parse(this.variablesText)); }
      catch { this.promotionError = 'promotion-invalid-values'; return; }
    }
    this.promotionOpening = true;
    this.promotionError = '';
    this.promotionSaved = false;
    try {
      const prepared = await this.source.prepareNamedQuery(snapshot);
      if (!this.disposed) this.promotion = structuredClone(prepared);
    } catch (error) {
      if (!this.disposed) this.promotionError = error instanceof HttpErrorResponse && [401, 403].includes(error.status)
        ? 'promotion-denied' : 'promotion-open-failed';
    } finally { if (!this.disposed) this.promotionOpening = false; }
  }
  closePromotion(saved = false): void {
    this.promotion = null;
    this.promotionSaved = saved;
    setTimeout(() => { if (!this.disposed) this.promotionButton?.nativeElement.focus(); });
  }
  get canSave(): boolean {
    return (
      !!this.catalogue?.persistence &&
      !!this.activeDefinition &&
      (this.mode === 'graphql' ? !this.rawErrors.length : !this.issues.length) &&
      !this.saving &&
      !this.loadingFields
    );
  }
  get activeDefinition(): SavedQuery | null {
    return this.mode === 'graphql' ? this.rawDraft : this.draft;
  }
  get rawErrors(): string[] {
    return editorErrors(this.schema, this.rawDraft.document, this.variablesText);
  }
  get recordTypes(): string[] {
    return [...new Set(this.catalogue?.scopes.map(scope => scope.recordType) ?? [])];
  }
  get typeScopes(): GridScope[] {
    return this.catalogue?.scopes.filter(scope => scope.recordType === this.draft?.recordType) ?? [];
  }
  chooseRecordType(type: string): void {
    const scope =
      this.catalogue?.scopes.find(scope => scope.recordType === type && !scope.workflowStage) ??
      this.catalogue?.scopes.find(scope => scope.recordType === type);
    if (scope) void this.chooseScope(scope.id);
  }
  get rawPaginated(): boolean {
    return !!cursorBinding(this.rawDraft.document, this.rawDraft.variables, this.rawDraft.resultPath);
  }
  get assistFields() {
    return schemaFields(this.schema, this.schemaType, this.schemaSearch);
  }
  get schemaTypes(): string[] {
    return Object.keys(this.schema?.getTypeMap() ?? {})
      .filter(name => !name.startsWith('__'))
      .sort();
  }
  private rawState(): string {
    return JSON.stringify([this.rawDraft, this.variablesText]);
  }

  readonly cellText: CellText = key => this.text('cell-' + key);

  text(key: string): string {
    return this.i18n.t(`data-grids-${key}`) as string;
  }
  fieldLabel(id: string, fields: GridField[] = this.scope?.fields ?? []): string {
    const field = fields.find(field => field.id === id);
    if (!field) return id;
    const ambiguous = fields.some(
      other => other.id !== id && other.label.trim().toLocaleLowerCase() === field.label.trim().toLocaleLowerCase()
    );
    return ambiguous ? `${field.label} (${field.path ?? field.id})` : field.label;
  }
  field(id: string): GridField | undefined {
    return this.scope?.fields.find(field => field.id === id);
  }
  open(grid?: GridDefinition, discover = true): boolean {
    if (this.saving || (this.hasUnsavedDrafts() && !window.confirm(this.text('discard-confirm')))) return false;
    this.fieldSequence++;
    this.modeSequence++;
    this.schemaSequence++;
    this.loadingFields = false;
    this.rawDraft = rawDefinition();
    this.variablesText = JSON.stringify(this.rawDraft.variables, null, 2);
    this.rawBaseline = '';
    this.rawInitialized = false;
    this.draft = grid ? copyGrid(grid) : emptyGrid();
    if (!grid) this.setSavedUrl();
    this.baseline = JSON.stringify(this.draft);
    this.mode = 'visual';
    this.editorOpen = true;
    this.pickerOpen = false;
    this.columnsOpen = false;
    this.saveDialog?.nativeElement.close();
    this.resetResults();
    this.fieldSearch = '';
    this.notice = '';
    this.error = '';
    this.changed();
    this.focusHeading('editor');
    if (grid && this.scope && discover) void this.chooseScope(this.scope.id);
    return true;
  }
  private setSavedUrl(id?: string): void {
    const url = new URL(window.location.href);
    url.hash = id && /^[a-f0-9]{24}$/.test(id) ? `grid=${id}` : '';
    window.history.replaceState(null, '', url);
  }
  async reopen(grid: Pick<GridDefinition, 'id'>, results = false): Promise<void> {
    if (!grid.id || this.saving) return;
    const seq = ++this.loadSequence;
    this.busy = true;
    this.error = '';
    try {
      const saved = await this.source.read(grid.id);
      if (this.disposed || seq !== this.loadSequence) return;
      if (saved.mode === 'graphql') {
        if (this.hasUnsavedDrafts() && !window.confirm(this.text('discard-confirm'))) return;
        this.fieldSequence++;
        this.loadingFields = false;
        this.modeSequence++;
        this.draft = emptyGrid();
        this.baseline = JSON.stringify(this.draft);
        this.rawDraft = structuredClone(saved);
        this.variablesText = JSON.stringify(saved.variables, null, 2);
        this.rawBaseline = this.rawState();
        this.rawInitialized = true;
        this.mode = 'graphql';
        this.editorOpen = !results;
        this.pickerOpen = false;
        this.columnsOpen = false;
        this.resetResults();
        this.setSavedUrl(saved.id);
        await this.loadSchema();
        if (this.rawErrors.length) this.editorOpen = true;
        if (
          seq === this.loadSequence &&
          this.mode === 'graphql' &&
          this.rawDraft.id === saved.id &&
          results &&
          this.canPreview
        )
          await this.preview();
        return;
      }
      if (!this.open(saved, false)) return;
      // Stage-specific grids must reopen even before the type's stages have been discovered.
      if (!this.scope && this.catalogue?.scopes.some(scope => scope.recordType === saved.recordType)) {
        this.catalogue.scopes.push({
          id: `saved:${saved.recordType}:${saved.workflowStage ?? ''}`,
          label: `${saved.recordType} / ${saved.workflowStage ?? this.text('all-stages')}`,
          recordType: saved.recordType,
          workflowStage: saved.workflowStage,
          fields: [],
        });
      }
      this.setSavedUrl(saved.id);
      if (this.scope) await this.chooseScope(this.scope.id);
      if (this.disposed || seq !== this.loadSequence || this.draft?.id !== saved.id) return;
      this.baseline = JSON.stringify(saved);
      this.editorOpen = !results || !this.canPreview;
      if (results && this.canPreview) await this.preview();
    } catch (error) {
      if (!this.disposed && seq === this.loadSequence)
        this.error = error instanceof GridRequestError ? error.key : 'load-failed';
    } finally {
      if (!this.disposed && seq === this.loadSequence) this.busy = false;
    }
  }
  async remove(grid: SavedQuery): Promise<void> {
    if (this.busy || !window.confirm(this.text('delete-confirm'))) return;
    this.busy = true;
    this.error = '';
    try {
      await this.source.remove(grid);
      if (!this.disposed) {
        this.saved = this.saved.filter(item => item.id !== grid.id);
        if (this.activeDefinition?.id === grid.id) {
          if (this.mode === 'graphql') {
            delete this.rawDraft.id;
            delete this.rawDraft.revision;
          } else if (this.draft) {
            delete this.draft.id;
            delete this.draft.revision;
          }
          this.setSavedUrl();
        }
      }
    } catch (error) {
      if (!this.disposed) this.error = error instanceof GridRequestError ? error.key : 'delete-failed';
    } finally {
      if (!this.disposed) this.busy = false;
    }
  }
  close(): void {
    if (this.saving || (this.hasUnsavedDrafts() && !window.confirm(this.text('discard-confirm')))) return;
    this.changed();
    this.fieldSequence++;
    this.loadingFields = false;
    this.draft = null;
    this.mode = 'visual';
    this.resetResults();
    this.setSavedUrl();
    this.error = '';
    this.focusHeading('catalogue');
  }
  private focusHeading(target: 'editor' | 'catalogue'): void {
    setTimeout(() => {
      if (!this.disposed) (target === 'editor' ? this.editorHeading : this.catalogueHeading)?.nativeElement.focus();
    });
  }

  async chooseScope(id: string): Promise<void> {
    const scope = this.catalogue?.scopes.find(item => item.id === id);
    if (!scope || !this.draft) return;
    const seq = ++this.fieldSequence;
    const scopeChanged = this.draft.recordType !== scope.recordType;
    if (scopeChanged) {
      this.draft.columns = [];
      this.draft.filters = [];
      this.draft.sort = null;
    }
    this.draft.recordType = scope.recordType;
    this.draft.workflowStage = scope.workflowStage;
    this.changed();
    this.error = '';
    this.loadingFields = !!this.source.fields;
    if (!this.source.fields) return;
    // Clear stale capabilities until the current scope is re-discovered.
    scope.fields = [];
    scope.revision = undefined;
    try {
      if (!scope.workflowStage && this.source.stages) {
        const stages = await this.source.stages(scope);
        if (seq !== this.fieldSequence || this.disposed || !this.catalogue) return;
        for (const stage of stages) {
          if (
            !this.catalogue.scopes.some(
              item => item.recordType === stage.recordType && item.workflowStage === stage.workflowStage
            )
          )
            this.catalogue.scopes.push(stage);
        }
      }
      const scopes = await this.source.fields(scope);
      if (seq !== this.fieldSequence || this.disposed || !this.catalogue) return;
      for (const discovered of scopes) {
        const index = this.catalogue.scopes.findIndex(
          item => item.recordType === discovered.recordType && item.workflowStage === discovered.workflowStage
        );
        if (index < 0) this.catalogue.scopes.push(discovered);
        else this.catalogue.scopes[index] = discovered;
      }
      if (scopeChanged && this.draft && this.scope) {
        const eligible = this.scope.fields.filter(field => field.selectable && !field.repeating);
        const defaults = eligible.filter(
          field => /title/i.test(field.label) || ['record:oid', 'record:workflowStep'].includes(field.id)
        );
        this.draft.columns = (defaults.length ? defaults : eligible).slice(0, 3).map(field => field.id);
      }
    } catch (error) {
      if (seq === this.fieldSequence && !this.disposed)
        this.error = error instanceof GridRequestError ? error.key : 'fields-failed';
    } finally {
      if (seq === this.fieldSequence && !this.disposed) this.loadingFields = false;
    }
  }
  toggleColumn(id: string): void {
    if (!this.draft) return;
    const index = this.draft.columns.indexOf(id);
    if (index >= 0) this.draft.columns.splice(index, 1);
    else if (this.field(id)?.selectable && this.draft.columns.length < LIMITS.columns) this.draft.columns.push(id);
    this.changed();
  }
  moveColumn(index: number, direction: number): void {
    if (!this.draft || index + direction < 0 || index + direction >= this.draft.columns.length) return;
    const columns = this.draft.columns;
    [columns[index], columns[index + direction]] = [columns[index + direction], columns[index]];
    this.changed();
  }
  addFilter(): void {
    const field = this.filterFields[0];
    if (!field || !this.draft || this.draft.filters.length >= LIMITS.filters) return;
    const filter: GridFilter = {
      expectedScalarType: scalarTypeFor(field),
      fieldId: field.id,
      operator: field.operators[0],
      values: [''],
    };
    this.draft.filters.push(filter);
    this.chooseOperator(filter, field.operators[0]);
    this.changed();
  }
  chooseFilterField(filter: GridFilter, id: string): void {
    const field = this.filterFields.find(item => item.id === id);
    if (!field) return;
    filter.fieldId = id;
    filter.expectedScalarType = scalarTypeFor(field);
    this.chooseOperator(filter, field.operators[0]);
  }
  filterTypeChanged(filter: GridFilter): boolean {
    const field = this.field(filter.fieldId);
    return !!field && filter.expectedScalarType !== scalarTypeFor(field);
  }
  chooseOperator(filter: GridFilter, operator: Operator): void {
    filter.operator = operator;
    filter.values = operator === 'exists' ? ['true'] : operator === 'between' ? ['', ''] : [''];
    this.changed();
  }
  removeFilter(index: number): void {
    this.draft?.filters.splice(index, 1);
    this.changed();
  }
  get sortTypeChanged(): boolean {
    const sort = this.draft?.sort;
    const field = sort && this.field(sort.fieldId);
    return !!sort && !!field && sort.expectedScalarType !== scalarTypeFor(field);
  }
  chooseSort(id: string): void {
    if (this.draft)
      this.draft.sort = id
        ? {
            fieldId: id,
            direction: this.draft.sort?.direction ?? 'asc',
            expectedScalarType: this.field(id) ? scalarTypeFor(this.field(id)!) : undefined,
          }
        : null;
    this.changed();
  }
  /** Cancel in-flight reads and cursors, retaining old rows with an explicit stale state. */
  changed(): void {
    this.sequence++;
    this.loadingPage = false;
    this.resultsStale = this.hasPreview;
    this.cursors = [null];
    this.endCursor = null;
    this.hasNext = false;
    // page describes the retained executed rows until a new run succeeds.
    this.previewError = '';
    this.notice = '';
  }
  private resetResults(): void {
    this.sequence++;
    this.loadingPage = false;
    this.rows = [];
    this.columnDefs = [];
    this.jsonResponse = null;
    this.lastExecuted = null;
    this.resultsStale = false;
    this.hasPreview = false;
    this.hasNext = false;
    this.cursors = [null];
    this.endCursor = null;
    this.page = 0;
  }
  async preview(page = 0): Promise<void> {
    if (this.mode === 'graphql') {
      await this.runRaw(page);
      return;
    }
    if (
      !this.canPreview ||
      !this.draft ||
      !this.scope ||
      page < 0 ||
      (page > 0 && this.resultsStale) ||
      page > this.page + 1 ||
      (page === this.page + 1 && !this.hasNext)
    )
      return;
    const after = page === this.page + 1 ? this.endCursor : this.cursors[page];
    if (page > 0 && !after) return;
    const request = queryFor(
      { ...this.draft, name: this.draft.name || this.text('untitled') },
      this.scope,
      after ?? null
    );
    const fields = this.scope.fields;
    const seq = ++this.sequence;
    this.loadingPage = true;
    this.previewError = '';
    this.resultsStale = this.hasPreview;
    try {
      const result = await this.source.query(request);
      if (seq !== this.sequence || this.disposed) return;
      validatePage(result, request.definition.pageSize, request.after);
      this.rows = result.rows;
      this.columnDefs = request.definition.columns.map(id => ({
        colId: id,
        headerName: this.fieldLabel(id, fields),
        cellRenderer: (params: { value: GridRow['values'][string] }) =>
          inspectCell(
            params.value,
            this.fieldLabel(id, fields),
            fields.find(field => field.id === id)!.type,
            this.cellText
          ),
        // Stable IDs are opaque; do not interpret dots in IDs as JS object paths.
        valueGetter: params => params.data?.values[id],
        ...(!fields.find(field => field.id === id)!.repeating &&
        fields.find(field => field.id === id)!.type !== 'structured' &&
        (/title/i.test(fields.find(field => field.id === id)!.label) || id === 'record:oid')
          ? {
              cellRenderer: (params: { value: GridRow['values'][string] | undefined; data?: GridRow }) =>
                this.recordLink(
                  params.value,
                  params.data?.oid,
                  this.fieldLabel(id, fields),
                  fields.find(field => field.id === id)!.type
                ),
            }
          : {}),
      }));
      this.cursors[page] = request.after;
      this.cursors.length = page + 1;
      this.page = page;
      this.endCursor = result.pageInfo.endCursor;
      this.hasNext = result.pageInfo.hasNextPage;
      this.hasPreview = true;
      this.lastExecuted = structuredClone(request.definition);
      this.resultsStale = false;
    } catch (error) {
      if (seq === this.sequence && !this.disposed) {
        this.rows = [];
        this.hasPreview = false;
        this.hasNext = false;
        this.previewError = error instanceof GridRequestError ? error.key : 'preview-failed';
      }
    } finally {
      if (seq === this.sequence && !this.disposed) this.loadingPage = false;
    }
  }
  async save(asNew = false, name?: string): Promise<void> {
    if (!this.canSave || !this.activeDefinition) return;
    const draft = this.activeDefinition;
    const original = JSON.stringify(draft);
    const snapshot = structuredClone(draft);
    if (name !== undefined) snapshot.name = name;
    if (asNew) {
      delete snapshot.id;
      delete snapshot.revision;
    }
    if (snapshot.mode === 'graphql') snapshot.variables = JSON.parse(this.variablesText);
    const rawState = this.rawState();
    this.saving = true;
    this.error = '';
    try {
      const saved = await this.source.save(snapshot);
      if (this.disposed) return;
      this.saved = [...this.saved.filter(item => item.id !== saved.id), saved];
      if (this.activeDefinition === draft) {
        const unchanged =
          draft.mode === 'graphql' ? this.rawState() === rawState : JSON.stringify(this.activeDefinition) === original;
        draft.id = saved.id;
        draft.revision = saved.revision;
        this.setSavedUrl(saved.id);
        if (saved.mode !== 'graphql') this.baseline = JSON.stringify(saved);
        // Never mark edits made during a save as saved.
        if (unchanged) {
          if (saved.mode === 'graphql') {
            this.rawDraft = structuredClone(saved);
            this.rawBaseline = this.rawState();
          } else {
            this.draft = copyGrid(saved);
            this.baseline = JSON.stringify(this.draft);
          }
          this.notice = 'saved';
        }
      }
    } catch (error) {
      if (!this.disposed) this.error = error instanceof GridRequestError ? error.key : 'save-failed';
    } finally {
      if (!this.disposed) this.saving = false;
    }
  }
  definitionSummary(query: SavedQuery | null): string {
    if (!query) return '';
    if (query.mode === 'graphql') return this.text('raw-summary') + ' · ' + (query.resultPath.join('.') || 'JSON');
    const conditions = query.filters.map(
      filter =>
        this.fieldLabel(filter.fieldId) + ' ' + this.text('op-' + filter.operator) + ' ' + filter.values.join(', ')
    );
    const sort = query.sort
      ? this.fieldLabel(query.sort.fieldId) +
        ' ' +
        this.text(query.sort.direction === 'asc' ? 'ascending' : 'descending')
      : this.text('default-order');
    return [
      query.recordType,
      query.workflowStage || this.text('all-stages'),
      conditions.length ? conditions.join(' · ') : this.text('no-filters'),
      sort,
    ].join(' · ');
  }
  recordLink(value: GridRow['values'][string] | undefined, oid?: string, label = '', type?: FieldType): HTMLElement {
    if (value == null || value === '' || typeof value === 'object')
      return inspectCell(value, label, type, this.cellText);
    const node = document.createElement(oid ? 'a' : 'span');
    node.textContent = displayScalar(value, type, this.cellText);
    if (oid)
      node.setAttribute(
        'href',
        window.location.pathname.replace(/\/admin\/data-grids\/?$/, '/record/view/') + encodeURIComponent(oid)
      );
    return node;
  }
  async loadSchema(): Promise<void> {
    const seq = ++this.schemaSequence;
    this.schemaLoading = true;
    this.schemaError = '';
    this.schema = null;
    try {
      if (!this.source.schema) throw new GridRequestError('schema-unavailable');
      const sdl = await this.source.schema();
      if (seq === this.schemaSequence && !this.disposed) {
        this.schema = editorSchema(sdl);
        this.schemaType = this.schema.getQueryType()?.name ?? 'Query';
      }
    } catch {
      if (seq === this.schemaSequence && !this.disposed) this.schemaError = 'schema-unavailable';
    } finally {
      if (seq === this.schemaSequence && !this.disposed) this.schemaLoading = false;
    }
  }
  async switchMode(mode: 'visual' | 'graphql'): Promise<void> {
    if (mode === this.mode || this.saving || this.loadingFields) return;
    this.modeSequence++;
    this.mode = mode;
    this.editorOpen = true;
    this.resetResults();
    this.changed();
    if (mode === 'graphql') {
      if (!this.rawInitialized) {
        this.rawInitialized = true;
        this.rawDraft = rawDefinition();
        this.rawDraft.variables['type'] = this.draft?.recordType ?? '';
        this.variablesText = JSON.stringify(this.rawDraft.variables, null, 2);
        this.rawBaseline = this.rawState();
      }
      await this.loadSchema();
    }
    this.setSavedUrl(this.activeDefinition?.id);
  }
  async generateGraphql(): Promise<void> {
    if (!this.draft || !this.scope || this.issues.length || !this.source.generate || this.loadingFields) return;
    if (
      this.rawInitialized &&
      this.rawState() !== this.rawBaseline &&
      !window.confirm(this.text('replace-graphql-confirm'))
    )
      return;
    const seq = ++this.modeSequence;
    const snapshot = JSON.stringify(this.draft);
    this.error = '';
    this.loadingFields = true;
    try {
      const generated = await this.source.generate(
        queryFor({ ...this.draft, name: this.draft.name || this.text('untitled') }, this.scope, null)
      );
      if (this.disposed || seq !== this.modeSequence || JSON.stringify(this.draft) !== snapshot) return;
      this.rawDraft = {
        ...rawDefinition(this.draft.name),
        document: generated.query,
        variables: JSON.parse(JSON.stringify(generated.variables)),
      };
      this.variablesText = JSON.stringify(this.rawDraft.variables, null, 2);
      this.rawBaseline = '';
      this.rawInitialized = true;
      this.mode = 'graphql';
      this.setSavedUrl();
      this.resetResults();
      this.changed();
      await this.loadSchema();
    } catch (error) {
      if (!this.disposed && seq === this.modeSequence)
        this.error = error instanceof GridRequestError ? error.key : 'query-unavailable';
    } finally {
      if (!this.disposed && seq === this.modeSequence) this.loadingFields = false;
    }
  }
  insertCompletion(editor: HTMLTextAreaElement, name: string): void {
    const start = editor.selectionStart,
      end = editor.selectionEnd;
    const prefix = this.rawDraft.document.slice(0, start).match(/[_A-Za-z][_0-9A-Za-z]*$/)?.[0] ?? '';
    this.rawDraft.document =
      this.rawDraft.document.slice(0, start - prefix.length) + name + this.rawDraft.document.slice(end);
    this.schemaSearch = '';
    this.changed();
    setTimeout(() => {
      editor.focus();
      editor.setSelectionRange(start - prefix.length + name.length, start - prefix.length + name.length);
    });
  }
  completeAtCursor(editor: HTMLTextAreaElement, event: KeyboardEvent): void {
    if (event.ctrlKey && event.code === 'Space') {
      event.preventDefault();
      if (this.schemaDetails) this.schemaDetails.nativeElement.open = true;
      this.schemaSearch =
        this.rawDraft.document.slice(0, editor.selectionStart).match(/[_A-Za-z][_0-9A-Za-z]*$/)?.[0] ?? '';
    }
  }
  rawChanged(): void {
    try {
      this.rawDraft.variables = JSON.parse(this.variablesText);
    } catch {
      /* Keep invalid JSON editable. */
    }
    this.changed();
    if (this.rawErrors.length && this.hasPreview) this.resultsStale = true;
  }
  selectResultPath(path: string): void {
    this.rawDraft.resultPath = path ? path.split('.') : [];
    this.changed();
    // Mapping can be applied to the last response only when its document/variables still match.
    if (
      this.jsonResponse &&
      !this.rawErrors.length &&
      this.lastExecuted?.mode === 'graphql' &&
      this.lastExecuted.document === this.rawDraft.document &&
      JSON.stringify(this.lastExecuted.variables) === JSON.stringify(this.rawDraft.variables)
    )
      this.mapRawResponse();
  }
  private mapRawResponse(fresh = false): void {
    if (!this.jsonResponse) return;
    try {
      const identityKey = this.rawPaginated
        ? recordIdentityKey(this.rawDraft.document, this.rawDraft.resultPath)
        : null;
      const mapped = rawRows(this.jsonResponse, this.rawDraft.resultPath, identityKey);
      this.rows = mapped.rows;
      this.columnDefs = mapped.columns.map(key => ({
        colId: key,
        headerName: key,
        cellRenderer: (params: { value: GridRow['values'][string] }) =>
          inspectCell(params.value, key, undefined, this.cellText),
        valueGetter: p => p.data?.values[key],
        ...(identityKey && (/(^|\.)title$/i.test(key) || key === 'oid')
          ? {
              cellRenderer: (params: { value: GridRow['values'][string] | undefined; data?: GridRow }) =>
                this.recordLink(params.value, params.data?.recordOid, key),
            }
          : {}),
      }));
      this.previewError = '';
      if (fresh) this.resultsStale = false;
    } catch (error) {
      this.rows = [];
      this.columnDefs = [];
      this.responseView = 'json';
      this.previewError = error instanceof GridRequestError ? error.key : 'result-path-invalid';
    }
  }
  private async runRaw(page = 0): Promise<void> {
    if (!this.canPreview || !this.source.raw || page < 0 || page > this.page + 1 || (page > this.page && !this.hasNext))
      return;
    const snapshot = structuredClone(this.rawDraft);
    snapshot.variables = JSON.parse(this.variablesText);
    const binding = cursorBinding(snapshot.document, snapshot.variables, snapshot.resultPath);
    if (page > 0 && (!binding || this.resultsStale)) return;
    const after =
      page === this.page + 1
        ? this.endCursor
        : page === 0 && binding
          ? snapshot.variables[binding.after]
          : this.cursors[page];
    const variables = { ...snapshot.variables, ...(binding ? { [binding.after]: after ?? null } : {}) };
    const seq = ++this.sequence;
    this.loadingPage = true;
    this.previewError = '';
    this.resultsStale = this.hasPreview;
    try {
      const data = await this.source.raw(snapshot.document, variables);
      if (seq !== this.sequence || this.disposed) return;
      this.jsonResponse = data;
      this.resultPaths = resultArrays(data);
      this.lastExecuted = snapshot;
      this.hasPreview = true;
      this.resultsStale = false;
      this.mapRawResponse(true);
      this.hasNext = false;
      this.endCursor = null;
      if (binding) {
        const result = data[binding.root];
        if (!result || typeof result !== 'object' || Array.isArray(result))
          throw new GridRequestError('invalid-response');
        const next = Reflect.get(result, 'hasNextPage'),
          cursor = Reflect.get(result, 'endCursor');
        if (
          typeof next !== 'boolean' ||
          (cursor !== null && typeof cursor !== 'string') ||
          (next && (!cursor || cursor === after)) ||
          this.rows.length > binding.size
        )
          throw new GridRequestError('invalid-response');
        this.hasNext = next;
        this.endCursor = cursor;
      }
      this.cursors[page] = typeof after === 'string' ? after : null;
      this.cursors.length = page + 1;
      this.page = page;
    } catch (error) {
      if (seq === this.sequence && !this.disposed) {
        this.resetResults();
        this.previewError = error instanceof GridRequestError ? error.key : 'preview-failed';
      }
    } finally {
      if (seq === this.sequence && !this.disposed) this.loadingPage = false;
    }
  }
  beginSave(asNew = false): void {
    if (!this.activeDefinition) return;
    this.saveName = this.activeDefinition.name;
    this.savingAs = asNew;
    this.saveOpen = true;
    const dialog = this.saveDialog?.nativeElement;
    if (dialog?.isConnected && !dialog.open) dialog.showModal();
  }
  async confirmSave(): Promise<void> {
    if (!this.activeDefinition || !this.saveName.trim() || this.saveName.length > 120) return;
    if (this.mode === 'graphql' ? this.rawErrors.length : this.issues.length) {
      this.error = 'invalid-definition';
      return;
    }
    await this.save(this.savingAs, this.saveName.trim());
    if (!this.error) {
      this.saveOpen = false;
      this.saveDialog?.nativeElement.close();
    }
  }
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedDrafts()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  override ngOnDestroy(): void {
    this.disposed = true;
    this.schemaSequence++;
    this.modeSequence++;
    this.sequence++;
    this.loadSequence++;
    this.fieldSequence++;
    super.ngOnDestroy();
  }
}
