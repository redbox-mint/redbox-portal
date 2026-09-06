// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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
import { Inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { APP_BASE_HREF } from '@angular/common';

import { ConfigService } from './config.service';
import { UtilityService } from './utility.service';
import { HttpClientService } from './httpClient.service';
import { LoggerService } from './logger.service';

export interface User {
  id: string;
  username: string;
  password: string;
  type: string;
  name: string;
  email: string;
  token: string;
  roles: Role[];
  newRoles: Role[];
  roleStr: string;
  accountLinkState?: 'active' | 'linked-alias';
  linkedPrimaryUserId?: string;
  effectivePrimaryUsername?: string;
  linkedAccountCount?: number;
  loginDisabled?: boolean;
  loginDisabledVersion?: number;
  effectiveLoginDisabled?: boolean;
  disabledByPrimaryUserId?: string;
  disabledByPrimaryUsername?: string;
}

export interface Role {
  id: string;
  name: string;
  users: User[];
  hasRole: boolean;
}

export interface UserLoginResult {
  id: string;
  message: string;
  user: User;
  url: string;
}

export interface SaveResult {
  status: boolean;
  message: string;
  version?: number;
}

export interface UserAccessOptions {
  /** AUTH-P5-002: mandatory caller-observed version for CAS (legacy rows send 1). */
  expectedVersion: number;
  reason?: string;
}

export interface LinkedUserSummary {
  id: string;
  username: string;
  name: string;
  email: string;
  type: string;
  accountLinkState: string;
  linkedAt?: string;
}

export interface UserLinkCandidate {
  id: string;
  username: string;
  name: string;
  email: string;
  type: string;
  accountLinkState: string;
}

export interface UserLinkResponse {
  primary: LinkedUserSummary;
  linkedAccounts: LinkedUserSummary[];
  impact?: {
    recordsRewritten: number;
    rolesMerged: number;
  };
  // AUTH-TXN-001: pending status + operation ID are mandatory end-to-end so
  // the UI always polls the durable operation instead of assuming atomic
  // completion.
  recordsPending: boolean;
  linkOperationId: string;
}

export interface UserListResponse {
  records: User[];
}

export interface UserDetailsUpdate {
  name?: string;
  email?: string;
  password?: string;
  roles?: string[];
  /** AUTH-P5-002: mandatory caller-observed version for CAS (legacy rows send 1). */
  expectedVersion: number;
}

export interface LocalUserCreateDetails {
  name?: string;
  email?: string;
  password?: string;
  roles?: string[];
}

export interface RoleSummary {
  id: string;
  name: string;
}

/**
 * Pair-bound proof for account-link apply. All four fields are REQUIRED:
 * both caller-observed versions, the preview confirmation token, and the
 * stable operation ID from preview. Omission fails closed server-side.
 */
export interface LinkAccountsOptions {
  primaryExpectedVersion: number;
  secondaryExpectedVersion: number;
  linkConfirmationToken: string;
  linkOperationId: string;
  reason?: string;
}

export interface RetryLinkAccountsOptions {
  primaryExpectedVersion: number;
  secondaryExpectedVersion: number;
  linkConfirmationToken: string;
  reason?: string;
}

export interface LinkAccountsPreview {
  primaryUserId: string;
  secondaryUserId: string;
  primaryExpectedVersion: number;
  secondaryExpectedVersion: number;
  primaryUsername: string;
  secondaryUsername: string;
  rolesToAdopt: number;
  rolesToRetire: number;
  confirmationToken: string;
  linkOperationId: string;
}

export type LinkOperationStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface LinkOperationState {
  operationId: string;
  brandId: string;
  primaryUserId: string;
  secondaryUserId: string;
  primaryUsername: string;
  secondaryUsername: string;
  secondaryEmail: string;
  status: LinkOperationStatus;
  recordsPending: boolean;
  recordsRewritten: number;
  rolesAdopted: number;
  rolesRetired: number;
  attemptCount: number;
  // AUTH-TXN-001 durable plan + per-record progress (mandatory).
  recordOids: string[];
  recordsCompletedOids: string[];
}

export interface ApiProblem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  instance?: string;
  requestId?: string;
}

export function getApiProblemCode(error: unknown): string | undefined {
  const data = (error as { error?: unknown })?.error;
  if (typeof data === 'object' && data !== null && 'code' in data) {
    const code = (data as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

export function getApiProblemStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown })?.status;
  return typeof status === 'number' ? status : undefined;
}

export interface UserAuditActor {
  username: string;
  name?: string;
  email?: string;
}

export interface UserAuditRecord {
  id: string;
  timestamp: string | null;
  action: string;
  actor: UserAuditActor;
  details: string;
  parsedAdditionalContext: unknown;
  rawAdditionalContext: string | null;
  parseError: boolean;
}

export interface UserAuditSummary {
  returnedCount: number;
  truncated: boolean;
}

export interface UserAuditResponse {
  user: User;
  records: UserAuditRecord[];
  summary: UserAuditSummary;
}

