import { Component, ElementRef, HostListener, Inject, Injector } from '@angular/core';
import {
  BaseComponent,
  LatestRequest,
  LoggerService,
  TranslationService,
  type CompletionSource,
  type ColumnPickerField,
} from '@researchdatabox/portal-ng-common';
import {
  type ContextSchemaField,
  type EditorDiagnostic,
  type NamedQueryParameterDescription,
  type ReportConfigDto,
  type ReportConfigFilterDto,
  type ReportConfigColumnDto,
  type ReportConfigPreviewDto,
  type ReportNamedQueryDescription,
  lookupPath,
} from '@researchdatabox/sails-ng-common';
import { ReportConfigService, type ReportQueryChoice } from './report-config.service';

@Component({
  selector: 'report-config',
  templateUrl: './report-config.component.html',
  styleUrls: ['./report-config.component.scss'],
  standalone: false,
})
export class ReportConfigComponent extends BaseComponent {
  reports: ReportConfigDto[] = [];
  filteredReports: ReportConfigDto[] = [];
  selectedReport: ReportConfigDto | null = null;
  previewResult: ReportConfigPreviewDto | null = null;
  previewFilterValues: Record<string, string> = {};
  namedQueries: ReportQueryChoice[] = [];
  private bindSelectedQuery = false;
  private parameterLabels: Record<string, string> = {};
  queryChoicesUnavailable = false;
  description: ReportNamedQueryDescription | null = null;
  diagnostics: EditorDiagnostic[] = [];
  selectedOutputs = new Set<string>();
  outputSearch = '';
  helpOpen = true;
  searchText = '';
  sourceFilter: 'all' | 'database' | 'graphql' | 'solr' = 'all';
  errorMessage = '';
  assistanceError = '';
  validationError = '';
  isSaving = false;
  isPreviewing = false;
  describing = false;
  validating = false;
  isAdmin = false;
  canManageQueries = false;
  isNewReport = false;
  private baseline = '';
  private validationBlocking = false;
  private itemRequests = new LatestRequest();
  private descriptionRequests = new LatestRequest();
  private validationRequests = new LatestRequest();
  private saveValidationRequests = new LatestRequest();
  private previewRequests = new LatestRequest();
  private listRequests = new LatestRequest();
  columnsOpen = false;
  queryBrowserOpen = false;
  columnDraft: ReportConfigColumnDto | null = null;
  columnIndex = -1;
  filterDraft: ReportConfigFilterDto | null = null;
  filterIndex = -1;
  activeSection = 'basics';
  previewMode: 'screen' | 'csv' = 'screen';
  columnAnnouncement = '';
  dragColumnIndex: number | null = null;
  sourceSummary = '';
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private fieldDetails = new Map<
    string,
    { type: string; group?: string; groupPath?: string[]; choices?: { value: string; label: string }[] }
  >();
  private validationTimer: ReturnType<typeof setTimeout> | null = null;

  get totalReports(): number {
    return this.reports.length;
  }
  get databaseReports(): number {
    return this.reports.filter(r => this.reportSource(r) === 'database').length;
  }
  get solrReports(): number {
    return this.reports.filter(r => r.reportSource === 'solr').length;
  }
  get editable(): boolean {
    return (
      !!this.selectedReport &&
      this.selectedReport.reportSource === 'database' &&
      !this.selectedReport.readOnly &&
      this.selectedReport.canEdit
    );
  }
  get dirty(): boolean {
    return this.editable && this.fingerprint() !== this.baseline;
  }
  get parameters(): NamedQueryParameterDescription[] {
    return this.description?.parameters ?? [];
  }
  get fields(): ContextSchemaField[] {
    return this.description?.result.fields ?? [];
  }
  get outputs(): ContextSchemaField[] {
    const search = this.outputSearch.toLowerCase();
    return this.fields.filter(
      f => lookupPath(f.path) !== null && (f.title + ' ' + f.path).toLowerCase().includes(search)
    );
  }
  get queryOptions(): string[] {
    return [
      ...new Set([this.selectedReport?.databaseQuery?.queryName ?? '', ...this.namedQueries.map(q => q.name)]),
    ].filter(Boolean);
  }
  get outputSource(): CompletionSource {
    return {
      fields: this.fields.filter(f => lookupPath(f.path) !== null),
      pathInsertion: lookupPath,
      roots: [],
      helpers: [],
    };
  }
  get visiblePreviewColumns(): ReportConfigColumnDto[] {
    return this.selectedReport?.columns.filter(c => !c.hide) ?? [];
  }

