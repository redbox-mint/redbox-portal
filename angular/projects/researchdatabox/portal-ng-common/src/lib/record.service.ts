// Copyright (c) 2023 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import { map, firstValueFrom } from 'rxjs';
import { Injectable, Inject, isDevMode } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  HttpHeaders,
  HttpParams,
  HttpResponse,
} from '@angular/common/http';
import { ConfigService } from './config.service';
import { UtilityService } from './utility.service';
import { LoggerService } from './logger.service';
import { HttpClientService } from './httpClient.service';
import {
  merge as _merge,
  isUndefined as _isUndefined,
  isEmpty as _isEmpty,
  get as _get,
  isArray as _isArray,
  clone as _clone,
  isString as _isString,
  isNumber as _isNumber,
} from 'lodash-es';
import { RecordResponseTable } from './dashboard-models';
import {
  emptyRecordSaveCompletion,
  isRecordConcurrencyProblemCode,
  isRecordConcurrencyResolution,
  isRecordEntityTag,
  isRecordFormFingerprint,
  isRecordRevision,
  isRecordSaveOutcome,
  isRecordSaveProblemKind,
  isRecordSaveRequestId,
  recordEntityTagRevision,
  RecordAttachment,
  RecordConcurrentModificationConfig,
  RecordConcurrencyMetadata,
  RecordConcurrencyResolution,
  RecordSaveLifecyclePhase,
  RecordSaveIssue,
  RecordSaveProblem,
  RecordSaveResult,
  sanitizeRecordConcurrencyMetadata,
  sanitizeRecordSaveIssue,
} from '@researchdatabox/sails-ng-common';

/** Per-request options for a record save. */
interface SaveRequestOptions {
  headers: HttpHeaders;
  context?: HttpContext;
  params?: HttpParams;
  responseType: 'json';
  observe: 'response';
}

/** Trusted client state attached to one record mutation request. */
export interface RecordMutationConcurrencyOptions {
  /** Exact opaque entity tag returned by the server. Never construct this from revision. */
  readonly entityTag?: string;
  /** Stable generated-form fingerprint, independent from the record entity tag. */
  readonly formFingerprint?: string;
  /** Selected list-row revision used to verify a fresh individual representation. */
  readonly revision?: number;
  /** Diagnostic resolution label. This never weakens server checks. */
  readonly resolution?: Extract<
    RecordConcurrencyResolution,
    'direct' | 'client-auto-merged' | 'client-manually-resolved'
  >;
  /** Request ID of the failed attempt that led to a client resolution. */
  readonly resolutionOfRequestId?: string;
}

export type RecordActionConcurrencyOutcome =
  | 'none'
  | 'stale'
  | 'precondition-required'
  | 'form-changed'
  | 'deleted'
  | 'authorization-lost'
  | 'unknown';

const recordSaveLifecyclePhases: ReadonlySet<RecordSaveLifecyclePhase> = new Set([
  'pre-save',
  'persistence',
  'attachments',
  'post-save',
  'response',
  'transport',
]);

function createSaveRequestId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  // crypto.randomUUID() may be unavailable when running the portal over HTTP in
  // development because it requires a secure context. Fall back to
  // crypto.getRandomValues() for local development, while keeping production
  // behaviour strict so unexpected crypto API availability issues are surfaced.
  if (!isDevMode() || !globalThis.crypto?.getRandomValues) {
    throw new Error('Unable to generate save request id: crypto.randomUUID() is unavailable');
  }
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, character =>
    (
      Number(character) ^
      (globalThis.crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(character) / 4)))
    ).toString(16)
  );
}

export interface RecordTypeConf {
  name: string;
}

export interface AuditFieldChange {
  kind: 'add' | 'delete' | 'change';
  path: Array<string | number>;
  pathText: string;
  displayPath: string;
  label?: string;
  displayName: string;
  original: unknown;
  changed: unknown;
}

export interface RecordAuditTabRow {
  id: string;
  timestamp: string | null;
  action: 'created' | 'updated' | 'deleted' | 'destroyed' | 'restored';
  actionLabelKey: string;
  workflowStageLabel: string;
  actor: { username: string; name: string; email: string; displayName: string };
  changeSummary: { available: boolean; count: number; changes: AuditFieldChange[]; note?: string };
  rawRecord: Record<string, unknown> | null;
}

export interface RecordAuditTabResponse {
  summary: { returnedCount: number };
  rawAuditUrl: string;
  records: RecordAuditTabRow[];
}

export interface RecordPermissionsSummary {
  edit: Array<{ username: string; name: string; email: string }>;
  view: Array<{ username: string; name: string; email: string }>;
  editPending: string[];
  viewPending: string[];
  editRoles: string[];
  viewRoles: string[];
}

export interface RecordRelationshipExpandOptions {
  depth?: number;
  includeRecordTypes?: string[];
  includeRelationIds?: string[];
  fields?: 'summary' | 'full';
}

export interface RecordRelationshipEdge {
  relationId: string;
  label?: string;
  sourceOid: string;
  targetOid: string;
  targetRecordType: string;
}

export interface RecordRelationshipGraph {
  rootOid: string;
  edges: RecordRelationshipEdge[];
  relatedObjects: Record<string, Record<string, unknown>[]>;
  omittedByAccess: Record<string, number>;
}

export interface RecordTypeRelationship {
  id: string;
  label?: string;
  recordType: string;
  localField: string;
  foreignField: string;
  cardinality: 'one' | 'many';
  direction: 'outbound' | 'inbound';
}

export interface RecordTypeDefinitionResponse {
  name: string;
  packageType: string;
  searchFilters: unknown[];
  searchable: boolean;
  relatedTo?: RecordTypeRelationship[];
  concurrentModification?: RecordConcurrentModificationConfig;
}

