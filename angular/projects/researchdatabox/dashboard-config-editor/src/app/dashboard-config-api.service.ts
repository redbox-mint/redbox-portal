import { Inject, Injectable } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClient, HttpContext, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService, HttpClientService, UtilityService } from '@researchdatabox/portal-ng-common';

export interface DashboardRowConfig {
  title: string;
  variable: string;
  template: string;
  initialSort?: 'asc' | 'desc';
  defaultSort?: boolean;
  secondarySort?: string;
  [extra: string]: unknown;
}

export interface DashboardRowRule {
  name: string;
  action: 'show' | 'hide';
  mode?: 'all' | 'alo';
  renderItemTemplate: string;
  evaluateRulesTemplate?: string;
  [extra: string]: unknown;
}

export interface DashboardRulesConfig {
  ruleSetName: string;
  applyRuleSet: boolean;
  type?: string;
  separator?: string;
  mode?: 'all' | 'alo';
  rules: DashboardRowRule[];
  [extra: string]: unknown;
}

export interface DashboardFormatRules {
  filterBy?: Record<string, unknown>;
  queryFilters?: Record<string, unknown>;
  sortBy?: string;
  groupBy?: string;
  sortGroupBy?: Array<Record<string, unknown>>;
  [extra: string]: unknown;
}

export interface DashboardTableConfig {
  rowConfig?: DashboardRowConfig[];
  formatRules?: DashboardFormatRules;
  rowRulesConfig?: DashboardRulesConfig[];
  groupRowConfig?: DashboardRowConfig[];
  groupRowRulesConfig?: DashboardRulesConfig[];
  [extra: string]: unknown;
}

/** Complete, independent settings for one workflow stage or view step. */
export interface DashboardSettings {
  searchable: boolean;
  showStageTitle: boolean;
  tableConfig: {
    rowConfig: DashboardRowConfig[];
    rowRulesConfig: DashboardRulesConfig[];
    groupRowConfig: DashboardRowConfig[];
    groupRowRulesConfig: DashboardRulesConfig[];
    formatRules: DashboardFormatRules;
    [extra: string]: unknown;
  };
  [extra: string]: unknown;
}

export type DashboardTarget =
  | { kind: 'workflow'; recordType: string; stage: string }
  | { kind: 'view'; view: string; step: string };

export interface DashboardTargetInfo {
  target: DashboardTarget;
  key: string;
  ownerLabel: string;
  stepLabel: string;
  hidden: boolean;
  recordType: string;
  queryFilterKeys: string[];
}

export interface DashboardTargetSettings {
  target: DashboardTarget;
  settings: DashboardSettings;
  revision: number;
  schemaVersion: number;
  hidden: boolean;
}

export interface DashboardFinding {
  id: string;
  severity: 'error' | 'warning';
  code: string;
  target: DashboardTarget;
  path: string;
  message: string;
}

export interface DashboardValidationResult {
  target: DashboardTarget;
  expectedRevision: number;
  errors: DashboardFinding[];
  warnings: DashboardFinding[];
  validationFingerprint: string;
}

export type DashboardCopyGroup = 'columnsAndActions' | 'filtersAndSearch' | 'grouping';
export type DashboardCopySelection = DashboardCopyGroup | 'all';

export interface DashboardChangeItem {
  label: string;
  before: string;
  after: string;
  cleared: boolean;
}

export interface DashboardGroupChange {
  group: DashboardCopyGroup;
  label: string;
  changed: boolean;
  items: DashboardChangeItem[];
}

export interface DashboardCopyPreview {
  expectedRevision: number;
  previewFingerprint: string;
  source: DashboardTarget;
  destinations: DashboardTarget[];
  groups: DashboardCopySelection[];
  changes: Array<{ target: DashboardTarget; label: string; hidden: boolean; groups: DashboardGroupChange[] }>;
  errors: DashboardFinding[];
  warnings: DashboardFinding[];
}

/** A record field available to a dashboard, from the stage's record JSON schema. */
export interface DashboardFieldInfo {
  path: string;
  label: string;
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'any';
  repeated: boolean;
  enum?: Array<string | number | boolean>;
  description?: string;
  source: 'schema' | 'system';
}

export interface DashboardFieldCatalogue {
  status: 'complete' | 'partial' | 'unavailable';
  reason?: string;
  recordType: string;
  workflowStage?: string;
  fields: DashboardFieldInfo[];
  openPrefixes: string[];
}

const SYSTEM_ROOTS = ['metaMetadata', 'workflow', 'authorization', 'redboxOid', 'oid'];

