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
import { I18NextModule, I18NEXT_SERVICE } from 'angular-i18next';
import { TranslationService } from './translation.service';
import { ConfigService } from './config.service';
import { HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { UtilityService } from './utility.service';

describe('TranslationService testing', () => {
  let translationService: TranslationService;
  let configService: ConfigService;
  let httpTestingController: HttpTestingController;
  let httpClient: HttpClient;
  
  beforeEach(function () {
    TestBed.configureTestingModule({
      imports: [
        HttpClientTestingModule,
        I18NextModule.forRoot()
      ],
      providers: [
        {
          provide: APP_BASE_HREF,
          useValue: 'base'
        },
        ConfigService,
        UtilityService,
        TranslationService
      ]
    })
    httpClient = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
    TestBed.inject(I18NEXT_SERVICE);
    configService = TestBed.inject(ConfigService);
    TestBed.inject(UtilityService);
    translationService = TestBed.inject(TranslationService);
  });

  it('should produce a valid translation using configService with valid config', async function () {
    const mockCsrfData = { _csrf: 'testCsrfValue' };
    const mockConfigData = {
      csrfToken: mockCsrfData._csrf, 
      rootContext: 'base', 
      i18NextOpts: {
        load: 'languageOnly',
        supportedLngs: ['en'],
        fallbackLng: 'en',
        debug: true,
        returnEmptyString: false,
        ns: [
          'translation'
        ],
        // lang detection plugin options
        detection: {
          // order and from where user language should be detected
          order: ['cookie'],
          // keys or params to lookup language from
          lookupCookie: 'lang',
          // cache user language on
          caches: ['cookie'],
          // optional expire and domain for set cookie
          cookieMinutes: 10080, // 7 days
          // cookieDomain: I18NEXT_LANG_COOKIE_DOMAIN
        }
      }
    };

    const obs = from(configService.waitForInit());
    obs.subscribe((config:any) => {
      console.log(`Using config: `);
      console.log(JSON.stringify(config));
    });
    
    const csrfReq = httpTestingController.expectOne(configService.csrfTokenUrl);
    expect(csrfReq.request.method).toEqual('GET');
    csrfReq.flush(mockCsrfData);

    const configReq = httpTestingController.expectOne(configService.configUrl);
    expect(configReq.request.method).toEqual('GET');
    configReq.flush(mockConfigData);
    await translationService.waitForInit();
    expect(translationService.t('key1')).toEqual("value1");
  });

  it('should produce a valid translation using configService with default config', async function () {
    const mockCsrfData = { _csrf: 'testCsrfValue' };
    const mockConfigData = {
      csrfToken: mockCsrfData._csrf, 
      rootContext: 'base'
    };

    const obs = from(configService.waitForInit());
    obs.subscribe((config:any) => {
      console.log(`Using config: `);
      console.log(JSON.stringify(config));
    });
    
    const csrfReq = httpTestingController.expectOne(configService.csrfTokenUrl);
    expect(csrfReq.request.method).toEqual('GET');
    csrfReq.flush(mockCsrfData);

    const configReq = httpTestingController.expectOne(configService.configUrl);
    expect(configReq.request.method).toEqual('GET');
    configReq.flush(mockConfigData);
    await translationService.waitForInit();
    expect(translationService.t('key1')).toEqual("value1");
  });


  afterEach(() => {
    httpTestingController.verify();
  });
});
