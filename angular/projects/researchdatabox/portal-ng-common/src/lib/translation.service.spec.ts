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
import { LoggerService } from './logger.service';
import { getStubConfigService } from './helper.spec';

describe('TranslationService testing', () => {
  let translationService: TranslationService;
  let configService: any;
  let httpTestingController: HttpTestingController;
  let httpClient: HttpClient;
  
  beforeEach(function () {
    configService = getStubConfigService();
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
        {
          provide: ConfigService,
          useValue: configService
        },
        LoggerService,
        UtilityService,
        TranslationService
      ]
    })
    httpClient = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
    TestBed.inject(I18NEXT_SERVICE);
    TestBed.inject(LoggerService);
    TestBed.inject(UtilityService);
    translationService = TestBed.inject(TranslationService);
  });

  it('should produce a valid translation using configService with valid config', async function () {
    const mockConfigData = {
      csrfToken: 'test', 
      rootContext: 'base'
    };
    configService.getConfig = function () { return mockConfigData};
    await translationService.waitForInit();
    expect(translationService.t('key1')).toEqual("value1");
  });

  it('should produce a valid translation using configService with default config', async function () {
    await translationService.waitForInit();
    expect(translationService.t('key1')).toEqual("value1");
  });


  afterEach(() => {
    httpTestingController.verify();
  });
});
