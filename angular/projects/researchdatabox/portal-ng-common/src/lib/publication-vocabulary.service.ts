import { Inject, Injectable } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from './config.service';
import { HttpClientService } from './httpClient.service';
import { UtilityService } from './utility.service';

export interface PublicationVocabularyCapabilities {
  snapshotImport: boolean;
  figshareScopes: Array<'public' | 'account'>;
  editMappings: boolean;
  approve: boolean;
}
export interface PublicationTargetTerm {
  id: string;
  namespace: string;
  value: string;
  sourceId: string;
  label: string;
  parentId?: string;
  selectable: boolean;
  historical: boolean;
}
export interface PublicationVocabularySource {
  id: string;
  provider: string;
  scope: string;
  catalogueId: string;
  namespace: string;
  displayName: string;
  version: number;
  archived: boolean;
}
export interface PublicationVocabularyEntry {
  id: string;
  label: string;
  value: string;
  codes: string[];
}
export interface PublicationCrosswalkMapping {
  id: string;
  localEntryId: string;
  targetId: string;
  status: 'proposed' | 'approved' | 'rejected';
  matchType: string;
}
export interface PublicationCrosswalkRevision {
  revision: number;
  mappings: PublicationCrosswalkMapping[];
  entries: PublicationVocabularyEntry[];
  targets: PublicationTargetTerm[];
  approvedAt?: string;
  approvedBy?: string;
  digest: string;
  auditReferences: string[];
}
export interface PublicationCrosswalkSummary {
  id: string;
  name: string;
  sourceId: string;
  localVocabularyId: string;
  normalizer: 'exact-v1' | 'figshare-code-v1';
  version: number;
  status: 'draft' | 'approved' | 'archived';
  workingRevision: number;
  approvedRevision?: number;
}
export interface PublicationVocabularyCrosswalk extends PublicationCrosswalkSummary {
  revisions: PublicationCrosswalkRevision[];
}
export interface PublicationSourceSnapshot {
  provider: string;
  scope: string;
  catalogueId: string;
  namespace: string;
  displayName: string;
  terms: Array<Omit<PublicationTargetTerm, 'historical'>>;
}
export interface PublicationSourceImport extends PublicationSourceSnapshot {
  importId: string;
  id?: string;
  expectedVersion?: number;
}
export interface PublicationVocabularyPage<T> {
  data: T[];
  meta: { total: number; offset: number; limit: number };
}
export interface PublicationImportHistory {
  id: string;
  at: string;
  actor: string;
  digest: string;
}
export interface PublicationLocalVocabulary {
  id: string;
  name: string;
  source: string;
  readOnly?: boolean;
}

export function sharedVocabularyAdministrationEnabled(config: unknown): boolean {
  return (
    !!config && typeof config === 'object' && Reflect.get(config, 'publicationVocabularyAdministrationEnabled') === true
  );
}

/** Works on HTTP development hosts too, where crypto.randomUUID is unavailable. */
export function vocabularyOperationId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
}