  constructor(
    private readonly elementRef: ElementRef,
    private readonly reportInjector: Injector,
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(ReportConfigService) private reportConfigService: ReportConfigService
  ) {
    super();
    this.initDependencies = [this.translationService, this.reportConfigService];
    this.isAdmin = elementRef.nativeElement.getAttribute('is-admin') === 'true';
    this.canManageQueries = elementRef.nativeElement.getAttribute('can-manage-named-queries') === 'true';
  }

  protected async initComponent(): Promise<void> {
    this.brandingAndPortalUrl = this.reportConfigService.brandingAndPortalUrl;
    await this.loadReports();
    await this.loadNamedQueries();
    this.applyFilter();
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = hash.get('create-from');
    if (query && this.isAdmin && this.namedQueries.some(item => item.name === query)) {
      this.createReport();
      this.selectQuery(query);
    }
    const report = hash.get('report');
    if (report) {
      const saved = this.reports.find(item => item.name === report);
      if (saved) this.editReport(saved);
    }
  }

  override ngOnDestroy(): void {
    this.itemRequests.invalidate();
    this.saveValidationRequests.invalidate();
    this.listRequests.invalidate();
    this.invalidateAssistance();
    super.ngOnDestroy();
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  @HostListener('document:click', ['$event'])
  guardNavigation(event: MouseEvent): void {
    const anchor = (event.target as Element)?.closest?.('a[href]');
    if (anchor && !anchor.getAttribute('href')?.startsWith('#') && !this.confirmDiscard()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    if (this.editable) void this.refreshAssistance();
  }

  async loadReports(): Promise<void> {
    const token = this.listRequests.next();
    const reports = await this.reportConfigService.list();
    if (this.listRequests.isCurrent(token)) {
      this.reports = reports;
      this.applyFilter();
    }
  }

  async loadNamedQueries(): Promise<void> {
    try {
      this.namedQueries = await this.reportConfigService.listNamedQueries();
      this.queryChoicesUnavailable = false;
    } catch (error: unknown) {
      this.loggerService.warn('Failed to load named queries for report config', error);
      this.namedQueries = [];
      this.queryChoicesUnavailable = true;
    }
  }

  applyFilter(): void {
    const search = this.searchText.toLowerCase();
    this.filteredReports = this.reports.filter(
      report =>
        (this.sourceFilter === 'all' || this.reportSource(report) === this.sourceFilter) &&
        [
          report.title,
          report.name,
          this.sourceLabel(this.reportSource(report)),
          report.databaseQuery?.queryName ?? '',
        ].some(value => value.toLowerCase().includes(search))
    );
  }
  setSourceFilter(source: 'all' | 'database' | 'graphql' | 'solr'): void {
    this.sourceFilter = source;
    this.applyFilter();
  }
  openReport(report: ReportConfigDto): string {
    return `${this.brandingAndPortalUrl}/admin/report/${encodeURIComponent(report.name)}`;
  }

  createReport(): void {
    if (!this.confirmDiscard()) return;
    this.startDraft(
      {
        name: '',
        title: '',
        reportSource: 'database',
        databaseQuery: { queryName: '' },
        solrQuery: null,
        filter: [],
        columns: [],
        readOnly: false,
        canEdit: true,
        canDelete: true,
        canPreview: true,
      },
      true
    );
  }
  editReport(report: ReportConfigDto): void {
    if (report.readOnly || report.reportSource !== 'database' || !report.canEdit || !this.confirmDiscard()) return;
    this.startDraft(this.clone(report), false);
  }
  private startDraft(report: ReportConfigDto, isNew: boolean): void {
    this.itemRequests.next();
    this.saveValidationRequests.invalidate();
    this.invalidateAssistance();
    this.bindSelectedQuery = false;
    this.selectedReport = report;
    this.isNewReport = isNew;
    this.isSaving = false;
    this.columnsOpen = false;
    this.columnDraft = null;
    this.filterDraft = null;
    this.queryBrowserOpen = false;
    this.errorMessage = '';
    this.previewFilterValues = {};
    this.outputSearch = '';
    this.selectedOutputs = new Set();
    this.baseline = this.fingerprint();
    void this.refreshAssistance();
    setTimeout(() => this.elementRef.nativeElement.querySelector('#report-workspace-title')?.focus(), 0);
  }
  cancelEdit(): void {
    if (this.confirmDiscard()) this.closeDraft();
  }
  reportsCrumb(event: MouseEvent): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    this.cancelEdit();
  }
  private closeDraft(): void {
    this.itemRequests.invalidate();
    this.saveValidationRequests.invalidate();
    this.invalidateAssistance();
    this.selectedReport = null;
    this.previewFilterValues = {};
    this.errorMessage = '';
    this.isNewReport = false;
    this.isSaving = false;
    setTimeout(() => this.elementRef.nativeElement.querySelector('#report-create')?.focus(), 0);
  }
  private confirmDiscard(): boolean {
    return !this.dirty || window.confirm(this.t('report-discard-confirm'));
  }
  private fingerprint(): string {
    return JSON.stringify(this.selectedReport);
  }
  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
  private t(key: string): string {
    return String(this.translationService.t(key));
  }

  private cancelValidation(): void {
    if (this.validationTimer) clearTimeout(this.validationTimer);
    this.validationTimer = null;
    this.validationRequests.invalidate();
    this.validating = false;
  }
  private invalidateAssistance(): void {
    this.descriptionRequests.invalidate();
    this.cancelValidation();
    this.previewChanged();
    this.description = null;
    this.fieldDetails.clear();
    this.sourceSummary = '';
    this.parameterLabels = {};
    this.describing = false;
    this.diagnostics = [];
    this.validationBlocking = false;
    this.validationError = '';
    this.assistanceError = '';
  }
  draftChanged(): void {
    this.cancelValidation();
    this.previewChanged();
    this.diagnostics = [];
    this.validationBlocking = false;
    this.validationError = '';
    if (this.editable)
      this.validationTimer = setTimeout(() => {
        this.validationTimer = null;
        void this.validateDraft();
      }, 400);
    if (this.editable && this.description?.valid && !this.queryVersionChanged)
      this.previewTimer = setTimeout(() => {
        this.previewTimer = null;
        void this.previewReport();
      }, 600);
  }
  previewChanged(): void {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = null;
    this.previewRequests.invalidate();
    this.previewResult = null;
    this.isPreviewing = false;
  }
  queryChanged(): void {
    this.selectedOutputs = new Set();
    void this.refreshAssistance();
  }
  selectQuery(name: string): void {
    if (!this.editable || !this.selectedReport) return;
    this.selectedReport.databaseQuery = { queryName: name };
    this.bindSelectedQuery = true;
    this.queryChanged();
  }
  async refreshAssistance(): Promise<void> {
    this.invalidateAssistance();
    const name = this.selectedReport?.databaseQuery?.queryName;
    if (!this.editable || !name) return;
    const token = this.descriptionRequests.next();
    this.describing = true;
    // Validation is independent of field discovery and never executes the query.
    void this.validateDraft();
    try {
      const description = await this.reportConfigService.describeQuery(name);
      if (this.descriptionRequests.isCurrent(token)) {
        this.description = description;
        if (description.source === 'graphql') {
          if (this.bindSelectedQuery || (this.isNewReport && !this.selectedReport!.databaseQuery?.queryVersion)) {
            this.selectedReport!.databaseQuery!.queryVersion = description.queryVersion;
            this.bindSelectedQuery = false;
          }
          await this.friendlyGraphqlFields(description);
          if (!this.descriptionRequests.isCurrent(token)) return;
          void this.validateDraft();
          if (description.valid && !this.queryVersionChanged) void this.previewReport();
        }

        this.selectedOutputs = new Set(
          [...this.selectedOutputs].filter(path => description.result.fields.some(f => f.path === path))
        );
      }
    } catch (error: unknown) {
      if (this.descriptionRequests.isCurrent(token))
        this.assistanceError = this.getErrorMessage(error, 'report-assistance-unavailable');
    } finally {
      if (this.descriptionRequests.isCurrent(token)) this.describing = false;
    }
  }
  async validateDraft(forSave = false): Promise<boolean> {
    this.cancelValidation();
    if (!this.editable || !this.selectedReport) return true;
    // Assistance refresh and preview cancel advisory validation, never Save's check.
    const requests = forSave ? this.saveValidationRequests : this.validationRequests;
    const token = requests.next();
    const fingerprint = this.fingerprint();
    if (!forSave) this.validating = true;
    try {
      const result = await this.reportConfigService.validate(this.clone(this.selectedReport));
      if (!requests.isCurrent(token) || fingerprint !== this.fingerprint()) return false;
      this.diagnostics = result.diagnostics;
      this.validationBlocking = !result.valid;
      this.validationError = '';
      return result.valid;
    } catch {
      if (!requests.isCurrent(token) || fingerprint !== this.fingerprint()) return false;
      this.validationError = this.t('report-validation-unavailable');
      this.validationBlocking = false;
      return true; // Guidance failures must not remove legacy editing/saving.
    } finally {
      if (!forSave && requests.isCurrent(token)) this.validating = false;
    }
  }
  async saveReport(): Promise<void> {
    if (!this.editable || !this.selectedReport || this.isSaving) return;
    const item = this.itemRequests.next();
    const fingerprint = this.fingerprint();
    const report = this.clone(this.selectedReport);
    const isNew = this.isNewReport;
    this.isSaving = true;
    this.errorMessage = '';
    try {
      const valid = await this.validateDraft(true);
      if (!this.itemRequests.isCurrent(item)) return;
      if (fingerprint !== this.fingerprint()) {
        this.errorMessage = this.t('report-save-draft-changed');
        return;
      }
      if (!valid) return;
      const saved = isNew
        ? await this.reportConfigService.create(report)
        : await this.reportConfigService.update(report);
      if (!this.itemRequests.isCurrent(item)) return;
      // Reconcile before Cancel or a list reload can expose the saved entry.
      this.listRequests.invalidate();
      this.reports = this.reports.some(r => r.name === saved.name)
        ? this.reports.map(r => (r.name === saved.name ? this.clone(saved) : r))
        : [...this.reports, this.clone(saved)];
      this.applyFilter();
      this.baseline = fingerprint;
      this.isNewReport = false;
      await this.loadReports();
      // Keep the workspace open during refresh, and preserve later edits/item switches.
      if (this.itemRequests.isCurrent(item) && fingerprint === this.fingerprint()) this.closeDraft();
    } catch (error: unknown) {
      if (this.itemRequests.isCurrent(item)) {
        this.errorMessage = this.getErrorMessage(error);
        this.loggerService.error('Failed to save report config', error);
      }
    } finally {
      if (this.itemRequests.isCurrent(item)) this.isSaving = false;
    }
  }
  async deleteReport(report: ReportConfigDto): Promise<void> {
    if (
      report.readOnly ||
      report.reportSource !== 'database' ||
      !report.canDelete ||
      !window.confirm(this.t('report-delete-confirm') + ' ' + report.title)
    )
      return;
    try {
      await this.reportConfigService.delete(report.name);
      await this.loadReports();
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error);
    }
  }
  async previewReport(): Promise<void> {
    if (!this.editable || !this.selectedReport?.canPreview) return;
    this.cancelValidation();
    const token = this.previewRequests.next();
    const fingerprint = this.fingerprint();
    this.isPreviewing = true;
    this.errorMessage = '';
    this.previewResult = null;
    try {
      const result = await this.reportConfigService.preview(
        {
          ...this.clone(this.selectedReport),
          ...(this.description?.source === 'graphql'
            ? { name: this.selectedReport.name || 'preview', title: this.selectedReport.title || 'preview' }
            : {}),
        },
        {
          ...this.previewFilterValues,
        }
      );
      if (!this.previewRequests.isCurrent(token) || fingerprint !== this.fingerprint()) return;
      this.previewResult = result;
      this.diagnostics = result.diagnostics ?? [];
      // A preview-only refusal does not tighten the existing save contract.
    } catch (error: unknown) {
      if (this.previewRequests.isCurrent(token)) this.errorMessage = this.getErrorMessage(error);
    } finally {
      if (this.previewRequests.isCurrent(token)) this.isPreviewing = false;
    }
  }