export interface DashboardViewStepDefinitionResponse {
  name: string;
  sourceRecordType: string;
  sourceWorkflowStage?: string;
  fetchMode: 'allForRecordType' | 'workflowStage';
  dashboardTable: Record<string, unknown>;
  baseRecordType?: string;
}

export interface DashboardViewDefinitionResponse {
  name: string;
  titleLabelKey: string;
  showAdminSideBar?: boolean;
  dashboardType: string;
  sourceRecordType: string;
  steps: DashboardViewStepDefinitionResponse[];
}
export interface IntegrationAuditTraceEvent {
  id: string;
  redboxOid: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  status: string;
  integrationAction: string;
  triggeredBy?: string;
  message?: string;
  errorDetail?: string;
  httpStatusCode?: number;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  requestSummary?: Record<string, unknown>;
  responseSummary?: Record<string, unknown>;
  depth: number;
  hasChildren: boolean;
}

export interface IntegrationAuditTraceRecord {
  id: string;
  traceId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  triggeredBy?: string;
  integrationName?: string;
  actions: string[];
  eventCount: number;
  rootSpanId?: string;
  events: IntegrationAuditTraceEvent[];
}

export interface IntegrationAuditTabResponse {
  summary: { numFound: number; page: number; pageSize: number; totalPages: number };
  records: IntegrationAuditTraceRecord[];
}
export type IntegrationOutcomeSeverity = 'none' | 'pending' | 'in-progress' | 'success' | 'warning' | 'error';

export interface IntegrationOutcome {
  state: string;
  severity: IntegrationOutcomeSeverity;
  labelKey: string;
  helpKey?: string;
}

export interface IntegrationStatusItem {
  integrationName: string;
  status: string;
  integrationAction?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  message?: string;
  keyResult?: Record<string, unknown>;
  traceId: string;
  outcome?: IntegrationOutcome;
  synthesized?: boolean;
}

export interface IntegrationStatusResponse {
  integrations: IntegrationStatusItem[];
}

/**
 * Record Service
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 */
@Injectable()
export class RecordService extends HttpClientService {
  private requestOptions: any = null as any;

  constructor(
    @Inject(HttpClient) protected override http: HttpClient,
    @Inject(APP_BASE_HREF) public override rootContext: string,
    @Inject(UtilityService) protected override utilService: UtilityService,
    @Inject(ConfigService) protected override configService: ConfigService,
    @Inject(LoggerService) private loggerService: LoggerService
  ) {
    super(http, rootContext, utilService, configService);
    this.requestOptions = { responseType: 'json', observe: 'body' };
  }

  public override async waitForInit(): Promise<any> {
    await super.waitForInit();
    this.enableCsrfHeader();
    this.loggerService.debug('waitForInit RecordService');
    _merge(this.requestOptions, { context: this.httpContext });
    return this;
  }

  public async getWorkflowSteps(name: string) {
    let url = `${this.brandingAndPortalUrl}/record/wfSteps/${name}`;
    const result$ = this.http.get(url).pipe(map(res => res));
    let result = await firstValueFrom(result$);
    return result;
  }

  public async getRecordMeta(oid: string) {
    // Cache-bust metadata reads so publication refreshes do not reuse a stale
    // browser response after the related record has been saved elsewhere.
    const ts = Date.now();
    let url = `${this.brandingAndPortalUrl}/record/metadata/${oid}?ts=${ts}`;
    const result$ = this.http.get(url).pipe(map(res => res));
    let result = await firstValueFrom(result$);
    return result;
  }

