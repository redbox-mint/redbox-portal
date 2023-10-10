// Copyright (c) 2023 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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
import { LoggerService } from './logger.service';
import { ReportService } from './report.service';
import { ReportDto, ReportFilterDto, ReportResultDto, RecordPropViewMetaDto } from '@researchdatabox/sails-ng-common';
import { getStubConfigService } from './helper.spec';

describe('ReportService testing', () => {
  let configService: any;
  let httpTestingController: HttpTestingController;
  let reportService: ReportService;
  let httpClient: HttpClient;

  beforeEach(async function () {
    configService = getStubConfigService();

    TestBed.configureTestingModule({
      imports: [
        HttpClientTestingModule
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
        ReportService        
      ]
    })
    httpClient = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
    TestBed.inject(LoggerService);
    TestBed.inject(UtilityService);
    reportService = TestBed.inject(ReportService);

    await reportService.waitForInit();
  });

  it('should require a reportName', async function () {
    const obs = from(reportService.getReportConfig(''));
    obs.subscribe(null, (error:any) => {
      expect(error.message).toEqual('Report Config name is empty!');
    });  
  });

  it('should return a valid ReportConfig object', async function () {
    const mockReportData = {
      title: 'Mock Report',
      name: 'mock-report',
      filter: [
        {
          "paramName": "dateObjectModifiedRange",
          "type": "date-range",
          "property": "date_object_modified",
          "message": "Filter by date modified"
        }
      ] as ReportFilterDto[],
      columns: [
        {
          "label": "Chief Investigator",
          "property": "contributor_ci.text_full_name",
          "template" : "${ data['contributor_ci.text_full_name'] }"
        }
      ] as RecordPropViewMetaDto[]
    } as ReportDto;
    const obs3 = from(reportService.getReportConfig(mockReportData.name));
    obs3.subscribe((reportData:any) => {
      expect(reportData).toEqual(mockReportData);
    });

    const reportConfigReq = httpTestingController.expectOne(`${reportService.brandingAndPortalUrl}/admin/getReport?name=${mockReportData.name}`);
    expect(reportConfigReq.request.method).toEqual('GET');
    reportConfigReq.flush(mockReportData);    
  });

  it('should return a valid ReportResult object', async function () {
    const obsErr = from(reportService.getReportResult('', 1, null));
    obsErr.subscribe(null, (error:any) => {
      expect(error.message).toEqual('Report name is empty!');
    });  
    const reportName = 'mock-report';
    let pageNum = 1;
    const mockReportResult = {
      records: [
        {
          id: '123'
        }
      ],
      total: 10,
      pageNum: pageNum,
      recordsPerPage: 1
    } as ReportResultDto;
    const params = {
      param1: 'value1'
    };
    const obs = from(reportService.getReportResult(reportName, pageNum, params , mockReportResult.recordsPerPage));
    
    obs.subscribe((reportResult:any) => {
      expect(reportResult).toEqual(mockReportResult);
    });
    let start = (pageNum-1) * mockReportResult.recordsPerPage;
    const reportResReq = httpTestingController.expectOne(`${reportService.brandingAndPortalUrl}/admin/getReportResults?name=${reportName}&start=${start}&rows=${mockReportResult.recordsPerPage}&param1=value1`);
    expect(reportResReq.request.method).toEqual('GET');
    reportResReq.flush(mockReportResult);    
  });
 
  afterEach(() => {
    httpTestingController.verify();
  });
});
