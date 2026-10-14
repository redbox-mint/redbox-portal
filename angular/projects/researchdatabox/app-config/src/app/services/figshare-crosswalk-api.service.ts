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
 * Reads the Figshare crosswalk and vocabulary options offered by crosswalk bindings.
 * All requests are brand scoped server-side; the browser never sees Figshare credentials.
 *
 * Results are memoised: a Figshare publishing config renders one binding editor per
 * bound field, so without this every page load would fire dozens of identical requests.
 */
@Injectable()
export class FigshareCrosswalkApiService extends HttpClientService {
  private crosswalksPromise?: Promise<FigshareCrosswalkOption[]>;
  private vocabulariesPromise?: Promise<FigshareLocalVocabularyOption[]>;
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

  /**
   * Approved, same-brand crosswalks, memoised across binding editors. Callers filter
   * by local vocabulary client-side, so the unfiltered list is fetched once.
   */
  public async listAllApprovedCrosswalks(): Promise<FigshareCrosswalkOption[]> {
    this.crosswalksPromise = this.crosswalksPromise ?? this.listApprovedCrosswalks().catch((error) => {
      this.crosswalksPromise = undefined;
      throw error;
    });
    return this.crosswalksPromise;
  }

  /** Local vocabulary options, memoised across binding editors. */
  public async listAllLocalVocabularies(): Promise<FigshareLocalVocabularyOption[]> {
    this.vocabulariesPromise = this.vocabulariesPromise ?? this.listLocalVocabularies().catch((error) => {
      this.vocabulariesPromise = undefined;
      throw error;
    });
    return this.vocabulariesPromise;
  }

  /** Drop the memoised lists so the next read re-fetches. */
  public refresh(): void {
    this.crosswalksPromise = undefined;
    this.vocabulariesPromise = undefined;
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
