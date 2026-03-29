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
import { merge as _merge } from 'lodash-es';

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

  protected infoUrl: string = "";
  protected loginUrl: string = "";
  private requestOptions:any = null as any;
  
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
    const req = this.http.get<User>(this.infoUrl, {responseType: 'json', observe: 'body', context: this.httpContext});
    req.pipe(
      map((data:any) => {
        return data as User;
      })
    );
    return firstValueFrom(req);
  } 

  loginLocal(username: string, password: string): Promise<any> {
    this.loggerService.debug(`Logging in locally using brand: ${this.config.branding}, portal: ${this.config.portal}:: ${this.loginUrl}`);
    const req = this.http.post(this.loginUrl, {username: username, password:password, branding:this.config.branding, portal: this.config.portal}, {responseType: 'json', observe: 'body', context: this.httpContext});
    req.pipe(
      map((data: any) => {
        return data as UserLoginResult
      })
    );
    return firstValueFrom(req);
  }

  public override async waitForInit(): Promise<any> {
    await super.waitForInit();
    this.infoUrl = `${this.baseUrlWithContext}/user/info`;
    this.loginUrl = `${this.baseUrlWithContext}/user/login_local`;
    this.requestOptions = this.reqOptsJsonBodyOnly;
    this.enableCsrfHeader();
    _merge(this.requestOptions, {context: this.httpContext});
    return this;
  }

  public getLoginUrl(): string {
    return this.loginUrl;
  }

  public getInfoUrl(): string {
    return this.infoUrl;
  }

  // old options from angular legacy
  // headersObj['X-Source'] = 'jsclient';
  // headersObj['Content-Type'] = 'application/json;charset=utf-8';
  // headersObj['X-CSRF-Token'] = this.config.csrfToken;
  public async getUsers(options?: { includeDisabled?: boolean }) {
    let url = `${this.brandingAndPortalUrl}/admin/users/get`;
    if (options?.includeDisabled) {
      url += '?includeDisabled=true';
    }
    const result$ = this.http.get(url, this.requestOptions).pipe(map(res => res));
    let result =  await firstValueFrom(result$);
    return result; // old function in angular legacy returned User[]
  }

  public async updateUserDetails(userid: any, details: any) {
    let url = `${this.brandingAndPortalUrl}/admin/users/update`;
    const result$ = this.http.post(url, {userid: userid, details:details}, this.requestOptions).pipe(map(res => res));
    let result =  await firstValueFrom(result$);
    return result; // old function in angular legacy returned SaveResult[]
  }

  public async addLocalUser(username: any, details: any) {
    let url = `${this.brandingAndPortalUrl}/admin/users/newUser`;
    const result$ =  this.http.post(url, {username: username, details:details}, this.requestOptions).pipe(map(res => res));
    let result =  await firstValueFrom(result$);
    return result; // old function in angular legacy returned SaveResult[]
  }

  public async genKey(userid: any) {
    let url = `${this.brandingAndPortalUrl}/admin/users/genKey`;
    const result$ = this.http.post(url, {userid: userid}, this.requestOptions).pipe(map(res => res));
    let result =  await firstValueFrom(result$);
    return result; // old function in angular legacy returned SaveResult[]
  }

  public async revokeKey(userid: any) {
    let url = `${this.brandingAndPortalUrl}/admin/users/revokeKey`;
    const result$ = this.http.post(url, {userid: userid}, this.requestOptions).pipe(map(res => res));
    let result =  await firstValueFrom(result$);
    return result; // old function in angular legacy returned SaveResult[]
  }

  public async getBrandRoles() {
    let url = `${this.brandingAndPortalUrl}/admin/roles/get`;
    const result$ = this.http.get(url,this.requestOptions).pipe(map(res => res));
    let result =  await firstValueFrom(result$);
    return result; // old function in angular legacy returned Role[]
  }

  public async updateUserRoles(userid: any, roleIds: any) {
    let url = `${this.brandingAndPortalUrl}/admin/roles/user`;
    const result$ = this.http.post(url, {userid: userid, roles:roleIds},this.requestOptions).pipe(map(res => res));
    let result =  await firstValueFrom(result$);
    return result; // old function in angular legacy returned SaveResult[]
  }

  public async searchLinkCandidates(primaryUserId: string, query: string): Promise<UserLinkCandidate[]> {
    const url = `${this.brandingAndPortalUrl}/api/users/link/candidates`;
    const result$ = this.http.get<UserLinkCandidate[]>(url, {
      responseType: 'json',
      observe: 'body',
      context: this.httpContext,
      params: {
        primaryUserId,
        query
      }
    }).pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async getUserLinks(primaryUserId: string): Promise<UserLinkResponse> {
    const url = `${this.brandingAndPortalUrl}/api/users/${primaryUserId}/links`;
    const result$ = this.http.get<UserLinkResponse>(url, {
      responseType: 'json',
      observe: 'body',
      context: this.httpContext
    }).pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async getUserAudit(userId: string): Promise<UserAuditResponse> {
    const url = `${this.brandingAndPortalUrl}/api/users/${userId}/audit`;
    const result$ = this.http.get<UserAuditResponse>(url, {
      responseType: 'json',
      observe: 'body',
      context: this.httpContext
    }).pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async disableUser(userId: string): Promise<SaveResult> {
    const url = `${this.brandingAndPortalUrl}/api/users/${userId}/disable`;
    const result$ = this.http.post<SaveResult>(url, {}, {
      responseType: 'json',
      observe: 'body',
      context: this.httpContext
    }).pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async enableUser(userId: string): Promise<SaveResult> {
    const url = `${this.brandingAndPortalUrl}/api/users/${userId}/enable`;
    const result$ = this.http.post<SaveResult>(url, {}, {
      responseType: 'json',
      observe: 'body',
      context: this.httpContext
    }).pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  public async linkAccounts(primaryUserId: string, secondaryUserId: string): Promise<UserLinkResponse> {
    const url = `${this.brandingAndPortalUrl}/api/users/link`;
    const result$ = this.http.post<UserLinkResponse>(url, { primaryUserId, secondaryUserId }, {
      responseType: 'json',
      observe: 'body',
      context: this.httpContext
    }).pipe(map(res => res));
    return await firstValueFrom(result$);
  }
  
}
