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
import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { LoDashTemplateUtilityService } from './lodash-template-utility.service';
import { Settings } from 'luxon';




/**
 * 'Lodash Template Utility Service Testing 
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
describe('Lodash Template Utility Service testing', () => {
  let loDashTemplateUtilityService: LoDashTemplateUtilityService;

  // Force a deterministic timezone for date-related tests so output is stable across developer machines.
  beforeAll(() => {
    Settings.defaultZone = 'UTC';
  });

  afterAll(() => {
    // Reset to system zone after tests complete to avoid side effects.
    Settings.defaultZone = 'system';
  });

  beforeEach(function () {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        {
          provide: APP_BASE_HREF,
          useValue: ''
        },
        LoDashTemplateUtilityService
      ]
    });

    loDashTemplateUtilityService = TestBed.inject(LoDashTemplateUtilityService);
  });

  it('Should format 2023-05-11T00:00:00.000Z as 11/05/2023 (dd/MM/yyyy)', function (done: any) {
    const dateString = "2023-05-11T00:00:00.000Z";
    const sourceDate: Date = new Date(Date.parse(dateString));

    const formattedString = loDashTemplateUtilityService.formatDate(sourceDate, "dd/MM/yyyy");
    expect(formattedString).toBe("11/05/2023");
    done()
  }
  )

  it('Should format 2023-05-11T00:00:00.000Z using DATETIME_MED', function (done: any) {
    const dateString = "2023-05-11T00:00:00.000Z"; // Midnight UTC
    const sourceDate: Date = new Date(Date.parse(dateString));
    const formattedString = loDashTemplateUtilityService.formatDateLocale(sourceDate, "DATETIME_MED", 'en');
  // Some environments introduce a narrow no-break space before AM/PM; normalise spaces for a stable assertion.
  const normalised = formattedString.replace(/\u202F/g, ' ');
  expect(normalised).toBe("May 11, 2023, 12:00 AM");
    done();
    }
  )

  it('Run template', function (done: any) {
    const data:any = {
      sourceDateString:  "2023-05-11T00:00:00.000Z",
      sourceNumber: 12000
    }
    let config1 = {
      template: '<%= "test" %>'
    }
    
    const evaluatedTemplate1 = loDashTemplateUtilityService.runTemplate(data,config1)
    expect(evaluatedTemplate1).toBe("test");

    let config2 = {
      template: '<%= util.formatDate(util.parseDateString(data.sourceDateString), "dd/MM/yyyy") %>'
    }
    
    const evaluatedTemplate2 = loDashTemplateUtilityService.runTemplate(data,config2)
    expect(evaluatedTemplate2).toBe("11/05/2023");

    let config3 = {
      template: '<%= util.numberFormat(data.sourceNumber) %>'
    }
    
    const evaluatedTemplate3 = loDashTemplateUtilityService.runTemplate(data,config3)
    expect(evaluatedTemplate3).toBe("12,000");

    done()
  }
  )

});




afterEach(() => {


});

