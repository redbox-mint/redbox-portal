import { Inject, Injectable } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClient, HttpContext } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  SavedExplorerQueryPage,
  NamedQueryPromotionDraft,
  NamedQueryDraftRequest,
  NamedQueryPreviewRequest,
  NamedQueryValidation,
  NamedQuerySourceDescription,
  NamedQuerySourcePreview,
  NamedQueryDefinition as SharedNamedQueryDefinition,
  DatabaseNamedQueryDefinition,
  NamedQueryCatalogueEntry,
  NamedQueryConsumer,
  NamedQueryUpdateReview,
  NamedQueryFieldDescription,
  NamedQueryGuidance,
  SchemaTarget,
} from '@researchdatabox/sails-ng-common';
import { ConfigService, HttpClientService, UtilityService } from '@researchdatabox/portal-ng-common';

export type {
  NamedQueryParam,
  RelatedRecordFilterDefinition,
  NamedQueryConsumer,
  NamedQueryUpdateReview,
} from '@researchdatabox/sails-ng-common';
export type NamedQueryDefinition = SharedNamedQueryDefinition & { usedBy?: NamedQueryConsumer[] };
export type NamedQueryDatabaseDefinition = DatabaseNamedQueryDefinition & { usedBy?: NamedQueryConsumer[] };
export type NamedQueryCatalogueRow = NamedQueryCatalogueEntry & { usedBy?: NamedQueryConsumer[] };

type ApiResponse<T> = { data: T };
type JsonRequestOptions = { responseType: 'json'; observe: 'body'; context: HttpContext };