/**
 * User-centric functions.
 *
 * Note: functions will be ported over as these are consumed by the apps/
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 *
 */
@Injectable()
export class UserService extends HttpClientService {
  protected infoUrl: string = '';
  protected loginUrl: string = '';

  constructor(
    @Inject(HttpClient) protected override http: HttpClient,
    @Inject(APP_BASE_HREF) public override rootContext: string,
    @Inject(UtilityService) protected override utilService: UtilityService,
    @Inject(ConfigService) protected override configService: ConfigService,
    @Inject(LoggerService) private loggerService: LoggerService
  ) {
    super(http, rootContext, utilService, configService);
  }
  public getInfo(): Promise<User> {
    const req = this.http.get<User>(this.infoUrl, {
      responseType: 'json',
      observe: 'body',
      context: this.httpContext,
    });
    return firstValueFrom(req);
  }

  loginLocal(username: string, password: string): Promise<UserLoginResult> {
    this.loggerService.debug(
      `Logging in locally using brand: ${this.config.branding}, portal: ${this.config.portal}:: ${this.loginUrl}`
    );
    const req = this.http.post<UserLoginResult>(
      this.loginUrl,
      { username: username, password: password, branding: this.config.branding, portal: this.config.portal },
      { responseType: 'json', observe: 'body', context: this.httpContext }
    );
    return firstValueFrom(req);
  }

  public override async waitForInit(): Promise<this> {
    await super.waitForInit();
    this.infoUrl = `${this.baseUrlWithContext}/user/info`;
    this.loginUrl = `${this.baseUrlWithContext}/user/login_local`;
    this.enableCsrfHeader();
    return this;
  }

  public getLoginUrl(): string {
    return this.loginUrl;
  }

  public getInfoUrl(): string {
    return this.infoUrl;
  }

  // RB-ANGULAR-001: typed /api contract endpoints. The legacy /admin URLs are
  // no longer used by maintained operations; every call below carries the
  // ambient CSRF context inline (no shared request-options bridge).
  private apiJsonOptions(): object {
    return { responseType: 'json', observe: 'body', context: this.httpContext };
  }

