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
import { Injectable, Inject } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClient, HttpContext, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
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
  isRecordSaveOutcome,
  RecordAttachment,
  RecordConcurrentModificationConfig,
  RecordConcurrencyMetadata,
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
  observe: 'body';
}

const saveRequestIdByteLength = 16;

function createSaveRequestId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  if (typeof cryptoApi?.getRandomValues !== 'function') {
    throw new Error('Web Crypto API is unavailable; cannot create a save request ID.');
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(saveRequestIdByteLength));
  // RFC 4122 version 4 UUID: set the version and variant bits explicitly.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
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

  public async restoreDeletedRecord(oid: string) {
    const httpOptions = this.getHttpOptions();
    const restoreDeletedRecordUrl = new URL(`${this.brandingAndPortalUrl}/record/delete/${oid}`);
    const result$ = this.http.put(restoreDeletedRecordUrl.toString(), undefined, httpOptions).pipe(map(res => res));
    let result: any = await firstValueFrom(result$);
    return result;
  }

  public async delete(oid: string) {
    const httpOptions = this.getHttpOptions();
    const deleteRecordUrl = new URL(`${this.brandingAndPortalUrl}/record/delete/${oid}`);
    const result$ = this.http.delete(deleteRecordUrl.toString(), httpOptions).pipe(map(res => res));
    const result: any = await firstValueFrom(result$);
    return result;
  }

  public async destroyDeletedRecord(oid: string) {
    const httpOptions = this.getHttpOptions();
    const destroyDeletedRecordUrl = new URL(`${this.brandingAndPortalUrl}/record/destroy/${oid}`);
    const result$ = this.http.delete(destroyDeletedRecordUrl.toString(), httpOptions).pipe(map(res => res));
    let result: any = await firstValueFrom(result$);
    return result;
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

  public async create(record: any, recordType: string, targetStep: string = '', operation?: string) {
    const requestId = createSaveRequestId();
    const httpOptions = this.getSaveHttpOptions(requestId, targetStep, operation);
    const url = `${this.brandingAndPortalUrl}/recordmeta/${recordType}`;
    try {
      const result$ = this.http.post(url, record, httpOptions).pipe(map(res => res));
      const result: unknown = await firstValueFrom(result$);
      return RecordActionResult.fromResponse(result, 200, requestId);
    } catch (error) {
      return RecordActionResult.fromHttpError(error, requestId);
    }
  }

  public async update(oid: string, record: any, targetStep: string = '', operation?: string) {
    const requestId = createSaveRequestId();
    const httpOptions = this.getSaveHttpOptions(requestId, targetStep, operation);
    const url = `${this.brandingAndPortalUrl}/recordmeta/${oid}`;
    try {
      const result$ = this.http.put(url, record, httpOptions).pipe(map(res => res));
      const result: unknown = await firstValueFrom(result$);
      return RecordActionResult.fromResponse(result, 200, requestId);
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
  private getSaveHttpOptions(requestId: string, targetStep: string = '', operation?: string): SaveRequestOptions {
    const base = this.getHttpOptions() as { headers?: HttpHeaders; context?: HttpContext };
    const headers = (base.headers instanceof HttpHeaders ? base.headers : new HttpHeaders(base.headers ?? {}))
      .set('X-ReDBox-Api-Version', '2.0')
      .set('X-ReDBox-Save-Request-Id', requestId);
    const params = this.getSaveRequestParams(targetStep, operation);
    return {
      headers,
      context: base.context,
      ...(params ? { params } : {}),
      responseType: 'json',
      observe: 'body',
    };
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

  public wasPersisted(): boolean {
    return this.outcome === 'saved' || this.outcome === 'saved-with-warnings';
  }

  public isComplete(): boolean {
    return this.outcome === 'saved';
  }

  public isSuccessful(): boolean {
    return this.success === true;
  }

  public static fromResponse(payload: unknown, status = 200, requestId = ''): RecordActionResult {
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
    result.requestId = typeof meta.requestId === 'string' && meta.requestId ? meta.requestId : requestId;
    result.oid = typeof meta.oid === 'string' ? meta.oid : '';
    result.message = typeof meta.message === 'string' ? meta.message : '';
    result.data = body.data ?? null;
    result.metadata =
      meta.metadata && typeof meta.metadata === 'object' ? (meta.metadata as Record<string, unknown>) : null;
    result.concurrency = sanitizeRecordConcurrencyMetadata(meta.concurrency);

    if (isRecordSaveOutcome(meta.outcome)) {
      result.outcome = meta.outcome;
      result.success = meta.success === true || result.wasPersisted();
      result.problems = Array.isArray(meta.problems) ? (meta.problems as RecordSaveProblem[]) : [];
      if (meta.completion && typeof meta.completion === 'object') {
        result.completion = meta.completion as RecordSaveResult['completion'];
      }
      return result;
    }

    const issues = (Array.isArray(body.errors) ? body.errors : []).map(RecordActionResult.toSafeIssue);

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
      return result;
    }

    // Anything else is uninterpretable once the request has been dispatched.
    // Claiming `not-saved` here would assert a certainty the client does not
    // have, so uncertainty is preserved instead.
    result.outcome = 'unknown';
    result.problems = [
      {
        kind: status === 0 ? 'network' : 'system',
        phase: 'transport',
        issues:
          issues.length > 0 ? issues : [{ message: 'The save result could not be confirmed.', code: 'save-unknown' }],
      },
    ];
    return result;
  }

  public static fromHttpError(error: unknown, requestId: string): RecordActionResult {
    const httpError = error instanceof HttpErrorResponse ? error : null;
    return RecordActionResult.fromResponse(httpError?.error, httpError?.status ?? 0, requestId);
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
      typeof item.detail === 'string'
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
}