/** Brand/portal URLs and CSRF context come from the same trusted client configuration as the legacy editor. */
@Injectable()
export class PublicationVocabularyApiService extends HttpClientService {
  constructor(
    @Inject(HttpClient) http: HttpClient,
    @Inject(APP_BASE_HREF) rootContext: string,
    @Inject(UtilityService) util: UtilityService,
    @Inject(ConfigService) config: ConfigService
  ) {
    super(http, rootContext, util, config);
  }
  public override async waitForInit(): Promise<this> {
    await super.waitForInit();
    this.enableCsrfHeader();
    return this;
  }
  get sharedAdministrationEnabled(): boolean {
    return sharedVocabularyAdministrationEnabled(this.getConfig());
  }
  private get url(): string {
    return `${this.brandingAndPortalUrl}/publication-vocabularies`;
  }
  private async get<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    const response = await firstValueFrom(
      this.http.get<{ data: T }>(`${this.url}${path}`, {
        context: this.httpContext,
        headers: { 'X-ReDBox-Api-Version': '2.0' },
        params: query,
      })
    );
    return response.data;
  }
  capabilities(): Promise<PublicationVocabularyCapabilities> {
    return this.get('/capabilities');
  }
  sources(): Promise<PublicationVocabularySource[]> {
    return this.get('/sources');
  }
  sourceHistory(id: string): Promise<PublicationImportHistory[]> {
    return this.get(`/sources/${encodeURIComponent(id)}/history`);
  }
  crosswalks(): Promise<PublicationCrosswalkSummary[]> {
    return this.get('/crosswalks');
  }
  crosswalk(id: string): Promise<PublicationVocabularyCrosswalk> {
    return this.get(`/crosswalks/${encodeURIComponent(id)}`);
  }
  targets(
    id: string,
    q = '',
    offset = 0,
    includeHistorical = false
  ): Promise<PublicationVocabularyPage<PublicationTargetTerm>> {
    return this.get(`/sources/${encodeURIComponent(id)}/terms`, {
      q,
      offset: String(offset),
      limit: '50',
      includeHistorical: String(includeHistorical),
    });
  }
  localEntries(id: string, q = '', offset = 0): Promise<PublicationVocabularyPage<PublicationVocabularyEntry>> {
    return this.get(`/crosswalks/${encodeURIComponent(id)}/local-entries`, { q, offset: String(offset), limit: '50' });
  }
  async localVocabularies(): Promise<PublicationLocalVocabulary[]> {
    const result: PublicationLocalVocabulary[] = [];
    let offset = 0;
    for (;;) {
      const response = await firstValueFrom(
        this.http.get<{
          data: {
            records: PublicationLocalVocabulary[];
            summary: { numFound: number };
          };
        }>(`${this.brandingAndPortalUrl}/api/vocabulary`, {
          context: this.httpContext,
          headers: { 'X-ReDBox-Api-Version': '2.0' },
          params: { limit: '200', offset: String(offset) },
        })
      );
      const page = response.data;
      result.push(...page.records.filter(row => row.source !== 'external' && !row.readOnly));
      offset += page.records.length;
      if (!page.records.length || offset >= page.summary.numFound) return result;
    }
  }
  private async post<T>(path: string, body: object): Promise<T> {
    return (
      await firstValueFrom(
        this.http.post<{ data: T }>(`${this.url}${path}`, body, {
          context: this.httpContext,
          headers: { 'X-ReDBox-Api-Version': '2.0' },
        })
      )
    ).data;
  }
  importSnapshot(input: PublicationSourceImport): Promise<PublicationVocabularySource> {
    return this.post('/sources/import', input);
  }
  importFigshare(input: {
    scope: 'public' | 'account';
    taxonomyId: string;
    importId: string;
    expectedVersion?: number;
  }): Promise<PublicationVocabularySource> {
    return this.post('/figshare/import', input);
  }
  createCrosswalk(input: {
    name: string;
    sourceId: string;
    localVocabularyId: string;
    normalizer: 'exact-v1' | 'figshare-code-v1';
  }): Promise<PublicationVocabularyCrosswalk> {
    return this.post('/crosswalks', input);
  }
  async saveMappings(
    id: string,
    version: number,
    mappings: PublicationCrosswalkMapping[]
  ): Promise<PublicationVocabularyCrosswalk> {
    const body = {
      version,
      mappings: mappings.map(({ id, localEntryId, targetId, status, matchType }) => ({
        id,
        localEntryId,
        targetId,
        status,
        matchType,
      })),
    };
    return (
      await firstValueFrom(
        this.http.put<{ data: PublicationVocabularyCrosswalk }>(
          `${this.url}/crosswalks/${encodeURIComponent(id)}/mappings`,
          body,
          { context: this.httpContext, headers: { 'X-ReDBox-Api-Version': '2.0' } }
        )
      )
    ).data;
  }
  approve(id: string, version: number): Promise<PublicationVocabularyCrosswalk> {
    return this.post(`/crosswalks/${encodeURIComponent(id)}/approve`, { version });
  }
}
