import { Component, ElementRef, Inject } from '@angular/core';
import {
  AuditFieldChange,
  BaseComponent,
  IntegrationAuditTraceEvent,
  IntegrationAuditTraceRecord,
  IntegrationAuditTabResponse,
  LoggerService,
  RecordAuditTabResponse,
  RecordPermissionsSummary,
  RecordService,
  TranslationService,
} from '@researchdatabox/portal-ng-common';

type RecordAuditTabName = 'audit' | 'permissions' | 'integration';

@Component({
  selector: 'record-audit',
  templateUrl: './record-audit.component.html',
  styleUrls: ['./record-audit.component.scss'],
  standalone: false,
})
export class RecordAuditComponent extends BaseComponent {
  title = '@researchdatabox/record-audit';
  oid = '';
  branding = '';
  portal = '';
  isAdmin = false;
  activeTab: RecordAuditTabName = 'audit';

  auditTab: {
    loading: boolean;
    error: string;
    summary: { returnedCount: number };
    rawAuditUrl: string;
    records: Array<RecordAuditTabResponse['records'][number] & { expanded?: boolean; technicalExpanded?: boolean }>;
  } = {
      loading: true,
      error: '',
      summary: { returnedCount: 0 },
      rawAuditUrl: '',
      records: [],
    };

  permissionsTab: {
    loaded: boolean;
    loading: boolean;
    error: string;
    data: RecordPermissionsSummary | null;
  } = {
      loaded: false,
      loading: false,
      error: '',
      data: null,
    };

  integrationTab: {
    loaded: boolean;
    loading: boolean;
    error: string;
    data: IntegrationAuditTabResponse;
    expandedTraces: Record<string, boolean>;
    expandedEvents: Record<string, boolean>;
  } = {
      loaded: false,
      loading: false,
      error: '',
      data: { summary: { numFound: 0, page: 1, pageSize: 20, totalPages: 0 }, records: [] },
      expandedTraces: {},
      expandedEvents: {},
    };

  constructor(
    private readonly elementRef: ElementRef,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    @Inject(TranslationService) public readonly translationService: TranslationService,
    @Inject(RecordService) private readonly recordService: RecordService,
  ) {
    super();
    this.initDependencies = [this.translationService, this.recordService];
    this.oid = elementRef.nativeElement.getAttribute('oid') || '';
    this.branding = elementRef.nativeElement.getAttribute('branding') || '';
    this.portal = elementRef.nativeElement.getAttribute('portal') || '';
    this.isAdmin = elementRef.nativeElement.getAttribute('is-admin') === 'true';
  }

  protected override async initComponent(): Promise<void> {
    this.loggerService.debug(`Initialising record audit for ${this.oid}`);
    await this.loadAuditTab();
  }

  async activateTab(tab: RecordAuditTabName) {
    this.activeTab = tab;
    if (tab === 'permissions' && this.isAdmin && !this.permissionsTab.loaded && !this.permissionsTab.loading) {
      await this.loadPermissionsTab();
    }
    if (tab === 'integration' && this.isAdmin && !this.integrationTab.loaded && !this.integrationTab.loading) {
      await this.loadIntegrationTab();
    }
  }

  async loadAuditTab() {
    this.auditTab.loading = true;
    this.auditTab.error = '';
    try {
      const response = await this.recordService.getRecordAuditTab(this.oid);
      this.auditTab.summary = response.summary;
      this.auditTab.rawAuditUrl = response.rawAuditUrl;
      this.auditTab.records = response.records.map(record => ({ ...record, expanded: false, technicalExpanded: false }));
    } catch (_error) {
      this.auditTab.error = '@record-audit-error';
    } finally {
      this.auditTab.loading = false;
    }
  }

  async loadPermissionsTab() {
    if (this.permissionsTab.loading) {
      return;
    }
    this.permissionsTab.loading = true;
    this.permissionsTab.error = '';
    try {
      this.permissionsTab.data = await this.recordService.getRecordPermissionsTab(this.oid);
      this.permissionsTab.loaded = true;
    } catch (_error) {
      this.permissionsTab.error = '@record-audit-error';
    } finally {
      this.permissionsTab.loading = false;
    }
  }

  async loadIntegrationTab(page = 1) {
    if (this.integrationTab.loading) {
      return;
    }
    this.integrationTab.loading = true;
    this.integrationTab.error = '';
    try {
      this.integrationTab.data = await this.recordService.getRecordIntegrationAuditTab(this.oid, {
        page,
        pageSize: this.integrationTab.data.summary.pageSize || 20,
      });
      this.integrationTab.expandedTraces = {};
      this.integrationTab.expandedEvents = {};
      this.integrationTab.loaded = true;
    } catch (_error) {
      this.integrationTab.error = '@record-audit-error';
    } finally {
      this.integrationTab.loading = false;
    }
  }

  toggleDiff(rowId: string) {
    const row = this.auditTab.records.find(record => record.id === rowId);
    if (row) {
      row.expanded = !row.expanded;
    }
  }

  toggleAuditTechnical(rowId: string) {
    const row = this.auditTab.records.find(record => record.id === rowId);
    if (row) {
      row.technicalExpanded = !row.technicalExpanded;
    }
  }

