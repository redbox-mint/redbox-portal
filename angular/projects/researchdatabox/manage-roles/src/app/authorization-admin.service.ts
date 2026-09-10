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

const ACTIONABLE_CODE_MESSAGES = new Map<string, string>([
  [
    'authorization.version-conflict',
    'Authorization data changed while you were editing. Your input is preserved; reload and compare before trying again.',
  ],
  [
    'authorization.preview-stale',
    'The server impact preview is stale. Your input is preserved; request a new preview before applying.',
  ],
  [
    'authorization.last-brand-admin',
    'This change would remove the final effective brand administrator. Assign another administrator first.',
  ],
  [
    'authorization.last-system-admin',
    'This change would remove the final effective system administrator. Assign another administrator first.',
  ],
]);

const ACTIONABLE_STATUS_MESSAGES = new Map<number, string>([
  [409, 'The authorization state changed or a protected invariant rejected the operation. Reload before trying again.'],
  [403, 'You no longer have permission to perform this authorization operation.'],
  [404, 'The requested authorization resource is unavailable in the active brand.'],
  [422, 'The server found invalid rows. Review the preview and correct every fatal error before applying.'],
  [401, 'Your session is no longer authorized. Sign in again before continuing.'],
]);

const TRANSACTION_UNAVAILABLE_MESSAGE =
  'This change could not be committed atomically. No partial authorization change was applied.';
const SERVER_ERROR_MESSAGE =
  'The server could not complete the authorization request. No unconfirmed change should be retried automatically.';

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
    return this.verb<T>('get', path, undefined, query);
  }

  private async post<T>(path: string, body: object): Promise<T> {
    return this.verb<T>('post', path, body);
  }

  private async put<T>(path: string, body: object): Promise<T> {
    return this.verb<T>('put', path, body);
  }

  private async patch<T>(path: string, body: object): Promise<T> {
    return this.verb<T>('patch', path, body);
  }

  private async delete<T>(path: string, body: object): Promise<T> {
    return this.verb<T>('delete', path, body);
  }

  private async verb<T>(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
    body?: object,
    query?: object
  ): Promise<T> {
    if (this.isInitializing()) {
      await this.waitForInit();
    }
    const url = this.apiUrl(path);
    const options = this.jsonOptions();
    switch (method) {
      case 'get':
        return this.request(
          this.http.get<MaybeWrapped<T>>(url, {
            ...options,
            params: this.toHttpParams(query),
          })
        );
      case 'post':
        return this.request(this.http.post<MaybeWrapped<T>>(url, body, options));
      case 'put':
        return this.request(this.http.put<MaybeWrapped<T>>(url, body, options));
      case 'patch':
        return this.request(this.http.patch<MaybeWrapped<T>>(url, body, options));
      case 'delete':
        return this.request(
          this.http.delete<MaybeWrapped<T>>(url, {
            ...options,
            body,
          })
        );
    }
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
    if (!query) {
      return new HttpParams();
    }
    const filtered = Object.entries(query as Record<string, unknown>)
      .filter(([, rawValue]) => rawValue !== undefined && rawValue !== null && rawValue !== '')
      .map(([key, rawValue]) => [key, String(rawValue)] as const);
    return new HttpParams({ fromObject: Object.fromEntries(filtered) });
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
    const byCode = ACTIONABLE_CODE_MESSAGES.get(code);
    if (byCode) {
      return byCode;
    }
    if (status === 409) {
      return ACTIONABLE_STATUS_MESSAGES.get(409) as string;
    }
    if (code === 'authorization.transaction-unavailable' || status === 503) {
      return TRANSACTION_UNAVAILABLE_MESSAGE;
    }
    const byStatus = ACTIONABLE_STATUS_MESSAGES.get(status);
    if (byStatus) {
      return byStatus;
    }
    if (status === 400) {
      return detail || 'Review the supplied authorization values and try again.';
    }
    if (status >= 500) {
      return SERVER_ERROR_MESSAGE;
    }
    return detail || 'The authorization request could not be completed.';
  }
}
