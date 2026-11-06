import { Component, ElementRef, Inject } from '@angular/core';
import { BaseComponent, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import { ReportConfigDto, ReportConfigFilterDto, ReportConfigPreviewDto } from '@researchdatabox/sails-ng-common';
import { ReportConfigService } from './report-config.service';

@Component({
  selector: 'report-config',
  templateUrl: './report-config.component.html',
  styleUrls: ['./report-config.component.scss'],
  standalone: false
})
export class ReportConfigComponent extends BaseComponent {
  readonly sources = ['all', 'database', 'solr'] as const;
  pendingDelete: ReportConfigDto | null = null;
  private modalTrigger: HTMLElement | null = null;
  get hasNamedQueries(): boolean { return this.reports.some(report => !!report.databaseQuery?.queryName); }
  reports: ReportConfigDto[] = [];
  filteredReports: ReportConfigDto[] = [];
  selectedReport: ReportConfigDto | null = null;
  previewResult: ReportConfigPreviewDto | null = null;
  previewFilterValues: Record<string, string> = {};
  namedQueries: { name: string }[] = [];
  searchText = '';
  sourceFilter: 'all' | 'database' | 'solr' = 'all';
  errorMessage = '';
  isSaving = false;
  isDeleting = false;
  isPreviewing = false;
  isAdmin = false;
  isNewReport = false;

  get totalReports(): number {
    return this.reports.length;
  }

  get databaseReports(): number {
    return this.reports.filter(report => report.reportSource === 'database').length;
  }

  get solrReports(): number {
    return this.reports.filter(report => report.reportSource === 'solr').length;
  }

  constructor(
    private readonly elementRef: ElementRef,
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(ReportConfigService) private reportConfigService: ReportConfigService
  ) {
    super();
    this.initDependencies = [this.translationService, this.reportConfigService];
    this.isAdmin = elementRef.nativeElement.getAttribute('is-admin') === 'true';
  }

  protected async initComponent(): Promise<void> {
    this.brandingAndPortalUrl = this.reportConfigService.brandingAndPortalUrl;
    await this.loadReports();
    await this.loadNamedQueries();
  }

  async loadReports(): Promise<void> {
    this.reports = await this.reportConfigService.list();
    this.applyFilter();
  }

  async loadNamedQueries(): Promise<void> {
    try {
      this.namedQueries = await this.reportConfigService.listNamedQueries();
    } catch (error: unknown) {
      this.loggerService.warn('Failed to load named queries for report config', error);
      this.namedQueries = [];
    }
  }

  applyFilter(): void {
    const search = this.searchText.toLowerCase();
    this.filteredReports = this.reports.filter(report => {
      const matchesSource = this.sourceFilter === 'all' || report.reportSource === this.sourceFilter;
      const matchesSearch =
        report.title.toLowerCase().includes(search) ||
        report.name.toLowerCase().includes(search) ||
        report.reportSource.toLowerCase().includes(search);
      return matchesSource && matchesSearch;
    });
  }

  setSourceFilter(source: 'all' | 'database' | 'solr'): void {
    this.sourceFilter = source;
    this.applyFilter();
  }

  openReport(report: ReportConfigDto): string {
    return `${this.brandingAndPortalUrl}/admin/report/${report.name}`;
  }

  createReport(): void {
    if (this.isSaving || this.isDeleting) return;
    this.modalTrigger = document.activeElement as HTMLElement;
    this.errorMessage = '';
    this.previewResult = null;
    this.previewFilterValues = {};
    this.selectedReport = this.newReport();
    this.isNewReport = true;
  }

  editReport(report: ReportConfigDto): void {
    if (this.isSaving || this.isDeleting) return;
    const trigger = document.activeElement as HTMLElement;
    this.modalTrigger = trigger?.closest('details')?.querySelector('summary') ?? trigger;
    this.errorMessage = '';
    this.previewResult = null;
    this.previewFilterValues = {};
    this.selectedReport = JSON.parse(JSON.stringify(report)) as ReportConfigDto;
    this.isNewReport = false;
  }

  cancelEdit(): void {
    if (this.isSaving) return;
    this.selectedReport = null;
    this.previewResult = null;
    this.previewFilterValues = {};
    this.errorMessage = '';
    this.isNewReport = false;
    this.restoreModalFocus();
  }

  async saveReport(): Promise<void> {
    if (!this.selectedReport || this.isSaving || this.isDeleting) {
      return;
    }
    const report = this.selectedReport;
    this.isSaving = true;
    this.errorMessage = '';
    try {
      if (this.isNewReport) {
        await this.reportConfigService.create(report);
      } else {
        await this.reportConfigService.update(report);
      }
      await this.loadReports();
      if (this.selectedReport === report) {
        this.isSaving = false;
        this.cancelEdit();
      }
    } catch (error: unknown) {
      if (this.selectedReport === report) this.errorMessage = this.getErrorMessage(error);
      this.loggerService.error('Failed to save report config', error);
    } finally {
      this.isSaving = false;
    }
  }

  requestDelete(report: ReportConfigDto): void {
    if (this.isSaving || this.isDeleting) return;
    const trigger = document.activeElement as HTMLElement;
    this.modalTrigger = trigger?.closest('details')?.querySelector('summary') ?? trigger;
    this.errorMessage = '';
    this.pendingDelete = report;
  }

  cancelDelete(): void {
    if (this.isDeleting) return;
    this.pendingDelete = null;
    this.errorMessage = '';
    this.restoreModalFocus();
  }

  async deleteReport(report: ReportConfigDto): Promise<void> {
    if (this.isDeleting || this.isSaving || report.readOnly || !report.canDelete || this.pendingDelete !== report) return;
    this.isDeleting = true;
    this.errorMessage = '';
    try {
      await this.reportConfigService.delete(report.name);
      await this.loadReports();
      if (this.pendingDelete === report) {
        this.isDeleting = false;
        this.cancelDelete();
      }
    } catch (error: unknown) {
      if (this.pendingDelete === report) this.errorMessage = this.getErrorMessage(error);
    } finally {
      this.isDeleting = false;
    }
  }

  async previewReport(): Promise<void> {
    if (!this.selectedReport || this.isSaving || this.isDeleting) {
      return;
    }
    this.isPreviewing = true;
    this.errorMessage = '';
    this.previewResult = null;
    try {
      this.previewResult = await this.reportConfigService.preview(this.selectedReport, this.previewFilterValues);
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error);
    } finally {
      this.isPreviewing = false;
    }
  }

  addColumn(): void {
    this.selectedReport?.columns.push({ label: '', property: '', hide: false, exportTemplate: '', template: '', multivalue: false });
  }

  removeColumn(index: number): void {
    this.selectedReport?.columns.splice(index, 1);
  }

  addFilter(): void {
    this.selectedReport?.filter.push({ type: 'text', paramName: '', property: '', message: '', database: null });
  }

  removeFilter(index: number): void {
    this.selectedReport?.filter.splice(index, 1);
  }

  filterTypeChanged(filter: ReportConfigFilterDto): void {
    filter.database = filter.type === 'date-range' ? { fromProperty: '', toProperty: '' } : null;
  }

  isExistingReport(): boolean {
    return this.reports.some(report => report.name === this.selectedReport?.name);
  }

  trackByIndex(index: number): number {
    return index;
  }

  private restoreModalFocus(): void {
    const trigger = this.modalTrigger;
    setTimeout(() => {
      const target = trigger && document.contains(trigger) ? trigger :
        this.elementRef.nativeElement.querySelector('.rb-admin-page-actions button');
      target?.focus();
    }, 0);
  }

  private newReport(): ReportConfigDto {
    return {
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
      canPreview: true
    };
  }

  private getErrorMessage(error: unknown): string {
    const response = error as { error?: { message?: string } };
    return response.error?.message ?? (error instanceof Error ? error.message : 'An unexpected error occurred');
  }
}
