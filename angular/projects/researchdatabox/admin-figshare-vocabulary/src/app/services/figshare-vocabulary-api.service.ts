import { Inject, Injectable } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClient, HttpContext } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService, HttpClientService, UtilityService } from '@researchdatabox/portal-ng-common';

export type FigshareScope = 'public' | 'account';

export interface FigshareTaxonomySummary {
  taxonomyId: string;
  title: string;
  categoryCount: number;
  selectableCount: number;
  missingParentCount: number;
}

export interface FigshareSourceSummary {
  id: string;
  displayName: string;
  scope: FigshareScope | string;
  taxonomyId: string;
  vocabularyId: string;
  vocabularyName: string;
  lastSyncedAt: string | null;
  archived: boolean;
  mirroredCount: number;
  historicalCount: number;
  crosswalkCount: number;
}

export interface FigsharePreviewSummary {
  added: number;
  changed: number;
  removed: number;
  reappeared: number;
  unchanged: number;
  proposed: number;
  preselected: number;
  unresolved: number;
  historicalWarnings: number;
}

export interface FigshareProposalRow {
  proposalId: string;
  localEntryId: string;
  localLabel: string;
  localValue: string;
  localIdentifier?: string;
  targetSourceId: string;
  targetCategoryId: number;
  targetTitle: string;
  matchType: 'exact-code' | 'identity' | 'label-suggestion' | 'manual' | 'historical';
  preselected: boolean;
  historical: boolean;
}

export interface FigshareDiffRow {
  changeClass: 'added' | 'changed' | 'removed' | 'reappeared' | 'unchanged';
  sourceId: string;
  title: string;
  categoryId?: number;
  previousCategoryId?: number;
  previousTitle?: string;
}

export interface FigsharePreview {
  runId: string;
  state: string;
  scope: string;
  taxonomyId: string;
  sourceId: string | null;
  localVocabularyId: string | null;
  crosswalkId: string | null;
  createLocalClone: boolean;
  baseHash: string;
  remoteHash: string;
  expiresAt: string;
  normalizerVersion: string;
  summary: FigsharePreviewSummary;
  warnings: unknown[];
}

export interface FigsharePagedPreview extends FigsharePreview {
  page: {
    view: 'proposals' | 'diff';
    records: Array<FigshareProposalRow | FigshareDiffRow>;
    total: number;
    limit: number;
    offset: number;
  };
  unresolved: Array<{ localEntryId: string; localLabel: string; localValue: string }>;
}

export interface FigshareCrosswalkSummary {
  id: string;
  name: string;
  status: 'draft' | 'approved' | 'archived' | string;
  workingRevision: number;
  approvedRevision: number | null;
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

export interface FigshareCrosswalkMapping {
  id: string;
  revision: number;
  status: string;
  matchType: string;
  localEntryId: string;
  localLabel: string;
  localValue: string;
  figshareCategoryId: string;
  figshareSourceId: string;
  figshareCategoryNumber: number | null;
  historical: boolean;
  approvedAt: string | null;
  approvedBy: string | null;
}

export interface FigshareSyncRunSummary {
  id: string;
  state: string;
  scope: string;
  taxonomyId: string;
  sourceId: string | null;
  summary: Partial<FigsharePreviewSummary>;
  requestedBy: string;
  appliedBy: string | null;
  appliedAt: string | null;
  expiresAt: string;
  errorCode: string | null;
}

export interface FigshareApplyResult {
  runId: string;
  state: string;
  sourceId: string;
  vocabularyId: string;
  localVocabularyId: string | null;
  crosswalkId: string | null;
  crosswalkRevision: number | null;
  categories: { created: number; updated: number; historical: number; reappeared: number };
  mappings: { created: number; removed: number };
  cloneCreated: boolean;
  appliedAt: string;
}

export interface FigshareLocalVocabulary {
  id: string;
  name: string;
  slug: string;
  source: string;
}

export interface PagedResult<T> {
  records: T[];
  total: number;
}

interface ListEnvelope<T> {
  summary?: { numFound?: number; start?: number; page?: number };
  records?: T[];
}

type ApiResponse<T> = { data: T };
type JsonRequestOptions = { responseType: 'json'; observe: 'body'; context: HttpContext };

/**
 * Typed access to the Admin-only Figshare vocabulary REST contract.
 *
 * The browser only ever selects a scope; base URLs and API tokens are resolved
 * server-side from trusted configuration and never travel to the client.
 */
@Injectable()
export class FigshareVocabularyApiService extends HttpClientService {
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
    const wrapped = response as ApiResponse<T>;
    if (wrapped && typeof wrapped === 'object' && 'data' in wrapped && typeof wrapped.data !== 'undefined') {
      return wrapped.data;
    }
    return response as T;
  }

