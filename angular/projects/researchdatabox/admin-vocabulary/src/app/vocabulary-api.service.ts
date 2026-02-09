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

  public async list(): Promise<VocabularySummary[]> {
    const url = `${this.brandingAndPortalUrl}/api/vocabulary`;
    const response = await firstValueFrom(
      this.http.get<ApiResponse<{ data?: VocabularySummary[] }> | { data?: VocabularySummary[] }>(url, this.getJsonRequestOptions())
    );
    const maybeV2 = response as ApiResponse<{ data?: VocabularySummary[] }>;
    if (maybeV2 && typeof maybeV2 === 'object' && 'data' in maybeV2 && maybeV2.data && Array.isArray(maybeV2.data.data)) {
      return maybeV2.data.data;
    }

    const maybeV1 = response as { data?: VocabularySummary[] };
    if (maybeV1 && typeof maybeV1 === 'object' && Array.isArray(maybeV1.data)) {
      return maybeV1.data;
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
