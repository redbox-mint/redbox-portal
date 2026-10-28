import { HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
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
        HttpClientTestingModule,
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

  for (const paginationFails of [false, true]) {
    it(`runs only the latest submitted filter after a pending page ${paginationFails ? 'fails' : 'succeeds'}, and retries its exact criteria`, async () => {
      configService.refreshConfig = jasmine.createSpy('refreshConfig').and.resolveTo({});
      const fixture = TestBed.createComponent(DeletedRecordsComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      await component.waitForInit();
      component.tableHeaders = [{ property: 'title', label: 'Title' }] as any;
      component.deletedRecordsResult = { records: [{ title: 'Original' }], total: 30, pageNum: 1, recordsPerPage: 10 };
      const realService = new RecordService(TestBed.inject(HttpClient), 'base', TestBed.inject(UtilityService), configService, TestBed.inject(LoggerService));
      await realService.waitForInit();
      realService.brandingAndPortalUrl = 'https://portal.example/base/default/rdmp';
      (component as any).recordService = realService;
      const http = TestBed.inject(HttpTestingController);
      const settle = async () => { for (let i = 0; i < 15; i++) { await Promise.resolve(); } };
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const pageTwo = Array.from(fixture.nativeElement.querySelectorAll('pagination .pagination-page a') as NodeListOf<HTMLAnchorElement>)
        .find(link => link.textContent?.trim() === '2')!;
      pageTwo.click();
      fixture.detectChanges();
      const page = http.expectOne(req => req.url.includes('listDeleted'));
      const input = fixture.nativeElement.querySelector('input#title') as HTMLInputElement;
      const submit = fixture.nativeElement.querySelector('a.btn-primary') as HTMLAnchorElement;
      for (const title of ['discarded', 'latest']) {
        input.value = title;
        input.dispatchEvent(new Event('input'));
        submit.click();
      }
      // Editing without submitting must not alter the queued or retry criteria.
      input.value = 'unsubmitted';
      input.dispatchEvent(new Event('input'));
      http.expectNone(req => req.url.includes('listDeleted'));
      if (paginationFails) {
        page.flush('failed', { status: 500, statusText: 'Server Error' });
      } else {
        page.flush({ items: [{ title: 'Page two' }], totalItems: 30, currentPage: 2 });
      }
      await settle();
      const latest = http.expectOne(req => req.url.includes('listDeleted'));
      expect(latest.request.urlWithParams).toContain('latest');
      expect(latest.request.urlWithParams).not.toContain('discarded');
      expect(latest.request.urlWithParams).not.toContain('unsubmitted');
      expect(latest.request.method).toBe('GET');
      latest.flush('failed', { status: 500, statusText: 'Server Error' });
      await settle();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.deletedRecordsResult.pageNum).toBe(paginationFails ? 1 : 2);
      expect(component.loadError).toContain('Unable to load');
      (fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement).click();
      await settle();
      const retry = http.expectOne(req => req.url.includes('listDeleted'));
      expect(retry.request.urlWithParams).toBe(latest.request.urlWithParams);
      retry.flush({ items: [{ title: 'Latest rows' }], totalItems: 1, currentPage: 1 });
      await settle();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.deletedRecordsResult.pageNum).toBe(1);
      expect(fixture.nativeElement.textContent).toContain('Latest rows');
      expect(component.loadError).toBe('');
      http.verify();
      fixture.destroy();
    });
  }

  it('queues the latest DOM sort and filter, restores the applied sort on failure and retries without writes', async () => {
    configService.refreshConfig = jasmine.createSpy('refreshConfig').and.resolveTo({});
    const fixture = TestBed.createComponent(DeletedRecordsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();
    component.tableHeaders = [{ property: 'title', label: 'Title' }] as any;
    component.deletedRecordsResult = { records: [{ title: 'Original' }], total: 30, pageNum: 1, recordsPerPage: 10 };
    const realService = new RecordService(TestBed.inject(HttpClient), 'base', TestBed.inject(UtilityService), configService, TestBed.inject(LoggerService));
    await realService.waitForInit();
    realService.brandingAndPortalUrl = 'https://portal.example/base/default/rdmp';
    (component as any).recordService = realService;
    const http = TestBed.inject(HttpTestingController);
    const settle = async () => { for (let i = 0; i < 15; i++) { await Promise.resolve(); } };
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const header = fixture.nativeElement.querySelector('header-sort button') as HTMLButtonElement;
    header.click();
    const ascending = http.expectOne(req => req.url.includes('listDeletedRecords'));
    expect(new URL(ascending.request.url).searchParams.get('sort')).toBe('title:1');
    ascending.flush({ items: [{ title: 'Ascending' }], totalItems: 30, currentPage: 1 });
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.sort).toBe('title:1');
    expect(header.getAttribute('aria-sort')).toBe('ascending');
    const pageTwo = Array.from(fixture.nativeElement.querySelectorAll('pagination .pagination-page a') as NodeListOf<HTMLAnchorElement>)
      .find(link => link.textContent?.trim() === '2')!;
    pageTwo.click();
    fixture.detectChanges();
    const page = http.expectOne(req => req.url.includes('listDeletedRecords'));
    header.click(); // descending
    header.click(); // ascending supersedes descending
    const input = fixture.nativeElement.querySelector('input#title') as HTMLInputElement;
    input.value = 'latest';
    input.dispatchEvent(new Event('input'));
    (fixture.nativeElement.querySelector('a.btn-primary') as HTMLAnchorElement).click();
    header.click(); // latest criteria: latest filter, descending sort
    http.expectNone(req => req.url.includes('listDeletedRecords'));
    page.flush('failed', { status: 500, statusText: 'Server Error' });
    await settle();
    const latest = http.expectOne(req => req.url.includes('listDeletedRecords'));
    const criteria = new URL(latest.request.url).searchParams;
    expect(criteria.get('sort')).toBe('title:-1');
    expect(criteria.get('filter')).toBe('latest');
    expect(criteria.get('start')).toBe('0');
    latest.flush('failed', { status: 500, statusText: 'Server Error' });
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.sort).toBe('title:1');
    expect(header.getAttribute('aria-sort')).toBe('ascending');
    expect(fixture.nativeElement.textContent).toContain('Ascending');
    expect(component.currentPageNumber).toBe(1);
    (fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    await settle();
    const retry = http.expectOne(req => req.url.includes('listDeletedRecords'));
    expect(retry.request.url).toBe(latest.request.url);
    retry.flush({ items: [{ title: 'Descending latest' }], totalItems: 1, currentPage: 1 });
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.sort).toBe('title:-1');
    expect(header.getAttribute('aria-sort')).toBe('descending');
    expect(fixture.nativeElement.textContent).toContain('Descending latest');
    expect(component.loadError).toBe('');
    http.verify();
    fixture.destroy();
  });

  it('propagates an initial page failure to bootstrap waiters and recovers through Retry', async () => {
    configService.refreshConfig = jasmine.createSpy('refreshConfig').and.resolveTo({});
    const original = recordService.getDeletedRecords.bind(recordService);
    const read = spyOn(recordService, 'getDeletedRecords').and.rejectWith({ status: 403 });
    const fixture = TestBed.createComponent(DeletedRecordsComponent);
    const component = fixture.componentInstance;
    const waiting = expectAsync(component.waitForInit()).toBeRejectedWith(jasmine.objectContaining({ status: 403 }));
    fixture.detectChanges();
    await waiting;
    await expectAsync(component.waitForInit()).toBeRejected();
    fixture.detectChanges();
    expect(component.loadPending).toBeFalse();
    expect(component.initTracker.resultsReturned).toBeTrue();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Sign in again');
    read.and.callFake(original);
    (fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    await fixture.whenStable();
    await component.waitForInit();
    fixture.detectChanges();
    expect(configService.refreshConfig).toHaveBeenCalledTimes(1);
    expect(component.loadError).toBe('');
    expect(component.deletedRecordsResult.pageNum).toBe(1);
    expect(read).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    fixture.destroy();
  });

  it('keeps actual paginator selection and loaded rows consistent after failure, retry and success', async () => {
    configService.refreshConfig = jasmine.createSpy('refreshConfig').and.resolveTo({});
    const fixture = TestBed.createComponent(DeletedRecordsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();
    component.tableHeaders = [{ property: 'title', label: 'Title' }] as any;
    component.deletedRecordsResult = { records: [{ title: 'Page one' }], total: 30, pageNum: 1, recordsPerPage: 10 };
    const previous = component.deletedRecordsResult;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const pageLink = (page: number) => Array.from(fixture.nativeElement.querySelectorAll('pagination .pagination-page a') as NodeListOf<HTMLAnchorElement>)
      .find(link => link.textContent?.trim() === String(page))!;
    const activePage = () => fixture.nativeElement.querySelector('pagination .pagination-page.active')?.textContent.trim();
    let reject!: (reason: unknown) => void;
    const read = spyOn(recordService, 'getDeletedRecords').and.returnValue(new Promise((_resolve, rejectRequest) => { reject = rejectRequest; }));
    expect(activePage()).toBe('1');
    pageLink(2).click();
    fixture.detectChanges();
    // Exercise both disabled DOM clicks and the request guard.
    pageLink(3).click();
    await component.gotoPage(3);
    expect(read).toHaveBeenCalledTimes(1);
    expect(previous.pageNum).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Page one');
    reject({ status: 500 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.deletedRecordsResult).toBe(previous);
    expect(previous.pageNum).toBe(1);
    expect(activePage()).toBe('1');
    expect(fixture.nativeElement.textContent).toContain('Page one');
    expect(component.loadError).toContain('Unable to load');
    expect(component.currentPageNumber).toBe(1);
    const restore = recordService.restoreDeletedRecord = jasmine.createSpy('restoreDeletedRecord').and.resolveTo({});
    const goto = spyOn(component, 'gotoPage').and.resolveTo(previous);
    await component.recordTableAction(undefined, { oid: 'restored' }, 'restore');
    expect(goto).toHaveBeenCalledWith(1);
    goto.and.callThrough();
    let resolve!: (value: any) => void;
    read.and.returnValue(new Promise(resolveRequest => { resolve = resolveRequest; }));
    (fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    pageLink(3).click();
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.calls.mostRecent().args[2]).toBe(2);
    resolve({ items: [{ title: 'Page two' }], totalItems: 30, currentPage: 2 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.deletedRecordsResult.pageNum).toBe(2);
    expect(activePage()).toBe('2');
    expect(fixture.nativeElement.textContent).toContain('Page two');
    expect(component.loadError).toBe('');
    expect(read).toHaveBeenCalledTimes(2);
    expect(component.currentPageNumber).toBe(2);
    read.and.resolveTo({ items: [{ title: 'Page two' }], totalItems: 30, currentPage: 2 });
    await component.recordTableAction(undefined, { oid: 'restored' }, 'restore');
    expect(restore).toHaveBeenCalledWith('restored');
    expect(read.calls.mostRecent().args[2]).toBe(2);
    read.and.resolveTo({ items: [{ title: 'Page three' }], totalItems: 30, currentPage: 3 } as any);
    pageLink(3).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.deletedRecordsResult.pageNum).toBe(3);
    expect(activePage()).toBe('3');
    expect(fixture.nativeElement.textContent).toContain('Page three');
    fixture.destroy();
  });

  it('retains the previous page on failure and retries the requested page', async () => {
    configService.refreshConfig = jasmine.createSpy('refreshConfig').and.resolveTo({});
    const fixture = TestBed.createComponent(DeletedRecordsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();
    const previous = component.deletedRecordsResult;
    const original = recordService.getDeletedRecords.bind(recordService);
    const read = spyOn(recordService, 'getDeletedRecords').and.rejectWith({ status: 0 });
    await component.gotoPage(2);
    expect(component.initTracker.resultsReturned).toBeTrue();
    expect(component.deletedRecordsResult).toBe(previous);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Check your connection');
    read.and.callFake(original);
    await component.retryLoad();
    expect(component.loadError).toBe('');
    expect(component.initTracker.resultsReturned).toBeTrue();
    expect(read).toHaveBeenCalledTimes(2);
    fixture.destroy();
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