  private unwrapList<T>(response: unknown): PagedResult<T> {
    const envelope = this.unwrap<ListEnvelope<T>>(response as ApiResponse<ListEnvelope<T>>);
    const records = Array.isArray(envelope?.records) ? envelope.records : [];
    return { records, total: Number(envelope?.summary?.numFound ?? records.length) };
  }

  private get figshareUrl(): string {
    return `${this.brandingAndPortalUrl}/api/figshare-vocabularies`;
  }

  private get crosswalkUrl(): string {
    return `${this.brandingAndPortalUrl}/api/figshare-crosswalks`;
  }

  public async discoverTaxonomies(scope: FigshareScope): Promise<FigshareTaxonomySummary[]> {
    const response = await firstValueFrom(
      this.http.get(`${this.figshareUrl}/catalogues`, { ...this.getJsonRequestOptions(), params: { scope } })
    );
    return this.unwrap<FigshareTaxonomySummary[]>(response as ApiResponse<FigshareTaxonomySummary[]>) ?? [];
  }

  public async listSources(scope?: string): Promise<PagedResult<FigshareSourceSummary>> {
    const params: Record<string, string> = {};
    if (scope) {
      params['scope'] = scope;
    }
    const response = await firstValueFrom(
      this.http.get(`${this.figshareUrl}/sources`, { ...this.getJsonRequestOptions(), params })
    );
    return this.unwrapList<FigshareSourceSummary>(response);
  }

  public async listSyncRuns(sourceId?: string): Promise<PagedResult<FigshareSyncRunSummary>> {
    const params: Record<string, string> = {};
    if (sourceId) {
      params['sourceId'] = sourceId;
    }
    const response = await firstValueFrom(
      this.http.get(`${this.figshareUrl}/sync-runs`, { ...this.getJsonRequestOptions(), params })
    );
    return this.unwrapList<FigshareSyncRunSummary>(response);
  }

  public async listLocalVocabularies(): Promise<FigshareLocalVocabulary[]> {
    const response = await firstValueFrom(
      this.http.get(`${this.brandingAndPortalUrl}/api/vocabulary`, {
        ...this.getJsonRequestOptions(),
        params: { limit: '200' }
      })
    );
    return this.unwrapList<FigshareLocalVocabulary>(response).records
      .filter((vocabulary) => vocabulary.source !== 'external');
  }

  public async createPreview(input: {
    scope: FigshareScope;
    taxonomyId: string;
    sourceId?: string;
    crosswalkId?: string;
    localVocabularyId?: string;
    createLocalClone?: boolean;
    localCloneName?: string;
    localCloneSlug?: string;
  }): Promise<FigsharePreview> {
    const response = await firstValueFrom(
      this.http.post(`${this.figshareUrl}/previews`, input, this.getJsonRequestOptions())
    );
    return this.unwrap<FigsharePreview>(response as ApiResponse<FigsharePreview>);
  }

  public async createSourcePreview(sourceId: string, body: { localVocabularyId?: string; crosswalkId?: string }): Promise<FigsharePreview> {
    const response = await firstValueFrom(
      this.http.post(`${this.figshareUrl}/sources/${encodeURIComponent(sourceId)}/preview`, body, this.getJsonRequestOptions())
    );
    return this.unwrap<FigsharePreview>(response as ApiResponse<FigsharePreview>);
  }

  public async cloneSource(sourceId: string, body: { name: string; slug?: string }): Promise<{ localVocabularyId: string; crosswalkId: string; entries: number }> {
    const response = await firstValueFrom(
      this.http.post(`${this.figshareUrl}/sources/${encodeURIComponent(sourceId)}/clone`, body, this.getJsonRequestOptions())
    );
    return this.unwrap(response as ApiResponse<{ localVocabularyId: string; crosswalkId: string; entries: number }>);
  }