  public async getRecordMetaWithOptions(
    oid: string,
    options: {
      includeRelationships?: boolean;
      relationshipDepth?: number;
      relationshipFields?: 'summary' | 'full';
    } = {}
  ) {
    const ts = Date.now();
    let params = new HttpParams().set('ts', String(ts));
    if (options.includeRelationships) {
      params = params.set('include', 'relationships');
    }
    if (!_isUndefined(options.relationshipDepth)) {
      params = params.set('relationshipDepth', String(options.relationshipDepth));
    }
    if (!_isEmpty(options.relationshipFields)) {
      params = params.set('fields', String(options.relationshipFields));
    }

    const requestOptions = this.getHttpOptions();
    const url = `${this.brandingAndPortalUrl}/record/metadata/${oid}`;
    const httpOptions = {
      ...requestOptions,
      observe: 'body' as const,
      responseType: 'json' as const,
      params,
    };
    const result$ = this.http.get(url, httpOptions).pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async getAttachments(oid: string): Promise<RecordAttachment[]> {
    const url = `${this.brandingAndPortalUrl}/record/${oid}/attachments`;
    const requestOptions = this.getHttpOptions();
    const httpOptions: {
      context?: typeof requestOptions.context;
      observe: 'body';
      responseType: 'json';
    } = {
      context: requestOptions?.context,
      observe: 'body',
      responseType: 'json',
    };
    const result$ = this.http
      .get<RecordAttachment[] | { data?: RecordAttachment[] }>(url, httpOptions)
      .pipe(map(response => (Array.isArray(response) ? response : (response?.data ?? []))));
    return await firstValueFrom(result$);
  }

  public async getRecordAuditTab(
    oid: string,
    opts: { dateFrom?: string; dateTo?: string; action?: string; workflowState?: string } = {}
  ): Promise<RecordAuditTabResponse> {
    const url = `${this.brandingAndPortalUrl}/record/viewAudit/${oid}/audit`;
    let params = new HttpParams();
    if (!_isEmpty(opts.dateFrom)) {
      params = params.set('dateFrom', String(opts.dateFrom));
    }
    if (!_isEmpty(opts.dateTo)) {
      params = params.set('dateTo', String(opts.dateTo));
    }
    if (!_isEmpty(opts.action)) {
      params = params.set('action', String(opts.action));
    }
    if (!_isEmpty(opts.workflowState)) {
      params = params.set('workflowState', String(opts.workflowState));
    }
    const requestOptions = this.getHttpOptions();
    const httpOptions = {
      context: requestOptions?.context,
      observe: 'body' as const,
      responseType: 'json' as const,
      params,
    };
    const result$ = this.http.get<{ data?: RecordAuditTabResponse } | RecordAuditTabResponse>(url, httpOptions).pipe(
      map(response => {
        const payload =
          (response as { data?: RecordAuditTabResponse })?.data ?? (response as RecordAuditTabResponse | undefined);
        return payload?.records ? payload : { summary: { returnedCount: 0 }, rawAuditUrl: '', records: [] };
      })
    );
    return await firstValueFrom(result$);
  }

  public async getRecordPermissionsTab(oid: string): Promise<RecordPermissionsSummary> {
    const url = `${this.brandingAndPortalUrl}/record/viewAudit/${oid}/permissions`;
    const requestOptions = this.getHttpOptions();
    const httpOptions = {
      context: requestOptions?.context,
      observe: 'body' as const,
      responseType: 'json' as const,
    };
    const result$ = this.http
      .get<{ data?: RecordPermissionsSummary } | RecordPermissionsSummary>(url, httpOptions)
      .pipe(
        map(response => {
          const payload =
            (response as { data?: RecordPermissionsSummary })?.data ??
            (response as RecordPermissionsSummary | undefined);
          return (
            payload ?? {
              edit: [],
              view: [],
              editPending: [],
              viewPending: [],
              editRoles: [],
              viewRoles: [],
            }
          );
        })
      );
    return await firstValueFrom(result$);
  }

  public async getRecordIntegrationStatus(
    oid: string,
    opts: { integrationName?: string } = {}
  ): Promise<IntegrationStatusResponse> {
    const url = `${this.brandingAndPortalUrl}/record/integrationStatus/${oid}`;
    let params = new HttpParams();
    if (!_isEmpty(opts.integrationName)) {
      params = params.set('integrationName', String(opts.integrationName));
    }
    const requestOptions = this.getHttpOptions();
    const httpOptions = {
      context: requestOptions?.context,
      observe: 'body' as const,
      responseType: 'json' as const,
      params,
    };
    const result$ = this.http
      .get<{ data?: IntegrationStatusResponse } | IntegrationStatusResponse>(url, httpOptions)
      .pipe(
        map(response => {
          const payload =
            (response as { data?: IntegrationStatusResponse })?.data ??
            (response as IntegrationStatusResponse | undefined);
          return payload?.integrations ? payload : { integrations: [] };
        })
      );
    return await firstValueFrom(result$);
  }

  public async getRecordIntegrationAuditTab(
    oid: string,
    opts: {
      page?: number;
      pageSize?: number;
      status?: string;
      integrationName?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {}
  ): Promise<IntegrationAuditTabResponse> {
    const url = `${this.brandingAndPortalUrl}/record/viewAudit/${oid}/integration-audit`;
    let params = new HttpParams();
    if (!_isUndefined(opts.page)) {
      params = params.set('page', String(opts.page));
    }
    if (!_isUndefined(opts.pageSize)) {
      params = params.set('pageSize', String(opts.pageSize));
    }
    if (!_isEmpty(opts.status)) {
      params = params.set('status', String(opts.status));
    }
    if (!_isEmpty(opts.integrationName)) {
      params = params.set('integrationName', String(opts.integrationName));
    }
    if (!_isEmpty(opts.dateFrom)) {
      params = params.set('dateFrom', String(opts.dateFrom));
    }
    if (!_isEmpty(opts.dateTo)) {
      params = params.set('dateTo', String(opts.dateTo));
    }
    const requestOptions = this.getHttpOptions();
    const httpOptions = {
      context: requestOptions?.context,
      observe: 'body' as const,
      responseType: 'json' as const,
      params,
    };
    const result$ = this.http
      .get<{ data?: IntegrationAuditTabResponse } | IntegrationAuditTabResponse>(url, httpOptions)
      .pipe(
        map(response => {
          const payload =
            (response as { data?: IntegrationAuditTabResponse })?.data ??
            (response as IntegrationAuditTabResponse | undefined);
          return payload?.records
            ? payload
            : { summary: { numFound: 0, page: 1, pageSize: 20, totalPages: 0 }, records: [] };
        })
      );
    return await firstValueFrom(result$);
  }

  private getDocMetadata(doc: any) {
    let metadata: any = {};
    for (var key in doc) {
      if (key.indexOf('authorization_') != 0 && key.indexOf('metaMetadata_') != 0) {
        metadata[key] = doc[key];
      }
      if (key == 'authorization_editRoles') {
        metadata[key] = doc[key];
      }
    }
    return metadata;
  }

  public async getRelationshipGraph(
    oid: string,
    options: RecordRelationshipExpandOptions = {}
  ): Promise<RecordRelationshipGraph> {
    let params = new HttpParams();
    if (!_isUndefined(options.depth)) {
      params = params.set('relationshipDepth', String(options.depth));
    }
    if (!_isEmpty(options.fields)) {
      params = params.set('fields', String(options.fields));
    }
    if (Array.isArray(options.includeRelationIds) && options.includeRelationIds.length > 0) {
      params = params.set('relationshipIds', options.includeRelationIds.join(','));
    }
    if (Array.isArray(options.includeRecordTypes) && options.includeRecordTypes.length > 0) {
      params = params.set('recordTypes', options.includeRecordTypes.join(','));
    }

    const requestOptions = this.getHttpOptions();
    const url = `${this.brandingAndPortalUrl}/record/${oid}/relatedRecords`;
    const result$ = this.http.get<Record<string, unknown>>(url, {
      context: requestOptions?.context,
      observe: 'body',
      responseType: 'json',
      params,
    });
    const response = await firstValueFrom(result$);
    const graph = (_get(response, 'data') ?? response) as Record<string, unknown>;

    return {
      rootOid: String(graph['rootOid'] ?? oid),
      edges: Array.isArray(graph['edges']) ? (graph['edges'] as RecordRelationshipEdge[]) : [],
      relatedObjects: (graph['relatedObjects'] as Record<string, Record<string, unknown>[]>) ?? {},
      omittedByAccess: (graph['omittedByAccess'] as Record<string, number>) ?? {},
    };
  }

  public async getRelatedRecords(oid: string, options: RecordRelationshipExpandOptions = {}) {
    const graphResponse = await this.getRelationshipGraph(oid, options);
    let response: any = {
      rootOid: graphResponse.rootOid,
      edges: graphResponse.edges,
      relatedObjects: graphResponse.relatedObjects,
      omittedByAccess: graphResponse.omittedByAccess,
      processedRelationships: Object.keys(graphResponse.relatedObjects ?? {}),
    };
    let items = [];
    let childOrTreeLevel2: any = Object.keys(graphResponse.relatedObjects ?? {});

    for (let childNameStr of childOrTreeLevel2) {
      let childArr = _get(graphResponse, 'relatedObjects.' + childNameStr);

      if (!_isUndefined(childArr) && _isArray(childArr)) {
        for (let child of childArr) {
          let item: any = {};
          item['oid'] = child['redboxOid'];
          item['title'] = _get(child, 'metadata.title', child['redboxOid']);
          item['metadata'] = this.getDocMetadata(child);
          item['dateCreated'] = child['dateCreated'];
          item['dateModified'] = child['lastSaveDate'];
          items.push(item);
        }
      }
    }

    response['items'] = items;
    return response;
  }

  public async getRecords(
    recordType: string,
    state: string,
    pageNumber: number,
    packageType: string = '',
    sort: string = '',
    filterFields: string = '',
    filterString: string = '',
    filterMode: string = '',
    secondarySort: string = ''
  ) {
    let rows = 10;
    let start = (pageNumber - 1) * rows;

    const items = {
      recordType: recordType,
      packageType: packageType,
      sort: sort,
      secondarySort: secondarySort,
      state: state,
      filterFields: filterFields,
      filter: filterString,
      filterMode: filterMode,
      start: start,
      rows: rows,
    };

    const listRecordsUrl = new URL(`${this.brandingAndPortalUrl}/listRecords`);
    for (const [key, value] of Object.entries(items)) {
      if (!_isUndefined(value)) {
        if (_isString(value) && !_isEmpty(value)) {
          listRecordsUrl.searchParams.set(key, value?.toString());
        } else {
          if (_isNumber(value)) {
            listRecordsUrl.searchParams.set(key, value?.toString());
          }
        }
      }
    }

    const result$ = this.http.get(listRecordsUrl.toString()).pipe(map(res => res));
    let result = await firstValueFrom(result$);
    return result;
  }

  public async getDeletedRecords(
    recordType: string,
    state: string,
    pageNumber: number,
    packageType: string = '',
    sort: string = '',
    filterFields: string = '',
    filterString: string = '',
    filterMode: string = ''
  ): Promise<RecordResponseTable> {
    let rows = 10;
    let start = (pageNumber - 1) * rows;

    const items = {
      recordType: recordType,
      packageType: packageType,
      sort: sort,
      state: state,
      filterFields: filterFields,
      filter: filterString,
      filterMode: filterMode,
      start: start,
      rows: rows,
    };

    const listDeletedRecordsUrl = new URL(`${this.brandingAndPortalUrl}/listDeletedRecords`);
    for (const [key, value] of Object.entries(items)) {
      if (!_isUndefined(value)) {
        if (_isString(value) && !_isEmpty(value)) {
          listDeletedRecordsUrl.searchParams.set(key, value?.toString());
        } else {
          if (_isNumber(value)) {
            listDeletedRecordsUrl.searchParams.set(key, value?.toString());
          }
        }
      }
    }

    const result$ = this.http.get(listDeletedRecordsUrl.toString()).pipe(map(res => res));
    let result: any = await firstValueFrom(result$);
    return result;
  }

  public async restoreDeletedRecord(
    oid: string,
    concurrency: number | RecordMutationConcurrencyOptions = {}
  ): Promise<RecordActionResult> {
    const selected = typeof concurrency === 'number' ? { revision: concurrency } : concurrency;
    return this.executeLifecycleMutation('PUT', oid, 'deleted', selected);
  }

  public async delete(
    oid: string,
    concurrency: number | RecordMutationConcurrencyOptions = {}
  ): Promise<RecordActionResult> {
    const selected = typeof concurrency === 'number' ? { revision: concurrency } : concurrency;
    return this.executeLifecycleMutation('DELETE', oid, 'active', selected);
  }

  public async destroyDeletedRecord(
    oid: string,
    concurrency: number | RecordMutationConcurrencyOptions = {}
  ): Promise<RecordActionResult> {
    const selected = typeof concurrency === 'number' ? { revision: concurrency } : concurrency;
    return this.executeLifecycleMutation('PURGE', oid, 'deleted', selected);
  }

  /**
   * Retrieves the default HTTP request options that includes the CSRF-TOKEN-HEADER.
   *
   * @returns {any} A cloned copy of the default request options.
   */
  private getHttpOptions(): any {
    return _clone(this.requestOptions);
  }

  public async getAllTypes() {
    let url = `${this.brandingAndPortalUrl}/record/type`;
    const result$ = this.http.get(url).pipe(map(res => res));
    let result: any = await firstValueFrom(result$);
    return result;
  }

  public async getType(recordType: string): Promise<RecordTypeDefinitionResponse> {
    const url = `${this.brandingAndPortalUrl}/record/type/${recordType}`;
    const requestOptions = this.getHttpOptions();
    const httpOptions: {
      context?: typeof requestOptions.context;
      observe: 'body';
      responseType: 'json';
    } = {
      context: requestOptions?.context,
      observe: 'body',
      responseType: 'json',
    };
    const result$ = this.http.get<Record<string, unknown>>(url, httpOptions);
    const result = await firstValueFrom(result$);
    return (_get(result, 'data') ?? result) as RecordTypeDefinitionResponse;
  }

  public async getDashboardType(dashboardType: string) {
    let url = `${this.brandingAndPortalUrl}/dashboard/type/${dashboardType}`;
    const result$ = this.http.get(url).pipe(map(res => res));
    let result = await firstValueFrom(result$);
    return result;
  }

  public async getDashboardView(name: string): Promise<DashboardViewDefinitionResponse> {
    const url = `${this.brandingAndPortalUrl}/dashboard/view/${name}`;
    const requestOptions = this.getHttpOptions();
    const httpOptions: {
      context?: typeof requestOptions.context;
      observe: 'body';
      responseType: 'json';
    } = {
      context: requestOptions?.context,
      observe: 'body',
      responseType: 'json',
    };
    const result$ = this.http.get<Record<string, unknown>>(url, httpOptions);
    const result = await firstValueFrom(result$);
    return (_get(result, 'data') ?? result) as DashboardViewDefinitionResponse;
  }

  public async getAllDashboardTypes() {
    let url = `${this.brandingAndPortalUrl}/dashboard/type`;
    const result$ = this.http.get(url).pipe(map(res => res));
    let result = await firstValueFrom(result$);
    return result;
  }

  public async create(
    record: any,
    recordType: string,
    targetStep: string = '',
    operation?: string,
    concurrency: RecordMutationConcurrencyOptions = {}
  ): Promise<RecordActionResult> {
    const requestId = createSaveRequestId();
    const url = `${this.brandingAndPortalUrl}/recordmeta/${recordType}`;
    try {
      const httpOptions = this.getSaveHttpOptions(requestId, targetStep, operation, concurrency, false);
      const response = await firstValueFrom(this.http.post<unknown>(url, record, httpOptions));
      return RecordActionResult.fromHttpResponse(response, requestId);
    } catch (error) {
      return RecordActionResult.fromHttpError(error, requestId);
    }
  }

  public async update(
    oid: string,
    record: any,
    targetStep: string = '',
    operation?: string,
    concurrency: RecordMutationConcurrencyOptions = {}
  ): Promise<RecordActionResult> {
    const requestId = createSaveRequestId();
    const url = `${this.brandingAndPortalUrl}/recordmeta/${oid}`;
    try {
      const httpOptions = this.getSaveHttpOptions(requestId, targetStep, operation, concurrency, true);
      const response = await firstValueFrom(this.http.put<unknown>(url, record, httpOptions));
      return RecordActionResult.fromHttpResponse(response, requestId);
    } catch (error) {
      return RecordActionResult.fromHttpError(error, requestId);
    }
  }

  private getSaveRequestParams(targetStep: string, operation?: string): HttpParams | undefined {
    let params = new HttpParams();
    if (!_isEmpty(targetStep)) {
      params = params.set('targetStep', targetStep);
    }
    if (typeof operation === 'string' && operation.length > 0) {
      params = params.set('operation', operation);
    }
    return params.keys().length > 0 ? params : undefined;
  }

  /**
   * Build immutable per-request options.  `HttpHeaders.set` returns a new
   * instance, so the shared request options are never mutated between saves.
   */
  private getSaveHttpOptions(
    requestId: string,
    targetStep: string = '',
    operation?: string,
    concurrency: RecordMutationConcurrencyOptions = {},
    allowEntityTag = true
  ): SaveRequestOptions {
    const base = this.getHttpOptions() as { headers?: HttpHeaders; context?: HttpContext };
    let headers = (base.headers instanceof HttpHeaders ? base.headers : new HttpHeaders(base.headers ?? {}))
      .set('X-ReDBox-Api-Version', '2.0')
      .set('X-ReDBox-Save-Request-Id', requestId);
    if (concurrency.entityTag !== undefined) {
      if (!allowEntityTag || !isRecordEntityTag(concurrency.entityTag)) {
        throw new TypeError('The record mutation entity tag is invalid for this request.');
      }
      headers = headers.set('If-Match', concurrency.entityTag);
    }
    if (concurrency.formFingerprint !== undefined) {
      if (!isRecordFormFingerprint(concurrency.formFingerprint)) {
        throw new TypeError('The record mutation form fingerprint is invalid.');
      }
      headers = headers.set('X-ReDBox-Form-Fingerprint', concurrency.formFingerprint);
    }
    if (concurrency.resolution !== undefined) {
      const resolution: unknown = concurrency.resolution;
      if (
        !isRecordConcurrencyResolution(resolution) ||
        (resolution !== 'direct' && resolution !== 'client-auto-merged' && resolution !== 'client-manually-resolved')
      ) {
        throw new TypeError('The record mutation concurrency resolution is invalid.');
      }
      headers = headers.set('X-ReDBox-Concurrency-Resolution', resolution);
    }
    const resolutionRequiresLinkage =
      concurrency.resolution === 'client-auto-merged' || concurrency.resolution === 'client-manually-resolved';
    if (concurrency.resolutionOfRequestId !== undefined || resolutionRequiresLinkage) {
      if (
        !resolutionRequiresLinkage ||
        !isRecordSaveRequestId(concurrency.resolutionOfRequestId) ||
        concurrency.resolutionOfRequestId === requestId
      ) {
        throw new TypeError('The record mutation request linkage is invalid.');
      }
      headers = headers.set('X-ReDBox-Resolution-Of-Request-Id', concurrency.resolutionOfRequestId);
    }
    const params = this.getSaveRequestParams(targetStep, operation);
    return {
      headers,
      context: base.context,
      ...(params ? { params } : {}),
      responseType: 'json',
      observe: 'response',
    };
  }

  private async executeLifecycleMutation(
    method: 'PUT' | 'DELETE' | 'PURGE',
    oid: string,
    representation: 'active' | 'deleted',
    concurrency: RecordMutationConcurrencyOptions
  ): Promise<RecordActionResult> {
    const requestId = createSaveRequestId();
    if (concurrency.entityTag === undefined && concurrency.revision === undefined) {
      return RecordActionResult.notDispatched(
        'An exact record precondition is required for this lifecycle action.',
        oid,
        requestId
      );
    }
    try {
      const resolved = await this.resolveListMutationConcurrency(oid, representation, concurrency, requestId);
      if (resolved instanceof RecordActionResult) {
        return resolved;
      }
      const url = `${this.brandingAndPortalUrl}/record/${method === 'PURGE' ? 'destroy' : 'delete'}/${oid}`;
      const httpOptions = this.getSaveHttpOptions(requestId, '', undefined, resolved, true);
      const response =
        method === 'PUT'
          ? await firstValueFrom(this.http.put<unknown>(url, undefined, httpOptions))
          : await firstValueFrom(this.http.delete<unknown>(url, httpOptions));
      return RecordActionResult.fromHttpResponse(response, requestId);
    } catch (error) {
      return RecordActionResult.fromHttpError(error, requestId);
    }
  }

  /**
   * Collection rows intentionally expose only a numeric revision. Before a
   * list-owned mutation, fetch the individual representation to obtain its
   * opaque tag and prove it still represents the selected row revision.
   */
  private async resolveListMutationConcurrency(
    oid: string,
    representation: 'active' | 'deleted',
    concurrency: RecordMutationConcurrencyOptions,
    requestId: string
  ): Promise<RecordMutationConcurrencyOptions | RecordActionResult> {
    if (concurrency.entityTag !== undefined || concurrency.revision === undefined) {
      return concurrency;
    }
    if (!isRecordRevision(concurrency.revision)) {
      throw new TypeError('The selected record revision is invalid.');
    }

    const base = this.getHttpOptions() as { headers?: HttpHeaders; context?: HttpContext };
    const headers = (base.headers instanceof HttpHeaders ? base.headers : new HttpHeaders(base.headers ?? {})).set(
      'X-ReDBox-Api-Version',
      '2.0'
    );
    const readUrl =
      representation === 'deleted'
        ? `${this.brandingAndPortalUrl}/record/delete/${oid}`
        : `${this.brandingAndPortalUrl}/record/metadata/${oid}`;
    const response = await firstValueFrom(
      this.http.get<unknown>(readUrl, {
        headers,
        context: base.context,
        observe: 'response',
        responseType: 'json',
      })
    );
    const current = RecordActionResult.readConcurrency(response.body, response.headers);
    if (
      current.entityTag !== undefined &&
      current.revision !== undefined &&
      recordEntityTagRevision(current.entityTag) !== current.revision
    ) {
      return RecordActionResult.notDispatched('The record concurrency response was inconsistent.', oid, requestId);
    }
    if (current.revision !== concurrency.revision) {
      return RecordActionResult.preflightConflict(
        oid,
        requestId,
        'record-revision-stale',
        concurrency.revision,
        current
      );
    }
    if (!current.entityTag) {
      return RecordActionResult.preflightConflict(
        oid,
        requestId,
        'record-precondition-required',
        concurrency.revision,
        current
      );
    }
    return { ...concurrency, entityTag: current.entityTag };
  }
}

export class RecordActionResult implements RecordSaveResult {
  success: boolean = false;
  oid: string = '';
  message: string = '';
  data: any = null;
  metadata: Record<string, unknown> | null = null;
  outcome: RecordSaveResult['outcome'] = 'not-saved';
  problems: RecordSaveProblem[] = [];
  completion = emptyRecordSaveCompletion();
  requestId: string = '';
  concurrency?: RecordConcurrencyMetadata;
  concurrencyOutcome: RecordActionConcurrencyOutcome = 'none';

  public wasPersisted(): boolean {
    return this.outcome === 'saved' || this.outcome === 'saved-with-warnings';
  }

  public isComplete(): boolean {
    return this.outcome === 'saved';
  }

  public isSuccessful(): boolean {
    return this.success === true;
  }

  public isDefinitiveConflict(): boolean {
    return (
      this.outcome === 'not-saved' &&
      this.concurrencyOutcome !== 'none' &&
      this.concurrencyOutcome !== 'authorization-lost' &&
      this.concurrencyOutcome !== 'unknown'
    );
  }

  public isUnknown(): boolean {
    return this.outcome === 'unknown' || this.concurrencyOutcome === 'unknown';
  }

  public static fromHttpResponse(response: HttpResponse<unknown>, requestId: string): RecordActionResult {
    return RecordActionResult.fromResponse(response.body, response.status, requestId, response.headers);
  }

  public static fromResponse(
    payload: unknown,
    status = 200,
    requestId = '',
    headers?: HttpHeaders
  ): RecordActionResult {
    type SaveMeta = Partial<RecordSaveResult> & {
      success?: boolean;
      oid?: string;
      message?: string;
      metadata?: Record<string, unknown> | null;
    };
    type SaveEnvelope = { meta?: SaveMeta; data?: unknown; errors?: unknown[] } & SaveMeta;
    const body = (payload && typeof payload === 'object' ? payload : {}) as SaveEnvelope;
    const meta: SaveMeta = body.meta && typeof body.meta === 'object' ? body.meta : body;
    const result = new RecordActionResult();
    result.requestId = isRecordSaveRequestId(requestId)
      ? requestId
      : isRecordSaveRequestId(meta.requestId)
        ? meta.requestId
        : '';
    result.oid = typeof meta.oid === 'string' ? meta.oid : '';
    result.message = typeof meta.message === 'string' ? meta.message : '';
    result.data = body.data ?? null;
    const typedProblems = Array.isArray(meta.problems)
      ? meta.problems
          .map(RecordActionResult.toSafeProblem)
          .filter((problem): problem is RecordSaveProblem => problem !== null)
      : [];
    const concurrencyResult = RecordActionResult.mergeResponseConcurrency(meta.concurrency, headers);
    const concurrency = concurrencyResult.value;
    const issues = (Array.isArray(body.errors) ? body.errors : []).map(RecordActionResult.toSafeIssue);

    // Status zero proves only a transport failure. Even a body that resembles a
    // typed server result cannot certify persistence when no HTTP response was
    // received.
    if (status === 0) {
      return RecordActionResult.asUnknown(result, 'network', issues);
    }

    if (isRecordSaveOutcome(meta.outcome)) {
      const concurrencyOutcome = RecordActionResult.classifyTypedOutcome(status, meta.outcome, typedProblems);
      if (concurrencyOutcome === null || (concurrencyOutcome !== 'none' && concurrencyResult.malformed)) {
        // 409/412/428 are actionable only when the typed problem kind/code
        // proves the certified non-write. Malformed lookalikes remain unknown.
        return RecordActionResult.asUnknown(result, 'system', issues);
      }
      result.outcome = meta.outcome;
      result.success = result.wasPersisted();
      result.problems = typedProblems;
      result.metadata = meta.outcome === 'unknown' ? null : RecordActionResult.safeProjectedMetadata(meta.metadata);
      result.concurrency = meta.outcome === 'unknown' ? undefined : concurrency;
      result.concurrencyOutcome = concurrencyOutcome;
      if (meta.completion && typeof meta.completion === 'object') {
        result.completion = meta.completion as RecordSaveResult['completion'];
      }
      return result;
    }

    // Policies short-circuit before the controller persists anything, so an
    // untyped 400/403 is safe to synthesise as a confirmed non-save.
    if (status === 400 || status === 403) {
      result.outcome = 'not-saved';
      result.problems = [
        {
          kind: status === 403 ? 'authorization' : 'validation',
          phase: 'pre-save',
          issues,
        },
      ];
      result.concurrencyOutcome = status === 403 ? 'authorization-lost' : 'none';
      return result;
    }

    // Legacy 2xx envelope from a server that predates the typed contract.
    if (meta.success === true) {
      result.success = true;
      const hasLegacyWarning = (meta.metadata as Record<string, unknown> | null)?.['postSaveSyncWarning'] === 'true';
      result.outcome = hasLegacyWarning ? 'saved-with-warnings' : 'saved';
      result.completion = {
        attachments: { status: hasLegacyWarning ? 'unknown' : 'completed', items: [] },
      };
      result.metadata = RecordActionResult.safeProjectedMetadata(meta.metadata);
      result.concurrency = concurrency;
      return result;
    }

    // Anything else is uninterpretable once the request has been dispatched.
    // Claiming `not-saved` here would assert a certainty the client does not
    // have, so uncertainty is preserved instead.
    return RecordActionResult.asUnknown(result, 'system', issues);
  }

  public static fromHttpError(error: unknown, requestId: string): RecordActionResult {
    if (!(error instanceof HttpErrorResponse)) {
      return RecordActionResult.notDispatched('The record request could not be dispatched.', '', requestId);
    }
    return RecordActionResult.fromResponse(error.error, error.status, requestId, error.headers);
  }

  public static readConcurrency(payload: unknown, headers?: HttpHeaders): RecordConcurrencyMetadata {
    const body = RecordActionResult.plainRecord(payload);
    const meta = RecordActionResult.plainRecord(body?.['meta']) ?? body ?? {};
    const nested = RecordActionResult.plainRecord(meta['concurrency']) ?? {};
    const concurrency = RecordActionResult.mergeResponseConcurrency(
      {
        ...nested,
        revision: nested['revision'] ?? meta['revision'],
        entityTag: nested['entityTag'] ?? meta['entityTag'],
        formFingerprint: nested['formFingerprint'] ?? meta['formFingerprint'],
      },
      headers
    );
    return concurrency.malformed ? {} : (concurrency.value ?? {});
  }

  public static preflightConflict(
    oid: string,
    requestId: string,
    code: 'record-revision-stale' | 'record-precondition-required',
    expectedRevision: number,
    current: RecordConcurrencyMetadata
  ): RecordActionResult {
    const result = new RecordActionResult();
    result.oid = oid;
    result.requestId = requestId;
    result.outcome = 'not-saved';
    result.concurrencyOutcome = code === 'record-revision-stale' ? 'stale' : 'precondition-required';
    result.problems = [
      {
        kind: 'conflict',
        phase: 'pre-save',
        issues: [{ code, message: `@record-save-${code}` }],
      },
    ];
    result.concurrency = {
      expectedRevision,
      ...(isRecordRevision(current.revision) ? { currentRevision: current.revision } : {}),
      ...(isRecordRevision(current.revision) ? { revision: current.revision } : {}),
      ...(isRecordEntityTag(current.entityTag) ? { entityTag: current.entityTag } : {}),
    };
    return result;
  }

  /**
   * A failure raised before the request was dispatched. Nothing reached the
   * server, so this is a confirmed non-save rather than an unknown one.
   */
  public static notDispatched(message: string, oid = '', requestId = ''): RecordActionResult {
    const result = new RecordActionResult();
    result.oid = oid;
    result.message = message;
    result.requestId = requestId;
    result.outcome = 'not-saved';
    result.problems = [{ kind: 'system', phase: 'transport', issues: [{ message }] }];
    return result;
  }

  /**
   * Map a v2 error envelope item onto a safe issue.  Only explicitly safe
   * fields are copied; anything else stays out of form state.
   */
  private static toSafeIssue(value: unknown): RecordSaveIssue {
    const item = (value && typeof value === 'object' ? value : {}) as {
      detail?: unknown;
      title?: unknown;
      message?: unknown;
      code?: unknown;
      field?: unknown;
      pointer?: unknown;
      class?: unknown;
      params?: unknown;
      targetField?: unknown;
      lineagePaths?: unknown;
      source?: { pointer?: unknown };
    };
    const pointer =
      typeof item.pointer === 'string'
        ? item.pointer
        : typeof item.source?.pointer === 'string'
          ? item.source.pointer
          : undefined;
    const message =
      typeof item.message === 'string'
        ? item.message
        : typeof item.detail === 'string'
          ? item.detail
          : typeof item.title === 'string'
            ? item.title
            : 'The submitted value is invalid.';
    return sanitizeRecordSaveIssue({
      message,
      ...(typeof item.code === 'string' ? { code: item.code } : {}),
      ...(typeof item.field === 'string' ? { field: item.field } : {}),
      ...(pointer ? { pointer } : {}),
      class: item.class,
      params: item.params,
      targetField: item.targetField,
      lineagePaths: item.lineagePaths,
    });
  }

  private static toSafeProblem(value: unknown): RecordSaveProblem | null {
    const problem = RecordActionResult.plainRecord(value);
    if (!problem || !isRecordSaveProblemKind(problem['kind'])) {
      return null;
    }
    const issues = Array.isArray(problem['issues']) ? problem['issues'].map(RecordActionResult.toSafeIssue) : [];

    if (problem['phase'] === 'schema') {
      return problem['source'] === 'schema'
        ? {
            kind: problem['kind'],
            source: 'schema',
            phase: 'schema',
            issues,
          }
        : null;
    }

    if (
      problem['source'] !== undefined ||
      !recordSaveLifecyclePhases.has(problem['phase'] as RecordSaveLifecyclePhase)
    ) {
      return null;
    }

    return {
      kind: problem['kind'],
      phase: problem['phase'] as RecordSaveLifecyclePhase,
      issues,
    };
  }

  private static classifyTypedOutcome(
    status: number,
    outcome: RecordSaveResult['outcome'],
    problems: readonly RecordSaveProblem[]
  ): RecordActionConcurrencyOutcome | null {
    if (outcome === 'unknown') return 'unknown';
    if (status === 409 || status === 412 || status === 428) {
      if (outcome !== 'not-saved') return null;
      const conflictCodes = new Set(
        problems
          .filter(problem => problem.kind === 'conflict')
          .flatMap(problem => problem.issues.map(issue => issue.code))
          .filter(isRecordConcurrencyProblemCode)
      );
      if (conflictCodes.size !== 1) return null;
      if (status === 428) {
        return conflictCodes.has('record-precondition-required') ? 'precondition-required' : null;
      }
      if (status === 412) {
        if (conflictCodes.has('record-deleted')) return 'deleted';
        return conflictCodes.has('record-revision-stale') ? 'stale' : null;
      }
      if (conflictCodes.has('form-definition-changed')) return 'form-changed';
      return conflictCodes.has('record-lifecycle-operation-conflict') ? 'stale' : null;
    }
    if (status === 403 && outcome === 'not-saved') {
      return problems.some(problem => problem.kind === 'authorization') ? 'authorization-lost' : 'none';
    }
    return 'none';
  }

  private static mergeResponseConcurrency(
    value: unknown,
    headers?: HttpHeaders
  ): { value?: RecordConcurrencyMetadata; malformed: boolean } {
    const metadata = sanitizeRecordConcurrencyMetadata(value) ?? {};
    const headerTag = headers?.get('ETag');
    const headerSupplied = headers?.has('ETag') === true;
    let malformed = headerSupplied && !isRecordEntityTag(headerTag);
    if (isRecordEntityTag(headerTag) && metadata.entityTag && metadata.entityTag !== headerTag) {
      malformed = true;
    }
    if (isRecordEntityTag(headerTag)) {
      metadata.entityTag = headerTag;
    }
    const currentCoordinates = [
      metadata.revision,
      metadata.currentRevision,
      recordEntityTagRevision(metadata.entityTag),
    ].filter((coordinate): coordinate is number => coordinate !== undefined);
    if (new Set(currentCoordinates).size > 1) {
      malformed = true;
    }
    return {
      ...(Object.keys(metadata).length > 0 ? { value: metadata } : {}),
      malformed,
    };
  }

  private static safeProjectedMetadata(value: unknown): Record<string, unknown> | null {
    const metadata = RecordActionResult.plainRecord(value);
    if (!metadata) return null;
    try {
      return structuredClone(metadata);
    } catch {
      return null;
    }
  }

  private static plainRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null ? (value as Record<string, unknown>) : null;
  }

  private static asUnknown(
    result: RecordActionResult,
    kind: 'network' | 'system',
    issues: RecordSaveIssue[]
  ): RecordActionResult {
    result.success = false;
    result.outcome = 'unknown';
    result.concurrencyOutcome = 'unknown';
    result.metadata = null;
    result.concurrency = undefined;
    result.problems = [
      {
        kind,
        phase: 'transport',
        issues:
          issues.length > 0 ? issues : [{ message: 'The save result could not be confirmed.', code: 'save-unknown' }],
      },
    ];
    return result;
  }
}
