import { Inject, Injectable } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClient, HttpContext } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService, HttpClientService, UtilityService } from '@researchdatabox/portal-ng-common';

export interface DashboardRowConfig {
  title: string;
  variable: string;
  template: string;
  initialSort?: 'asc' | 'desc';
  defaultSort?: boolean;
  secondarySort?: string;
}

export interface DashboardRowRule {
  name: string;
  action: 'show' | 'hide';
  mode?: 'all' | 'alo';
  renderItemTemplate: string;
  evaluateRulesTemplate?: string;
}

export interface DashboardRulesConfig {
  ruleSetName: string;
  applyRuleSet: boolean;
  type?: string;
  separator?: string;
  mode?: 'all' | 'alo';
  rules: DashboardRowRule[];
}

export interface DashboardFormatRules {
  filterBy?: Record<string, unknown>;
  filterWorkflowStepsBy?: string[];
  recordTypeFilterBy?: string;
  queryFilters?: Record<string, unknown>;
  sortBy?: string;
  groupBy?: string;
  sortGroupBy?: Array<Record<string, unknown>>;
  hideWorkflowStepTitleForRecordType?: string[];
}

export interface DashboardTableConfig {
  rowConfig?: DashboardRowConfig[];
  formatRules?: DashboardFormatRules;
  rowRulesConfig?: DashboardRulesConfig[];
  groupRowConfig?: DashboardRowConfig[];
  groupRowRulesConfig?: DashboardRulesConfig[];
}

export interface DashboardTypeDefinition {
  name: string;
  description?: string;
  searchable?: boolean;
  system?: boolean;
  formatRules: DashboardFormatRules;
  tableConfig: DashboardTableConfig;
}

export interface DashboardConfigInfo {
  recordTypes: Array<{ name: string; steps: string[] }>;
  views: Array<{ name: string; steps: string[] }>;
  dashboardTypes: DashboardTypeDefinition[];
}

export interface WorkflowStateDashboardConfig {
  dashboardType: string;
  tableConfig?: DashboardTableConfig;
}

export interface DashboardTableOverrideConfigData {
  recordTypes?: Record<string, { default?: WorkflowStateDashboardConfig; steps?: Record<string, WorkflowStateDashboardConfig> }>;
  views?: Record<string, { default?: WorkflowStateDashboardConfig; steps?: Record<string, WorkflowStateDashboardConfig> }>;
}

export interface MergedDashboardConfigResult {
  dashboardType: string;
  inheritedTypeConfig: DashboardTableConfig;
  workflowConfig: DashboardTableConfig | null;
  overrideConfig: DashboardTableConfig | null;
  mergedConfig: DashboardTableConfig;
  formatRules: DashboardFormatRules;
}