  public async getPreview(runId: string, query: {
    view?: 'proposals' | 'diff';
    changeClass?: string;
    matchType?: string;
    q?: string;
    unresolvedOnly?: boolean;
    historicalOnly?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<FigsharePagedPreview> {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params[key] = String(value);
      }
    }
    const response = await firstValueFrom(
      this.http.get(`${this.figshareUrl}/previews/${encodeURIComponent(runId)}`, {
        ...this.getJsonRequestOptions(),
        params
      })
    );
    return this.unwrap<FigsharePagedPreview>(response as ApiResponse<FigsharePagedPreview>);
  }

  public async applyPreview(runId: string, body: {
    remoteHash: string;
    expectedRevision?: number;
    approvedProposalIds: string[];
    manualMappings?: Array<{ localEntryId?: string; localEntryKey?: string; figshareSourceIds: string[] }>;
  }): Promise<FigshareApplyResult> {
    const response = await firstValueFrom(
      this.http.post(`${this.figshareUrl}/previews/${encodeURIComponent(runId)}/apply`, body, this.getJsonRequestOptions())
    );
    return this.unwrap<FigshareApplyResult>(response as ApiResponse<FigshareApplyResult>);
  }

  public async listCrosswalks(query: { status?: string; sourceId?: string; localVocabularyId?: string } = {}): Promise<PagedResult<FigshareCrosswalkSummary>> {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
      if (value) {
        params[key] = String(value);
      }
    }
    const response = await firstValueFrom(
      this.http.get(this.crosswalkUrl, { ...this.getJsonRequestOptions(), params })
    );
    return this.unwrapList<FigshareCrosswalkSummary>(response);
  }

  public async getCrosswalk(id: string): Promise<FigshareCrosswalkSummary> {
    const response = await firstValueFrom(
      this.http.get(`${this.crosswalkUrl}/${encodeURIComponent(id)}`, this.getJsonRequestOptions())
    );
    return this.unwrap<FigshareCrosswalkSummary>(response as ApiResponse<FigshareCrosswalkSummary>);
  }

  public async getCrosswalkUsage(id: string): Promise<Array<{ brandName: string; configKey: string; resolutionMode: string }>> {
    const response = await firstValueFrom(
      this.http.get(`${this.crosswalkUrl}/${encodeURIComponent(id)}/usage`, this.getJsonRequestOptions())
    );
    return this.unwrap(response as ApiResponse<Array<{ brandName: string; configKey: string; resolutionMode: string }>>) ?? [];
  }

  public async listMappings(id: string, query: { q?: string; status?: string; revision?: number; limit?: number; offset?: number } = {}): Promise<PagedResult<FigshareCrosswalkMapping>> {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params[key] = String(value);
      }
    }
    const response = await firstValueFrom(
      this.http.get(`${this.crosswalkUrl}/${encodeURIComponent(id)}/mappings`, { ...this.getJsonRequestOptions(), params })
    );
    return this.unwrapList<FigshareCrosswalkMapping>(response);
  }

  public async saveMappings(id: string, body: {
    revision: number;
    changes: Array<{ op: 'add' | 'remove'; localEntryId: string; figshareCategoryId: string; matchType?: string; status?: string }>;
  }): Promise<FigshareCrosswalkSummary> {
    const response = await firstValueFrom(
      this.http.put(`${this.crosswalkUrl}/${encodeURIComponent(id)}/mappings`, body, this.getJsonRequestOptions())
    );
    return this.unwrap<FigshareCrosswalkSummary>(response as ApiResponse<FigshareCrosswalkSummary>);
  }

  public async approveCrosswalk(id: string, revision: number): Promise<FigshareCrosswalkSummary> {
    const response = await firstValueFrom(
      this.http.post(`${this.crosswalkUrl}/${encodeURIComponent(id)}/approve`, { revision }, this.getJsonRequestOptions())
    );
    return this.unwrap<FigshareCrosswalkSummary>(response as ApiResponse<FigshareCrosswalkSummary>);
  }

  public async deleteCrosswalk(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.crosswalkUrl}/${encodeURIComponent(id)}`, this.getJsonRequestOptions())
    );
  }
}
