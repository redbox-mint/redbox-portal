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

import { HTTP_INTERCEPTORS, HttpClient, HttpContext } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CsrfInterceptor, RB_HTTP_INTERCEPTOR_AUTH_CSRF } from './csrf.interceptor';
import { ConfigService } from './config.service';

describe('CsrfInterceptor', () => {
  let httpTestingController: HttpTestingController;
  let configService: any;
  let interceptor: any;
  let httpClient: any;
  beforeEach(function () {
    configService = {
      isInitializing: function() { return false; },
      csrfToken: 'very-secure-token'
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        CsrfInterceptor,
        {
          provide: ConfigService,
          useValue: configService
        },
        {
          provide: HTTP_INTERCEPTORS,
          useClass: CsrfInterceptor,
          multi: true
        }
      ]
    });
    httpTestingController = TestBed.inject(HttpTestingController);
    interceptor = TestBed.inject(CsrfInterceptor);
    httpClient = TestBed.inject(HttpClient);
  });

  it('should construct', () => {
    expect(interceptor).toBeDefined();
  });

  it('when CSRF Token is set, should insert the csrf header, etc.', () => {
    const httpContext = new HttpContext();
    httpContext.set(RB_HTTP_INTERCEPTOR_AUTH_CSRF, configService.csrfToken);
    httpClient.get('/any-url', {context: httpContext}).subscribe(() => {
    }, () => {});
    
    const req = httpTestingController.expectOne('/any-url');
    expect(req.request.headers.get('X-CSRF-Token')).toBe(configService.csrfToken);
    expect(req.request.headers.get('X-Source')).toBe('jsclient');
    expect(req.request.headers.get('Content-Type')).toBe('application/json;charset=utf-8');
  });

  it('when CSRF Token is not set, should not insert the csrf header, but insert the rest', () => {
    const httpContext = new HttpContext();
    httpClient.get('/any-url', {context: httpContext}).subscribe(() => {
    }, () => {});
    
    const req = httpTestingController.expectOne('/any-url');
    expect(req.request.headers.get('X-CSRF-Token')).toBeNull();
    expect(req.request.headers.get('X-Source')).toBe('jsclient');
    expect(req.request.headers.get('Content-Type')).toBe('application/json;charset=utf-8');
  });

  afterEach(() => {
    // After every test, assert that there are no more pending requests.
    httpTestingController.verify();
  });

});

