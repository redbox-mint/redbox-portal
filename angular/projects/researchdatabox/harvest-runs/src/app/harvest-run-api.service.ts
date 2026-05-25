import { APP_BASE_HREF } from '@angular/common';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfigService, HttpClientService, UtilityService } from '@researchdatabox/portal-ng-common';

export interface ListApiSummary {
  numFound: number;
  page: number;
  start: number;
}

export interface ListApiResponse<T> {
  summary: ListApiSummary;
  records: T[];
}

export interface HarvestRunSummary {
  id?: string;
  sourceRunId: string;
  brandId?: string;
  recordType: string;
  sourceName: string;
  sourceUri?: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  startedBy?: string;
  lastChunkAt?: string;
  totalProcessed: number;
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  failed: number;
  chunksProcessed: number;
  duplicateChunks: number;
}

export interface HarvestRunChunkSummary {
  id?: string;
  runId?: string;
  brandId?: string;
  recordType?: string;
  sourceRunId?: string;
  contentHash: string;
  attempt?: number;
  chunkIndex?: number;
  chunkLabel?: string;
  totalExpected?: number;
  status: string;
  recordCount: number;
  totalProcessed: number;
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  failed: number;
  duplicate: boolean;
  submittedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface HarvestRunEvent {
  id?: string;
  runId?: string;
  chunkId?: string;
  brandId?: string;
  recordType?: string;
  sourceRunId?: string;
  harvestId: string;
  oid?: string;
  operation: string;
  outcome: string;
  status: boolean;
  message?: string;
  details?: string;
  errorCode?: string;
  createdAt: string;
}

export interface HarvestRunAggregateCounts {
  totalProcessed: number;
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  failed: number;
  chunksProcessed: number;
  duplicateChunks: number;
}

export interface HarvestRunDetail {
  run: HarvestRunSummary;
  chunks: HarvestRunChunkSummary[];
  events: HarvestRunEvent[];
  aggregateCounts: HarvestRunAggregateCounts;
}

export interface HarvestRunListQuery {
  status?: string;
  recordType?: string;
  sourceName?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface HarvestRunEventsQuery {
  outcome?: string;
  operation?: string;
  harvestId?: string;
  oid?: string;
  page?: number;
  pageSize?: number;
}

type MaybeWrapped<T> = T | { data: T };

@Injectable()
export class HarvestRunApiService extends HttpClientService {
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

  public async listRuns(query: HarvestRunListQuery = {}): Promise<ListApiResponse<HarvestRunSummary>> {
    await this.waitForInit();
    const response = await firstValueFrom(this.http.get<MaybeWrapped<ListApiResponse<HarvestRunSummary>>>(
      this.apiUrl(),
      {
        ...this.getJsonRequestOptions(),
        params: this.toHttpParams(query)
      }
    ));
    return this.normalizeList(this.unwrap(response));
  }

  public async getRun(id: string): Promise<HarvestRunDetail> {
    await this.waitForInit();
    const response = await firstValueFrom(this.http.get<MaybeWrapped<HarvestRunDetail>>(
      this.apiUrl(`/${encodeURIComponent(id)}`),
      this.getJsonRequestOptions()
    ));
    return this.unwrap(response);
  }

  public async listRunEvents(id: string, query: HarvestRunEventsQuery = {}): Promise<ListApiResponse<HarvestRunEvent>> {
    await this.waitForInit();
    const response = await firstValueFrom(this.http.get<MaybeWrapped<ListApiResponse<HarvestRunEvent>>>(
      this.apiUrl(`/${encodeURIComponent(id)}/events`),
      {
        ...this.getJsonRequestOptions(),
        params: this.toHttpParams(query)
      }
    ));
    return this.normalizeList(this.unwrap(response));
  }

  private apiUrl(path = ''): string {
    return `${this.brandingAndPortalUrl}/api/harvest-runs${path}`;
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

  private normalizeList<T>(response: Partial<ListApiResponse<T>> | null | undefined): ListApiResponse<T> {
    const records = Array.isArray(response?.records) ? response.records : [];
    return {
      summary: {
        numFound: Number(response?.summary?.numFound ?? records.length),
        page: Number(response?.summary?.page ?? 1),
        start: Number(response?.summary?.start ?? 0)
      },
      records
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
