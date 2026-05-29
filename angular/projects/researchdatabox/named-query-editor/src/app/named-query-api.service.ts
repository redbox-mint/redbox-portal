import { Inject, Injectable } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClient, HttpContext } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService, HttpClientService, UtilityService } from '@researchdatabox/portal-ng-common';

export interface NamedQueryParam {
  type: 'string' | 'date' | 'number' | 'boolean' | 'array' | 'object';
  path: string;
  queryType?: string;
  whenUndefined: 'defaultValue' | 'ignore';
  defaultValue?: unknown;
  format?: 'days' | 'ISODate';
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

  private apiUrl(path: string): string {
    return `${this.brandingAndPortalUrl}/api/named-query${path}`;
  }

  async list(): Promise<NamedQueryDefinition[]> {
    const response = await firstValueFrom(this.http.get<ApiResponse<NamedQueryDefinition[]>>(this.apiUrl(''), this.getJsonRequestOptions()));
    return this.unwrap(response);
  }

  async getCollections(): Promise<string[]> {
    const response = await firstValueFrom(this.http.get<ApiResponse<string[]>>(this.apiUrl('/collections'), this.getJsonRequestOptions()));
    const collections = this.unwrap(response);
    return Array.isArray(collections) ? collections : [];
  }

  async get(name: string): Promise<NamedQueryDefinition> {
    const response = await firstValueFrom(this.http.get<ApiResponse<NamedQueryDefinition>>(this.apiUrl(`/${encodeURIComponent(name)}`), this.getJsonRequestOptions()));
    return this.unwrap(response);
  }

  async create(data: NamedQueryDefinition): Promise<{ name: string }> {
    const response = await firstValueFrom(this.http.post<ApiResponse<{ name: string }>>(this.apiUrl(''), data, this.getJsonRequestOptions()));
    return this.unwrap(response);
  }

  async update(name: string, data: NamedQueryDefinition): Promise<{ name: string }> {
    const response = await firstValueFrom(this.http.put<ApiResponse<{ name: string }>>(this.apiUrl(`/${encodeURIComponent(name)}`), data, this.getJsonRequestOptions()));
    return this.unwrap(response);
  }

  async delete(name: string): Promise<{ name: string }> {
    const response = await firstValueFrom(this.http.delete<ApiResponse<{ name: string }>>(this.apiUrl(`/${encodeURIComponent(name)}`), this.getJsonRequestOptions()));
    return this.unwrap(response);
  }
}
