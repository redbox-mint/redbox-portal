// Copyright (c) 2022 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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
import { from } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF } from '@angular/common';
import { ConfigService } from './config.service';
import { HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { UtilityService } from './utility.service';
import { User, UserLoginResult, UserService } from './user.service';
import { LoggerService } from './logger.service';

describe('UserService testing', () => {
  let configService: ConfigService;
  let httpTestingController: HttpTestingController;
  let httpClient: HttpClient;
  let userService: UserService;

  const mockUserData = {
    id: '123',
    username: 'username',
    password: 'password',
    type: 'type',
    name: 'name',
    email: 'email',
    token: 'token',
    roles: [],
    newRoles: [],
    roleStr: '',
  };
  const mockUser: User = mockUserData as User;

  beforeEach(async function () {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        {
          provide: APP_BASE_HREF,
          useValue: 'base',
        },
        ConfigService,
        LoggerService,
        UtilityService,
        UserService,
      ],
    }).compileComponents();
    httpClient = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
    configService = TestBed.inject(ConfigService);
    TestBed.inject(LoggerService);
    TestBed.inject(UtilityService);
    userService = TestBed.inject(UserService);

    const mockCsrfData = { _csrf: 'testCsrfValue' };
    const mockConfigData = {
      csrfToken: mockCsrfData._csrf,
      rootContext: '',
      someRandomKey: 'someRandomValue',
      portal: 'rdmp',
      branding: 'default',
    };

    const csrfReq = httpTestingController.expectOne(configService.csrfTokenUrl);
    csrfReq.flush(mockCsrfData);

    const configReq = httpTestingController.expectOne(configService.configUrl);
    configReq.flush(mockConfigData);

    await userService.waitForInit();
  });

  it('should return a valid user info object', async function () {
    const obs3 = from(userService.getInfo());
    obs3.subscribe((user: any) => {
      console.log(`UserService returned info:`);
      console.log(JSON.stringify(user));
      expect(user).toEqual(mockUserData);
      expect(user).toEqual(mockUser);
    });

    const userInfoReq = httpTestingController.expectOne(userService.getInfoUrl());
    expect(userInfoReq.request.method).toEqual('GET');
    userInfoReq.flush(mockUserData);
  });

  it('should process success login', async function () {
    const mockUserLoginResultSuccessData = { id: 'id', message: 'success', user: mockUserData, url: 'url' };
    const mockUserLoginResultSuccess: UserLoginResult = mockUserLoginResultSuccessData as UserLoginResult;

    const obs1 = from(userService.loginLocal('username', 'correct_password'));
    obs1.subscribe((loginOkRes: any) => {
      expect(loginOkRes).toEqual(mockUserLoginResultSuccessData);
      expect(loginOkRes).toEqual(mockUserLoginResultSuccess);
    });
    const loginOkReq = httpTestingController.expectOne(userService.getLoginUrl());
    expect(loginOkReq.request.method).toEqual('POST');
    loginOkReq.flush(mockUserLoginResultSuccessData);
  });

  it('should process failure login', async function () {
    const mockUserLoginResultFailData = { id: 'id', message: 'fail' };
    const mockUserLoginResultFail: UserLoginResult = mockUserLoginResultFailData as UserLoginResult;

    const obs2 = from(userService.loginLocal('username', 'wrong_password'));
    obs2.subscribe((loginFailRes: any) => {
      expect(loginFailRes).toEqual(mockUserLoginResultFailData);
      expect(loginFailRes).toEqual(mockUserLoginResultFail);
    });

    const loginFailReq = httpTestingController.expectOne(userService.getLoginUrl());
    expect(loginFailReq.request.method).toEqual('POST');
    loginFailReq.flush(mockUserLoginResultFailData);
  });

  it('should call the contract link candidate endpoint', async function () {
    void userService.searchLinkCandidates('primary-1', 'candidate');

    const req = httpTestingController.expectOne(
      request =>
        request.method === 'GET' &&
        request.urlWithParams.includes('/api/users/link/candidates') &&
        request.urlWithParams.includes('primaryUserId=primary-1') &&
        request.urlWithParams.includes('query=candidate')
    );
    expect(req.request.method).toEqual('GET');
    req.flush([]);
  });

  it('should call the contract user audit endpoint', async function () {
    void userService.getUserAudit('user-1');

    const req = httpTestingController.expectOne(
      request => request.method === 'GET' && request.url.includes('/api/users/user-1/audit')
    );
    expect(req.request.method).toEqual('GET');
    req.flush({ user: mockUserData, records: [], summary: { returnedCount: 0, truncated: false } });
  });

  it('should call the contract disable user endpoint with CAS options', async function () {
    void userService.disableUser('user-1', { expectedVersion: 2, reason: 'offboard' });

    const req = httpTestingController.expectOne(
      request => request.method === 'POST' && request.url.includes('/api/users/user-1/disable')
    );
    expect(req.request.method).toEqual('POST');
    expect(req.request.body).toEqual({ expectedVersion: 2, reason: 'offboard' });
    req.flush({ status: true, message: 'User disabled successfully' });
  });

  it('should send the mandatory expectedVersion when updating user roles', async function () {
    void userService.updateUserRoles('user-1', ['role-1', 'role-2'], 4);

    const req = httpTestingController.expectOne(
      request => request.method === 'POST' && request.url.endsWith('/api/users')
    );
    expect(req.request.method).toEqual('POST');
    expect(req.request.body).toEqual({ id: 'user-1', roles: ['role-1', 'role-2'], expectedVersion: 4 });
    req.flush({ status: true, message: 'Save OK.' });
  });

  it('should call the contract link accounts endpoint with pair-bound proof', async function () {
    void userService.linkAccounts('primary-1', 'secondary-1', {
      primaryExpectedVersion: 3,
      secondaryExpectedVersion: 4,
      linkConfirmationToken: 'proof-token',
      linkOperationId: 'op-1',
      reason: 'merge',
    });

    const req = httpTestingController.expectOne(
      request => request.method === 'POST' && request.url.endsWith('/api/users/link')
    );
    expect(req.request.method).toEqual('POST');
    expect(req.request.body).toEqual({
      primaryUserId: 'primary-1',
      secondaryUserId: 'secondary-1',
      primaryExpectedVersion: 3,
      secondaryExpectedVersion: 4,
      linkConfirmationToken: 'proof-token',
      linkOperationId: 'op-1',
      reason: 'merge',
    });
    req.flush({
      primary: mockUserData,
      linkedAccounts: [],
      impact: { rolesMerged: 0, recordsRewritten: 0 },
      recordsPending: true,
      linkOperationId: 'op-1',
    });
  });

  it('should call the contract link retry endpoint with pair-bound proof and path operation id', async function () {
    void userService.retryLinkOperation('op-1', 'primary-1', 'secondary-1', {
      primaryExpectedVersion: 3,
      secondaryExpectedVersion: 4,
      linkConfirmationToken: 'proof-token',
      reason: 'reconcile',
    });

    const req = httpTestingController.expectOne(
      request => request.method === 'POST' && request.url.endsWith('/api/users/link/operations/op-1/retry')
    );
    expect(req.request.method).toEqual('POST');
    expect(req.request.body).toEqual({
      primaryUserId: 'primary-1',
      secondaryUserId: 'secondary-1',
      primaryExpectedVersion: 3,
      secondaryExpectedVersion: 4,
      linkConfirmationToken: 'proof-token',
      reason: 'reconcile',
    });
    req.flush({
      primary: mockUserData,
      linkedAccounts: [],
      impact: { rolesMerged: 0, recordsRewritten: 0 },
      recordsPending: false,
      linkOperationId: 'op-1',
    });
  });

  it('should call the contract link preview and operation endpoints', async function () {
    void userService.previewLinkAccounts('primary-1', 'secondary-1');

    const previewReq = httpTestingController.expectOne(
      request => request.method === 'POST' && request.url.endsWith('/api/users/link/preview')
    );
    expect(previewReq.request.body).toEqual({ primaryUserId: 'primary-1', secondaryUserId: 'secondary-1' });
    previewReq.flush({
      primaryUserId: 'primary-1',
      secondaryUserId: 'secondary-1',
      primaryExpectedVersion: 1,
      secondaryExpectedVersion: 1,
      primaryUsername: 'primary-1',
      secondaryUsername: 'secondary-1',
      rolesToAdopt: 0,
      rolesToRetire: 0,
      confirmationToken: 'token',
      linkOperationId: 'op-1',
    });

    void userService.getLinkOperation('op-1');

    const operationReq = httpTestingController.expectOne(
      request => request.method === 'GET' && request.url.endsWith('/api/users/link/operations/op-1')
    );
    expect(operationReq.request.method).toEqual('GET');
    operationReq.flush({ operationId: 'op-1', status: 'completed', recordsPending: false });
  });

  it('should call the typed contract user endpoints instead of legacy admin URLs', async function () {
    void userService.getUsers({ includeDisabled: true });
    const listReq = httpTestingController.expectOne(
      request => request.method === 'GET' && request.url.includes('/api/users')
    );
    expect(listReq.request.urlWithParams).toContain('includeDisabled=true');
    listReq.flush([]);

    void userService.getBrandRoles();
    const rolesReq = httpTestingController.expectOne(
      request => request.method === 'GET' && request.url.endsWith('/api/roles')
    );
    rolesReq.flush([]);

    void userService.addLocalUser('newuser', { name: 'New', email: 'n@example.com' });
    const createReq = httpTestingController.expectOne(
      request => request.method === 'PUT' && request.url.endsWith('/api/users')
    );
    expect(createReq.request.body).toEqual({ username: 'newuser', name: 'New', email: 'n@example.com' });
    createReq.flush({ id: 'newuser' });

    void userService.updateUserDetails('user-1', { name: 'Renamed', expectedVersion: 3 });
    const updateReq = httpTestingController.expectOne(
      request => request.method === 'POST' && request.url.endsWith('/api/users')
    );
    expect(updateReq.request.body).toEqual({ id: 'user-1', name: 'Renamed', expectedVersion: 3 });
    updateReq.flush([{ id: 'user-1' }]);

    void userService.genKey('user-1', 3);
    const genReq = httpTestingController.expectOne(
      request => request.method === 'POST' && request.url.endsWith('/api/users/token/generate')
    );
    expect(genReq.request.params.get('expectedVersion')).toEqual('3');
    genReq.flush({ status: true });

    void userService.revokeKey('user-1', 3);
    const revokeReq = httpTestingController.expectOne(
      request => request.method === 'POST' && request.url.endsWith('/api/users/token/revoke')
    );
    expect(revokeReq.request.params.get('expectedVersion')).toEqual('3');
    revokeReq.flush({ status: true });
  });

  afterEach(() => {
    httpTestingController.verify();
  });
});