  public async getUsers(options?: { includeDisabled?: boolean }): Promise<User[] | UserListResponse> {
    let url = `${this.brandingAndPortalUrl}/api/users`;
    if (options?.includeDisabled) {
      url += '?includeDisabled=true';
    }
    const result$ = this.http
      .get<User[] | UserListResponse>(url, {
        responseType: 'json',
        observe: 'body',
        context: this.httpContext,
      })
      .pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async updateUserDetails(userid: string, details: UserDetailsUpdate): Promise<SaveResult> {
    const url = `${this.brandingAndPortalUrl}/api/users`;
    const result$ = this.http
      .post<SaveResult>(
        url,
        { id: userid, ...details },
        { responseType: 'json', observe: 'body', context: this.httpContext }
      )
      .pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async addLocalUser(username: string, details: LocalUserCreateDetails): Promise<SaveResult> {
    const url = `${this.brandingAndPortalUrl}/api/users`;
    const result$ = this.http
      .put<SaveResult>(
        url,
        { username: username, ...details },
        { responseType: 'json', observe: 'body', context: this.httpContext }
      )
      .pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async genKey(userid: string, expectedVersion: number): Promise<SaveResult> {
    const url = `${this.brandingAndPortalUrl}/api/users/token/generate`;
    const result$ = this.http
      .post<SaveResult>(
        url,
        {},
        {
          responseType: 'json',
          observe: 'body',
          context: this.httpContext,
          params: { id: userid, expectedVersion: String(expectedVersion) },
        }
      )
      .pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async revokeKey(userid: string, expectedVersion: number): Promise<SaveResult> {
    const url = `${this.brandingAndPortalUrl}/api/users/token/revoke`;
    const result$ = this.http
      .post<SaveResult>(
        url,
        {},
        {
          responseType: 'json',
          observe: 'body',
          context: this.httpContext,
          params: { id: userid, expectedVersion: String(expectedVersion) },
        }
      )
      .pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async getBrandRoles(): Promise<RoleSummary[]> {
    const url = `${this.brandingAndPortalUrl}/api/roles`;
    const result$ = this.http
      .get<RoleSummary[]>(url, { responseType: 'json', observe: 'body', context: this.httpContext })
      .pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async updateUserRoles(userid: string, roleIds: string[], expectedVersion: number): Promise<SaveResult> {
    // AUTH-P5-002: role CAS is mandatory — the caller-observed user version
    // is always sent (the server rejects the write without it).
    const url = `${this.brandingAndPortalUrl}/api/users`;
    const result$ = this.http
      .post<SaveResult>(
        url,
        { id: userid, roles: roleIds, expectedVersion },
        { responseType: 'json', observe: 'body', context: this.httpContext }
      )
      .pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async searchLinkCandidates(primaryUserId: string, query: string): Promise<UserLinkCandidate[]> {
    // RB-ANGULAR-001: contract endpoint (was compatibility /admin/users/...).
    const url = `${this.brandingAndPortalUrl}/api/users/link/candidates`;
    const result$ = this.http
      .get<UserLinkCandidate[]>(url, {
        responseType: 'json',
        observe: 'body',
        context: this.httpContext,
        params: {
          primaryUserId,
          query,
        },
      })
      .pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async getUserLinks(primaryUserId: string): Promise<UserLinkResponse> {
    // RB-ANGULAR-001: contract endpoint (was compatibility /admin/users/...).
    const url = `${this.brandingAndPortalUrl}/api/users/${primaryUserId}/links`;
    const result$ = this.http
      .get<UserLinkResponse>(url, {
        responseType: 'json',
        observe: 'body',
        context: this.httpContext,
      })
      .pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async getUserAudit(userId: string): Promise<UserAuditResponse> {
    // RB-ANGULAR-001: contract endpoint (was compatibility /admin/users/...).
    const url = `${this.brandingAndPortalUrl}/api/users/${userId}/audit`;
    const result$ = this.http
      .get<UserAuditResponse>(url, {
        responseType: 'json',
        observe: 'body',
        context: this.httpContext,
      })
      .pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async disableUser(userId: string, options: UserAccessOptions): Promise<SaveResult> {
    // RB-ANGULAR-001: contract endpoint (was compatibility /admin/users/...).
    // AUTH-P5-002: CAS is mandatory — the version is always sent.
    const url = `${this.brandingAndPortalUrl}/api/users/${userId}/disable`;
    const body: Record<string, unknown> = { expectedVersion: options.expectedVersion };
    if (options.reason !== undefined) body['reason'] = options.reason;
    const result$ = this.http
      .post<SaveResult>(url, body, {
        responseType: 'json',
        observe: 'body',
        context: this.httpContext,
      })
      .pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async enableUser(userId: string, options: UserAccessOptions): Promise<SaveResult> {
    // RB-ANGULAR-001: contract endpoint (was compatibility /admin/users/...).
    // AUTH-P5-002: CAS is mandatory — the version is always sent.
    const url = `${this.brandingAndPortalUrl}/api/users/${userId}/enable`;
    const body: Record<string, unknown> = { expectedVersion: options.expectedVersion };
    if (options.reason !== undefined) body['reason'] = options.reason;
    const result$ = this.http
      .post<SaveResult>(url, body, {
        responseType: 'json',
        observe: 'body',
        context: this.httpContext,
      })
      .pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async linkAccounts(
    primaryUserId: string,
    secondaryUserId: string,
    options: LinkAccountsOptions
  ): Promise<UserLinkResponse> {
    // RB-ANGULAR-001: contract endpoint carrying the full pair-bound proof
    // (both expected versions plus the preview confirmation token and the
    // stable operation ID). All proof fields are required — omission fails
    // closed server-side.
    const url = `${this.brandingAndPortalUrl}/api/users/link`;
    const body: Record<string, unknown> = {
      primaryUserId,
      secondaryUserId,
      primaryExpectedVersion: options.primaryExpectedVersion,
      secondaryExpectedVersion: options.secondaryExpectedVersion,
      linkConfirmationToken: options.linkConfirmationToken,
      linkOperationId: options.linkOperationId,
    };
    if (options.reason !== undefined) body['reason'] = options.reason;
    const result$ = this.http
      .post<UserLinkResponse>(url, body, {
        responseType: 'json',
        observe: 'body',
        context: this.httpContext,
      })
      .pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async previewLinkAccounts(primaryUserId: string, secondaryUserId: string): Promise<LinkAccountsPreview> {
    const url = `${this.brandingAndPortalUrl}/api/users/link/preview`;
    const result$ = this.http
      .post<LinkAccountsPreview>(
        url,
        { primaryUserId, secondaryUserId },
        { responseType: 'json', observe: 'body', context: this.httpContext }
      )
      .pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async getLinkOperation(operationId: string): Promise<LinkOperationState> {
    const url = `${this.brandingAndPortalUrl}/api/users/link/operations/${operationId}`;
    const result$ = this.http
      .get<LinkOperationState>(url, { responseType: 'json', observe: 'body', context: this.httpContext })
      .pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async retryLinkOperation(
    operationId: string,
    primaryUserId: string,
    secondaryUserId: string,
    options: RetryLinkAccountsOptions
  ): Promise<UserLinkResponse> {
    const url = `${this.brandingAndPortalUrl}/api/users/link/operations/${operationId}/retry`;
    const body: Record<string, unknown> = {
      primaryUserId,
      secondaryUserId,
      primaryExpectedVersion: options.primaryExpectedVersion,
      secondaryExpectedVersion: options.secondaryExpectedVersion,
      linkConfirmationToken: options.linkConfirmationToken,
    };
    if (options.reason !== undefined) body['reason'] = options.reason;
    const result$ = this.http
      .post<UserLinkResponse>(url, body, { responseType: 'json', observe: 'body', context: this.httpContext })
      .pipe(map(res => res));
    return await firstValueFrom(result$);
  }
}
