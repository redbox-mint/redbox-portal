import { Inject, Injectable } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClient, HttpContext } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService, HttpClientService, UtilityService } from '@researchdatabox/portal-ng-common';

export interface VocabularySummary {
  id: string;
  name: string;
  slug: string;
  type: 'flat' | 'tree';
  source: 'local' | 'rva';
  sourceId?: string;
}

export interface VocabularyEntry {
  id?: string;
  label: string;
  value: string;
  historical?: boolean;
  parent?: string | null;
  identifier?: string;
  order?: number;
  children?: VocabularyEntry[];
}

export interface VocabularyDetail {
  id?: string;
  name: string;
  description?: string;
  slug?: string;
  type: 'flat' | 'tree';
  source: 'local' | 'rva';
  sourceId?: string;
  sourceVersionId?: string;
  owner?: string;
  entries?: VocabularyEntry[];
}

export interface VocabularyListQuery {
  q?: string;
  type?: 'flat' | 'tree';
  source?: 'local' | 'rva';
  limit?: number;
  offset?: number;
  sort?: string;
}

export interface VocabularyListMeta {
  total: number;
  limit: number;
  offset: number;
}

interface ListAPISummary {
  numFound?: number;
  page?: number;
  start?: number;
}

interface ListAPIResponse<T> {
  summary?: ListAPISummary;
  records?: T[];
}

export interface VocabularyListResult {
  data: VocabularySummary[];
  meta: VocabularyListMeta;
}

type ApiResponse<T> = { data: T };
type JsonRequestOptions = { responseType: 'json'; observe: 'body'; context: HttpContext };

@Injectable()
export class VocabularyApiService extends HttpClientService {
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

  private getJsonRequestOptions(): JsonRequestOptions {
    return {
      ...(this.reqOptsJsonBodyOnly as { responseType: 'json'; observe: 'body' }),
      context: this.httpContext
    };
  }

  private unwrap<T>(response: ApiResponse<T> | T): T {
    const maybeWrapped = response as ApiResponse<T>;
    if (maybeWrapped && typeof maybeWrapped === 'object' && 'data' in maybeWrapped && typeof maybeWrapped.data !== 'undefined') {
      return maybeWrapped.data;
    }
    return response as T;
  }

  private describeUnexpectedResponse(response: unknown): string {
    try {
      return JSON.stringify(response);
    } catch (_err) {
      return String(response);
    }
  }

  public async list(query: VocabularyListQuery = {}): Promise<VocabularyListResult> {
    const url = `${this.brandingAndPortalUrl}/api/vocabulary`;
    const params: Record<string, string> = {};
    if (query.q && query.q.trim()) {
      params['q'] = query.q.trim();
    }
    if (query.type) {
      params['type'] = query.type;
    }
    if (query.source) {
      params['source'] = query.source;
    }
    if (typeof query.limit === 'number' && Number.isFinite(query.limit)) {
      params['limit'] = String(query.limit);
    }
    if (typeof query.offset === 'number' && Number.isFinite(query.offset)) {
      params['offset'] = String(query.offset);
    }
    if (query.sort && query.sort.trim()) {
      params['sort'] = query.sort.trim();
    }

    const response = await firstValueFrom(
      this.http.get<
        ApiResponse<ListAPIResponse<VocabularySummary>> |
        ListAPIResponse<VocabularySummary> |
        ApiResponse<VocabularyListResult> |
        VocabularyListResult |
        ApiResponse<{ data?: VocabularySummary[]; meta?: VocabularyListMeta }> |
        { data?: VocabularySummary[]; meta?: VocabularyListMeta }
      >(url, {
        ...this.getJsonRequestOptions(),
        params
      })
    );

    const asWrapped = response as ApiResponse<VocabularyListResult>;
    if (
      asWrapped &&
      typeof asWrapped === 'object' &&
      'data' in asWrapped &&
      asWrapped.data &&
      Array.isArray(asWrapped.data.data) &&
      asWrapped.data.meta
    ) {
      return asWrapped.data;
    }

    const listApiWrapped = response as ApiResponse<ListAPIResponse<VocabularySummary>>;
    if (
      listApiWrapped &&
      typeof listApiWrapped === 'object' &&
      'data' in listApiWrapped &&
      listApiWrapped.data &&
      Array.isArray(listApiWrapped.data.records)
    ) {
      const records = listApiWrapped.data.records;
      const summary = listApiWrapped.data.summary ?? {};
      const offset = Number(summary.start ?? query.offset ?? 0);
      const limit = Number(query.limit ?? records.length ?? 25);
      return {
        data: records,
        meta: {
          total: Number(summary.numFound ?? records.length),
          limit,
          offset
        }
      };
    }

    const listApiDirect = response as ListAPIResponse<VocabularySummary>;
    if (listApiDirect && typeof listApiDirect === 'object' && Array.isArray(listApiDirect.records)) {
      const records = listApiDirect.records;
      const summary = listApiDirect.summary ?? {};
      const offset = Number(summary.start ?? query.offset ?? 0);
      const limit = Number(query.limit ?? records.length ?? 25);
      return {
        data: records,
        meta: {
          total: Number(summary.numFound ?? records.length),
          limit,
          offset
        }
      };
    }

    const asDirect = response as VocabularyListResult;
    if (asDirect && typeof asDirect === 'object' && Array.isArray(asDirect.data) && asDirect.meta) {
      return asDirect;
    }

    const legacyWrapped = response as ApiResponse<{ data?: VocabularySummary[]; meta?: VocabularyListMeta }>;
    if (
      legacyWrapped &&
      typeof legacyWrapped === 'object' &&
      'data' in legacyWrapped &&
      legacyWrapped.data &&
      Array.isArray(legacyWrapped.data.data)
    ) {
      return {
        data: legacyWrapped.data.data,
        meta: legacyWrapped.data.meta ?? { total: legacyWrapped.data.data.length, limit: legacyWrapped.data.data.length, offset: 0 }
      };
    }

    const legacyDirect = response as { data?: VocabularySummary[]; meta?: VocabularyListMeta };
    if (legacyDirect && typeof legacyDirect === 'object' && Array.isArray(legacyDirect.data)) {
      return {
        data: legacyDirect.data,
        meta: legacyDirect.meta ?? { total: legacyDirect.data.length, limit: legacyDirect.data.length, offset: 0 }
      };
    }

    throw new Error(`Unexpected response from ${url}: ${this.describeUnexpectedResponse(response)}`);
  }

