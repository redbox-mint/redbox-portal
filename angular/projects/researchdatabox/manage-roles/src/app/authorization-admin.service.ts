import { APP_BASE_HREF } from '@angular/common';
import { HttpClient, HttpContext, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { ConfigService, HttpClientService, UtilityService } from '@researchdatabox/portal-ng-common';
import { firstValueFrom, Observable } from 'rxjs';
import {
  AssignmentCatalogQuery,
  AssignmentMutationRequest,
  AuditCatalogQuery,
  AuthorizationAssignment,
  AuthorizationAuditEvent,
  AuthorizationMe,
  AuthorizationMutationResult,
  AuthorizationProblemDetails,
  AuthorizationRole,
  AuthorizationRoleSummary,
  AuthorizationScope,
  AuthorizationTemplate,
  AuthorizationTemplateRevision,
  AuthorizationUiErrorState,
  BulkTemplateUpgradePreview,
  BulkTemplateUpgradeRequest,
  CreateRoleRequest,
  CursorPage,
  GrantAssignmentRequest,
  RoleCatalogQuery,
  RoleImpactPreview,
  RoleLifecycleRequest,
  RoleScopeRequest,
  RoleTemplateUpgradeRequest,
  ScopeCatalogPage,
  ScopeCatalogQuery,
  TemplateCatalogQuery,
  UpdateRoleRequest,
} from './authorization-admin.models';

type MaybeWrapped<T> = T | { data: T; meta?: Record<string, unknown> };

export class AuthorizationAdminError extends Error implements AuthorizationUiErrorState {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = 'AuthorizationAdminError';
  }

  public get isConflict(): boolean {
    return this.status === 409;
  }
}

@Injectable()
export class AuthorizationAdminService extends HttpClientService {
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

  public getMe(): Promise<AuthorizationMe> {
    return this.get<AuthorizationMe>('/me');
  }

  public listScopes(query: ScopeCatalogQuery = {}): Promise<ScopeCatalogPage> {
    return this.get<ScopeCatalogPage>('/scopes', query);
  }

  public listTemplates(query: TemplateCatalogQuery = {}): Promise<CursorPage<AuthorizationTemplate>> {
    return this.get<CursorPage<AuthorizationTemplate>>('/templates', query);
  }

  public getTemplateRevision(templateKey: string, revision: number): Promise<AuthorizationTemplateRevision> {
    return this.get<AuthorizationTemplateRevision>(
      `/templates/${encodeURIComponent(templateKey)}/revisions/${encodeURIComponent(String(revision))}`
    );
  }

  public listRoles(query: RoleCatalogQuery = {}): Promise<CursorPage<AuthorizationRoleSummary>> {
    return this.get<CursorPage<AuthorizationRoleSummary>>('/roles', query);
  }

  public getRole(roleKey: string): Promise<AuthorizationRole> {
    return this.get<AuthorizationRole>(`/roles/${encodeURIComponent(roleKey)}`);
  }

  public createRole(request: CreateRoleRequest): Promise<AuthorizationMutationResult<AuthorizationRole>> {
    return this.post<AuthorizationMutationResult<AuthorizationRole>>('/roles', request);
  }

  public updateRole(
    roleKey: string,
    request: UpdateRoleRequest
  ): Promise<AuthorizationMutationResult<AuthorizationRole>> {
    return this.patch<AuthorizationMutationResult<AuthorizationRole>>(`/roles/${encodeURIComponent(roleKey)}`, request);
  }

  public previewRoleScopes(roleKey: string, request: RoleScopeRequest): Promise<RoleImpactPreview> {
    return this.post<RoleImpactPreview>(`/roles/${encodeURIComponent(roleKey)}/scope-preview`, {
      expectedVersion: request.expectedVersion,
      scopeKeys: request.scopeKeys,
      ...(request.reason ? { reason: request.reason } : {}),
    });
  }

  public applyRoleScopes(
    roleKey: string,
    request: RoleScopeRequest & { confirmationToken: string }
  ): Promise<AuthorizationMutationResult<AuthorizationRole>> {
    return this.put<AuthorizationMutationResult<AuthorizationRole>>(
      `/roles/${encodeURIComponent(roleKey)}/scopes`,
      request
    );
  }

  public previewRoleTemplateUpgrade(roleKey: string, request: RoleTemplateUpgradeRequest): Promise<RoleImpactPreview> {
    return this.post<RoleImpactPreview>(`/roles/${encodeURIComponent(roleKey)}/template-upgrade-preview`, {
      expectedVersion: request.expectedVersion,
      targetRevision: request.targetRevision,
      ...(request.reason ? { reason: request.reason } : {}),
    });
  }

  public applyRoleTemplateUpgrade(
    roleKey: string,
    request: RoleTemplateUpgradeRequest & { confirmationToken: string }
  ): Promise<AuthorizationMutationResult<AuthorizationRole>> {
    return this.post<AuthorizationMutationResult<AuthorizationRole>>(
      `/roles/${encodeURIComponent(roleKey)}/template-upgrade`,
      request
    );
  }

