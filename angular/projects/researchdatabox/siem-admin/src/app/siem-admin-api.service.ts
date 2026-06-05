import { APP_BASE_HREF } from '@angular/common';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfigService, HttpClientService, UtilityService } from '@researchdatabox/portal-ng-common';

/**
 * Placeholder sent by the backend in place of stored secret values. When a draft
 * is saved with this value, the backend keeps the existing secret unchanged.
 * Mirrors `APP_CONFIG_SECRET_MASK` in the server-side AppConfigService.
 */
export const SIEM_SECRET_MASK = '__REDACTED__';

export type SiemAdapterType =
  | 'splunk-hec-json'
  | 'otel-otlp-logs'
  | 'syslog-rfc5424-json'
  | 'cef'
  | 'leef';

export type SiemEventCategory =
  | 'authentication'
  | 'authorization'
  | 'userManagement'
  | 'recordLifecycle'
  | 'integrationAudit'
  | 'attachmentAccess';

export type SiemSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface SiemRetryConfig {
  maxAttempts?: number;
  retryDelayMs?: number;
  retryBackoffMultiplier?: number;
}

export interface SiemDestinationConfig {
  id: string;
  name: string;
  enabled: boolean;
  adapterType: SiemAdapterType;
  endpointUrl: string;
  token?: string;
  username?: string;
  password?: string;
  headers?: Record<string, string>;
  formatOptions?: Record<string, unknown>;
  timeoutMs?: number;
  retry?: SiemRetryConfig;
}

export interface SiemEventSelectionConfig {
  categories: Record<SiemEventCategory, boolean>;
  severity: Record<string, SiemSeverity>;
}

export interface SiemRedactionConfig {
  denylistedPaths: string[];
  maxPayloadBytes: number;
  includeActorEmail: boolean;
  includeIpAddress: boolean;
  includeUserAgent: boolean;
}

export interface SiemDeliveryConfig {
  batchSize: number;
  maxAttempts: number;
  retryDelayMs: number;
  retryBackoffMultiplier: number;
  deadLetterRetentionDays: number;
  nonBlocking: boolean;
}

export interface SiemConfiguration {
  enabled: boolean;
  destinations: SiemDestinationConfig[];
  events: SiemEventSelectionConfig;
  redaction: SiemRedactionConfig;
  delivery: SiemDeliveryConfig;
}

export interface SiemListResponse<T> {
  rows: T[];
  total: number;
}

export interface SecurityEventRow {
  id?: string;
  eventId?: string;
  brandId?: string;
  portalId?: string;
  eventType?: string;
  category?: string;
  severity?: string;
  occurredAt?: string;
  source?: string;
  deliveryState?: string;
  correlationId?: string;
  traceId?: string;
}

export interface SiemDeliveryAttemptRow {
  id?: string;
  eventId?: string;
  brandId?: string;
  destinationId?: string;
  adapterType?: string;
  attemptNumber?: number;
  status?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  httpStatusCode?: number;
  responseSummary?: Record<string, unknown>;
  errorSummary?: Record<string, unknown>;
}

export interface SiemTestResult {
  status: 'success' | 'failed';
  httpStatusCode?: number;
  durationMs?: number;
  responseSummary?: Record<string, unknown>;
  errorSummary?: Record<string, unknown>;
}

export interface SiemEventsQuery {
  brandId?: string;
  eventType?: string;
  category?: string;
  deliveryState?: string;
  limit?: number;
  skip?: number;
}

export interface SiemDeliveryStatusQuery {
  brandId?: string;
  destinationId?: string;
  status?: string;
  limit?: number;
  skip?: number;
}

export interface SiemTestInput {
  destination: SiemDestinationConfig;
  redaction?: Partial<SiemRedactionConfig>;
}

type MaybeWrapped<T> = T | { data: T };

@Injectable()
export class SiemAdminApiService extends HttpClientService {
  constructor(
    @Inject(HttpClient) http: HttpClient,
    @Inject(APP_BASE_HREF) rootContext: string,
    @Inject(UtilityService) utilService: UtilityService,
    @Inject(ConfigService) configService: ConfigService
  ) {
    super(http, rootContext, utilService, configService);
  }

  public override async waitForInit(): Promise<this> {
    await super.waitForInit();
    this.enableCsrfHeader();
    return this;
  }

  public getBrandingAndPortalUrl(): string {
    return this.brandingAndPortalUrl;
  }

  public async getSiemConfig(): Promise<SiemConfiguration | null> {
    await this.waitForInit();
    const response = await firstValueFrom(this.http.get<MaybeWrapped<SiemConfiguration | null>>(
      this.apiUrl('/config'),
      this.getJsonRequestOptions()
    ));
    return this.unwrap(response);
  }

  public async saveSiemConfig(config: SiemConfiguration): Promise<SiemConfiguration | null> {
    await this.waitForInit();
    const response = await firstValueFrom(this.http.put<MaybeWrapped<SiemConfiguration | null>>(
      this.apiUrl('/config'),
      config,
      this.getJsonRequestOptions()
    ));
    return this.unwrap(response);
  }

  public async getEvents(query: SiemEventsQuery = {}): Promise<SiemListResponse<SecurityEventRow>> {
    await this.waitForInit();
    const response = await firstValueFrom(this.http.get<MaybeWrapped<SiemListResponse<SecurityEventRow>>>(
      this.apiUrl('/events'),
      {
        ...this.getJsonRequestOptions(),
        params: this.toHttpParams(query)
      }
    ));
    return this.normalizeList(this.unwrap(response));
  }

  public async getDeliveryStatus(query: SiemDeliveryStatusQuery = {}): Promise<SiemListResponse<SiemDeliveryAttemptRow>> {
    await this.waitForInit();
    const response = await firstValueFrom(this.http.get<MaybeWrapped<SiemListResponse<SiemDeliveryAttemptRow>>>(
      this.apiUrl('/delivery-status'),
      {
        ...this.getJsonRequestOptions(),
        params: this.toHttpParams(query)
      }
    ));
    return this.normalizeList(this.unwrap(response));
  }

  public async testDestination(input: SiemTestInput): Promise<SiemTestResult> {
    await this.waitForInit();
    const response = await firstValueFrom(this.http.post<MaybeWrapped<SiemTestResult>>(
      this.apiUrl('/test'),
      input,
      this.getJsonRequestOptions()
    ));
    return this.unwrap(response);
  }

  private apiUrl(path = ''): string {
    return `${this.brandingAndPortalUrl}/api/siem${path}`;
  }

  private getJsonRequestOptions(): { responseType: 'json'; observe: 'body'; context: HttpContext } {
    return {
      ...(this.reqOptsJsonBodyOnly as { responseType: 'json'; observe: 'body' }),
      context: this.httpContext
    };
  }

  private unwrap<T>(response: MaybeWrapped<T>): T {
    const maybeWrapped = response as { data?: T };
    if (maybeWrapped && typeof maybeWrapped === 'object' && typeof maybeWrapped.data !== 'undefined') {
      return maybeWrapped.data as T;
    }
    return response as T;
  }

  private normalizeList<T>(response: Partial<SiemListResponse<T>> | null | undefined): SiemListResponse<T> {
    const rows = Array.isArray(response?.rows) ? response.rows : [];
    return {
      rows,
      total: Number(response?.total ?? rows.length)
    };
  }

  private toHttpParams(query: object): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
      if (value === undefined || value === null) {
        continue;
      }

      const normalized = typeof value === 'string' ? value.trim() : value;
      if (normalized === '') {
        continue;
      }

      params = params.set(key, String(normalized));
    }
    return params;
  }
}
