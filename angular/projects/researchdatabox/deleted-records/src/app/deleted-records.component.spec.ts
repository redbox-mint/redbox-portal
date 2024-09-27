import {APP_INITIALIZER, LOCALE_ID} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {APP_BASE_HREF} from '@angular/common';
import {
  RedboxPortalCoreModule,
  UtilityService,
  LoggerService,
  TranslationService,
  ConfigService,
  getStubConfigService,
  getStubTranslationService,
  appInit,
  localeId,
  getStubRecordService
} from '@researchdatabox/portal-ng-common';
import {RecordResponseTable, RecordService} from '@researchdatabox/sails-ng-common';
import {I18NextModule, I18NEXT_SERVICE} from 'angular-i18next';
import {BsDatepickerModule} from 'ngx-bootstrap/datepicker';
import {FormsModule} from "@angular/forms";
import {PaginationModule} from 'ngx-bootstrap/pagination';
import {DeletedRecordsComponent} from './deleted-records.component';
import {ModalModule} from "ngx-bootstrap/modal";
import {DashboardComponent} from "../../../dashboard/src/app/dashboard.component";

describe('DeletedRecordsComponent', () => {
  let configService: any;
  let recordService: any;
  let translationService: any;
  let mockData: any;

  beforeEach(async () => {
    configService = getStubConfigService();
    translationService = getStubTranslationService();
    const mockDeletedRecords: RecordResponseTable = {
      currentPage: 1,
      items: [
        {},
        {},
      ],
      noItems: 2,
      totalItems: 2
    };
    mockData = {
      deletedRecords: mockDeletedRecords,
    };
    recordService = getStubRecordService(mockData);
    const testModule = await TestBed.configureTestingModule({
      declarations: [
        DeletedRecordsComponent,
      ],
      imports: [
        FormsModule,
        I18NextModule.forRoot(),
        BsDatepickerModule.forRoot(),
        PaginationModule.forRoot(),
        ModalModule.forRoot(),
        RedboxPortalCoreModule
      ],
      providers: [
        {
          provide: APP_BASE_HREF,
          useValue: 'base'
        },
        LoggerService,
        UtilityService,
        {
          provide: TranslationService,
          useValue: translationService
        },
        {
          provide: ConfigService,
          useValue: configService
        },
        {
          provide: RecordService,
          useValue: recordService
        },
        {
          provide: APP_INITIALIZER,
          useFactory: appInit,
          deps: [I18NEXT_SERVICE],
          multi: true,
        },
        {
          provide: LOCALE_ID,
          deps: [I18NEXT_SERVICE],
          useValue: localeId
        }
      ]
    });
    TestBed.inject(I18NEXT_SERVICE);
    await testModule.compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should apply filters', async function () {
    // create app
    const fixture = TestBed.createComponent(DeletedRecordsComponent);
    const app = fixture.componentInstance;

    // init app
    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    expect(app.deletedRecordsResult.total).toEqual(mockData.deletedRecords.total);

    // apply filter
    app.filterParams['title'] = 'test';
    app.filterParams['recordType'] = 'RDMP';
    await app.filter();
    expect(app.deletedRecordsResult.total).toEqual(mockData.deletedRecords.total);
  });

  it('should restore a deleted record', async function () {
    // create app
    const fixture = TestBed.createComponent(DeletedRecordsComponent);
    const app = fixture.componentInstance;

    // init app
    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    expect(app.deletedRecordsResult.total).toEqual(mockData.deletedRecords.total);

    // set up recordService.destroyDeletedRecord
    recordService.destroyDeletedRecord = async function (oid) {
      const index = mockData.deletedRecords.items.findIndex(item => item.oid == oid);
      if (index > -1) {
        mockData.deletedRecords.items.splice(index, 1);
        mockData.deletedRecords.noItems -= 1;
        mockData.deletedRecords.totalItems -= 1;
      }
    };

    // trigger restore
    await app.recordTableAction(undefined, {oid: 'record-id'}, 'restore');
    expect(app.deletedRecordsResult.total).toEqual(mockData.deletedRecords.total);
  });
  it('should destroy a deleted record', async function () {
    // create app
    const fixture = TestBed.createComponent(DeletedRecordsComponent);
    const app = fixture.componentInstance;

    // init app
    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    expect(app.deletedRecordsResult.total).toEqual(mockData.deletedRecords.total);

    // set up recordService.destroyDeletedRecord
    recordService.restoreDeletedRecord = async function (oid) {
      const index = mockData.deletedRecords.items.findIndex(item => item.oid == oid);
      if (index > -1) {
        mockData.deletedRecords.items.splice(index, 1);
        mockData.deletedRecords.noItems -= 1;
        mockData.deletedRecords.totalItems -= 1;
      }
    };

    // trigger destroy
    await app.recordTableAction(undefined, {oid: 'record-id'}, 'destroy');
    expect(app.isDestroyRecordModalShown).toEqual(true);
    expect(app.currentDestroyRecordModalOid).toEqual('record-id');

    await app.confirmDestroyRecordModal(undefined);
    expect(app.currentDestroyRecordModalOid).toBeUndefined();
    expect(app.deletedRecordsResult.total).toEqual(mockData.deletedRecords.total);
  });
});
