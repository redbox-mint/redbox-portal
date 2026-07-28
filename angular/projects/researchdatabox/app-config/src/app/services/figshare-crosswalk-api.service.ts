import { Inject, Injectable } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClient, HttpContext } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService, HttpClientService, UtilityService } from '@researchdatabox/portal-ng-common';

export interface FigshareCrosswalkOption {
  id: string;
  name: string;
  status: string;
  workingRevision: number;
  approvedRevision?: number | null;
  approvedAt?: string;
  approvedBy?: string;
  localVocabularyId: string;
  localVocabularyName: string;
  figshareSourceId: string;
  figshareSourceName: string;
  scope: string;
  taxonomyId: string;
  approvedMappingCount: number;
  workingMappingCount: number;
  historicalTargetCount: number;
}

export interface FigshareLocalVocabularyOption {
  id: string;
  name: string;
  slug: string;
  source: string;
}

interface ListEnvelope<T> {
  summary?: { numFound?: number; start?: number; page?: number };
  records?: T[];
}

type ApiResponse<T> = { data: T };
type JsonRequestOptions = { responseType: 'json'; observe: 'body'; context: HttpContext };

/**
 * Reads the Figshare crosswalk and vocabulary options offered by the Categories panel.
 * All requests are brand scoped server-side; the browser never sees Figshare credentials.
 */
@Injectable()
export class FigshareCrosswalkApiService extends HttpClientService {
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

  private unwrapRecords<T>(response: unknown): T[] {
    const wrapped = response as ApiResponse<ListEnvelope<T>> | undefined;
    if (wrapped && typeof wrapped === 'object' && 'data' in wrapped && Array.isArray(wrapped.data?.records)) {
      return wrapped.data.records as T[];
    }
    const direct = response as ListEnvelope<T> | undefined;
    if (direct && Array.isArray(direct.records)) {
      return direct.records;
    }
    return [];
  }

  /** Approved, same-brand crosswalks. Optionally restricted to one local vocabulary. */
  public async listApprovedCrosswalks(localVocabularyId?: string): Promise<FigshareCrosswalkOption[]> {
    const url = `${this.brandingAndPortalUrl}/api/figshare-crosswalks`;
    const params: Record<string, string> = { status: 'approved', limit: '200' };
    if (localVocabularyId && localVocabularyId.trim()) {
      params['localVocabularyId'] = localVocabularyId.trim();
    }
    const response = await firstValueFrom(
      this.http.get(url, { ...this.getJsonRequestOptions(), params })
    );
    return this.unwrapRecords<FigshareCrosswalkOption>(response);
  }

  /** Local and RVA vocabularies that may act as the local side of a crosswalk. */
  public async listLocalVocabularies(): Promise<FigshareLocalVocabularyOption[]> {
    const url = `${this.brandingAndPortalUrl}/api/vocabulary`;
    const response = await firstValueFrom(
      this.http.get(url, { ...this.getJsonRequestOptions(), params: { limit: '200' } })
    );
    return this.unwrapRecords<FigshareLocalVocabularyOption>(response)
      .filter((vocabulary) => vocabulary.source !== 'external');
  }

  public getCrosswalkAdminUrl(): string {
    return `${this.brandingAndPortalUrl}/admin/integrations/figshare/vocabularies`;
  }
}