  public previewRoleInactivation(roleKey: string, request: RoleLifecycleRequest): Promise<RoleImpactPreview> {
    return this.post<RoleImpactPreview>(`/roles/${encodeURIComponent(roleKey)}/inactivation-preview`, {
      expectedVersion: request.expectedVersion,
      ...(request.reason ? { reason: request.reason } : {}),
    });
  }

  public inactivateRole(
    roleKey: string,
    request: RoleLifecycleRequest & { confirmationToken: string }
  ): Promise<AuthorizationMutationResult<AuthorizationRole>> {
    return this.post<AuthorizationMutationResult<AuthorizationRole>>(
      `/roles/${encodeURIComponent(roleKey)}/inactivate`,
      request
    );
  }

  public previewRoleDeletion(roleKey: string, request: RoleLifecycleRequest): Promise<RoleImpactPreview> {
    return this.delete<RoleImpactPreview>(`/roles/${encodeURIComponent(roleKey)}`, {
      expectedVersion: request.expectedVersion,
      ...(request.reason ? { reason: request.reason } : {}),
    });
  }

  public deleteRole(
    roleKey: string,
    request: RoleLifecycleRequest & { confirmationToken: string }
  ): Promise<AuthorizationMutationResult<AuthorizationRole>> {
    return this.delete<AuthorizationMutationResult<AuthorizationRole>>(
      `/roles/${encodeURIComponent(roleKey)}`,
      request
    );
  }

  public previewBulkTemplateUpgrade(request: BulkTemplateUpgradeRequest): Promise<BulkTemplateUpgradePreview> {
    const { confirmationToken: _confirmationToken, ...previewRequest } = request;
    return this.post<BulkTemplateUpgradePreview>('/template-upgrades/bulk-preview', previewRequest);
  }

  public applyBulkTemplateUpgrade(
    request: BulkTemplateUpgradeRequest & { confirmationToken: string }
  ): Promise<AuthorizationMutationResult<{ appliedCount: number; noOpCount: number; targetRevision: number }>> {
    return this.post<AuthorizationMutationResult<{ appliedCount: number; noOpCount: number; targetRevision: number }>>(
      '/template-upgrades/bulk-apply',
      request
    );
  }

  public listAssignments(query: AssignmentCatalogQuery = {}): Promise<CursorPage<AuthorizationAssignment>> {
    return this.get<CursorPage<AuthorizationAssignment>>('/assignments', query);
  }

  public grantAssignment(
    roleKey: string,
    userId: string,
    request: GrantAssignmentRequest
  ): Promise<AuthorizationMutationResult<AuthorizationAssignment>> {
    return this.put<AuthorizationMutationResult<AuthorizationAssignment>>(
      `/assignments/${encodeURIComponent(roleKey)}/users/${encodeURIComponent(userId)}`,
      request
    );
  }

  public revokeAssignment(
    roleKey: string,
    userId: string,
    request: AssignmentMutationRequest
  ): Promise<AuthorizationMutationResult<AuthorizationAssignment>> {
    return this.delete<AuthorizationMutationResult<AuthorizationAssignment>>(
      `/assignments/${encodeURIComponent(roleKey)}/users/${encodeURIComponent(userId)}`,
      request
    );
  }

  public suppressAssignment(
    assignmentId: string,
    request: AssignmentMutationRequest
  ): Promise<AuthorizationMutationResult<AuthorizationAssignment>> {
    return this.post<AuthorizationMutationResult<AuthorizationAssignment>>(
      `/assignments/${encodeURIComponent(assignmentId)}/suppress`,
      request
    );
  }

  public unsuppressAssignment(
    assignmentId: string,
    request: AssignmentMutationRequest
  ): Promise<AuthorizationMutationResult<AuthorizationAssignment>> {
    return this.post<AuthorizationMutationResult<AuthorizationAssignment>>(
      `/assignments/${encodeURIComponent(assignmentId)}/unsuppress`,
      request
    );
  }

  public listAudit(query: AuditCatalogQuery = {}): Promise<CursorPage<AuthorizationAuditEvent>> {
    return this.get<CursorPage<AuthorizationAuditEvent>>('/audit', query);
  }

  public toUiError(error: unknown): AuthorizationAdminError {
    if (error instanceof AuthorizationAdminError) {
      return error;
    }
    return new AuthorizationAdminError(
      0,
      'authorization.client-error',
      'The authorization request could not be completed.'
    );
  }

  private async get<T>(path: string, query?: object): Promise<T> {
    if (this.isInitializing()) {
      await this.waitForInit();
    }
    return this.request(
      this.http.get<MaybeWrapped<T>>(this.apiUrl(path), {
        ...this.jsonOptions(),
        params: this.toHttpParams(query),
      })
    );
  }

  private async post<T>(path: string, body: object): Promise<T> {
    if (this.isInitializing()) {
      await this.waitForInit();
    }
    return this.request(this.http.post<MaybeWrapped<T>>(this.apiUrl(path), body, this.jsonOptions()));
  }

