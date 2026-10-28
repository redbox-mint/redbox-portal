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
import { HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ConfigService } from './config.service';

/**
 * Config Service Testing 
 * 
 * Based on recommendations at https://angular.io/guide/testing
 * 
 * Note, as per above URL: 
 * 
 * It's a good idea to put unit test spec files in the same folder as the application source code files that they test:
 * - Such tests are painless to find
 * - You see at a glance if a part of your application lacks tests
 * - Nearby tests can reveal how a part works in context
 * - When you move the source (inevitable), you remember to move the test
 * - When you rename the source file (inevitable), you remember to rename the test - file
 * 
 */
describe('ConfigService testing', () => {
  let configService: ConfigService;
  let httpTestingController: HttpTestingController;
  let httpClient: HttpClient;

  beforeEach(async function () {
    const testModule = TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        {
          provide: APP_BASE_HREF,
          useValue: ''
        },
        ConfigService
      ]
    });
    httpClient = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
    configService = TestBed.inject(ConfigService);
    await testModule.compileComponents();
  });

  it('should have a valid config object', function (done:any) {
    const mockCsrfData = { _csrf: 'testCsrfValue' };
    const mockConfigData = {
      csrfToken: mockCsrfData._csrf, 
      rootContext: '', 
      someRandomKey: 'someRandomValue', 
      app: {
        sample: {
          block: {
            present: 'yes'
          }
        }
      }
    };
    expect(configService.isInitializing()).toEqual(true);
    const obs = from(configService.waitForInit());
    obs.subscribe((config:any) => {
      expect(config).toEqual(mockConfigData);
      const defaultVal = 'defaultSpecificVal';
      expect(ConfigService._getAppConfig(config, 'sample')).toEqual(mockConfigData.app.sample);
      expect(ConfigService._getAppConfigProperty(config, 'sample', 'block.present', defaultVal)).toEqual(mockConfigData.app.sample.block.present);
      expect(ConfigService._getAppConfigProperty(config, 'sample', 'missingProperty', defaultVal)).toEqual(defaultVal);
      done();
    });
    
    const csrfReq = httpTestingController.expectOne(configService.csrfTokenUrl);
    expect(csrfReq.request.method).toEqual('GET');
    csrfReq.flush(mockCsrfData);

    const configReq = httpTestingController.expectOne(configService.configUrl);
    expect(configReq.request.method).toEqual('GET');
    configReq.flush(mockConfigData);

  });

  for (const endpoint of ['csrf', 'config']) {
    it(`rejects early and late waiters after a ${endpoint} failure and recovers`, async () => {
      const waiting = expectAsync(configService.waitForInit()).toBeRejected();
      const csrf = httpTestingController.expectOne(configService.csrfTokenUrl);
      if (endpoint === 'csrf') {
        csrf.error(new ProgressEvent('error'));
      } else {
        csrf.flush({ _csrf: 'old' });
        httpTestingController.expectOne(configService.configUrl).flush('denied', { status: 403, statusText: 'Forbidden' });
      }
      await waiting;
      await expectAsync(configService.waitForInit()).toBeRejected();
      const recovered = configService.refreshConfig();
      httpTestingController.expectOne(configService.csrfTokenUrl).flush({ _csrf: 'rotated' });
      httpTestingController.expectOne(configService.configUrl).flush({ branding: 'default', portal: 'rdmp' });
      expect((await recovered).csrfToken).toBe('rotated');
      expect((await configService.waitForInit()).csrfToken).toBe('rotated');
    });
  }

  it('loads and refreshes configuration when Sails returns an empty token with CSRF disabled', async () => {
    const waiting = configService.waitForInit();
    httpTestingController.expectOne(configService.csrfTokenUrl).flush({ _csrf: '' });
    httpTestingController.expectOne(configService.configUrl).flush({ branding: 'default', portal: 'rdmp' });
    expect((await waiting).csrfToken).toBe('');

    const enabled = configService.refreshConfig();
    httpTestingController.expectOne(configService.csrfTokenUrl).flush({ _csrf: 'enabled' });
    httpTestingController.expectOne(configService.configUrl).flush({ branding: 'default', portal: 'rdmp' });
    expect((await enabled).csrfToken).toBe('enabled');

    const disabled = configService.refreshConfig();
    httpTestingController.expectOne(configService.csrfTokenUrl).flush({ _csrf: '' });
    httpTestingController.expectOne(configService.configUrl).flush({ branding: 'default', portal: 'rdmp' });
    expect((await disabled).csrfToken).toBe('');
    expect(configService.csrfToken).toBe('');
  });

  for (const response of ['<html>Sign in</html>', null, [], {}, { _csrf: null }, { _csrf: 123 }, { message: 'Sign in' }]) {
    it(`rejects malformed CSRF response ${JSON.stringify(response)} and permits explicit recovery`, async () => {
      const waiting = expectAsync(configService.waitForInit()).toBeRejected();
      httpTestingController.expectOne(configService.csrfTokenUrl).flush(response);
      await waiting;
      await expectAsync(configService.waitForInit()).toBeRejected();
      httpTestingController.expectNone(configService.configUrl);

      const retry = configService.refreshConfig();
      httpTestingController.expectOne(configService.csrfTokenUrl).flush({ _csrf: 'recovered' });
      httpTestingController.expectOne(configService.configUrl).flush({ branding: 'default', portal: 'rdmp' });
      expect((await retry).csrfToken).toBe('recovered');
    });
  }

  afterEach(() => {
    // After every test, assert that there are no more pending requests.
    httpTestingController.verify();
  });
});
