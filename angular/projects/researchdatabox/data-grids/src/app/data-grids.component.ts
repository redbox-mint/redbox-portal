import type { NamedQueryPromotionDraft } from '@researchdatabox/sails-ng-common';
import { HttpErrorResponse } from '@angular/common/http';
import { fieldValue, fieldGroups, columnSize } from './field-presentation';
import { parseQueryVariables } from './record-grid.protocol';
import { inspectCell, detailKeyboard, CellText, displayScalar } from './cell-detail';
import type { GraphQLSchema } from 'graphql';
import { rawDefinition } from './raw-definition';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AdminTabsDirective,
  AdminOverflowDirective,
  I18NextPipe,
  type NamedQueryResultField,
} from '@researchdatabox/portal-ng-common';
import { ColumnsPanelComponent } from './columns-panel.component';
import { ExplorerNamedQueryComponent } from './explorer-named-query.component';
import { ResultsGridComponent } from './results-grid.component';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Inject,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { BaseComponent, TranslationService } from '@researchdatabox/portal-ng-common';
import type { ColDef, GetRowIdParams } from 'ag-grid-community';
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
  defaultColumns,
  editableQuery,
} from './data-grid.model';

@Component({
  selector: 'data-grids',
  templateUrl: './data-grids.component.html',
  styleUrls: ['./data-grids.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    I18NextPipe,
    AdminTabsDirective,
    AdminOverflowDirective,
    ColumnsPanelComponent,
    ExplorerNamedQueryComponent,
    ResultsGridComponent,
  ],
})
export class DataGridsComponent extends BaseComponent implements OnDestroy {
  @ViewChild('schemaDetails') schemaDetails?: ElementRef<HTMLDetailsElement>;
  @ViewChild('saveDialog') saveDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('editorHeading') editorHeading?: ElementRef<HTMLElement>;
  @ViewChild('catalogueHeading') catalogueHeading?: ElementRef<HTMLElement>;
  @ViewChild('promotionButton') promotionButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('columnsButton') columnsButton?: ElementRef<HTMLButtonElement>;
  promotion: NamedQueryPromotionDraft | null = null;
  promotionOrigin: SavedQuery | null = null;
  publicationFields: NamedQueryResultField[] = [];
  publicationTarget = '';
  publishAfterSave = false;
  unlinked = false;
  filterEditor: number | null = null;
  private graphqlEngine: typeof import('./graphql-query') | null = null;
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
  schemaSdl = '';
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
  private schemaSequence = 0;
  private modeSequence = 0;
  private promotionSequence = 0;
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
    return this.dirty;
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
      const params = new URLSearchParams(window.location.hash.slice(1));
      const id = params.get('grid');
      if (!this.draft && id && /^[a-f0-9]{24}$/.test(id)) await this.reopen({ id }, true);
      else if (!this.draft) {
        this.open();
        if (params.get('new') === 'graphql') {
          this.unlinked = true;
          await this.switchMode('graphql');
        }
      }
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
    return this.unlinked
      ? this.rawState() !== this.rawBaseline
      : !!this.draft && JSON.stringify(editableQuery(this.draft)) !== this.baseline;
  }
  get visibleFields(): GridField[] {
    return (this.scope?.fields ?? []).filter(field =>
      [this.fieldLabel(field.id), field.path, field.id]
        .join(' ')
        .toLocaleLowerCase()
        .includes(this.fieldSearch.toLocaleLowerCase().trim())
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
      (this.unlinked ? !!this.source.raw && !this.rawErrors.length : !!this.draft && !this.issues.length) &&
      !this.loadingPage &&
      !this.loadingFields
    );
  }
  get canPromote(): boolean {
    return (
      this.host.nativeElement.getAttribute('can-create-named-query') === 'true' &&
      !!this.source.prepareNamedQuery &&
      !!this.activeDefinition &&
      !this.promotionOpening &&
      !this.promotion &&
      !this.busy &&
      !this.saving &&
      !this.loadingFields &&
      (this.unlinked ? !this.rawErrors.length : !this.issues.length)
    );
  }
  async createNamedQuery(): Promise<void> {
    if (!this.canPromote || !this.activeDefinition || !this.source.prepareNamedQuery) return;
    if (!this.activeDefinition.id || this.dirty) {
      this.publishAfterSave = true;
      this.beginSave();
      return;
    }
    const snapshot = structuredClone(editableQuery(this.activeDefinition));
    const original = JSON.stringify(this.activeDefinition);
    const originalScope = this.scope;
    this.promotionOrigin = structuredClone(snapshot);
    if (snapshot.mode === 'graphql') {
      try {
        snapshot.variables = parseQueryVariables(JSON.parse(this.variablesText));
      } catch {
        this.promotionError = 'promotion-invalid-values';
        return;
      }
    }
    const trigger = this.promotionButton?.nativeElement;
    const promotionSeq = ++this.promotionSequence;
    this.promotionOpening = true;
    this.promotionError = '';
    this.promotionSaved = false;
    this.requestRender();
    try {
      // Fetch the detached definition, field selections and lazy panel together
      // after the user opens Publish, avoiding sequential mobile round trips.
      const [prepared, selections, { visualPublicationProjection }] = await Promise.all([
        this.source.prepareNamedQuery(snapshot),
        snapshot.mode !== 'graphql' && originalScope && this.source.selection
          ? this.source.selections
            ? this.source.selections(originalScope, snapshot.columns)
            : Promise.all(snapshot.columns.map(id => this.source.selection!(originalScope, id)))
          : Promise.resolve(null),
        import('./publish-query'),
      ]);
      if (this.disposed || promotionSeq !== this.promotionSequence) return;
      if (selections) {
        const projection = visualPublicationProjection(prepared.definition.graphql.document, selections);
        prepared.definition.graphql.document = projection.document;
        this.publicationFields = [
          { label: this.text('oid'), path: ['oid'], type: 'text' },
          ...projection.fields,
          { label: this.text('field-group-metadata'), path: ['metadata'], type: 'object' },
        ].filter((field, i, all) => all.findIndex(f => JSON.stringify(f.path) === JSON.stringify(field.path)) === i);
      } else this.publicationFields = this.publishFields;
      if (!this.disposed && original === JSON.stringify(this.activeDefinition))
        this.promotion = structuredClone(prepared);
      else if (!this.disposed) this.promotionError = 'promotion-query-changed';
    } catch (error) {
      if (!this.disposed && promotionSeq === this.promotionSequence) {
        const code: unknown =
          error instanceof HttpErrorResponse
            ? (error.error?.errors?.[0]?.code ?? error.error?.data?.error?.code ?? error.error?.error?.code)
            : undefined;
        this.promotionError =
          error instanceof HttpErrorResponse && [401, 403].includes(error.status)
            ? 'promotion-denied'
            : error instanceof HttpErrorResponse && [503, 504].includes(error.status)
              ? code === 'GRAPHQL_DISABLED'
                ? 'promotion-disabled'
                : code === 'QUERY_TIMEOUT'
                  ? 'promotion-timeout'
                  : 'promotion-unavailable'
              : error instanceof HttpErrorResponse &&
                  error.status === 400 &&
                  typeof code === 'string' &&
                  ['schema-changed', 'filter-type-changed', 'sort-type-changed'].includes(code)
                ? 'promotion-schema-changed'
                : 'promotion-open-failed';
        setTimeout(() => {
          if (!this.disposed) (trigger?.isConnected ? trigger : this.promotionButton?.nativeElement)?.focus();
        });
      }
    } finally {
      if (!this.disposed && promotionSeq === this.promotionSequence) {
        this.promotionOpening = false;
        this.requestRender();
      }
    }
  }
  closePromotion(saved = false): void {
    this.promotionSequence++;
    this.promotionOpening = false;
    this.promotion = null;
    this.promotionSaved = saved;
    if (saved) void this.refreshSaved();
    setTimeout(() => {
      if (!this.disposed) this.promotionButton?.nativeElement.focus();
    });
  }
  get canSave(): boolean {
    return (
      !!this.catalogue?.persistence &&
      !!this.activeDefinition &&
      (this.unlinked ? !this.rawErrors.length : !this.issues.length) &&
      !this.saving &&
      !this.loadingFields
    );
  }
  get activeDefinition(): SavedQuery | null {
    return this.unlinked ? this.rawDraft : this.draft;
  }
  private rawValidation: {
    schema: GraphQLSchema | null;
    document: string;
    variables: string;
    errors: string[];
  } | null = null;
  get rawErrors(): string[] {
    if (!this.graphqlEngine) return [this.text('loading-fields')];
    const previous = this.rawValidation;
    if (
      previous &&
      previous.schema === this.schema &&
      previous.document === this.rawDraft.document &&
      previous.variables === this.variablesText
    )
      return previous.errors;
    const errors = this.graphqlEngine.editorErrors(this.schema, this.rawDraft.document, this.variablesText);
    this.rawValidation = {
      schema: this.schema,
      document: this.rawDraft.document,
      variables: this.variablesText,
      errors,
    };
    return errors;
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
    return !!this.graphqlEngine?.cursorBinding(
      this.rawDraft.document,
      this.rawDraft.variables,
      this.rawDraft.resultPath
    );
  }
  private rawState(): string {
    return JSON.stringify([editableQuery(this.rawDraft), this.variablesText]);
  }

  readonly cellText: CellText = key => this.text('cell-' + key);

  text(key: string): string {
    const translated = this.i18n.t(`data-grids-${key}`) as string;
    if (translated === `data-grids-${key}` && ['title', 'intro', 'loading'].includes(key))
      return this.host.nativeElement.getAttribute('initial-' + key) || translated;
    return translated;
  }
  fieldLabel(id: string, fields: GridField[] = this.scope?.fields ?? []): string {
    const field = fields.find(field => field.id === id);
    if (!field) return id;
    return field.label;
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
    this.unlinked = false;
    this.filterEditor = null;
    this.publicationTarget = '';
    this.draft = grid ? copyGrid(grid) : emptyGrid();
    if (!grid) this.setSavedUrl();
    this.baseline = JSON.stringify(editableQuery(this.draft));
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
        this.baseline = JSON.stringify(editableQuery(this.draft));
        this.unlinked = true;
        this.rawDraft = structuredClone(saved);
        this.variablesText = JSON.stringify(saved.variables, null, 2);
        this.rawBaseline = this.rawState();
        this.mode = 'graphql';
        this.editorOpen = true;
        this.pickerOpen = false;
        this.columnsOpen = false;
        this.resetResults();
        this.setSavedUrl(saved.id);
        await this.loadSchema();
        await this.discoverRawFields();
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
      // Reuse a catalogue already displayed for this exact type/stage. Run and
      // Publish still revalidate against the server; Refresh fields explicitly
      // reloads the catalogue. Avoid blanking/rebuilding it on every rail click.
      if (this.scope && !this.scope.fields.length) await this.chooseScope(this.scope.id);
      if (this.disposed || seq !== this.loadSequence || this.draft?.id !== saved.id) return;
      this.baseline = JSON.stringify(editableQuery(saved));
      this.editorOpen = true;
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
          if (this.unlinked) {
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
      const [stageResult, fieldResult] = await Promise.allSettled([
        !scope.workflowStage && this.source.stages ? this.source.stages(scope) : Promise.resolve([]),
        this.source.fields(scope),
      ]);
      if (seq !== this.fieldSequence || this.disposed || !this.catalogue) return;
      if (stageResult.status === 'rejected') throw stageResult.reason;
      for (const stage of stageResult.value) {
        if (
          !this.catalogue.scopes.some(
            item => item.recordType === stage.recordType && item.workflowStage === stage.workflowStage
          )
        )
          this.catalogue.scopes.push(stage);
      }
      if (fieldResult.status === 'rejected') throw fieldResult.reason;
      const scopes = fieldResult.value;
      for (const discovered of scopes) {
        const index = this.catalogue.scopes.findIndex(
          item => item.recordType === discovered.recordType && item.workflowStage === discovered.workflowStage
        );
        if (index < 0) this.catalogue.scopes.push(discovered);
        else this.catalogue.scopes[index] = discovered;
      }
      if (scopeChanged && this.draft && this.scope) {
        this.draft.columns = defaultColumns(this.scope.fields);
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
    this.filterEditor = this.draft.filters.length - 1;
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
    this.filterEditor = null;
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
    if (this.unlinked) {
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
      this.jsonResponse = { rows: result.rows, pageInfo: result.pageInfo };
      this.columnDefs = request.definition.columns.map(id => ({
        colId: id,
        ...columnSize(id, fields.find(field => field.id === id)?.type),
        headerName: this.fieldLabel(id, fields),
        cellRenderer: (params: { value: GridRow['values'][string] }) =>
          inspectCell(
            fieldValue(
              fields.find(field => field.id === id),
              params.value
            ),
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
        if (saved.mode !== 'graphql') this.baseline = JSON.stringify(editableQuery(saved));
        // Never mark edits made during a save as saved.
        if (unchanged) {
          if (saved.mode === 'graphql') {
            this.unlinked = true;
            this.rawDraft = structuredClone(saved);
            this.rawBaseline = this.rawState();
          } else {
            this.draft = copyGrid(saved);
            this.baseline = JSON.stringify(editableQuery(this.draft));
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
        this.fieldLabel(filter.fieldId) +
        ' ' +
        this.text('op-' + filter.operator).replace(/^./, c => c.toLocaleLowerCase()) +
        ' ' +
        filter.values.map(value => fieldValue(this.field(filter.fieldId), value)).join(', ')
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
      const [sdl, engine] = await Promise.all([this.source.schema(), import('./graphql-query')]);
      if (seq === this.schemaSequence && !this.disposed) {
        if (seq !== this.schemaSequence || this.disposed) return;
        this.graphqlEngine = engine;
        this.schemaSdl = sdl;
        this.schema = this.graphqlEngine.editorSchema(sdl);
        this.schemaType = this.schema.getQueryType()?.name ?? 'Query';
      }
    } catch {
      if (seq === this.schemaSequence && !this.disposed) this.schemaError = 'schema-unavailable';
    } finally {
      if (seq === this.schemaSequence && !this.disposed) this.schemaLoading = false;
    }
  }
  async switchMode(mode: 'visual' | 'graphql'): Promise<void> {
    if (mode === this.mode || this.saving) return;
    this.mode = mode;
    this.editorOpen = true;
    if (mode === 'graphql') {
      await Promise.all([
        !this.unlinked ? this.syncGraphql() : Promise.resolve(),
        !this.schema ? this.loadSchema() : Promise.resolve(),
      ]);
    }
  }
  /** Generated GraphQL is a view of the visual definition until the explicit unlink action. */
  async syncGraphql(): Promise<void> {
    if (
      this.unlinked ||
      !this.draft ||
      !this.scope ||
      this.issues.length ||
      !this.source.generate ||
      this.loadingFields
    )
      return;
    const seq = ++this.modeSequence,
      snapshot = JSON.stringify(this.draft);
    this.loadingFields = true;
    this.error = '';
    try {
      const generated = await this.source.generate(
        queryFor({ ...this.draft, name: this.draft.name || this.text('untitled') }, this.scope, null)
      );
      if (this.disposed || seq !== this.modeSequence || snapshot !== JSON.stringify(this.draft)) return;
      this.rawDraft = {
        ...rawDefinition(this.draft.name),
        document: generated.query,
        variables: JSON.parse(JSON.stringify(generated.variables)),
      };
      this.variablesText = JSON.stringify(this.rawDraft.variables, null, 2);
    } catch (error) {
      if (!this.disposed && seq === this.modeSequence)
        this.error = error instanceof GridRequestError ? error.key : 'query-unavailable';
    } finally {
      if (!this.disposed && seq === this.modeSequence) this.loadingFields = false;
    }
  }
  unlink(): void {
    if (this.unlinked || this.loadingFields || this.saving) return;
    const origin = this.draft;
    this.rawDraft = {
      ...this.rawDraft,
      name: origin?.name ?? this.rawDraft.name,
      ...(origin?.id ? { id: origin.id, revision: origin.revision, publishedAs: origin.publishedAs } : {}),
    };
    this.rawBaseline = '';
    this.unlinked = true;
    this.changed();
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
        ? (this.graphqlEngine?.recordIdentityKey(this.rawDraft.document, this.rawDraft.resultPath) ?? null)
        : null;
      const mapped = this.graphqlEngine!.rawRows(this.jsonResponse, this.rawDraft.resultPath, identityKey);
      this.rows = mapped.rows;
      const resultFields = this.publishFields;
      const labels = new Map(resultFields.map(field => [field.path.join('.'), field.label]));
      this.columnDefs = mapped.columns.map(key => ({
        colId: key,
        ...columnSize(
          labels.get(key) === this.text('title-column') ? 'title' : key,
          resultFields.find(field => field.path.join('.') === key)?.type
        ),
        headerName: labels.get(key) ?? key,
        cellRenderer: (params: { value: GridRow['values'][string] }) =>
          inspectCell(
            fieldValue(
              resultFields.find(field => field.path.join('.') === key),
              params.value
            ),
            labels.get(key) ?? key,
            undefined,
            this.cellText
          ),
        valueGetter: p => p.data?.values[key],
        ...(identityKey && (/(^|\.)title$/i.test(key) || labels.get(key) === this.text('title-column') || key === 'oid')
          ? {
              cellRenderer: (params: { value: GridRow['values'][string] | undefined; data?: GridRow }) =>
                this.recordLink(params.value, params.data?.recordOid, labels.get(key) ?? key),
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
    const binding = this.graphqlEngine!.cursorBinding(snapshot.document, snapshot.variables, snapshot.resultPath);
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
      this.resultPaths = this.graphqlEngine!.resultArrays(data);
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
  get publications() {
    return this.activeDefinition?.publishedAs ?? [];
  }
  private labelsCache: { fields: GridField[]; labels: Record<string, string> } | null = null;
  get fieldLabels(): Record<string, string> {
    const fields = this.scope?.fields;
    if (!fields) return {};
    if (this.labelsCache?.fields !== fields)
      this.labelsCache = { fields, labels: Object.fromEntries(fields.map(f => [f.id, f.label])) };
    return this.labelsCache.labels;
  }
  get publishFields(): NamedQueryResultField[] {
    const fields = this.scope?.fields ?? [];
    if (!this.unlinked && this.draft)
      return [
        { label: this.text('oid'), path: ['oid'], type: 'string' },
        ...this.draft.columns.flatMap(id => {
          const field = fields.find(f => f.id === id);
          return !field
            ? []
            : field.selections?.length
              ? field.selections.map(selection => ({
                  label: this.fieldLabel(id),
                  path: selection.responsePath,
                  type: field.type,
                  choices: field.choices,
                }))
              : [
                  {
                    label: this.fieldLabel(id),
                    path: [id.replace(/^record:/, '')],
                    type: field.type,
                    choices: field.choices,
                  },
                ];
        }),
        { label: this.text('field-group-metadata'), path: ['metadata'], type: 'object' },
      ].filter((f, i, all) => all.findIndex(other => JSON.stringify(other.path) === JSON.stringify(f.path)) === i);
    return (
      this.graphqlEngine?.selectedResultFields(this.schema, this.rawDraft.document, this.rawDraft.resultPath) ?? []
    ).map(result => {
      const field = fields.find(
        f =>
          f.id === 'record:' + result.path.join('.') ||
          (result.path[0] === 'metadata' && f.path === (result.sourcePath ?? '/' + result.path.slice(1).join('/')))
      );
      return {
        ...result,
        choices: field?.choices,
        label: field
          ? this.fieldLabel(field.id)
          : result.path.length === 1 && result.path[0] === 'metadata'
            ? this.text('field-group-metadata')
            : result.label,
      };
    });
  }
  recordTypeLabel(type: string): string {
    return this.catalogue?.scopes.find(s => s.recordType === type && s.recordTypeLabel)?.recordTypeLabel ?? type;
  }
  get adminUrl(): string {
    return window.location.pathname.replace(/\/data-grids\/?$/, '');
  }
  namedQueryUrl(name = ''): string {
    return (
      window.location.pathname.replace(/\/data-grids\/?$/, '/named-query') +
      (name ? '#query=' + encodeURIComponent(name) : '')
    );
  }
  get graphqlFieldGroups(): { label: string; fields: GridField[] }[] {
    const q = this.schemaSearch.trim().toLocaleLowerCase();
    return fieldGroups(
      (this.scope?.fields ?? []).filter(
        f =>
          f.selectable &&
          !f.repeatingSubfield &&
          (!q || [f.label, f.path, ...(f.groupPath ?? [])].join(' ').toLocaleLowerCase().includes(q))
      )
    );
  }
  workflowLabel(stage: string): string {
    return String(fieldValue(this.field('record:workflowStep'), stage));
  }
  async discoverRawFields(): Promise<void> {
    const original = this.rawDraft;
    const seq = ++this.fieldSequence;
    const type = this.graphqlEngine?.queryRecordType(this.rawDraft.document, this.rawDraft.variables);
    if (!type || !this.catalogue) return;
    const scope =
      this.catalogue.scopes.find(s => s.recordType === type && !s.workflowStage) ??
      this.catalogue.scopes.find(s => s.recordType === type);
    if (!scope) return;
    this.draft = { ...emptyGrid(), recordType: type, workflowStage: scope.workflowStage };
    if (this.source.fields) {
      const discovered = await this.source.fields(scope);
      if (this.disposed || original !== this.rawDraft || seq !== this.fieldSequence) return;
      for (const fieldScope of discovered) {
        const index = this.catalogue.scopes.findIndex(s => s.id === fieldScope.id);
        if (index >= 0) this.catalogue.scopes[index] = fieldScope;
        else this.catalogue.scopes.push(fieldScope);
      }
    }
  }
  async insertField(editor: HTMLTextAreaElement, id: string): Promise<void> {
    if (!this.unlinked || !this.scope || !this.source.selection) return;
    const original = this.rawDraft,
      document = original.document;
    try {
      const field = await this.source.selection(this.scope, id);
      if (this.disposed || !this.unlinked || original !== this.rawDraft || document !== this.rawDraft.document) return;
      this.rawDraft.document = this.graphqlEngine!.insertRecordField(
        this.rawDraft.document,
        field.selections ?? [],
        id.startsWith('metadata')
      );
      this.rawChanged();
      editor.focus();
    } catch {
      this.error = 'schema-changed';
    }
  }
  applyColumns(columns: string[]): void {
    if (!this.draft || this.unlinked) return;
    this.draft.columns = [...columns];
    this.closeColumns();
    this.changed();
    void this.preview();
  }
  closeColumns(): void {
    this.columnsOpen = false;
    setTimeout(() => {
      if (!this.disposed) this.columnsButton?.nativeElement.focus();
    });
  }
  conditionLabel(filter: GridFilter): string {
    return (
      this.fieldLabel(filter.fieldId) +
      ' ' +
      this.text('op-' + filter.operator).replace(/^./, c => c.toLocaleLowerCase()) +
      ' ' +
      filter.values.map(value => fieldValue(this.field(filter.fieldId), value)).join(', ')
    );
  }
  async refreshSaved(): Promise<void> {
    try {
      const page = await this.source.list();
      if (this.disposed) return;
      this.saved = page.grids;
      this.nextSaved = page.next;
      const active = this.activeDefinition;
      const current = this.saved.find(s => s.id === active?.id);
      if (active && current) active.publishedAs = current.publishedAs;
    } catch {
      if (!this.disposed) this.error = 'load-failed';
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
    if (this.unlinked ? this.rawErrors.length : this.issues.length) {
      this.error = 'invalid-definition';
      return;
    }
    await this.save(this.savingAs, this.saveName.trim());
    if (!this.error) {
      this.saveOpen = false;
      this.saveDialog?.nativeElement.close();
      if (this.publishAfterSave) {
        this.publishAfterSave = false;
        await this.createNamedQuery();
      }
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
