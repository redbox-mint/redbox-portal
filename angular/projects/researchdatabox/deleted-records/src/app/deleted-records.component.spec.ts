import { LOCALE_ID, inject as inject_1, provideAppInitializer } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF } from '@angular/common';
import {
  RedboxPortalCoreModule,
  UtilityService,
  LoggerService,
  TranslationService,
  ConfigService,
  getStubConfigService,
  getStubTranslationService,
  getStubRecordService,
  RecordService,
  RecordResponseTable
} from '@researchdatabox/portal-ng-common';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { FormsModule } from "@angular/forms";
import { PaginationModule } from 'ngx-bootstrap/pagination';
import { DeletedRecordsComponent } from './deleted-records.component';
import { ModalModule } from "ngx-bootstrap/modal";

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
        {
          oid: 'rdmp-record-1',
          title: 'rdmp record 1',
          dateCreated: '26-09-2024T14:00:00Z',
          dateModified: '26-09-2024T14:10:00Z',
          dateDeleted: '26-09-2024T14:20:00Z',
        },
        {
          oid: 'dataRecord-record-2',
          title: 'dataRecord record 2',
          dateCreated: '26-09-2024T15:00:00Z',
          dateModified: '26-09-2024T15:10:00Z',
          dateDeleted: '26-09-2024T15:20:00Z',
        },
      ],
      noItems: 2,
      totalItems: 2
    };
    mockData = {
      deletedRecords: mockDeletedRecords,
      types: [
        {
          name: 'rdmp',
          packageType: 'rdmp',
          searchFilters: [],
          searchable: false,
        },
        {
          name: 'dataRecord',
          packageType: 'dataRecord',
          searchFilters: [],
          searchable: false,
        }
      ]
    };
    recordService = getStubRecordService(mockData);
    const testModule = await TestBed.configureTestingModule({
      declarations: [
        DeletedRecordsComponent,
      ],
      imports: [
        FormsModule,
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
        }
      ]
    });
    await testModule.compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(DeletedRecordsComponent);
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
    expect(app.deletedRecordsResult.total).toEqual(2);

    recordService.getDeletedRecords = async function(
      recordType: string,
      state: string,
      pageNumber: number,
      packageType: string = '',
      sort: string = '',
      filterFields: string = '',
      filterString: string = '',
      filterMode: string = '',
      secondarySort: string = ''
      ){
      mockData.deletedRecords.items = mockData.deletedRecords.items.filter((item: any) => {
        if (recordType && !item.title.startsWith(recordType)) {
          console.debug(`item filtered out:
          item title '${item.title}' does not start with recordType '${recordType}'`);
          return false;
        }
        console.info('filterFields', filterFields, filterFields.split(','));
        console.info('filterString', filterString, item.title);
        if (filterFields && filterFields.split(',').includes('title') &&
          filterString && !item.title.includes(filterString)) {
          console.debug(`item filtered out:
          filterFields does not include 'title' '${filterFields.split(',')}' or
          item title '${item.title}' does not contain filterString '${filterString}'`);
          return false;
        }
        return true;
      });
      mockData.deletedRecords.noItems = mockData.deletedRecords.items.length;
      mockData.deletedRecords.totalItems = mockData.deletedRecords.items.length;
      return mockData.deletedRecords;
    }

    // apply filter
    app.filterParams['title'] = 'record 1';
    app.filterParams['recordType'] = 'rdmp';
    await app.filter();
    expect(app.deletedRecordsResult.total).toEqual(1);
  });

  it('should restore a deleted record', async function () {
    // create app
    const fixture = TestBed.createComponent(DeletedRecordsComponent);
    const app = fixture.componentInstance;

    // init app
    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    expect(app.deletedRecordsResult.total).toEqual(2);

    // set up recordService.destroyDeletedRecord
    recordService.restoreDeletedRecord = async function (oid: string) {
      const index = mockData.deletedRecords.items.findIndex((item: any) => item.oid == oid);
      if (index > -1) {
        mockData.deletedRecords.items.splice(index, 1);
        mockData.deletedRecords.noItems -= 1;
        mockData.deletedRecords.totalItems -= 1;
      }
    };

    // trigger restore
    await app.recordTableAction(undefined, {oid: 'rdmp-record-1'}, 'restore');
    expect(app.deletedRecordsResult.total).toEqual(1);
  });
  it('should destroy a deleted record', async function () {
    // create app
    const fixture = TestBed.createComponent(DeletedRecordsComponent);
    const app = fixture.componentInstance;

    // init app
    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    expect(app.deletedRecordsResult.total).toEqual(2);

    // set up recordService.destroyDeletedRecord
    recordService.destroyDeletedRecord = async function (oid: string) {
      const index = mockData.deletedRecords.items.findIndex((item: any) => item.oid == oid);
      if (index > -1) {
        mockData.deletedRecords.items.splice(index, 1);
        mockData.deletedRecords.noItems -= 1;
        mockData.deletedRecords.totalItems -= 1;
      }
    };

    // trigger destroy
    await app.recordTableAction(undefined, {oid: 'rdmp-record-1'}, 'destroy');
    expect(app.isDestroyRecordModalShown).toEqual(true);
    expect(app.currentDestroyRecordModalOid).toEqual('rdmp-record-1');

    await app.confirmDestroyRecordModal(undefined);
    expect(app.currentDestroyRecordModalOid).toBeUndefined();
    expect(app.deletedRecordsResult.total).toEqual(1);
  });
});
