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

  const mockUserData = { id: '123', username: 'username', password: 'password', type: 'type', name: 'name', email: 'email', token: 'token',
      roles: [], newRoles: [], roleStr: ''}
  const mockUser:User = mockUserData as User;

  beforeEach(async function () {
    TestBed.configureTestingModule({
      imports: [
        HttpClientTestingModule
      ],
      providers: [
        {
          provide: APP_BASE_HREF,
          useValue: 'base'
        },
        ConfigService,
        LoggerService,
        UtilityService,
        UserService        
      ]
    }).compileComponents();
    httpClient = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
    configService = TestBed.inject(ConfigService);
    TestBed.inject(LoggerService);
    TestBed.inject(UtilityService);
    userService = TestBed.inject(UserService);

    const mockCsrfData = { _csrf: 'testCsrfValue' };
    const mockConfigData = { csrfToken: mockCsrfData._csrf, rootContext: '', someRandomKey: 'someRandomValue', portal: 'rdmp', branding: 'default' };

    const csrfReq = httpTestingController.expectOne(configService.csrfTokenUrl);
    csrfReq.flush(mockCsrfData);

    const configReq = httpTestingController.expectOne(configService.configUrl);
    configReq.flush(mockConfigData);  

    await userService.waitForInit();
  });

  it('should return a valid user info object', async function () {
    const obs3 = from(userService.getInfo());
    obs3.subscribe((user:any) => {
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
    const mockUserLoginResultSuccessData = {id: 'id', message: 'success', user: mockUserData, url: 'url' };
    const mockUserLoginResultSuccess: UserLoginResult = mockUserLoginResultSuccessData as UserLoginResult;

    const obs1 = from(userService.loginLocal('username', 'correct_password'));
    obs1.subscribe((loginOkRes:any) => {
      expect(loginOkRes).toEqual(mockUserLoginResultSuccessData);
      expect(loginOkRes).toEqual(mockUserLoginResultSuccess);
    });
    const loginOkReq = httpTestingController.expectOne(userService.getLoginUrl());
    expect(loginOkReq.request.method).toEqual('POST');
    loginOkReq.flush(mockUserLoginResultSuccessData);   

  });

  it('should process failure login', async function () {
    const mockUserLoginResultFailData = {id: 'id', message: 'fail'};
    const mockUserLoginResultFail: UserLoginResult = mockUserLoginResultFailData as UserLoginResult;

    const obs2 = from(userService.loginLocal('username', 'wrong_password'));
    obs2.subscribe((loginFailRes:any) => {
      expect(loginFailRes).toEqual(mockUserLoginResultFailData);
      expect(loginFailRes).toEqual(mockUserLoginResultFail);
    });

    const loginFailReq = httpTestingController.expectOne(userService.getLoginUrl());
    expect(loginFailReq.request.method).toEqual('POST');
    loginFailReq.flush(mockUserLoginResultFailData);

  });

  it('should call the admin link candidate endpoint', async function () {
    void userService.searchLinkCandidates('primary-1', 'candidate');

    const req = httpTestingController.expectOne((request) =>
      request.method === 'GET'
      && request.urlWithParams.includes('/admin/users/link/candidates')
      && request.urlWithParams.includes('primaryUserId=primary-1')
      && request.urlWithParams.includes('query=candidate')
    );
    expect(req.request.method).toEqual('GET');
    req.flush([]);
  });

  it('should call the admin user audit endpoint', async function () {
    void userService.getUserAudit('user-1');

    const req = httpTestingController.expectOne((request) =>
      request.method === 'GET'
      && request.url.includes('/admin/users/user-1/audit')
    );
    expect(req.request.method).toEqual('GET');
    req.flush({ user: mockUserData, records: [], summary: { returnedCount: 0, truncated: false } });
  });

  it('should call the admin disable user endpoint', async function () {
    void userService.disableUser('user-1');

    const req = httpTestingController.expectOne((request) =>
      request.method === 'POST'
      && request.url.includes('/admin/users/user-1/disable')
    );
    expect(req.request.method).toEqual('POST');
    req.flush({ status: true, message: 'User disabled successfully' });
  });

  it('should call the admin link accounts endpoint', async function () {
    void userService.linkAccounts('primary-1', 'secondary-1');

    const req = httpTestingController.expectOne((request) =>
      request.method === 'POST'
      && request.url.includes('/admin/users/link')
    );
    expect(req.request.method).toEqual('POST');
    expect(req.request.body).toEqual({ primaryUserId: 'primary-1', secondaryUserId: 'secondary-1' });
    req.flush({ primary: mockUserData, linkedAccounts: [], impact: { rolesMerged: 0, recordsRewritten: 0 } });
  });
 
  afterEach(() => {
    httpTestingController.verify();
  });
});