type ApiResponse<T> = { data: T };
type JsonRequestOptions = { responseType: 'json'; observe: 'body'; context: HttpContext };

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
    return `${this.brandingAndPortalUrl}/api/dashboard-config${path}`;
  }

  async getConfigInfo(): Promise<DashboardConfigInfo> {
    const response = await firstValueFrom(this.http.get<ApiResponse<DashboardConfigInfo>>(this.apiUrl('/info'), this.getJsonRequestOptions()));
    return this.unwrap(response);
  }

  async getDefaults(params?: { recordType?: string; workflowStage?: string; viewName?: string; stepName?: string; dashboardType?: string }): Promise<Record<string, unknown>> {
    const query = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]).toString() : '';
    const response = await firstValueFrom(this.http.get<ApiResponse<Record<string, unknown>>>(this.apiUrl(`/defaults${query}`), this.getJsonRequestOptions()));
    return this.unwrap(response);
  }

  async getOverrides(): Promise<DashboardTableOverrideConfigData> {
    const response = await firstValueFrom(this.http.get<ApiResponse<DashboardTableOverrideConfigData>>(this.apiUrl('/overrides'), this.getJsonRequestOptions()));
    return this.unwrap(response);
  }

  async saveOverrides(overrides: DashboardTableOverrideConfigData): Promise<DashboardTableOverrideConfigData> {
    const response = await firstValueFrom(this.http.put<ApiResponse<DashboardTableOverrideConfigData>>(this.apiUrl('/overrides'), overrides, this.getJsonRequestOptions()));
    return this.unwrap(response);
  }

  async getDashboardTypes(): Promise<DashboardTypeDefinition[]> {
    const response = await firstValueFrom(this.http.get<ApiResponse<{ dashboardTypes: DashboardTypeDefinition[] }>>(this.apiUrl('/dashboard-types'), this.getJsonRequestOptions()));
    return this.unwrap(response).dashboardTypes;
  }

  async getDashboardType(name: string): Promise<DashboardTypeDefinition | null> {
    const response = await firstValueFrom(this.http.get<ApiResponse<DashboardTypeDefinition | null>>(this.apiUrl(`/dashboard-types/${encodeURIComponent(name)}`), this.getJsonRequestOptions()));
    return this.unwrap(response);
  }

  async createDashboardType(input: Partial<DashboardTypeDefinition> & { name: string }): Promise<DashboardTypeDefinition> {
    const response = await firstValueFrom(this.http.post<ApiResponse<DashboardTypeDefinition>>(this.apiUrl('/dashboard-types'), input, this.getJsonRequestOptions()));
    return this.unwrap(response);
  }

  async updateDashboardType(name: string, input: Partial<DashboardTypeDefinition>): Promise<DashboardTypeDefinition> {
    const response = await firstValueFrom(this.http.put<ApiResponse<DashboardTypeDefinition>>(this.apiUrl(`/dashboard-types/${encodeURIComponent(name)}`), input, this.getJsonRequestOptions()));
    return this.unwrap(response);
  }

  async deleteDashboardType(name: string): Promise<{ deleted: boolean }> {
    const response = await firstValueFrom(this.http.delete<ApiResponse<{ deleted: boolean }>>(this.apiUrl(`/dashboard-types/${encodeURIComponent(name)}`), this.getJsonRequestOptions()));
    return this.unwrap(response);
  }

  async saveWorkflowStateDashboardConfig(recordType: string, workflowStage: string, config: WorkflowStateDashboardConfig): Promise<DashboardTableOverrideConfigData> {
    const response = await firstValueFrom(this.http.put<ApiResponse<DashboardTableOverrideConfigData>>(this.apiUrl(`/record-types/${encodeURIComponent(recordType)}/steps/${encodeURIComponent(workflowStage)}`), config, this.getJsonRequestOptions()));
    return this.unwrap(response);
  }

  async saveDashboardViewStepConfig(viewName: string, stepName: string, config: WorkflowStateDashboardConfig): Promise<DashboardTableOverrideConfigData> {
    const response = await firstValueFrom(this.http.put<ApiResponse<DashboardTableOverrideConfigData>>(this.apiUrl(`/views/${encodeURIComponent(viewName)}/steps/${encodeURIComponent(stepName)}`), config, this.getJsonRequestOptions()));
    return this.unwrap(response);
  }

  async getMergedConfig(recordType: string, workflowStage: string): Promise<MergedDashboardConfigResult | null> {
    const response = await firstValueFrom(this.http.get<ApiResponse<MergedDashboardConfigResult | null>>(this.apiUrl(`/merged/${encodeURIComponent(recordType)}/${encodeURIComponent(workflowStage)}`), this.getJsonRequestOptions()));
    return this.unwrap(response);
  }

  async getMergedViewConfig(viewName: string, stepName: string): Promise<MergedDashboardConfigResult | null> {
    const response = await firstValueFrom(this.http.get<ApiResponse<MergedDashboardConfigResult | null>>(this.apiUrl(`/merged-view/${encodeURIComponent(viewName)}/${encodeURIComponent(stepName)}`), this.getJsonRequestOptions()));
    return this.unwrap(response);
  }

  async getMergedTypeFormatRules(dashboardType: string): Promise<DashboardFormatRules | null> {
    const response = await firstValueFrom(this.http.get<ApiResponse<DashboardFormatRules | null>>(this.apiUrl(`/merged-type/${encodeURIComponent(dashboardType)}`), this.getJsonRequestOptions()));
    return this.unwrap(response);
  }
}