  private async put<T>(path: string, body: object): Promise<T> {
    if (this.isInitializing()) {
      await this.waitForInit();
    }
    return this.request(this.http.put<MaybeWrapped<T>>(this.apiUrl(path), body, this.jsonOptions()));
  }

  private async patch<T>(path: string, body: object): Promise<T> {
    if (this.isInitializing()) {
      await this.waitForInit();
    }
    return this.request(this.http.patch<MaybeWrapped<T>>(this.apiUrl(path), body, this.jsonOptions()));
  }

  private async delete<T>(path: string, body: object): Promise<T> {
    if (this.isInitializing()) {
      await this.waitForInit();
    }
    return this.request(
      this.http.delete<MaybeWrapped<T>>(this.apiUrl(path), {
        ...this.jsonOptions(),
        body,
      })
    );
  }

  private apiUrl(path: string): string {
    return `${this.brandingAndPortalUrl}/api/authorization${path}`;
  }

  private jsonOptions(): { responseType: 'json'; observe: 'body'; context: HttpContext } {
    return {
      responseType: 'json',
      observe: 'body',
      context: this.httpContext,
    };
  }

  private toHttpParams(query?: object): HttpParams {
    let params = new HttpParams();
    if (!query) {
      return params;
    }
    for (const [key, rawValue] of Object.entries(query as Record<string, unknown>)) {
      if (rawValue === undefined || rawValue === null || rawValue === '') {
        continue;
      }
      params = params.set(key, String(rawValue));
    }
    return params;
  }

  private async request<T>(observable: Observable<MaybeWrapped<T>>): Promise<T> {
    try {
      const response = await firstValueFrom(observable);
      if (this.isWrapped(response)) {
        return response.data;
      }
      return response;
    } catch (error) {
      throw this.mapHttpError(error);
    }
  }

  private isWrapped<T>(response: MaybeWrapped<T>): response is { data: T; meta?: Record<string, unknown> } {
    return Boolean(response && typeof response === 'object' && 'data' in response && 'meta' in response);
  }

  private mapHttpError(error: unknown): AuthorizationAdminError {
    if (!(error instanceof HttpErrorResponse)) {
      return new AuthorizationAdminError(
        0,
        'authorization.network-error',
        'The server could not be reached. Try again.'
      );
    }
    if (error.status === 0) {
      return new AuthorizationAdminError(
        0,
        'authorization.network-error',
        'The server could not be reached. Check your connection and try again.'
      );
    }
    const problem = this.asProblem(error.error);
    const code = problem?.code ?? `authorization.http-${error.status}`;
    return new AuthorizationAdminError(
      error.status,
      code,
      this.actionableMessage(error.status, code, problem?.detail),
      problem?.requestId
    );
  }

  private asProblem(value: unknown): AuthorizationProblemDetails | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate['type'] !== 'string' ||
      typeof candidate['title'] !== 'string' ||
      typeof candidate['status'] !== 'number' ||
      typeof candidate['detail'] !== 'string' ||
      typeof candidate['instance'] !== 'string' ||
      typeof candidate['code'] !== 'string' ||
      typeof candidate['requestId'] !== 'string'
    ) {
      return undefined;
    }
    return {
      type: candidate['type'],
      title: candidate['title'],
      status: candidate['status'],
      detail: candidate['detail'],
      instance: candidate['instance'],
      code: candidate['code'],
      requestId: candidate['requestId'],
    };
  }

  private actionableMessage(status: number, code: string, detail?: string): string {
    if (code === 'authorization.version-conflict') {
      return 'Authorization data changed while you were editing. Your input is preserved; reload and compare before trying again.';
    }
    if (code === 'authorization.preview-stale') {
      return 'The server impact preview is stale. Your input is preserved; request a new preview before applying.';
    }
    if (code === 'authorization.last-brand-admin') {
      return 'This change would remove the final effective brand administrator. Assign another administrator first.';
    }
    if (code === 'authorization.last-system-admin') {
      return 'This change would remove the final effective system administrator. Assign another administrator first.';
    }
    if (status === 409) {
      return 'The authorization state changed or a protected invariant rejected the operation. Reload before trying again.';
    }
    if (code === 'authorization.transaction-unavailable' || status === 503) {
      return 'This change could not be committed atomically. No partial authorization change was applied.';
    }
    if (status === 403) {
      return 'You no longer have permission to perform this authorization operation.';
    }
    if (status === 404) {
      return 'The requested authorization resource is unavailable in the active brand.';
    }
    if (status === 422) {
      return 'The server found invalid rows. Review the preview and correct every fatal error before applying.';
    }
    if (status === 400) {
      return detail || 'Review the supplied authorization values and try again.';
    }
    if (status === 401) {
      return 'Your session is no longer authorized. Sign in again before continuing.';
    }
    if (status >= 500) {
      return 'The server could not complete the authorization request. No unconfirmed change should be retried automatically.';
    }
    return detail || 'The authorization request could not be completed.';
  }
}
