import type { NamedQueryPromotionDraft } from '@researchdatabox/sails-ng-common';
import { Injectable, Inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { APP_BASE_HREF } from '@angular/common';
import {
  HttpClientService,
  ConfigService,
  UtilityService,
  TranslationService,
} from '@researchdatabox/portal-ng-common';
import { firstValueFrom } from 'rxjs';
import { DataGridSource, GridRequestError, GridSourceUnavailable } from './data-grid-source';
import {
  GridCatalogue,
  GridListPage,
  GridDefinition,
  GridPage,
  GridQuery,
  GridScope,
  SavedQuery,
  editableQuery,
} from './data-grid.model';
import {
  array,
  collectionRequest,
  discoveryQuery,
  object,
  parseDiscovery,
  parsePage,
  parseSavedQuery,
  scopeId,
  string,
} from './record-grid.protocol';

@Injectable({ providedIn: 'root' })
export class RecordGridService extends HttpClientService implements DataGridSource {
  constructor(
    @Inject(HttpClient) http: HttpClient,
    @Inject(APP_BASE_HREF) rootContext: string,
    @Inject(UtilityService) utilService: UtilityService,
    @Inject(ConfigService) configService: ConfigService,
    @Inject(TranslationService) private i18n: TranslationService
  ) {
    super(http, rootContext, utilService, configService);
  }

  public override async waitForInit(): Promise<this> {
    await super.waitForInit();
    this.enableCsrfHeader();
    return this;
  }

  async catalogue(): Promise<GridCatalogue> {
    await this.waitForInit();
    try {
      const response = object(
        await firstValueFrom(
          this.http.get(`${this.brandingAndPortalUrl}/api/recordtypes`, { context: this.httpContext })
        )
      );
      const data = response['data'] === undefined ? response : object(response['data']);
      const scopes = array(data['records']).map(value => {
        const type = object(value);
        const name = string(type['name']);
        if (!name) throw new GridRequestError('invalid-response');
        const labels = type['labels'] && typeof type['labels'] === 'object' ? object(type['labels']) : {};
        const configured = typeof labels['name'] === 'string' ? labels['name'] : name;
        const translated = configured.startsWith('@') ? (this.i18n.t(configured) as string) : configured;
        const label =
          translated && translated !== configured.replace(/^@/, '') ? translated : configured.replace(/^@/, '');
        return { id: scopeId(name), label, recordTypeLabel: label, recordType: name, fields: [] };
      });
      if (new Set(scopes.map(scope => scope.id)).size !== scopes.length) throw new GridRequestError('invalid-response');
      return { scopes, persistence: true };
    } catch (error) {
      throw this.requestError(error);
    }
  }

  private async discover(scope: GridScope, ids?: string[]) {
    const data = await this.graphql(discoveryQuery(!!ids), {
      type: scope.recordType,
      stages: scope.workflowStage ? [scope.workflowStage] : undefined,
      ids,
    });
    return parseDiscovery(data['recordFields'], key => this.i18n.t(key) as string);
  }

  async stages(scope: GridScope): Promise<GridScope[]> {
    const response = object(await this.persistence('GET', `/scopes/${encodeURIComponent(scope.recordType)}`));
    const stages = array(response['stages']).map(string);
    if (stages.length > 100 || stages.some(stage => !stage) || new Set(stages).size !== stages.length)
      throw new GridRequestError('invalid-response');
    return stages.map(stage => ({
      id: scopeId(scope.recordType, stage),
      recordType: scope.recordType,
      workflowStage: stage,
      label: `${scope.recordType} / ${stage}`,
      fields: [],
    }));
  }
  async fields(scope: GridScope): Promise<GridScope[]> {
    const discovery = await this.discover(scope);
    return [
      {
        ...scope,
        recordTypeLabel: discovery.recordTypeLabel ?? scope.recordTypeLabel,
        fields: discovery.fields,
        revision: discovery.revision,
      },
    ];
  }

  async selection(scope: GridScope, id: string) {
    const discovery = await this.discover(scope, [id]);
    const field = discovery.fields.find(f => f.id === id);
    if (!field) throw new GridRequestError('schema-changed');
    return field;
  }

  async query(request: GridQuery): Promise<GridPage> {
    const definition = request.definition;
    const scope: GridScope = {
      id: scopeId(definition.recordType, definition.workflowStage),
      label: definition.recordType,
      recordType: definition.recordType,
      workflowStage: definition.workflowStage,
      fields: [],
    };
    const ids = [
      ...new Set([
        ...definition.columns,
        ...definition.filters.map(filter => filter.fieldId),
        ...(definition.sort ? [definition.sort.fieldId] : []),
      ]),
    ];
    const discovery = await this.discover(scope, ids);
    const payload = collectionRequest(request, scope, discovery);
    const data = await this.graphql(payload.query, payload.variables);
    return parsePage(data['records'], request, discovery.fields);
  }

  async prepareNamedQuery(definition: SavedQuery): Promise<NamedQueryPromotionDraft> {
    await this.waitForInit();
    const response = await firstValueFrom(
      this.http.post<{ data: NamedQueryPromotionDraft }>(
        `${this.brandingAndPortalUrl}/api/named-query/editor/from-explorer`,
        { exploration: structuredClone(editableQuery(definition)) },
        { context: this.httpContext, headers: { 'X-ReDBox-Api-Version': '2.0' } }
      )
    );
    return structuredClone(response.data);
  }
  async schema(): Promise<string> {
    return string(object(await this.persistence('GET', '/schema'))['sdl']);
  }
  async raw(document: string, variables: object): Promise<Record<string, unknown>> {
    if (new TextEncoder().encode(JSON.stringify({ query: document, variables })).length > 65536)
      throw new GridRequestError('query-limit');
    return this.graphql(document, variables);
  }
  async generate(request: GridQuery) {
    const scope: GridScope = {
      id: '',
      label: '',
      recordType: request.definition.recordType,
      workflowStage: request.definition.workflowStage,
      fields: [],
    };
    const ids = [
      ...new Set([
        ...request.definition.columns,
        ...request.definition.filters.map(f => f.fieldId),
        ...(request.definition.sort ? [request.definition.sort.fieldId] : []),
      ]),
    ];
    const discovery = await this.discover(scope, ids);
    return collectionRequest(request, scope, discovery);
  }
  private async persistence(method: 'GET' | 'POST' | 'PUT' | 'DELETE', suffix = '', body?: object): Promise<unknown> {
    await this.waitForInit();
    try {
      const response = object(
        await firstValueFrom(
          this.http.request(method, `${this.brandingAndPortalUrl}/app/data-grids${suffix}`, {
            body,
            context: this.httpContext,
            headers: { 'X-ReDBox-Api-Version': '2.0' },
          })
        )
      );
      return response['data'] === undefined ? response : response['data'];
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        if ([401, 403].includes(error.status)) throw new GridRequestError('auth-required');
        if (error.status === 409) throw new GridRequestError('revision-conflict');
        if (error.status === 404) throw new GridRequestError('grid-missing');
        const response = error.error;
        const code = response?.errors?.[0]?.code ?? response?.data?.error?.code ?? response?.error?.code;
        if (
          [
            'invalid-document',
            'schema-unavailable',
            'query-limit',
            'schema-changed',
            'filter-type-changed',
            'sort-type-changed',
            'invalid-definition',
            'catalogue-limit',
            'query-unavailable',
          ].includes(code)
        )
          throw new GridRequestError(code);
      }
      throw new GridRequestError('persistence-failed');
    }
  }
  async list(after?: string): Promise<GridListPage> {
    const response = object(await this.persistence('GET', after ? `?after=${encodeURIComponent(after)}` : ''));
    const grids = array(response['grids']).map(value => parseSavedQuery(value));
    const next = response['next'];
    if (
      grids.length > 100 ||
      (next !== null && (typeof next !== 'string' || !/^[a-f0-9]{24}$/.test(next) || next === after)) ||
      (next !== null && !grids.length) ||
      new Set(grids.map(grid => grid.id)).size !== grids.length
    )
      throw new GridRequestError('invalid-response');
    return { grids, next };
  }
  async read(id: string): Promise<SavedQuery> {
    return parseSavedQuery(await this.persistence('GET', `/${encodeURIComponent(id)}`));
  }
  async save(definition: SavedQuery): Promise<SavedQuery> {
    const { id, revision, ...stored } = editableQuery(definition);
    return parseSavedQuery(
      await this.persistence(
        id ? 'PUT' : 'POST',
        id ? `/${encodeURIComponent(id)}` : '',
        id ? { definition: stored, revision } : { definition: stored }
      )
    );
  }
  async remove(definition: SavedQuery): Promise<void> {
    if (!definition.id || !definition.revision) throw new GridRequestError('invalid-definition');
    await this.persistence('DELETE', `/${encodeURIComponent(definition.id)}`, { revision: definition.revision });
  }
  private async graphql(query: string, variables: object): Promise<Record<string, unknown>> {
    await this.waitForInit();
    try {
      const response = object(
        await firstValueFrom(
          this.http.post(
            `${this.brandingAndPortalUrl}/api/graphql`,
            { query, variables },
            {
              context: this.httpContext,
              headers: { Accept: 'application/graphql-response+json', 'Content-Type': 'application/json' },
            }
          )
        )
      );
      if (response['errors'] !== undefined) {
        const errors = array(response['errors']);
        if (errors.length) throw this.graphqlError(errors);
      }
      return object(response['data']);
    } catch (error) {
      throw this.requestError(error);
    }
  }

  private graphqlError(errors: unknown[]): GridRequestError {
    const codes = errors.map(value => {
      const error = object(value);
      return error['extensions'] ? object(error['extensions'])['code'] : undefined;
    });
    const mappings: Record<string, string> = {
      CATALOGUE_LIMIT: 'catalogue-limit',
      INVALID_CURSOR: 'cursor-expired',
      REINDEX_REQUIRED: 'reindex-required',
      COLLECTION_LIMIT: 'collection-limit',
      QUERY_LIMIT: 'query-limit',
      UNKNOWN_FIELD: 'schema-changed',
      UNKNOWN_WORKFLOW_STAGE: 'schema-changed',
      UNKNOWN_RECORD_TYPE: 'schema-changed',
      UNSUPPORTED_FILTER: 'schema-changed',
      UNSUPPORTED_SORT: 'schema-changed',
      VARIANT_SCOPE_REQUIRED: 'schema-changed',
      UNSUPPORTED_SEARCH_INDEX: 'query-unavailable',
      COLLECTION_UNAVAILABLE: 'query-unavailable',
      SEARCH_UNAVAILABLE: 'query-unavailable',
      STORAGE_UNAVAILABLE: 'query-unavailable',
      QUERY_TIMEOUT: 'query-unavailable',
    };
    return new GridRequestError(codes.map(code => mappings[String(code)]).find(Boolean) ?? 'preview-failed');
  }

  private requestError(error: unknown): Error {
    if (error instanceof GridRequestError || error instanceof GridSourceUnavailable) return error;
    if (error instanceof HttpErrorResponse) {
      if ([401, 403].includes(error.status)) return new GridRequestError('auth-required');
      if (error.status === 503) return new GridRequestError('query-unavailable');
      const body = error.error;
      if (body && typeof body === 'object' && Array.isArray(body.errors) && body.errors.length)
        return this.graphqlError(body.errors);
    }
    return new GridRequestError('query-unavailable');
  }
}