  toggleOutput(path: string, selected: boolean): void {
    if (selected) this.selectedOutputs.add(path);
    else this.selectedOutputs.delete(path);
  }
  addSelectedColumns(): void {
    if (!this.editable || !this.selectedReport) return;
    for (const field of this.fields.filter(f => this.selectedOutputs.has(f.path))) {
      const property = lookupPath(field.path);
      if (property !== null)
        this.selectedReport.columns.push({ label: field.title || property.split('.').pop() || property, property });
    }
    this.selectedOutputs = new Set();
    this.draftChanged();
    if (this.description?.source === 'graphql') void this.previewReport();
  }
  addColumn(): void {
    if (this.editable) {
      this.selectedReport!.columns.push({ label: '', property: '' });
      this.draftChanged();
    }
  }
  removeColumn(index: number): void {
    if (this.editable) {
      this.selectedReport!.columns.splice(index, 1);
      this.draftChanged();
    }
  }
  moveColumn(index: number, offset: number): void {
    const columns = this.selectedReport?.columns;
    if (!this.editable || !columns || index + offset < 0 || index + offset >= columns.length) return;
    const [column] = columns.splice(index, 1);
    columns.splice(index + offset, 0, column);
    this.columnAnnouncement = String(
      this.translationService.t('report-ux-moved', {
        name: column.label,
        position: index + offset + 1,
        total: columns.length,
      })
    );
    this.draftChanged();
  }
  addFilter(): void {
    if (this.editable) {
      this.selectedReport!.filter.push({ type: 'text', paramName: '', property: '', message: '' });
      this.draftChanged();
    }
  }
  removeFilter(index: number): void {
    if (this.editable) {
      this.selectedReport!.filter.splice(index, 1);
      this.draftChanged();
    }
  }
  filterTypeChanged(filter: ReportConfigFilterDto): void {
    if (filter.type === 'date-range' && !filter.database) filter.database = { fromProperty: '', toProperty: '' };
    this.draftChanged();
  }
  setDateBinding(filter: ReportConfigFilterDto, bound: 'fromProperty' | 'toProperty', key: string): void {
    filter.database = { fromProperty: '', toProperty: '', ...filter.database, [bound]: key };
    this.draftChanged();
  }
  get dateParameters(): NamedQueryParameterDescription[] {
    return this.parameters.filter(
      p => ['date', 'string', 'unknown'].includes(p.type) && !(p.type === 'date' && p.format === 'days' && p.queryType)
    );
  }
  datePair(): { from: NamedQueryParameterDescription; to: NamedQueryParameterDescription } | null {
    // Suggest only a unique, known date pair with the same target and opposite bounds.
    const dates = this.dateParameters.filter(p => p.type === 'date');
    const pairs = dates
      .filter(p => ['$gt', '$gte'].includes(p.queryType ?? ''))
      .flatMap(from =>
        dates
          .filter(to => to.path === from.path && ['$lt', '$lte'].includes(to.queryType ?? ''))
          .map(to => ({ from, to }))
      );
    return pairs.length === 1 ? pairs[0] : null;
  }
  suggestDatePair(filter: ReportConfigFilterDto): void {
    const pair = this.datePair();
    if (
      !this.editable ||
      !pair ||
      !window.confirm(this.t('report-confirm-date-pair') + ` ${pair.from.key} → ${pair.to.key} (${pair.from.path})`)
    )
      return;
    filter.database = { ...filter.database, fromProperty: pair.from.key, toProperty: pair.to.key };
    this.draftChanged();
  }
  columnIsArray(column: ReportConfigColumnDto): boolean {
    return this.fields.some(f => f.isArray && lookupPath(f.path) === column.property);
  }
  get saveBlocked(): boolean {
    return this.validationBlocking;
  }
  get selectedQueryChoice(): ReportQueryChoice | undefined {
    return this.namedQueries.find(item => item.name === this.selectedReport?.databaseQuery?.queryName);
  }
  get queryVersionChanged(): boolean {
    return (
      this.description?.source === 'graphql' &&
      !!this.description.queryVersion &&
      ![this.description.queryVersion, ...(this.description.compatibleQueryVersions ?? [])].includes(
        this.selectedReport?.databaseQuery?.queryVersion ?? ''
      )
    );
  }
  reviewQueryVersion(): void {
    if (!this.selectedReport?.databaseQuery || !this.description?.queryVersion) return;
    this.selectedReport.databaseQuery.queryVersion = this.description.queryVersion;
    this.draftChanged();
    void this.previewReport();
  }
  querySourceLabel(choice?: ReportQueryChoice): string {
    return this.t(choice?.source === 'graphql' ? 'report-graphql-source' : 'report-source-database');
  }
  parameterLabel(parameter: NamedQueryParameterDescription): string {
    return (
      this.parameterLabels[parameter.path] ||
      parameter.sourceField?.title ||
      parameter.key
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/^./, c => c.toUpperCase())
    );
  }
  addParameterFilter(parameter: NamedQueryParameterDescription): void {
    if (
      !this.editable ||
      !this.selectedReport ||
      this.selectedReport.filter.some(filter => filter.paramName === parameter.key)
    )
      return;
    this.selectedReport.filter.push({
      type: 'text',
      paramName: parameter.key,
      message: this.parameterLabel(parameter),
      property: '',
    });
    this.draftChanged();
  }
  private async friendlyGraphqlFields(description: ReportNamedQueryDescription): Promise<void> {
    const choice = this.selectedQueryChoice;
    if (!choice?.graphql) return;
    // Reuse the explorer's caller-scoped catalogue and named editor's alias/projection logic.
    try {
      const presentation = await import('../../../named-query-editor/src/app/graphql-presentation');
      const draft = { source: 'graphql' as const, graphql: choice.graphql };
      const type = presentation.recordType(draft);
      if (!type) return;
      const { RecordGridService } = await import('../../../data-grids/src/app/record-grid.service');
      const service = this.reportInjector.get(RecordGridService);
      await service.waitForInit();
      const saved = choice.sourceSavedQuery?.id ? await service.read(choice.sourceSavedQuery.id) : null;
      const scope = {
        id: type,
        label: type,
        recordType: type,
        fields: [],
        ...(saved && saved.mode !== 'graphql' && saved.workflowStage ? { workflowStage: saved.workflowStage } : {}),
      };
      const [catalogue] = await service.fields(scope);
      if (this.description !== description) return;
      const typeKey = 'report-ux-record-type-' + type;
      const translatedType = this.t(typeKey);
      const typeLabel =
        catalogue.recordTypeLabel && catalogue.recordTypeLabel !== type
          ? catalogue.recordTypeLabel
          : translatedType !== typeKey
            ? translatedType
            : this.t('report-ux-records');
      const stage = saved && saved.mode !== 'graphql' ? saved.workflowStage : '';
      const sortBinding = choice.graphql.variables['sort'];
      const sort = sortBinding?.ownership === 'fixed' && Array.isArray(sortBinding.value) ? sortBinding.value[0] : null;
      const sortField = sort && typeof sort === 'object' && !Array.isArray(sort) ? String(sort['field'] || '') : '';
      const sortLabel =
        catalogue.fields.find(field => field.id === sortField || field.id === 'metadata:/' + sortField)?.label ||
        presentation.humanLabel(sortField);
      this.sourceSummary = [
        typeLabel,
        stage
          ? String(this.translationService.t('report-ux-stage-summary', { name: presentation.humanLabel(stage) }))
          : '',
        sortLabel ? String(this.translationService.t('report-ux-sort-summary', { name: sortLabel })) : '',
      ]
        .filter(Boolean)
        .join(' · ');
      const ids = [
        ...new Set([
          ...(saved && saved.mode !== 'graphql'
            ? saved.columns
            : catalogue.fields
                .filter(field => field.selectable && !field.repeatingSubfield)
                .slice(0, 30)
                .map(field => field.id)),
          ...catalogue.fields
            .filter(field => field.selectable && field.id.startsWith('record:'))
            .map(field => field.id),
        ]),
      ].slice(0, 50);
      const fields = await service.selections(scope, ids);
      const { visualPublicationProjection } = await import('../../../named-query-editor/src/app/publication-helpers');
      const known = visualPublicationProjection(choice.graphql.document, fields).fields;
      const labels = Object.fromEntries(catalogue.fields.map(field => [field.id, field.label]));
      const parameterLabels = presentation.conditionLabels(draft, labels, key =>
        String(this.translationService.t('data-grids-' + key))
      );
      if (this.description === description) this.parameterLabels = parameterLabels;
      const selected = presentation.selectedResultFields(draft, [
        ...known,
        ...fields.flatMap(field =>
          (field.selections ?? []).map(selection => ({
            label: field.label,
            path: selection.responsePath,
            type: field.type,
          }))
        ),
      ]);
      for (const field of selected)
        for (const [target, path] of Object.entries(choice.graphql.mappings ?? {}) as Array<[string, string[]]>) {
          if (!path.every((part, index) => field.path[index] === part)) continue;
          const property = lookupPath(
            [target, ...field.path.slice(path.length)]
              .map((part, index) =>
                /^[A-Za-z_][A-Za-z0-9_]*$/.test(part) ? (index ? '.' : '') + part : '[' + JSON.stringify(part) + ']'
              )
              .join('')
          );
          const result = description.result.fields.find(item => lookupPath(item.path) === property);
          if (result) {
            result.title = field.label;
            const original = fields.find(item => item.label === field.label);
            const detail = catalogue.fields.find(item => item.id === original?.id);
            if (detail) this.fieldDetails.set(property!, detail);
          }
        }
    } catch {
      /* Schema guidance is advisory; execution and server validation remain authoritative. */
    }
  }

  readonly sections = ['basics', 'source', 'columns', 'filters', 'preview'];
  get graphqlReports(): number {
    return this.reports.filter(r => this.reportSource(r) === 'graphql').length;
  }
  reportSource(report: ReportConfigDto): string {
    return report.reportSource === 'solr'
      ? 'solr'
      : this.namedQueries.find(q => q.name === report.databaseQuery?.queryName)?.source === 'graphql'
        ? 'graphql'
        : 'database';
  }
  sourceLabel(source: string): string {
    return this.t(source === 'graphql' ? 'report-graphql-source' : 'report-source-' + source);
  }
  queryUrl(name = this.selectedReport?.databaseQuery?.queryName ?? ''): string {
    return this.brandingAndPortalUrl + '/admin/named-query#query=' + encodeURIComponent(name);
  }
  explorerUrl(): string {
    return (
      this.brandingAndPortalUrl +
      '/admin/data-grids#grid=' +
      encodeURIComponent(this.selectedQueryChoice?.sourceSavedQuery?.id ?? '')
    );
  }
  goSection(event: Event, section: string): void {
    event.preventDefault();
    this.activeSection = section;
    this.elementRef.nativeElement
      .querySelector('#report-section-' + section)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  get columnFields(): ContextSchemaField[] {
    return this.fields.filter(
      f =>
        lookupPath(f.path) !== null && (!['object', 'array'].includes(f.type) || (f.isArray && f.itemType !== 'object'))
    );
  }
  fieldLabel(property: string): string {
    if (property === 'oid') return this.t('data-grids-oid');
    return (
      this.fields.find(f => lookupPath(f.path) === property)?.title ||
      property
        .split('.')
        .pop()
        ?.replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/^./, c => c.toUpperCase()) ||
      property
    );
  }
  get pickerFields(): ColumnPickerField[] {
    const fields: ColumnPickerField[] = this.columnFields.map(f => ({
      id: lookupPath(f.path)!,
      label: this.fieldLabel(lookupPath(f.path)!),
      path: lookupPath(f.path)!,
      group:
        this.fieldDetails.get(lookupPath(f.path)!)?.group ||
        (['oid', 'workflowStep', 'lastModified', 'createdOn', 'recordType', 'form'].includes(f.path)
          ? this.t('data-grids-field-group-record')
          : undefined),
      groupPath: this.fieldDetails.get(lookupPath(f.path)!)?.groupPath,
      type:
        (this.fieldDetails.get(lookupPath(f.path)!)?.choices?.length
          ? 'choice'
          : this.fieldDetails.get(lookupPath(f.path)!)?.type) ||
        (f.type === 'date'
          ? 'datetime'
          : f.type === 'number'
            ? 'number'
            : f.type === 'boolean'
              ? 'boolean'
              : f.isArray
                ? 'structured'
                : 'text'),
      selectable: true,
    }));
    // Preserve manual/legacy bindings; assistance is advisory and may be incomplete.
    for (const column of this.selectedReport?.columns ?? [])
      if (!fields.some(f => f.id === column.property))
        fields.push({
          id: column.property,
          label: column.label,
          path: column.property,
          type: 'text',
          selectable: true,
          listed: false,
        });
    return fields;
  }
  get selectedColumnPaths(): string[] {
    return this.selectedReport?.columns.map(c => c.property) ?? [];
  }
  applyColumns(paths: string[]): void {
    if (!this.selectedReport) return;
    this.selectedReport.columns = paths.map(
      property => this.selectedReport!.columns.find(c => c.property === property) || this.newColumn(property)
    );
    this.columnsOpen = false;
    this.draftChanged();
  }
  private newColumn(property: string): ReportConfigColumnDto {
    const detail = this.fieldDetails.get(property);
    return {
      label: this.fieldLabel(property),
      property,
      format: 'text',
      ...(detail?.type === 'datetime' || this.fields.find(f => lookupPath(f.path) === property)?.type === 'date'
        ? { format: 'date' as const }
        : {}),
      ...(detail?.choices?.length ? { valueLabels: detail.choices } : {}),
    };
  }
  editColumn(index: number): void {
    this.columnIndex = index;
    this.columnDraft = this.clone(this.selectedReport!.columns[index]);
  }
  columnFieldChanged(property: string): void {
    if (this.columnDraft) Object.assign(this.columnDraft, this.newColumn(property), { label: this.columnDraft.label });
  }
  doneColumn(): void {
    if (this.columnDraft && this.selectedReport) {
      this.columnDraft.format ??= 'text';
      this.selectedReport.columns[this.columnIndex] = this.columnDraft;
      this.columnDraft = null;
      this.draftChanged();
    }
  }
  formatLabel(column: ReportConfigColumnDto): string {
    return this.t('report-ux-format-' + (column.format || 'text'));
  }
  checkMessage(diagnostic: EditorDiagnostic): string {
    const messages: Record<string, string> = {
      UNKNOWN_OUTPUT_COLUMN: 'report-ux-check-column',
      UNKNOWN_TEMPLATE_REFERENCE: 'report-ux-check-template-field',
      TEMPLATE_SYNTAX: 'report-ux-check-template-syntax',
      TEMPLATE_COMPLEXITY: 'report-ux-check-template-length',
      UNKNOWN_QUERY_PARAMETER: 'report-ux-check-filter',
      INCOMPATIBLE_DATE_PARAMETER: 'report-ux-check-date-filter',
      ARRAY_WITHOUT_MULTIVALUE: 'report-ux-check-multiple',
    };
    const key = messages[diagnostic.code];
    if (!key) return this.t(diagnostic.reason);
    const match = /^(columns|filter)\.(\d+)/.exec(diagnostic.field);
    const index = Number(match?.[2]);
    const name =
      match?.[1] === 'columns'
        ? this.selectedReport?.columns[index]?.label
        : this.selectedReport?.filter[index]?.message;
    return String(this.translationService.t(key, { name: name || this.t('report-ux-this-setting') }));
  }
  reorderColumn(event: KeyboardEvent, index: number): void {
    if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const offset = event.key === 'ArrowUp' ? -1 : 1;
    this.moveColumn(index, offset);
    setTimeout(() =>
      this.elementRef.nativeElement
        .querySelectorAll('[data-column-handle]')
        [Math.max(0, Math.min(index + offset, this.selectedReport!.columns.length - 1))]?.focus()
    );
  }
  dropColumn(event: DragEvent, index: number): void {
    event.preventDefault();
    if (this.dragColumnIndex !== null) this.moveColumn(this.dragColumnIndex, index - this.dragColumnIndex);
    this.dragColumnIndex = null;
  }
  openFilter(index = -1): void {
    this.filterIndex = index;
    this.filterDraft =
      index < 0
        ? { type: 'text', paramName: '', property: '', message: '' }
        : this.clone(this.selectedReport!.filter[index]);
  }
  suggestFilter(parameter: NamedQueryParameterDescription): void {
    if (!this.filterDraft || this.filterIndex >= 0) return;
    this.filterDraft = {
      type: 'text',
      paramName: parameter.key,
      property: '',
      message: this.parameterLabel(parameter),
    };
    const pair = this.datePair();
    if (pair && [pair.from.key, pair.to.key].includes(parameter.key)) {
      this.filterDraft.type = 'date-range';
      this.filterDraft.database = { fromProperty: pair.from.key, toProperty: pair.to.key };
    }
  }
  previewFilterLabel(filter: ReportConfigFilterDto): string {
    return this.t(filter.message).replace(/:\s*$/, '');
  }
  doneFilter(): void {
    if (!this.filterDraft || !this.selectedReport) return;
    if (this.filterIndex < 0) this.selectedReport.filter.push(this.filterDraft);
    else this.selectedReport.filter[this.filterIndex] = this.filterDraft;
    this.filterDraft = null;
    this.draftChanged();
  }
  get previewColumns(): ReportConfigColumnDto[] {
    return this.selectedReport?.columns.filter(c => this.previewMode === 'csv' || !c.hide) ?? [];
  }
  get previewRows() {
    return this.previewResult?.renderedRows.slice(0, 10) ?? [];
  }
  private getErrorMessage(error: unknown, fallback = 'report-request-failed'): string {
    const response = error as {
      error?: { message?: string; data?: { message?: string }; errors?: Array<{ code?: string }> };
    };
    const message = response.error?.errors?.[0]?.code ?? response.error?.data?.message ?? response.error?.message;
    const key = 'report-graphql-error-' + message;
    const translated = this.t(key);
    if (translated !== key) return translated;
    if (message && /^(REPORT_|GRAPHQL_|QUERY_|INVALID_GRAPHQL_|COLLECTION_|UNAVAILABLE$)/.test(message))
      return this.t(fallback);
    return message ?? this.t(fallback);
  }
}