@Injectable()
export class NamedQueryApiService extends HttpClientService {
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
      context: this.httpContext,
    };
  }

  private unwrap<T>(response: ApiResponse<T> | T): T {
    const maybeWrapped = response as ApiResponse<T>;
    if (
      maybeWrapped &&
      typeof maybeWrapped === 'object' &&
      'data' in maybeWrapped &&
      typeof maybeWrapped.data !== 'undefined'
    ) {
      return maybeWrapped.data;
    }
    return response as T;
  }

  private apiUrl(path: string): string {
    return `${this.brandingAndPortalUrl}/api/named-query${path}`;
  }

  async savedQueries(
    filters: { q?: string; mode?: 'visual' | 'graphql'; after?: string } = {}
  ): Promise<SavedExplorerQueryPage> {
    return this.unwrap(
      await firstValueFrom(
        this.http.get<SavedExplorerQueryPage>(this.apiUrl('/editor/saved-queries'), {
          ...this.getJsonRequestOptions(),
          params: filters,
        })
      )
    );
  }
  async fromSavedQuery(id: string, revision: number): Promise<NamedQueryPromotionDraft> {
    return this.unwrap(
      await firstValueFrom(
        this.http.post<NamedQueryPromotionDraft>(
          this.apiUrl('/editor/from-saved-query'),
          { id, revision },
          this.getJsonRequestOptions()
        )
      )
    );
  }
  async graphqlRead(
    document: string,
    variables: Record<string, unknown>,
    operationName?: string
  ): Promise<{ data?: Record<string, unknown>; errors?: unknown[] }> {
    return firstValueFrom(
      this.http.post<{ data?: Record<string, unknown>; errors?: unknown[] }>(
        this.brandingAndPortalUrl + '/api/graphql',
        { query: document, variables, ...(operationName ? { operationName } : {}) },
        this.getJsonRequestOptions()
      )
    );
  }

  async graphqlSchema(): Promise<{ sdl: string }> {
    return this.unwrap(
      await firstValueFrom(
        this.http.get<{ sdl: string }>(this.apiUrl('/editor/graphql-schema'), this.getJsonRequestOptions())
      )
    );
  }
  async reviewUpdate(name: string, definition: NamedQueryDefinition): Promise<NamedQueryUpdateReview> {
    return this.unwrap(
      await firstValueFrom(
        this.http.post<NamedQueryUpdateReview>(
          this.apiUrl(`/${encodeURIComponent(name)}/review-update`),
          { definition },
          this.getJsonRequestOptions()
        )
      )
    );
  }

  async schemaTargets(): Promise<{ recordTypes: SchemaTarget[] }> {
    return this.unwrap(
      await firstValueFrom(
        this.http.get<{ recordTypes: SchemaTarget[] }>(
          this.apiUrl('/editor/schema-targets'),
          this.getJsonRequestOptions()
        )
      )
    );
  }

  async fields(guidance: NamedQueryGuidance): Promise<NamedQueryFieldDescription> {
    const params: Record<string, string> = { collectionName: guidance.collectionName };
    if (guidance.recordType) params['recordType'] = guidance.recordType;
    if (guidance.stage) params['stage'] = guidance.stage;
    return this.unwrap(
      await firstValueFrom(
        this.http.get<NamedQueryFieldDescription>(this.apiUrl('/editor/fields'), {
          ...this.getJsonRequestOptions(),
          params,
        })
      )
    );
  }

  async validate(request: NamedQueryDraftRequest): Promise<NamedQueryValidation> {
    return this.unwrap(
      await firstValueFrom(
        this.http.post<NamedQueryValidation>(this.apiUrl('/editor/validate'), request, this.getJsonRequestOptions())
      )
    );
  }

  async describe(request: NamedQueryDraftRequest): Promise<NamedQuerySourceDescription> {
    return this.unwrap(
      await firstValueFrom(
        this.http.post<NamedQuerySourceDescription>(
          this.apiUrl('/editor/describe'),
          request,
          this.getJsonRequestOptions()
        )
      )
    );
  }

  async preview(request: NamedQueryPreviewRequest): Promise<NamedQuerySourcePreview> {
    return this.unwrap(
      await firstValueFrom(
        this.http.post<NamedQuerySourcePreview>(this.apiUrl('/editor/preview'), request, this.getJsonRequestOptions())
      )
    );
  }

  async list(): Promise<NamedQueryCatalogueRow[]> {
    const response = await firstValueFrom(
      this.http.get<ApiResponse<NamedQueryCatalogueRow[]>>(this.apiUrl(''), this.getJsonRequestOptions())
    );
    return this.unwrap(response);
  }

  async getCollections(): Promise<string[]> {
    const response = await firstValueFrom(
      this.http.get<ApiResponse<string[]>>(this.apiUrl('/collections'), this.getJsonRequestOptions())
    );
    const collections = this.unwrap(response);
    return Array.isArray(collections) ? collections : [];
  }

  async get(name: string): Promise<NamedQueryDefinition> {
    const response = await firstValueFrom(
      this.http.get<ApiResponse<NamedQueryDefinition>>(
        this.apiUrl(`/${encodeURIComponent(name)}`),
        this.getJsonRequestOptions()
      )
    );
    return this.unwrap(response);
  }

  async create(data: NamedQueryDefinition): Promise<{ name: string }> {
    const response = await firstValueFrom(
      this.http.post<ApiResponse<{ name: string }>>(this.apiUrl(''), data, this.getJsonRequestOptions())
    );
    return this.unwrap(response);
  }

  async update(name: string, data: NamedQueryDefinition, confirmation?: string): Promise<{ name: string }> {
    const response = await firstValueFrom(
      this.http.put<ApiResponse<{ name: string }>>(this.apiUrl(`/${encodeURIComponent(name)}`), data, {
        ...this.getJsonRequestOptions(),
        ...(confirmation ? { headers: { 'X-ReDBox-Named-Query-Confirmation': confirmation } } : {}),
      })
    );
    return this.unwrap(response);
  }

  async delete(name: string): Promise<{ name: string }> {
    const response = await firstValueFrom(
      this.http.delete<ApiResponse<{ name: string }>>(
        this.apiUrl(`/${encodeURIComponent(name)}`),
        this.getJsonRequestOptions()
      )
    );
    return this.unwrap(response);
  }
}
