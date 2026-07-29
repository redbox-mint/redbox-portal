import { Component, Inject } from '@angular/core';
import { DateTime } from 'luxon';
import { BaseComponent, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import {
  SecurityEventRow,
  SiemAdapterType,
  SiemAdminApiService,
  SiemConfiguration,
  SiemDeliveryAttemptRow,
  SiemDeliveryStatusQuery,
  SiemDestinationConfig,
  SiemEventCategory,
  SiemEventsQuery,
  SiemListResponse,
} from './siem-admin-api.service';

type TabId = 'overview' | 'destinations' | 'policy';

interface HeaderEntry {
  key: string;
  value: string;
}

interface AdapterOption {
  value: SiemAdapterType;
  label: string;
}

interface CategoryOption {
  key: SiemEventCategory;
  labelKey: string;
}

interface TestState {
  status: 'success' | 'failed';
  httpStatusCode?: number;
  durationMs?: number;
  responseSummary?: string;
  errorSummary?: string;
}

const DEFAULT_EVENT_SELECTION = (): SiemConfiguration['events'] => ({
  categories: {
    authentication: true,
    authorization: true,
    userManagement: true,
    recordLifecycle: true,
    integrationAudit: true,
    attachmentAccess: true,
  },
  severity: {},
});

const DEFAULT_REDACTION = (): SiemConfiguration['redaction'] => ({
  denylistedPaths: [],
  maxPayloadBytes: 64 * 1024,
  includeActorEmail: false,
  includeIpAddress: false,
  includeUserAgent: false,
});

const DEFAULT_DELIVERY = (): SiemConfiguration['delivery'] => ({
  batchSize: 50,
  maxAttempts: 3,
  retryDelayMs: 60 * 1000,
  retryBackoffMultiplier: 2,
  deadLetterRetentionDays: 30,
  nonBlocking: true,
});

@Component({
  selector: 'siem-admin',
  templateUrl: './siem-admin.component.html',
  styleUrls: ['./siem-admin.component.scss'],
  standalone: false
})
export class SiemAdminComponent extends BaseComponent {
  readonly displayDateFormat = 'dd/MM/yyyy HH:mm';
  readonly eventPageSize = 25;
  readonly deliveryPageSize = 25;

  readonly adapterOptions: AdapterOption[] = [
    { value: 'splunk-hec-json', label: 'Splunk HEC JSON' },
    { value: 'otel-otlp-logs', label: 'OTLP Logs' },
    { value: 'syslog-rfc5424-json', label: 'Syslog RFC5424 JSON' },
    { value: 'cef', label: 'CEF' },
    { value: 'leef', label: 'LEEF' },
  ];

  readonly categoryOptions: CategoryOption[] = [
    { key: 'authentication', labelKey: 'siem-category-authentication' },
    { key: 'authorization', labelKey: 'siem-category-authorization' },
    { key: 'userManagement', labelKey: 'siem-category-userManagement' },
    { key: 'recordLifecycle', labelKey: 'siem-category-recordLifecycle' },
    { key: 'integrationAudit', labelKey: 'siem-category-integrationAudit' },
    { key: 'attachmentAccess', labelKey: 'siem-category-attachmentAccess' },
  ];

  activeTab: TabId = 'overview';

  draft: SiemConfiguration = this.createDefaultConfig();
  private savedSnapshot = '';

  loading = false;
  saving = false;
  loadError = '';
  saveError = '';
  saveSuccess = false;
  lastSavedAt = '';

  selectedDestinationId = '';
  private headerEntriesById: Record<string, HeaderEntry[]> = {};
  private formatOptionsTextById: Record<string, string> = {};
  formatOptionsErrorById: Record<string, string> = {};

  testStateById: Record<string, TestState> = {};
  testErrorById: Record<string, string> = {};
  testingById: Record<string, boolean> = {};

  eventFilters: SiemEventsQuery = this.createEmptyEventFilters();
  eventResponse: SiemListResponse<SecurityEventRow> = { rows: [], total: 0 };
  eventSkip = 0;
  loadingEvents = false;
  eventsError = '';

  deliveryFilters: SiemDeliveryStatusQuery = this.createEmptyDeliveryFilters();
  deliveryResponse: SiemListResponse<SiemDeliveryAttemptRow> = { rows: [], total: 0 };
  deliverySkip = 0;
  loadingDelivery = false;
  deliveryError = '';

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(SiemAdminApiService) private siemApiService: SiemAdminApiService
  ) {
    super();
    this.initDependencies = [this.translationService, this.siemApiService];
  }

  protected async initComponent(): Promise<void> {
    await this.refresh();
  }

  public async refresh(): Promise<void> {
    await Promise.all([
      this.loadConfig(),
      this.loadEvents(0),
      this.loadDelivery(0),
    ]);
  }

  public setActiveTab(tab: TabId): void {
    this.activeTab = tab;
  }

  // ─── Config loading & saving ───

  private async loadConfig(): Promise<void> {
    this.loading = true;
    this.loadError = '';
    try {
      const config = await this.siemApiService.getSiemConfig();
      this.applyConfig(this.normalizeConfig(config));
    } catch (error) {
      this.loadError = this.getErrorMessage(error, 'siem-load-error');
      this.loggerService.error(this.loadError);
    } finally {
      this.loading = false;
    }
  }

  private applyConfig(config: SiemConfiguration): void {
    this.draft = config;
    this.headerEntriesById = {};
    this.formatOptionsTextById = {};
    this.formatOptionsErrorById = {};
    for (const destination of this.draft.destinations) {
      this.headerEntriesById[destination.id] = this.objectToEntries(destination.headers);
      this.formatOptionsTextById[destination.id] = this.stringifyFormatOptions(destination.formatOptions);
    }
    if (this.draft.destinations.length > 0) {
      const stillSelected = this.draft.destinations.some(d => d.id === this.selectedDestinationId);
      if (!stillSelected) {
        this.selectedDestinationId = this.draft.destinations[0].id;
      }
    } else {
      this.selectedDestinationId = '';
    }
    this.savedSnapshot = JSON.stringify(this.buildConfig());
  }

  public isDirty(): boolean {
    return JSON.stringify(this.buildConfig()) !== this.savedSnapshot;
  }

  public hasFormatOptionsError(): boolean {
    return Object.values(this.formatOptionsErrorById).some(error => !!error);
  }

  public canSave(): boolean {
    return !this.loading && !this.saving && this.isDirty() && !this.hasFormatOptionsError();
  }

  public async save(): Promise<void> {
    if (this.saving || this.hasFormatOptionsError()) {
      return;
    }
    this.saving = true;
    this.saveError = '';
    this.saveSuccess = false;
    try {
      const payload = this.buildConfig();
      const saved = await this.siemApiService.saveSiemConfig(payload);
      this.applyConfig(this.normalizeConfig(saved ?? payload));
      this.saveSuccess = true;
      this.lastSavedAt = DateTime.now().toFormat(this.displayDateFormat);
    } catch (error) {
      this.saveError = this.getErrorMessage(error, 'siem-save-error');
      this.loggerService.error(this.saveError);
    } finally {
      this.saving = false;
    }
  }

  /**
   * Builds the canonical configuration, merging the per-destination header and
   * formatOptions editing models back into each destination.
   */
  public buildConfig(): SiemConfiguration {
    return {
      enabled: !!this.draft.enabled,
      destinations: this.draft.destinations.map(destination => this.buildDestination(destination)),
      events: this.draft.events,
      redaction: this.draft.redaction,
      delivery: this.draft.delivery,
    };
  }

  private buildDestination(destination: SiemDestinationConfig): SiemDestinationConfig {
    const built: SiemDestinationConfig = { ...destination };
    const headers = this.entriesToObject(this.headerEntriesById[destination.id]);
    if (headers) {
      built.headers = headers;
    } else {
      delete built.headers;
    }
    const formatOptions = this.parseFormatOptions(destination.id);
    if (formatOptions) {
      built.formatOptions = formatOptions;
    } else {
      delete built.formatOptions;
    }
    return built;
  }

  // ─── Destinations ───

  get selectedDestination(): SiemDestinationConfig | null {
    return this.draft.destinations.find(d => d.id === this.selectedDestinationId) ?? null;
  }

  public selectDestination(id: string): void {
    this.selectedDestinationId = id;
    this.activeTab = 'destinations';
  }

  public addDestination(): void {
    const id = this.generateId();
    const destination: SiemDestinationConfig = {
      id,
      name: this.translationService.t('siem-destination-default-name'),
      enabled: true,
      adapterType: 'splunk-hec-json',
      endpointUrl: '',
      timeoutMs: 10000,
    };
    this.draft.destinations = [...this.draft.destinations, destination];
    this.headerEntriesById[id] = [];
    this.formatOptionsTextById[id] = '';
    this.selectedDestinationId = id;
    this.activeTab = 'destinations';
  }

  public removeDestination(id: string): void {
    const destination = this.draft.destinations.find(d => d.id === id);
    const name = destination?.name || id;
    const message = this.translationService.t('siem-destination-remove-confirm').replace('{name}', name);
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(message)) {
      return;
    }
    this.draft.destinations = this.draft.destinations.filter(d => d.id !== id);
    delete this.headerEntriesById[id];
    delete this.formatOptionsTextById[id];
    delete this.formatOptionsErrorById[id];
    delete this.testStateById[id];
    delete this.testErrorById[id];
    delete this.testingById[id];
    if (this.selectedDestinationId === id) {
      this.selectedDestinationId = this.draft.destinations[0]?.id ?? '';
    }
  }

  public moveDestination(id: string, direction: -1 | 1): void {
    const index = this.draft.destinations.findIndex(d => d.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= this.draft.destinations.length) {
      return;
    }
    const destinations = [...this.draft.destinations];
    const [moved] = destinations.splice(index, 1);
    destinations.splice(target, 0, moved);
    this.draft.destinations = destinations;
  }

  public showsTokenField(adapter: SiemAdapterType): boolean {
    return adapter === 'splunk-hec-json' || adapter === 'otel-otlp-logs';
  }

  public showsUsernamePasswordFields(adapter: SiemAdapterType): boolean {
    return adapter === 'syslog-rfc5424-json' || adapter === 'cef' || adapter === 'leef';
  }

  public showsFormatOptionsField(adapter: SiemAdapterType): boolean {
    return adapter === 'syslog-rfc5424-json' || adapter === 'cef' || adapter === 'leef';
  }

  public getAdapterLabel(adapter?: string): string {
    return this.adapterOptions.find(option => option.value === adapter)?.label ?? String(adapter ?? '');
  }

  // ─── Header editing ───

  public getHeaderEntries(id: string): HeaderEntry[] {
    if (!this.headerEntriesById[id]) {
      this.headerEntriesById[id] = [];
    }
    return this.headerEntriesById[id];
  }

  public addHeader(id: string): void {
    this.getHeaderEntries(id).push({ key: '', value: '' });
  }

  public removeHeader(id: string, index: number): void {
    const entries = this.getHeaderEntries(id);
    entries.splice(index, 1);
  }

  // ─── formatOptions editing ───

  public getFormatOptionsText(id: string): string {
    return this.formatOptionsTextById[id] ?? '';
  }

  public updateFormatOptionsText(id: string, value: string): void {
    this.formatOptionsTextById[id] = value;
    this.parseFormatOptions(id);
  }

  private parseFormatOptions(id: string): Record<string, unknown> | undefined {
    const text = (this.formatOptionsTextById[id] ?? '').trim();
    if (!text) {
      this.formatOptionsErrorById[id] = '';
      return undefined;
    }
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        this.formatOptionsErrorById[id] = '';
        return parsed as Record<string, unknown>;
      }
      this.formatOptionsErrorById[id] = this.translationService.t('siem-format-options-error');
      return undefined;
    } catch {
      this.formatOptionsErrorById[id] = this.translationService.t('siem-format-options-error');
      return undefined;
    }
  }

  // ─── Redaction denylist editing ───

  public addDenylistPath(): void {
    this.draft.redaction.denylistedPaths = [...this.draft.redaction.denylistedPaths, ''];
  }

  public removeDenylistPath(index: number): void {
    this.draft.redaction.denylistedPaths = this.draft.redaction.denylistedPaths.filter((_, i) => i !== index);
  }

  public trackByIndex(index: number): number {
    return index;
  }

  // ─── Destination testing ───

  public async testDestination(id: string): Promise<void> {
    const destination = this.draft.destinations.find(d => d.id === id);
    if (!destination) {
      return;
    }
    this.testingById[id] = true;
    this.testErrorById[id] = '';
    delete this.testStateById[id];
    try {
      const result = await this.siemApiService.testDestination({
        destination: this.buildDestination(destination),
        redaction: this.draft.redaction,
      });
      this.testStateById[id] = {
        status: result.status,
        httpStatusCode: result.httpStatusCode,
        durationMs: result.durationMs,
        responseSummary: this.summarize(result.responseSummary),
        errorSummary: this.formatErrorSummary(result.errorSummary),
      };
    } catch (error) {
      this.testErrorById[id] = this.getErrorMessage(error, 'siem-test-error');
      this.loggerService.error(this.testErrorById[id]);
    } finally {
      this.testingById[id] = false;
    }
  }

  // ─── Monitoring ───

  public async applyEventFilters(event?: Event): Promise<void> {
    event?.preventDefault();
    await this.loadEvents(0);
  }

  public async clearEventFilters(): Promise<void> {
    this.eventFilters = this.createEmptyEventFilters();
    await this.loadEvents(0);
  }

  public async loadEvents(skip: number): Promise<void> {
    this.loadingEvents = true;
    this.eventsError = '';
    this.eventSkip = Math.max(skip, 0);
    try {
      this.eventResponse = await this.siemApiService.getEvents({
        eventType: this.eventFilters.eventType,
        category: this.eventFilters.category,
        deliveryState: this.eventFilters.deliveryState,
        limit: this.eventPageSize,
        skip: this.eventSkip,
      });
    } catch (error) {
      this.eventsError = this.getErrorMessage(error, 'siem-events-error');
      this.eventResponse = { rows: [], total: 0 };
      this.loggerService.error(this.eventsError);
    } finally {
      this.loadingEvents = false;
    }
  }

  public async applyDeliveryFilters(event?: Event): Promise<void> {
    event?.preventDefault();
    await this.loadDelivery(0);
  }

  public async clearDeliveryFilters(): Promise<void> {
    this.deliveryFilters = this.createEmptyDeliveryFilters();
    await this.loadDelivery(0);
  }

  public async loadDelivery(skip: number): Promise<void> {
    this.loadingDelivery = true;
    this.deliveryError = '';
    this.deliverySkip = Math.max(skip, 0);
    try {
      this.deliveryResponse = await this.siemApiService.getDeliveryStatus({
        destinationId: this.deliveryFilters.destinationId,
        status: this.deliveryFilters.status,
        limit: this.deliveryPageSize,
        skip: this.deliverySkip,
      });
    } catch (error) {
      this.deliveryError = this.getErrorMessage(error, 'siem-delivery-error');
      this.deliveryResponse = { rows: [], total: 0 };
      this.loggerService.error(this.deliveryError);
    } finally {
      this.loadingDelivery = false;
    }
  }

  public async onEventPagePrev(): Promise<void> {
    if (this.eventSkip <= 0) {
      return;
    }
    await this.loadEvents(this.eventSkip - this.eventPageSize);
  }

  public async onEventPageNext(): Promise<void> {
    if (this.eventSkip + this.eventPageSize >= this.eventResponse.total) {
      return;
    }
    await this.loadEvents(this.eventSkip + this.eventPageSize);
  }

  public async onDeliveryPagePrev(): Promise<void> {
    if (this.deliverySkip <= 0) {
      return;
    }
    await this.loadDelivery(this.deliverySkip - this.deliveryPageSize);
  }

  public async onDeliveryPageNext(): Promise<void> {
    if (this.deliverySkip + this.deliveryPageSize >= this.deliveryResponse.total) {
      return;
    }
    await this.loadDelivery(this.deliverySkip + this.deliveryPageSize);
  }

  // ─── Summary counts ───

  public get destinationCount(): number {
    return this.draft.destinations.length;
  }

  public get deliveredCount(): number {
    return this.deliveryResponse.rows.filter(row => row.status === 'success').length;
  }

  public get failedCount(): number {
    return this.deliveryResponse.rows.filter(row => row.status === 'failed').length;
  }

  public get deadLetterCount(): number {
    return this.eventResponse.rows.filter(row => row.deliveryState === 'deadLetter').length;
  }

  // ─── Display helpers ───

  public formatDate(value?: string): string {
    const safeValue = String(value ?? '').trim();
    if (!safeValue) {
      return '';
    }
    const date = DateTime.fromISO(safeValue);
    return date.isValid ? date.toFormat(this.displayDateFormat) : safeValue;
  }

  public getDeliveryStateVariant(state?: string): string {
    switch (String(state ?? '').trim()) {
      case 'delivered':
        return 'success';
      case 'failed':
        return 'danger';
      case 'deadLetter':
        return 'danger';
      case 'partial':
        return 'warning';
      case 'pending':
        return 'info';
      case 'ignored':
        return 'muted';
      default:
        return 'neutral';
    }
  }

  public getAttemptStatusVariant(status?: string): string {
    switch (String(status ?? '').trim()) {
      case 'success':
        return 'success';
      case 'failed':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  public getSeverityVariant(severity?: string): string {
    switch (String(severity ?? '').trim()) {
      case 'critical':
        return 'danger';
      case 'error':
        return 'danger';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'neutral';
    }
  }

  // ─── Internal helpers ───

  private normalizeConfig(config: SiemConfiguration | null | undefined): SiemConfiguration {
    const base = this.createDefaultConfig();
    if (!config || typeof config !== 'object') {
      return base;
    }
    const events = config.events ?? base.events;
    const redaction = config.redaction ?? base.redaction;
    const delivery = config.delivery ?? base.delivery;
    return {
      enabled: !!config.enabled,
      destinations: Array.isArray(config.destinations) ? config.destinations.map(d => ({ ...d })) : [],
      events: {
        categories: { ...base.events.categories, ...(events.categories ?? {}) },
        severity: { ...(events.severity ?? {}) },
      },
      redaction: {
        denylistedPaths: Array.isArray(redaction.denylistedPaths) ? [...redaction.denylistedPaths] : [],
        maxPayloadBytes: Number(redaction.maxPayloadBytes ?? base.redaction.maxPayloadBytes),
        includeActorEmail: !!redaction.includeActorEmail,
        includeIpAddress: !!redaction.includeIpAddress,
        includeUserAgent: !!redaction.includeUserAgent,
      },
      delivery: {
        batchSize: Number(delivery.batchSize ?? base.delivery.batchSize),
        maxAttempts: Number(delivery.maxAttempts ?? base.delivery.maxAttempts),
        retryDelayMs: Number(delivery.retryDelayMs ?? base.delivery.retryDelayMs),
        retryBackoffMultiplier: Number(delivery.retryBackoffMultiplier ?? base.delivery.retryBackoffMultiplier),
        deadLetterRetentionDays: Number(delivery.deadLetterRetentionDays ?? base.delivery.deadLetterRetentionDays),
        nonBlocking: delivery.nonBlocking !== false,
      },
    };
  }

  private createDefaultConfig(): SiemConfiguration {
    return {
      enabled: false,
      destinations: [],
      events: DEFAULT_EVENT_SELECTION(),
      redaction: DEFAULT_REDACTION(),
      delivery: DEFAULT_DELIVERY(),
    };
  }

  private objectToEntries(headers?: Record<string, string>): HeaderEntry[] {
    if (!headers || typeof headers !== 'object') {
      return [];
    }
    return Object.entries(headers).map(([key, value]) => ({ key, value: String(value ?? '') }));
  }

  private entriesToObject(entries?: HeaderEntry[]): Record<string, string> | undefined {
    if (!entries || entries.length === 0) {
      return undefined;
    }
    const result: Record<string, string> = {};
    for (const entry of entries) {
      const key = String(entry.key ?? '').trim();
      if (!key) {
        continue;
      }
      result[key] = String(entry.value ?? '');
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  private stringifyFormatOptions(formatOptions?: Record<string, unknown>): string {
    if (!formatOptions || typeof formatOptions !== 'object' || Object.keys(formatOptions).length === 0) {
      return '';
    }
    return JSON.stringify(formatOptions, null, 2);
  }

  private summarize(value?: Record<string, unknown>): string | undefined {
    if (!value || typeof value !== 'object' || Object.keys(value).length === 0) {
      return undefined;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }

  /**
   * Formats a test error summary for display, keeping the human-readable message
   * but dropping any stack-trace frames the backend may include.
   */
  private formatErrorSummary(value?: Record<string, unknown>): string | undefined {
    if (!value || typeof value !== 'object' || Object.keys(value).length === 0) {
      return undefined;
    }
    const message = value['message'];
    if (typeof message === 'string' && message.trim()) {
      return this.stripStackTrace(message);
    }
    return this.summarize(value);
  }

  private stripStackTrace(text: string): string {
    const lines = text.split('\n');
    const messageLines: string[] = [];
    for (const line of lines) {
      if (/^\s*at\s/.test(line)) {
        break;
      }
      messageLines.push(line);
    }
    return messageLines.join(' ').replace(/\s+/g, ' ').trim();
  }

  private generateId(): string {
    const random = Math.random().toString(36).slice(2, 8);
    return `dest-${Date.now().toString(36)}-${random}`;
  }

  private createEmptyEventFilters(): SiemEventsQuery {
    return {
      eventType: '',
      category: '',
      deliveryState: '',
    };
  }

  private createEmptyDeliveryFilters(): SiemDeliveryStatusQuery {
    return {
      destinationId: '',
      status: '',
    };
  }

  private getErrorMessage(error: unknown, fallbackKey: string): string {
    if (error && typeof error === 'object') {
      const errorRecord = error as Record<string, unknown>;
      const nestedError = errorRecord['error'] as Record<string, unknown> | undefined;
      const detail = nestedError?.['detail'];
      const message = nestedError?.['message'] ?? errorRecord['message'];
      if (typeof detail === 'string' && detail.trim()) {
        return detail;
      }
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }
    return this.translationService.t(fallbackKey);
  }
}
