import { normalizeSiemConfiguration } from '@researchdatabox/sails-ng-common';
import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
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

@Component({
  selector: 'siem-admin',
  templateUrl: './siem-admin.component.html',
  styleUrls: ['./siem-admin.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
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
  private configLoaded = false;

  loading = false;
  saving = false;
  loadError = '';
  saveError = '';
  saveSuccess = false;
  lastSavedAt = '';

  selectedDestinationId = '';
  private headerEntriesById: Record<string, HeaderEntry[]> = {};

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
    await Promise.all([this.loadConfig(), this.loadEvents(0), this.loadDelivery(0)]);
  }

  public setActiveTab(tab: TabId): void {
    this.activeTab = tab;
  }

  // ─── Config loading & saving ───

  private async loadConfig(): Promise<void> {
    this.loading = true;
    this.configLoaded = false;
    this.loadError = '';
    try {
      const config = await this.siemApiService.getSiemConfig();
      this.applyConfig(this.normalizeConfig(config));
      this.configLoaded = true;
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
    for (const destination of this.draft.destinations) {
      this.headerEntriesById[destination.id] = this.objectToEntries(destination.headers);
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

  public canSave(): boolean {
    return this.configLoaded && !this.loading && !this.saving && this.isDirty();
  }

  public async save(): Promise<void> {
    if (!this.canSave()) {
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
   * editing models back into each destination.
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

  public changeAdapter(destination: SiemDestinationConfig, adapter: SiemAdapterType): void {
    destination.adapterType = adapter;
    // Hidden credentials cannot be replaced or cleared from the new adapter's form.
    if (!this.showsTokenField(adapter)) {
      delete destination.token;
    }
    if (!this.showsUsernamePasswordFields(adapter)) {
      delete destination.username;
      delete destination.password;
    }
  }

  public showsTokenField(adapter: SiemAdapterType): boolean {
    return adapter === 'splunk-hec-json' || adapter === 'otel-otlp-logs';
  }

  public showsUsernamePasswordFields(adapter: SiemAdapterType): boolean {
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
        offset: this.eventSkip,
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
        offset: this.deliverySkip,
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
    return normalizeSiemConfiguration(config ?? {});
  }

  private createDefaultConfig(): SiemConfiguration {
    return normalizeSiemConfiguration({});
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
      const nestedError: unknown = Reflect.get(error, 'error');
      const detail: unknown =
        nestedError && typeof nestedError === 'object' ? Reflect.get(nestedError, 'detail') : undefined;
      const message: unknown =
        (nestedError && typeof nestedError === 'object' ? Reflect.get(nestedError, 'message') : undefined) ??
        Reflect.get(error, 'message');
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