  toggleIntegrationTrace(traceId: string) {
    this.integrationTab.expandedTraces[traceId] = !this.integrationTab.expandedTraces[traceId];
  }

  toggleIntegrationTechnical(eventId: string) {
    this.integrationTab.expandedEvents[eventId] = !this.integrationTab.expandedEvents[eventId];
  }

  formatChangedFields(changeSummary: { count: number }) {
    return this.translationService.t('@record-audit-changed-fields-count', { count: changeSummary.count });
  }

  noteText(noteKey?: string) {
    return noteKey ? this.translationService.t(noteKey) : '';
  }

  changeKindLabel(change: AuditFieldChange) {
    return change.kind.charAt(0).toUpperCase() + change.kind.slice(1);
  }

  changeTrackBy(_index: number, change: AuditFieldChange) {
    return `${change.pathText}:${change.kind}`;
  }

  canGoToPreviousPage() {
    return this.integrationTab.data.summary.page > 1 && !this.integrationTab.loading;
  }

  canGoToNextPage() {
    return this.integrationTab.data.summary.page < this.integrationTab.data.summary.totalPages && !this.integrationTab.loading;
  }

  /**
   * Format an ISO timestamp into a human-readable date string.
   */
  formatTimestamp(isoString: string | null | undefined): string {
    if (!isoString) return '-';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  }

  /**
   * Return a relative time string like "2 hours ago" or "3 days ago".
   */
  formatRelativeTime(isoString: string | null | undefined): string {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return '';
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      if (diffMs < 0) return ''; // Future date
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffSecs / 60);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      const diffMonths = Math.floor(diffDays / 30);
      const diffYears = Math.floor(diffDays / 365);

      if (diffSecs < 60) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 30) return `${diffDays}d ago`;
      if (diffMonths < 12) return `${diffMonths}mo ago`;
      return `${diffYears}y ago`;
    } catch {
      return '';
    }
  }

  /**
   * Return a Bootstrap badge class based on the action label key.
   */
  getActionBadgeClass(actionLabelKey: string): string {
    if (actionLabelKey.includes('created')) return 'text-bg-success';
    if (actionLabelKey.includes('updated')) return 'text-bg-info';
    if (actionLabelKey.includes('deleted')) return 'text-bg-danger';
    if (actionLabelKey.includes('destroyed')) return 'text-bg-danger';
    if (actionLabelKey.includes('restored')) return 'text-bg-warning';
    return 'text-bg-secondary';
  }

  /**
   * Return a Font Awesome icon class based on the action label key.
   */
  getActionIcon(actionLabelKey: string): string {
    if (actionLabelKey.includes('created')) return 'fa-solid fa-plus';
    if (actionLabelKey.includes('updated')) return 'fa-solid fa-pen';
    if (actionLabelKey.includes('deleted')) return 'fa-solid fa-trash';
    if (actionLabelKey.includes('destroyed')) return 'fa-solid fa-xmark';
    if (actionLabelKey.includes('restored')) return 'fa-solid fa-rotate-left';
    return 'fa-solid fa-circle-info';
  }

  /**
   * Return a CSS class for the change kind in the diff table.
   */
  getChangeKindClass(change: AuditFieldChange): string {
    switch (change.kind) {
      case 'change': return 'rb-diff-change';
      case 'add': return 'rb-diff-add';
      case 'delete': return 'rb-diff-remove';
      default: return '';
    }
  }

  /**
   * Return a Font Awesome icon class for a change kind.
   */
  getChangeKindIcon(change: AuditFieldChange): string {
    switch (change.kind) {
      case 'change': return 'fa-solid fa-right-left';
      case 'add': return 'fa-solid fa-circle-plus';
      case 'delete': return 'fa-solid fa-circle-minus';
      default: return 'fa-solid fa-circle';
    }
  }

  /**
   * Return a Bootstrap badge class for integration audit status.
   */
  getStatusBadgeClass(status: string): string {
    switch (status?.toLowerCase()) {
      case 'success': return 'text-bg-success';
      case 'failed':
      case 'error': return 'text-bg-danger';
      case 'started':
      case 'pending':
      case 'in_progress': return 'text-bg-warning';
      default: return 'text-bg-secondary';
    }
  }

  formatDuration(durationMs: number | null | undefined): string {
    if (durationMs == null || Number.isNaN(durationMs)) {
      return '-';
    }
    if (durationMs < 1000) {
      return `${durationMs}ms`;
    }
    const totalSeconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) {
      return `${seconds}s`;
    }
    return `${minutes}m ${seconds}s`;
  }

  formatTraceActions(actions: string[] | null | undefined): string {
    return actions != null && actions.length > 0 ? actions.join(', ') : '-';
  }

  getIntegrationTraceLabel(trace: IntegrationAuditTraceRecord): string {
    return trace.traceId || trace.id || '-';
  }

  getIntegrationEventIndent(event: IntegrationAuditTraceEvent): string {
    const depth = Number.isFinite(event.depth) ? event.depth : 0;
    return `${Math.max(0, depth) * 20}px`;
  }
}