/** Mirror of isKnownFieldPath in @researchdatabox/redbox-core DashboardFieldCatalogue. */
export function isKnownFieldPath(catalogue: DashboardFieldCatalogue | null | undefined, path: string): boolean {
  const trimmed = (path ?? '').trim();
  if (!catalogue || catalogue.status === 'unavailable' || !trimmed) {
    return true;
  }
  if (SYSTEM_ROOTS.some((root) => trimmed === root || trimmed.startsWith(`${root}.`))) {
    return true;
  }
  if (catalogue.fields.some((f) => f.path === trimmed || f.path.startsWith(`${trimmed}.`))) {
    return true;
  }
  return catalogue.openPrefixes.some((prefix) => trimmed === prefix || trimmed.startsWith(`${prefix}.`));
}

/** Error carrying the server's typed code and structured details (findings, revision). */
export class DashboardConfigApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string, public readonly details: Record<string, any>) {
    super(message);
  }
}

type ApiResponse<T> = { data: T };

@Injectable()
export class DashboardConfigApiService extends HttpClientService {
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

  private options(): { responseType: 'json'; observe: 'body'; context: HttpContext; headers: HttpHeaders } {
    return {
      responseType: 'json',
      observe: 'body',
      context: this.httpContext,
      headers: new HttpHeaders({ 'X-ReDBox-Api-Version': '2.0' })
    };
  }

  /** CSRF-protected session routes used by the editor. */
  private url(path: string): string {
    return `${this.brandingAndPortalUrl}/admin/dashboard-config${path}`;
  }

  private targetPath(target: DashboardTarget): string {
    return target.kind === 'workflow'
      ? `/workflows/${encodeURIComponent(target.recordType)}/${encodeURIComponent(target.stage)}`
      : `/views/${encodeURIComponent(target.view)}/${encodeURIComponent(target.step)}`;
  }

  private async request<T>(work: Promise<ApiResponse<T>>): Promise<T> {
    try {
      const response = await work;
      return response.data;
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        const body = error.error ?? {};
        const first = Array.isArray(body.errors) ? body.errors[0] ?? {} : {};
        const message = first.detail || first.title || error.message || 'Request failed.';
        throw new DashboardConfigApiError(message, error.status, first.code || String(error.status), { ...(body.meta ?? {}), ...(first.meta ?? {}) });
      }
      throw error;
    }
  }

  async getTargets(): Promise<{ targets: DashboardTargetInfo[]; catalogueFingerprint: string }> {
    return this.request(firstValueFrom(this.http.get<ApiResponse<{ targets: DashboardTargetInfo[]; catalogueFingerprint: string }>>(this.url('/targets'), this.options())));
  }

  async getSettings(target: DashboardTarget): Promise<DashboardTargetSettings> {
    return this.request(firstValueFrom(this.http.get<ApiResponse<DashboardTargetSettings>>(this.url(this.targetPath(target)), this.options())));
  }

  async getFields(target: DashboardTarget): Promise<DashboardFieldCatalogue> {
    return this.request(firstValueFrom(this.http.get<ApiResponse<DashboardFieldCatalogue>>(this.url(`${this.targetPath(target)}/fields`), this.options())));
  }

  async validate(target: DashboardTarget, expectedRevision: number, settings: DashboardSettings): Promise<DashboardValidationResult> {
    return this.request(firstValueFrom(this.http.post<ApiResponse<DashboardValidationResult>>(this.url('/validate'), { target, expectedRevision, settings }, this.options())));
  }

  async save(target: DashboardTarget, body: { expectedRevision: number; settings: DashboardSettings; validationFingerprint?: string; acknowledgedWarningIds?: string[] }): Promise<DashboardTargetSettings> {
    return this.request(firstValueFrom(this.http.put<ApiResponse<DashboardTargetSettings>>(this.url(this.targetPath(target)), body, this.options())));
  }

  async previewCopy(source: DashboardTarget, destinations: DashboardTarget[], groups: DashboardCopySelection[]): Promise<DashboardCopyPreview> {
    return this.request(firstValueFrom(this.http.post<ApiResponse<DashboardCopyPreview>>(this.url('/copy/preview'), { source, destinations, groups }, this.options())));
  }

  async applyCopy(preview: DashboardCopyPreview, acknowledgedWarningIds: string[]): Promise<{ updated: number; revision: number }> {
    const body = {
      source: preview.source,
      destinations: preview.destinations,
      groups: preview.groups,
      expectedRevision: preview.expectedRevision,
      previewFingerprint: preview.previewFingerprint,
      acknowledgedWarningIds
    };
    return this.request(firstValueFrom(this.http.post<ApiResponse<{ updated: number; revision: number }>>(this.url('/copy/apply'), body, this.options())));
  }
}