  public async get(id: string): Promise<{ vocabulary: VocabularyDetail; entries: VocabularyEntry[] }> {
    const url = `${this.brandingAndPortalUrl}/api/vocabulary/${id}`;
    const response = await firstValueFrom(
      this.http.get<ApiResponse<{ vocabulary: VocabularyDetail; entries: VocabularyEntry[] }> | { vocabulary: VocabularyDetail; entries: VocabularyEntry[] }>(
        url,
        this.getJsonRequestOptions()
      )
    );
    return this.unwrap<{ vocabulary: VocabularyDetail; entries: VocabularyEntry[] }>(response);
  }

  public async create(payload: VocabularyDetail): Promise<VocabularyDetail> {
    const url = `${this.brandingAndPortalUrl}/api/vocabulary`;
    const response = await firstValueFrom(this.http.post<ApiResponse<VocabularyDetail> | VocabularyDetail>(url, payload, this.getJsonRequestOptions()));
    return this.unwrap<VocabularyDetail>(response);
  }

  public async update(id: string, payload: Partial<VocabularyDetail>): Promise<VocabularyDetail> {
    const url = `${this.brandingAndPortalUrl}/api/vocabulary/${id}`;
    const response = await firstValueFrom(this.http.put<ApiResponse<VocabularyDetail> | VocabularyDetail>(url, payload, this.getJsonRequestOptions()));
    return this.unwrap<VocabularyDetail>(response);
  }

  public async delete(id: string): Promise<void> {
    const url = `${this.brandingAndPortalUrl}/api/vocabulary/${id}`;
    await firstValueFrom(this.http.delete(url, this.getJsonRequestOptions()));
  }

  public async importRva(rvaId: string, versionId?: string): Promise<VocabularyDetail> {
    const url = `${this.brandingAndPortalUrl}/api/vocabulary/import`;
    const response = await firstValueFrom(
      this.http.post<ApiResponse<VocabularyDetail> | VocabularyDetail>(url, { rvaId, versionId }, this.getJsonRequestOptions())
    );
    return this.unwrap<VocabularyDetail>(response);
  }

  public async sync(id: string, versionId?: string): Promise<{ created: number; updated: number; skipped: number; lastSyncedAt: string }> {
    const url = `${this.brandingAndPortalUrl}/api/vocabulary/${id}/sync`;
    const response = await firstValueFrom(
      this.http.post<
        ApiResponse<{ created: number; updated: number; skipped: number; lastSyncedAt: string }> | { created: number; updated: number; skipped: number; lastSyncedAt: string }
      >(
        url,
        { versionId },
        this.getJsonRequestOptions()
      )
    );
    return this.unwrap<{ created: number; updated: number; skipped: number; lastSyncedAt: string }>(response);
  }
}
