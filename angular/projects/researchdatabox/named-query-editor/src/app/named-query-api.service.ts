import { Inject, Injectable } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClient, HttpContext } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  NamedQueryDraftRequest,
  NamedQueryPreviewRequest,
  NamedQueryValidation,
  NamedQueryDescription,
  NamedQueryPreview,
  NamedQueryFieldDescription,
  NamedQueryGuidance,
  SchemaTarget,
} from '@researchdatabox/sails-ng-common';
import { ConfigService, HttpClientService, UtilityService } from '@researchdatabox/portal-ng-common';

export interface NamedQueryParam {
  type: string;
  path: string;
  queryType?: string;
  whenUndefined: string;
  defaultValue?: unknown;
  format?: string;
  template?: string;
}

export interface RelatedRecordFilterDefinition {
  collectionName: string;
  mongoQuery: Record<string, unknown>;
  localField: string;
  foreignField: string;
}

export interface NamedQueryDefinition {
  name?: string;
  collectionName: string;
  brandIdFieldPath?: string;
  resultObjectMapping: Record<string, string>;
  mongoQuery: Record<string, unknown>;
  sort?: Array<Record<string, 'ASC' | 'DESC'>>;
  expandRelations?: boolean;
  relatedRecordFilters?: RelatedRecordFilterDefinition[];
  queryParams: Record<string, NamedQueryParam>;
}

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

  async describe(request: NamedQueryDraftRequest): Promise<NamedQueryDescription> {
    return this.unwrap(
      await firstValueFrom(
        this.http.post<NamedQueryDescription>(this.apiUrl('/editor/describe'), request, this.getJsonRequestOptions())
      )
    );
  }

  async preview(request: NamedQueryPreviewRequest): Promise<NamedQueryPreview> {
    return this.unwrap(
      await firstValueFrom(
        this.http.post<NamedQueryPreview>(this.apiUrl('/editor/preview'), request, this.getJsonRequestOptions())
      )
    );
  }

  async list(): Promise<NamedQueryDefinition[]> {
    const response = await firstValueFrom(
      this.http.get<ApiResponse<NamedQueryDefinition[]>>(this.apiUrl(''), this.getJsonRequestOptions())
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

  async update(name: string, data: NamedQueryDefinition): Promise<{ name: string }> {
    const response = await firstValueFrom(
      this.http.put<ApiResponse<{ name: string }>>(
        this.apiUrl(`/${encodeURIComponent(name)}`),
        data,
        this.getJsonRequestOptions()
      )
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
