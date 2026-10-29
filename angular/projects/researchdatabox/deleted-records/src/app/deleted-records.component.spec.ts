import { By } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { LOCALE_ID, inject as inject_1, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { fakeAsync, flushMicrotasks, tick, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { APP_BASE_HREF } from '@angular/common';
import {
  RedboxPortalCoreServicesModule, RedboxPortalRecordsModule, RedboxPortalRecordTableModule,
  UtilityService,
  LoggerService,
  TranslationService,
  ConfigService,
  getStubConfigService,
  getStubTranslationService,
  getStubRecordService,
  RecordService,
  RecordResponseTable, RecordTableComponent
} from '@researchdatabox/portal-ng-common';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { FormsModule } from "@angular/forms";
import { PaginationModule } from 'ngx-bootstrap/pagination';
import { DeletedRecordsComponent } from './deleted-records.component';
import { ModalModule } from "ngx-bootstrap/modal";

describe('DeletedRecordsComponent', () => {
  async function settleView(fixture: any): Promise<void> {
    // Component event handlers return promises outside Angular's pending-task tracking.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();
    await fixture.whenStable();
    const table = fixture.debugElement.query(By.directive(RecordTableComponent));
    if (table) await table.componentInstance.waitForInit();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function destroyView(fixture: any): Promise<void> {
    // ngx-bootstrap defers showing newly created modals to the next task.
    // Let rendering and that task finish before destroying its injector.
    await fixture.whenStable();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    fixture.destroy();
  }

  function approveSelectedRevision(http: HttpTestingController): void {
    const read = http.expectOne(req => req.method === 'GET' && req.url.includes('/record/delete/'));
    const entityTag = '"rb-record-v1.3.' + 'a'.repeat(43) + '"';
    read.flush({ data: {}, meta: { revision: 3, entityTag } }, { headers: { ETag: entityTag } });
  }

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
          oid: 'rdmp-record-1', revision: 3,
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
        BsDatepickerModule,
        PaginationModule,
        ModalModule,
        RedboxPortalCoreServicesModule, RedboxPortalRecordsModule, RedboxPortalRecordTableModule
      ],
      providers: [
        provideZonelessChangeDetection(),
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

  afterEach(async () => {
    // Original modal tests rely on TestBed teardown; drain deferred show tasks first.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });

  for (const paginationFails of [false, true]) {
    it(`runs only the latest submitted filter after a pending page ${paginationFails ? 'fails' : 'succeeds'}, and retries its exact criteria`, async () => {
      configService.refreshConfig = jasmine.createSpy('refreshConfig').and.resolveTo({});
      const fixture = TestBed.createComponent(DeletedRecordsComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      await component.waitForInit();
      component.tableHeaders = [{ property: 'title', sortProperty: 'deletedRecordMetadata.metadata.title', label: 'Title' }] as any;
      component.deletedRecordsResult = { records: [{ title: 'Original' }], total: 30, pageNum: 1, recordsPerPage: 10 };
      const realService = new RecordService(TestBed.inject(HttpClient), 'base', TestBed.inject(UtilityService), configService, TestBed.inject(LoggerService));
      await realService.waitForInit();
      realService.brandingAndPortalUrl = 'https://portal.example/base/default/rdmp';
      (component as any).recordService = realService;
      const http = TestBed.inject(HttpTestingController);
      const settle = async () => { for (let i = 0; i < 15; i++) { await Promise.resolve(); } };
      fixture.autoDetectChanges();
      await settleView(fixture);
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
      await settleView(fixture);
      fixture.detectChanges();
      expect(component.deletedRecordsResult.pageNum).toBe(paginationFails ? 1 : 2);
      expect(component.loadError).toContain('Unable to load');
      (fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement).click();
      await settle();
      const retry = http.expectOne(req => req.url.includes('listDeleted'));
      expect(retry.request.urlWithParams).toBe(latest.request.urlWithParams);
      retry.flush({ items: [{ title: 'Latest rows' }], totalItems: 1, currentPage: 1 });
      await settle();
      await settleView(fixture);
      fixture.detectChanges();
      expect(component.deletedRecordsResult.pageNum).toBe(1);
      expect(fixture.nativeElement.textContent).toContain('Latest rows');
      expect(component.loadError).toBe('');
      http.verify();
      await destroyView(fixture);
    });
  }

  it('queues the latest DOM sort and filter, restores the applied sort on failure and retries without writes', async () => {
    configService.refreshConfig = jasmine.createSpy('refreshConfig').and.resolveTo({});
    const fixture = TestBed.createComponent(DeletedRecordsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();
    component.tableHeaders = [{ property: 'title', sortProperty: 'deletedRecordMetadata.metadata.title', label: 'Title' }] as any;
    component.deletedRecordsResult = { records: [{ title: 'Original' }], total: 30, pageNum: 1, recordsPerPage: 10 };
    const realService = new RecordService(TestBed.inject(HttpClient), 'base', TestBed.inject(UtilityService), configService, TestBed.inject(LoggerService));
    await realService.waitForInit();
    realService.brandingAndPortalUrl = 'https://portal.example/base/default/rdmp';
    (component as any).recordService = realService;
    const http = TestBed.inject(HttpTestingController);
    const settle = async () => { for (let i = 0; i < 15; i++) { await Promise.resolve(); } };
    fixture.detectChanges();
    await settleView(fixture);
    fixture.detectChanges();
    const header = fixture.nativeElement.querySelector('header-sort button') as HTMLButtonElement;
    header.click();
    const ascending = http.expectOne(req => req.url.includes('listDeletedRecords'));
    expect(new URL(ascending.request.url).searchParams.get('sort')).toBe('deletedRecordMetadata.metadata.title:1');
    ascending.flush({ items: [{ title: 'Ascending' }], totalItems: 30, currentPage: 1 });
    await settle();
    await settleView(fixture);
    fixture.detectChanges();
    expect(component.sort).toBe('deletedRecordMetadata.metadata.title:1');
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
    expect(criteria.get('sort')).toBe('deletedRecordMetadata.metadata.title:-1');
    expect(criteria.get('filter')).toBe('latest');
    expect(criteria.get('start')).toBe('0');
    latest.flush('failed', { status: 500, statusText: 'Server Error' });
    await settle();
    await settleView(fixture);
    fixture.detectChanges();
    expect(component.sort).toBe('deletedRecordMetadata.metadata.title:1');
    expect(header.getAttribute('aria-sort')).toBe('ascending');
    expect(fixture.nativeElement.textContent).toContain('Ascending');
    expect(component.currentPageNumber).toBe(1);
    (fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    await settle();
    const retry = http.expectOne(req => req.url.includes('listDeletedRecords'));
    expect(retry.request.url).toBe(latest.request.url);
    retry.flush({ items: [{ title: 'Descending latest' }], totalItems: 1, currentPage: 1 });
    await settle();
    await settleView(fixture);
    fixture.detectChanges();
    expect(component.sort).toBe('deletedRecordMetadata.metadata.title:-1');
    expect(header.getAttribute('aria-sort')).toBe('descending');
    expect(fixture.nativeElement.textContent).toContain('Descending latest');
    expect(component.loadError).toBe('');

    // A rejected configuration retry never reaches gotoPage. An ignored header
    // click must still leave its indicator aligned with the retained rows.
    const failedPage = component.gotoPage(2);
    http.expectOne(req => req.url.includes('listDeletedRecords'))
      .flush('failed', { status: 500, statusText: 'Server Error' });
    await failedPage;
    let rejectConfig!: (reason: unknown) => void;
    configService.refreshConfig = jasmine.createSpy('refreshConfig').and.returnValue(
      new Promise((_resolve, reject) => { rejectConfig = reject; }));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    expect(component.loadPending).toBeTrue();
    header.click();
    await settle();
    fixture.detectChanges();
    expect(header.getAttribute('aria-sort')).toBe('descending');
    rejectConfig({ status: 403 });
    await settle();
    await settleView(fixture);
    fixture.detectChanges();
    expect(component.loadPending).toBeFalse();
    expect(component.sort).toBe('deletedRecordMetadata.metadata.title:-1');
    expect(header.getAttribute('aria-sort')).toBe('descending');
    expect(fixture.nativeElement.textContent).toContain('Descending latest');
    expect(component.loadError).toContain('Sign in again');
    http.expectNone(req => req.url.includes('listDeletedRecords'));
    http.verify();
    await destroyView(fixture);
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
    await settleView(fixture);
    await component.waitForInit();
    fixture.detectChanges();
    expect(configService.refreshConfig).toHaveBeenCalledTimes(1);
    expect(component.loadError).toBe('');
    expect(component.deletedRecordsResult.pageNum).toBe(1);
    expect(read).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    await destroyView(fixture);
  });

  it('keeps actual paginator selection and loaded rows consistent after failure, retry and success', async () => {
    configService.refreshConfig = jasmine.createSpy('refreshConfig').and.resolveTo({});
    const fixture = TestBed.createComponent(DeletedRecordsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();
    component.tableHeaders = [{ property: 'title', sortProperty: 'deletedRecordMetadata.metadata.title', label: 'Title' }] as any;
    component.deletedRecordsResult = { records: [{ title: 'Page one' }], total: 30, pageNum: 1, recordsPerPage: 10 };
    const previous = component.deletedRecordsResult;
    fixture.detectChanges();
    await settleView(fixture);
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
    await settleView(fixture);
    fixture.detectChanges();
    expect(component.deletedRecordsResult).toBe(previous);
    expect(previous.pageNum).toBe(1);
    expect(activePage()).toBe('1');
    expect(fixture.nativeElement.textContent).toContain('Page one');
    expect(component.loadError).toContain('Unable to load');
    expect(component.currentPageNumber).toBe(1);
    const restore = recordService.restoreDeletedRecord = jasmine.createSpy('restoreDeletedRecord').and.resolveTo({ success: true });
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
    await settleView(fixture);
    fixture.detectChanges();
    expect(component.deletedRecordsResult.pageNum).toBe(2);
    expect(activePage()).toBe('2');
    expect(fixture.nativeElement.textContent).toContain('Page two');
    expect(component.loadError).toBe('');
    expect(read).toHaveBeenCalledTimes(2);
    expect(component.currentPageNumber).toBe(2);
    read.and.resolveTo({ items: [{ title: 'Page two' }], totalItems: 30, currentPage: 2 });
    await component.recordTableAction(undefined, { oid: 'restored' }, 'restore');
    expect(restore).toHaveBeenCalledWith('restored', {});
    expect(read.calls.mostRecent().args[2]).toBe(2);
    read.and.resolveTo({ items: [{ title: 'Page three' }], totalItems: 30, currentPage: 3 } as any);
    pageLink(3).click();
    await settleView(fixture);
    fixture.detectChanges();
    expect(component.deletedRecordsResult.pageNum).toBe(3);
    expect(activePage()).toBe('3');
    expect(fixture.nativeElement.textContent).toContain('Page three');
    await destroyView(fixture);
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
    await destroyView(fixture);
  });

  it('does not let filtering skip a page retry while configuration refresh is pending', async () => {
    let refresh!: (value: any) => void;
    configService.refreshConfig = jasmine.createSpy('refreshConfig').and.returnValue(
      new Promise(resolve => { refresh = resolve; })
    );
    const fixture = TestBed.createComponent(DeletedRecordsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();
    const previous = component.deletedRecordsResult;
    const read = spyOn(recordService, 'getDeletedRecords').and.rejectWith({ status: 500 });
    await component.gotoPage(2);
    const retry = component.retryLoad();
    expect(component.loadPending).toBeTrue();
    await component.filter();
    expect(read).toHaveBeenCalledTimes(1);
    expect(component.deletedRecordsResult).toBe(previous);
    read.and.resolveTo({ items: [{ title: 'Page two' }], totalItems: 30, currentPage: 2 });
    refresh({});
    await retry;
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.calls.mostRecent().args[2]).toBe(2);
    expect(component.currentPageNumber).toBe(2);
    expect(component.loadError).toBe('');
    expect(component.loadPending).toBeFalse();
    await destroyView(fixture);
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
    await settleView(fixture);
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
        if (filterFields && filterFields.split(',').includes('deletedRecordMetadata.metadata.title') &&
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

  it('should sort each column using its deleted-record storage path', async function () {
    const fixture = TestBed.createComponent(DeletedRecordsComponent);
    const app = fixture.componentInstance;

    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await settleView(fixture);

    const requestedSorts: string[] = [];
    recordService.getDeletedRecords = async function(
      recordType: string,
      state: string,
      pageNumber: number,
      packageType: string = '',
      sort: string = ''
    ) {
      requestedSorts.push(sort);
      return mockData.deletedRecords;
    };

    for (const header of app.tableHeaders) {
      await app.headerSortChanged({ sort: 'asc' }, header);
      await app.headerSortChanged({ sort: 'desc' }, header);
    }

    expect(requestedSorts).toEqual([
      'deletedRecordMetadata.metadata.title:1',
      'deletedRecordMetadata.metadata.title:-1',
      'deletedRecordMetadata.dateCreated:1',
      'deletedRecordMetadata.dateCreated:-1',
      'deletedRecordMetadata.lastSaveDate:1',
      'deletedRecordMetadata.lastSaveDate:-1',
      'dateDeleted:1',
      'dateDeleted:-1',
    ]);
  });

  it('clears the previous column sort indicator when another header is clicked', async () => {
    const fixture = TestBed.createComponent(DeletedRecordsComponent);
    fixture.autoDetectChanges(true);
    await fixture.componentInstance.waitForInit();
    await settleView(fixture);
    const headers: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('header-sort button');
    headers[0].click();
    await settleView(fixture);
    expect(headers[0].getAttribute('aria-sort')).toBe('ascending');
    headers[1].click();
    await settleView(fixture);
    expect(headers[1].getAttribute('aria-sort')).toBe('ascending');
    expect(headers[0].hasAttribute('aria-sort')).toBeFalse();
  });

  it('should restore a deleted record', async function () {
    // create app
    const fixture = TestBed.createComponent(DeletedRecordsComponent);
    const app = fixture.componentInstance;

    // init app
    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await settleView(fixture);
    expect(app.deletedRecordsResult.total).toEqual(2);

    // set up recordService.destroyDeletedRecord
    let selectedRevision: number | undefined;
    recordService.restoreDeletedRecord = async function (oid: string, revision: number) {
      selectedRevision = revision;
      const index = mockData.deletedRecords.items.findIndex((item: any) => item.oid == oid);
      if (index > -1) {
        mockData.deletedRecords.items.splice(index, 1);
        mockData.deletedRecords.noItems -= 1;
        mockData.deletedRecords.totalItems -= 1;
      }
      return { success: true, oid };
    };

    // trigger restore
    await app.recordTableAction(undefined, {oid: 'rdmp-record-1', revision: 4}, 'restore');
    expect(selectedRevision).toBe(4);
    expect(app.deletedRecordsResult.total).toEqual(1);
    await settleView(fixture);
    expect(fixture.nativeElement.querySelector('record-table').textContent).not.toContain('rdmp record 1');
    expect(fixture.nativeElement.querySelector('record-table').textContent).toContain('dataRecord record 2');
  });
  it('should destroy a deleted record', async function () {
    // create app
    const fixture = TestBed.createComponent(DeletedRecordsComponent);
    const app = fixture.componentInstance;

    // init app
    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await settleView(fixture);
    expect(app.deletedRecordsResult.total).toEqual(2);

    // set up recordService.destroyDeletedRecord
    let selectedRevision: number | undefined;
    recordService.destroyDeletedRecord = async function (oid: string, revision: number) {
      selectedRevision = revision;
      const index = mockData.deletedRecords.items.findIndex((item: any) => item.oid == oid);
      if (index > -1) {
        mockData.deletedRecords.items.splice(index, 1);
        mockData.deletedRecords.noItems -= 1;
        mockData.deletedRecords.totalItems -= 1;
      }
      return { success: true, oid };
    };

    // trigger destroy
    await app.recordTableAction(undefined, {oid: 'rdmp-record-1', revision: 4}, 'destroy');
    expect(app.isDestroyRecordModalShown).toEqual(true);
    expect(app.currentDestroyRecordModalOid).toEqual('rdmp-record-1');

    await settleView(fixture);
    await app.confirmDestroyRecordModal(undefined);
    expect(selectedRevision).toBe(4);
    expect(app.currentDestroyRecordModalOid).toBeUndefined();
    expect(app.deletedRecordsResult.total).toEqual(1);
  });
  for (const action of ['restore', 'destroy'] as const) {
    async function setupAction() {
      mockData.deletedRecords.totalItems = 30;
      const fixture = TestBed.createComponent(DeletedRecordsComponent);
      fixture.detectChanges();
      const app = fixture.componentInstance;
      await app.waitForInit();
      await settleView(fixture);
      await app.gotoPage(2);
      fixture.detectChanges();
      await settleView(fixture);
      const method = action === 'restore' ? 'restoreDeletedRecord' : 'destroyDeletedRecord';
      const mutation = jasmine.createSpy(method);
      recordService[method] = mutation;
      const reload = spyOn(recordService, 'getDeletedRecords').and.resolveTo(mockData.deletedRecords);
      const run = async () => {
        if (action === 'destroy') {
          await app.recordTableAction(null, { oid: 'rdmp-record-1', revision: 3 }, action);
          fixture.detectChanges();
          await settleView(fixture);
          await app.confirmDestroyRecordModal(null);
        } else {
          await app.recordTableAction(null, { oid: 'rdmp-record-1', revision: 3 }, action);
        }
        fixture.detectChanges();
      };
      return { fixture, app, mutation, reload, run };
    }

    it(`${action}: retains escaped v1 display diagnostics after HTTP 500 and locks writes across read retries`, async () => {
      const { fixture, app } = await setupAction();
      configService.refreshConfig = jasmine.createSpy('refreshConfig').and.resolveTo({});
      const service = new RecordService(TestBed.inject(HttpClient), 'base', TestBed.inject(UtilityService), configService, TestBed.inject(LoggerService));
      await service.waitForInit();
      service.brandingAndPortalUrl = 'https://portal.example/base/default/rdmp';
      (app as any).recordService = service;
      const http = TestBed.inject(HttpTestingController);
      const settle = async () => { for (let i = 0; i < 15; i++) { await Promise.resolve(); } };
      const previous = app.deletedRecordsResult;
      if (action === 'destroy') {
        await app.recordTableAction(null, { oid: 'rdmp-record-1', revision: 3 }, action);
        fixture.detectChanges();
        (fixture.nativeElement.querySelector('.modal-footer .btn-primary') as HTMLButtonElement).click();
      } else {
        (fixture.nativeElement.querySelector('record-table .btn-primary') as HTMLButtonElement).click();
      }
      approveSelectedRevision(http);
      await settle();
      const write = http.expectOne(req => req.method === (action === 'restore' ? 'PUT' : 'DELETE'));
      expect(write.request.headers.get('X-CSRF-Token')).toBe('testCsrfValue');
      write.flush({ message: 'Action failed', details: 'Storage rejected <img src=x onerror=alert(1)> & ownership check' },
        { status: 500, statusText: 'Server Error' });
      await settle();
      fixture.detectChanges();
      const feedback = fixture.nativeElement.querySelector('.action-feedback');
      expect(feedback.textContent).toContain('Action failed');
      expect(feedback.textContent).toContain('Storage rejected <img src=x onerror=alert(1)> & ownership check');
      expect(feedback.querySelector('img')).toBeNull();
      expect(feedback.textContent).toContain('may have completed');
      expect(app.actionNeedsRefresh).toBeTrue();
      expect(app.canRetryRestore).toBeFalse();
      expect(app.deletedRecordsResult).toBe(previous);
      if (action === 'destroy') {
        expect(app.currentDestroyRecordModalOid).toBe('rdmp-record-1');
        expect(app.isDestroyRecordModalShown).toBeTrue();
      }
      for (const succeeds of [false, true]) {
        (fixture.nativeElement.querySelector('.refresh-actions') as HTMLButtonElement).click();
        await settle();
        const read = http.expectOne(req => req.url.includes('listDeletedRecords'));
        await app.recordTableAction(null, { oid: 'another' }, 'restore');
        await app.confirmDestroyRecordModal(null);
        await app.retryRestore();
        await app.filter();
        await app.headerSortChanged({ variable: 'title', sort: 'desc' }, app.tableHeaders.find(header => header.property === 'title')!);
        http.expectNone(req => req.method !== 'GET');
        if (succeeds) {
          read.flush({ items: [], totalItems: 30, currentPage: 2 });
        } else {
          read.flush({ message: 'read failed' }, { status: 500, statusText: 'Server Error' });
        }
        await settle();
        fixture.detectChanges();
        expect(app.actionNeedsRefresh).toBe(!succeeds);
        expect(app.actionMessage).toContain('Storage rejected');
        if (!succeeds) {
          expect(app.deletedRecordsResult).toBe(previous);
          expect(app.actionRefreshError).toContain('Unable to refresh');
        }
      }
      http.verify();
      await destroyView(fixture);
    });

    it(`${action}: ignores unrecognized error bodies and bounds known display text`, async () => {
      const { fixture, app, mutation, reload, run } = await setupAction();
      for (const body of [
        '<html><body>Proxy stack trace</body></html>',
        { message: 'Private raw exception' },
        { error: { message: 'Nested private error' }, details: { stack: 'Private stack' } },
        { message: 'Internal Server Error', details: '' },
        { message: { stack: 'Private stack' }, details: ['Private array'] },
      ]) {
        mutation.and.rejectWith(new HttpErrorResponse({ status: 500, error: body }));
        await run();
        expect(app.actionNeedsRefresh).toBeTrue();
        expect(app.actionMessage).toContain('may have completed');
        expect(app.actionMessage).not.toMatch(/Private|Proxy|Internal Server Error|object Object/);
        await app.refreshActionList();
      }
      mutation.and.rejectWith(new HttpErrorResponse({ status: 500,
        error: { message: 'Display failure', details: 'x'.repeat(5000) } }));
      await run();
      expect(app.actionMessage).toContain('Display failure');
      expect(app.actionMessage.length).toBeLessThan(1400);
      expect(app.actionNeedsRefresh).toBeTrue();
      await destroyView(fixture);
    });

    for (const stall of ['mutation', 'refresh', 'uncertain refresh']) {
      it(`${action}: recovers controls after a stalled ${stall} while keeping mutations locked`, fakeAsync(() => {
        const fixture = TestBed.createComponent(DeletedRecordsComponent);
        const app = fixture.componentInstance;
        fixture.detectChanges();
        flushMicrotasks();
        // Exercise only timeout state, without scheduling modal DOM animations.
        fixture.changeDetectorRef.detach();
        (app as any).isReady = true;
        app.currentPageNumber = 1;
        app.deletedRecordsResult = { records: [{ oid: 'last', revision: 3, title: 'Retained row' }],
          total: 1, pageNum: 1, recordsPerPage: 10 };
        const previous = app.deletedRecordsResult;
        const service = new RecordService(TestBed.inject(HttpClient), 'base', TestBed.inject(UtilityService), configService, TestBed.inject(LoggerService));
        void service.waitForInit();
        flushMicrotasks();
        service.brandingAndPortalUrl = 'https://portal.example/base/default/rdmp';
        (app as any).recordService = service;
        const http = TestBed.inject(HttpTestingController);
        if (action === 'destroy') {
          void app.recordTableAction(null, { oid: 'last', revision: 3 }, action);
          void app.confirmDestroyRecordModal(null);
        } else {
          void app.recordTableAction(null, { oid: 'last', revision: 3 }, action);
        }
        approveSelectedRevision(http);
        flushMicrotasks();
        const mutation = http.expectOne(req => req.method === (action === 'restore' ? 'PUT' : 'DELETE'));
        let stalled = mutation;
        if (stall !== 'mutation') {
          mutation.flush(stall === 'refresh' ? { success: true } : {});
          flushMicrotasks();
          if (stall === 'uncertain refresh') {
            void app.refreshActionList();
          }
          stalled = http.expectOne(req => req.url.includes('listDeletedRecords'));
        }
        tick(29_999);
        expect(app.actionPending).toBeTrue();
        app.hideDestroyRecordModal();
        if (action === 'destroy' && stall !== 'refresh') {
          expect(app.isDestroyRecordModalShown).toBeTrue();
        }
        tick(1);
        flushMicrotasks();
        expect(stalled.cancelled).toBeTrue();
        expect(app.actionPending).toBeFalse();
        expect(app.actionNeedsRefresh).toBeTrue();
        expect(app.deletedRecordsResult).toBe(previous);
        expect(app.canRetryRestore).toBeFalse();
        if (stall !== 'refresh') {
          expect(app.actionMessage).toContain('outcome is unknown');
          if (stall === 'uncertain refresh') {
            expect(app.actionRefreshError).toContain('Unable to refresh');
          }
        } else {
          expect(app.actionMessage).toContain('succeeded');
          expect(app.actionRefreshError).toContain('Unable to refresh');
        }
        app.hideDestroyRecordModal();
        expect(app.isDestroyRecordModalShown).toBeFalse();
        void app.recordTableAction(null, { oid: 'last', revision: 3 }, action);
        http.expectNone(req => req.method !== 'GET');
        void app.refreshActionList();
        http.expectOne(req => req.url.includes('listDeletedRecords')).flush({ items: [], totalItems: 0 });
        flushMicrotasks();
        expect(app.actionNeedsRefresh).toBeFalse();
        expect(app.actionPending).toBeFalse();
        http.verify();
        fixture.destroy();
      }));
    }

    it(`${action}: uses the configured page size for requests, fallback and paginator metadata`, async () => {
      const fixture = TestBed.createComponent(DeletedRecordsComponent);
      const app = fixture.componentInstance;
      // Exercise the real component/service request contract without bootstrapping
      // a paginator whose prior page belongs to the default-size fixture.
      (app as any).isReady = true;
      app.recordsPerPage = 5;
      app.currentPageNumber = 5;
      app.deletedRecordsResult = { records: [{ oid: 'last', revision: 3, title: 'Last record' }],
        total: 21, pageNum: 5, recordsPerPage: 5 };
      const previous = app.deletedRecordsResult;
      const service = new RecordService(TestBed.inject(HttpClient), 'base', TestBed.inject(UtilityService), configService, TestBed.inject(LoggerService));
      await service.waitForInit();
      service.brandingAndPortalUrl = 'https://portal.example/base/default/rdmp';
      (app as any).recordService = service;
      const http = TestBed.inject(HttpTestingController);
      const settle = async () => { for (let i = 0; i < 15; i++) { await Promise.resolve(); } };
      let running: Promise<unknown>;
      if (action === 'destroy') {
        await app.recordTableAction(null, { oid: 'last', revision: 3 }, action);
        running = app.confirmDestroyRecordModal(null);
      } else {
        running = app.recordTableAction(null, { oid: 'last', revision: 3 }, action);
      }
      approveSelectedRevision(http);
      await settle();
      http.expectOne(req => req.method === (action === 'restore' ? 'PUT' : 'DELETE')).flush({ success: true });
      await settle();
      const stale = http.expectOne(req => req.url.includes('listDeletedRecords'));
      expect(new URL(stale.request.url).searchParams.get('rows')).toBe('5');
      expect(new URL(stale.request.url).searchParams.get('start')).toBe('20');
      stale.flush({ items: [], totalItems: 20 });
      await settle();
      const last = http.expectOne(req => req.url.includes('listDeletedRecords'));
      expect(new URL(last.request.url).searchParams.get('rows')).toBe('5');
      expect(new URL(last.request.url).searchParams.get('start')).toBe('15');
      expect(app.deletedRecordsResult).toBe(previous);
      expect(app.actionNeedsRefresh).toBeTrue();
      last.flush({ items: [{ oid: 'remaining', title: 'Remaining row' }], totalItems: 20 });
      await running;
      expect(app.currentPageNumber).toBe(4);
      expect(app.deletedRecordsResult.recordsPerPage).toBe(5);
      expect(app.deletedRecordsResult.records[0]).toEqual(jasmine.objectContaining({ title: 'Remaining row' }));
      expect(app.actionNeedsRefresh).toBeFalse();
      http.verify();
      await destroyView(fixture);
    });

    for (const total of [20, 0]) {
      it(`${action}: refreshes an empty out-of-range page once to the last valid page (total ${total})`, async () => {
        const { fixture, app, mutation, reload, run } = await setupAction();
        await app.gotoPage(3);
        reload.calls.reset();
        const previous = app.deletedRecordsResult;
        let markMutationStarted!: () => void;
        const mutationStarted = new Promise<void>(resolve => { markMutationStarted = resolve; });
        mutation.and.callFake(() => {
          markMutationStarted();
          return Promise.resolve({ success: true });
        });
        let finishFallback!: (value: any) => void;
        reload.and.returnValues(Promise.resolve({ items: [], totalItems: total }),
          new Promise(resolve => { finishFallback = resolve; }));
        const running = run();
        await mutationStarted;
        for (let i = 0; i < 15; i++) { await Promise.resolve(); }
        expect(reload.calls.count()).toBe(2);
        expect(reload.calls.mostRecent().args[2]).toBe(total === 0 ? 1 : 2);
        expect(app.actionNeedsRefresh).toBeTrue();
        expect(app.actionPending).toBeTrue();
        expect(app.deletedRecordsResult).toBe(previous);
        await app.recordTableAction(null, { oid: 'another' }, 'restore');
        await app.filter();
        finishFallback({ items: total ? [{ title: 'Last valid page' }] : [], totalItems: total });
        await running;
        fixture.detectChanges();
        expect(app.currentPageNumber).toBe(total === 0 ? 1 : 2);
        expect(app.actionNeedsRefresh).toBeFalse();
        expect(mutation).toHaveBeenCalledTimes(1);
        await destroyView(fixture);
      });
    }

    it(`${action}: does not loop when the fallback page also becomes out of range`, async () => {
      const { fixture, app, mutation, reload, run } = await setupAction();
      await app.gotoPage(3);
      reload.calls.reset();
      const previous = app.deletedRecordsResult;
      mutation.and.resolveTo({ success: true });
      reload.and.returnValues(Promise.resolve({ items: [], totalItems: 20 }),
        Promise.resolve({ items: [], totalItems: 0 }));
      await run();
      expect(reload).toHaveBeenCalledTimes(2);
      expect(app.deletedRecordsResult).toBe(previous);
      expect(app.actionNeedsRefresh).toBeTrue();
      expect(app.actionRefreshError).toContain('Unable to refresh');
      expect(mutation).toHaveBeenCalledTimes(1);
      await destroyView(fixture);
    });

    it(`${action}: retains rows and the refresh lock when the bounded last-page fallback fails`, async () => {
      const { fixture, app, mutation, reload, run } = await setupAction();
      await app.gotoPage(3);
      reload.calls.reset();
      const previous = app.deletedRecordsResult;
      mutation.and.resolveTo({ success: true });
      reload.and.callFake(async (...args: any[]) => {
        if (args[2] === 3) { return { items: [], totalItems: 20 }; }
        throw new HttpErrorResponse({ status: 500 });
      });
      await run();
      expect(reload).toHaveBeenCalledTimes(2);
      expect(app.deletedRecordsResult).toBe(previous);
      expect(app.currentPageNumber).toBe(3);
      expect(app.actionNeedsRefresh).toBeTrue();
      expect(app.actionRefreshError).toContain('Unable to refresh');
      reload.and.resolveTo({ items: [], totalItems: 20 });
      await app.refreshActionList();
      expect(reload).toHaveBeenCalledTimes(4);
      expect(app.currentPageNumber).toBe(2);
      expect(app.actionNeedsRefresh).toBeFalse();
      expect(mutation).toHaveBeenCalledTimes(1);
      await destroyView(fixture);
    });

    it(`${action}: shows refusal, retains rows/context, and retries through the DOM`, async () => {
      const { fixture, app, mutation, reload, run } = await setupAction();
      const previous = app.deletedRecordsResult;
      mutation.and.resolveTo({ success: false, message: 'Access denied <script>unsafe</script>' });
      await run();
      expect(reload).not.toHaveBeenCalled();
      expect(app.deletedRecordsResult).toBe(previous);
      expect(app.actionPending).toBeFalse();
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Access denied');
      expect(fixture.nativeElement.querySelector('script')).toBeNull();
      if (action === 'destroy') {
        expect(app.isDestroyRecordModalShown).toBeTrue();
        expect(app.currentDestroyRecordModalOid).toBe('rdmp-record-1');
      }
      mutation.and.resolveTo({ success: true });
      const retry = fixture.nativeElement.querySelector(action === 'restore' ? '.retry-restore' : '.modal-footer .btn-primary') as HTMLButtonElement;
      retry.click();
      await settleView(fixture);
      fixture.detectChanges();
      expect(mutation).toHaveBeenCalledTimes(2);
      expect(reload).toHaveBeenCalledTimes(1);
      expect(app.currentDestroyRecordModalOid).toBeUndefined();
      expect(app.actionPending).toBeFalse();
      await destroyView(fixture);
    });

    for (const failure of [
      new HttpErrorResponse({ status: 0 }),
      new HttpErrorResponse({ status: 500, error: { success: false } }),
      new HttpErrorResponse({ status: 409 })
    ]) {
      it(`${action}: status ${failure.status} requires a successful refresh before any repeat`, async () => {
        const { fixture, app, mutation, reload, run } = await setupAction();
        mutation.and.rejectWith(failure);
        await run();
        expect(app.actionPending).toBeFalse();
        expect(app.actionNeedsRefresh).toBeTrue();
        expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('outcome is unknown');
        expect(reload).not.toHaveBeenCalled();
        await run();
        await app.retryRestore();
        expect(mutation).toHaveBeenCalledTimes(1);
        if (action === 'destroy') {
          expect(app.currentDestroyRecordModalOid).toBe('rdmp-record-1');
          expect(fixture.nativeElement.querySelector('.modal-footer .btn-primary').disabled).toBeTrue();
        }
        reload.and.rejectWith(new HttpErrorResponse({ status: 0 }));
        (fixture.nativeElement.querySelector('.refresh-actions') as HTMLButtonElement).click();
        await settleView(fixture);
        fixture.detectChanges();
        expect(app.actionNeedsRefresh).toBeTrue();
        expect(app.initTracker.resultsReturned).toBeTrue();
        expect(app.actionPending).toBeFalse();
        reload.and.resolveTo(mockData.deletedRecords);
        (fixture.nativeElement.querySelector('.refresh-actions') as HTMLButtonElement).click();
        await settleView(fixture);
        fixture.detectChanges();
        expect(app.actionNeedsRefresh).toBeFalse();
        expect(app.currentDestroyRecordModalOid).toBeUndefined();
        expect(fixture.nativeElement.textContent).toContain('Verify the record state');
        expect(mutation).toHaveBeenCalledTimes(1);
        await destroyView(fixture);
      });
    }

    for (const status of [400, 401, 403]) {
      it(`${action}: status ${status} gives auth/CSRF recovery without bypassing the refusal`, async () => {
        const { fixture, app, mutation, reload, run } = await setupAction();
        mutation.and.rejectWith(new HttpErrorResponse({ status }));
        await run();
        expect(app.actionMessage).toContain('sign in again or refresh');
        expect(app.actionNeedsRefresh).toBeFalse();
        expect(app.actionPending).toBeFalse();
        expect(reload).not.toHaveBeenCalled();
        expect(app.isDestroyRecordModalShown).toBe(action === 'destroy');
        await destroyView(fixture);
      });
    }

    for (const outcome of ['success', 'unknown'] as const) {
      it(`${action}: ${outcome} with failed refresh retains the real page and retries only the read`, async () => {
        const { fixture, app, mutation, reload, run } = await setupAction();
        const previous = app.deletedRecordsResult;
        const activePage = () => fixture.nativeElement.querySelector('pagination .pagination-page.active')?.textContent.trim();
        const pageLink = (page: number) => Array.from(fixture.nativeElement.querySelectorAll('pagination .pagination-page a') as NodeListOf<HTMLAnchorElement>)
          .find(link => link.textContent?.trim() === String(page))!;
        expect(activePage()).toBe('2');
        if (outcome === 'success') {
          mutation.and.resolveTo({ success: true });
        } else {
          mutation.and.rejectWith(new HttpErrorResponse({ status: 0 }));
        }
        reload.and.rejectWith(new HttpErrorResponse({ status: 500 }));
        await run();
        if (outcome === 'unknown') {
          // Unknown writes require an explicit read before state can be verified.
          expect(reload).not.toHaveBeenCalled();
          (fixture.nativeElement.querySelector('.refresh-actions') as HTMLButtonElement).click();
          await settleView(fixture);
          fixture.detectChanges();
        }
        expect(app.actionMessage).toContain(outcome === 'success' ? 'succeeded' : 'unknown');
        expect(fixture.nativeElement.textContent).toContain('Unable to refresh');
        expect(app.actionNeedsRefresh).toBeTrue();
        expect(app.actionPending).toBeFalse();
        expect(app.initTracker.resultsReturned).toBeTrue();
        expect(app.deletedRecordsResult).toBe(previous);
        expect(app.currentPageNumber).toBe(2);
        expect(activePage()).toBe('2');
        expect(fixture.nativeElement.textContent).toContain('rdmp record 1');
        expect(fixture.nativeElement.querySelector('record-table .btn-primary')).toBeNull();
        expect(fixture.nativeElement.querySelector('.retry-restore')).toBeNull();
        await run();
        await app.retryRestore();
        await app.confirmDestroyRecordModal(null);
        expect(mutation).toHaveBeenCalledTimes(1);

        let finishRead!: (result: any) => void;
        reload.and.returnValue(new Promise(resolve => { finishRead = resolve; }));
        const retry = fixture.nativeElement.querySelector('.refresh-actions') as HTMLButtonElement;
        retry.click();
        retry.click();
        fixture.detectChanges();
        expect(retry.disabled).toBeTrue();
        expect(app.actionPending).toBeTrue();
        pageLink(3).click();
        await app.gotoPage(3);
        await app.filter();
        await app.headerSortChanged({ variable: 'title', sort: 'asc' }, app.tableHeaders.find(header => header.property === 'title')!);
        await app.refreshActionList();
        await app.recordTableAction(null, { oid: 'other' }, 'restore');
        expect(reload).toHaveBeenCalledTimes(2);
        expect(reload.calls.mostRecent().args[2]).toBe(2);
        expect(mutation).toHaveBeenCalledTimes(1);
        expect(app.actionNeedsRefresh).toBeTrue();
        expect(app.deletedRecordsResult).toBe(previous);
        finishRead({ items: [{ oid: 'remaining', title: 'Verified page two' }], totalItems: 21, currentPage: 2 });
        await settleView(fixture);
        fixture.detectChanges();
        expect(app.actionNeedsRefresh).toBeFalse();
        expect(app.actionPending).toBeFalse();
        expect(app.actionRefreshError).toBe('');
        expect(app.currentDestroyRecordModalOid).toBeUndefined();
        expect(fixture.nativeElement.textContent).toContain('Verify the record state');
        expect(fixture.nativeElement.textContent).toContain('Verified page two');
        expect(fixture.nativeElement.querySelector('record-table .btn-primary')).toBeTruthy();
        expect(activePage()).toBe('2');
        expect(mutation).toHaveBeenCalledTimes(1);
        await destroyView(fixture);
      });
    }

    it(`${action}: refuses a mutation while a paginator read is pending`, async () => {
      const { fixture, app, mutation, reload } = await setupAction();
      if (action === 'destroy') {
        await app.recordTableAction(null, { oid: 'rdmp-record-1', revision: 3 }, action);
        fixture.detectChanges();
      }
      let finishRead!: (result: any) => void;
      reload.and.returnValue(new Promise(resolve => { finishRead = resolve; }));
      const pageThree = Array.from(fixture.nativeElement.querySelectorAll('pagination .pagination-page a') as NodeListOf<HTMLAnchorElement>)
        .find(link => link.textContent?.trim() === '3')!;
      pageThree.click();
      // Exercise method guards before Angular updates disabled/hidden controls.
      await app.recordTableAction(null, { oid: 'rdmp-record-1', revision: 3 }, action);
      await app.confirmDestroyRecordModal(null);
      await app.retryRestore();
      fixture.detectChanges();
      expect(mutation).not.toHaveBeenCalled();
      expect(reload).toHaveBeenCalledTimes(1);
      expect(fixture.nativeElement.querySelector('record-table .btn-primary')).toBeNull();
      if (action === 'destroy') {
        expect(fixture.nativeElement.querySelector('.modal-footer .btn-primary').disabled).toBeTrue();
      }
      finishRead({ items: [], totalItems: 30, currentPage: 3 });
      await settleView(fixture);
      fixture.detectChanges();
      expect(app.currentPageNumber).toBe(3);
      expect(app.initTracker.resultsReturned).toBeTrue();
      await destroyView(fixture);
    });

    it(`${action}: blocks double clicks and competing actions until mutation and refresh settle`, async () => {
      const { fixture, app, mutation, reload } = await setupAction();
      let complete!: (result: any) => void;
      mutation.and.returnValue(new Promise(resolve => { complete = resolve; }));
      if (action === 'destroy') {
        await app.recordTableAction(null, { oid: 'rdmp-record-1', revision: 3 }, action);
        fixture.detectChanges();
        const confirm = fixture.nativeElement.querySelector('.modal-footer .btn-primary') as HTMLButtonElement;
        confirm.click();
        confirm.click();
        fixture.detectChanges();
        expect(confirm.disabled).toBeTrue();
        (fixture.nativeElement.querySelector('.modal-footer .btn-default') as HTMLButtonElement).click();
        expect(app.currentDestroyRecordModalOid).toBe('rdmp-record-1');
      } else {
        // Exercise the real table buttons before rendering disables them.
        const restore = fixture.nativeElement.querySelector('record-table .btn-primary') as HTMLButtonElement;
        expect(restore).toBeTruthy();
        restore.click();
        restore.click();
      }
      await app.recordTableAction(null, { oid: 'another-record' }, 'destroy');
      await app.confirmDestroyRecordModal(null);
      expect(mutation).toHaveBeenCalledTimes(1);
      const pageThree = Array.from(fixture.nativeElement.querySelectorAll('pagination .pagination-page a') as NodeListOf<HTMLAnchorElement>)
        .find(link => link.textContent?.trim() === '3')!;
      fixture.detectChanges();
      pageThree.click();
      await app.gotoPage(3);
      await app.filter();
      await app.headerSortChanged({ variable: 'title', sort: 'desc' }, app.tableHeaders.find(header => header.property === 'title')!);
      expect(app.sort).toBeUndefined();
      expect(reload).not.toHaveBeenCalled();
      let refresh!: (result: any) => void;
      reload.and.returnValue(new Promise(resolve => { refresh = resolve; }));
      complete({ success: true });
      await Promise.resolve();
      await Promise.resolve();
      expect(app.actionPending).toBeTrue();
      await app.recordTableAction(null, { oid: 'another-record' }, 'restore');
      expect(mutation).toHaveBeenCalledTimes(1);
      refresh(mockData.deletedRecords);
      await settleView(fixture);
      expect(app.actionPending).toBeFalse();
      expect(reload).toHaveBeenCalledTimes(1);
      await destroyView(fixture);
    });

    it(`${action}: treats a missing result as uncertain`, async () => {
      const { fixture, app, mutation, reload, run } = await setupAction();
      mutation.and.resolveTo(undefined);
      await run();
      expect(app.actionNeedsRefresh).toBeTrue();
      expect(app.actionMessage).toContain('may have completed');
      expect(reload).not.toHaveBeenCalled();
      await destroyView(fixture);
    });
  }

  it('retains the selected revision and locks actions for typed uncertain mutation results', async () => {
    const fixture = TestBed.createComponent(DeletedRecordsComponent);
    const component = fixture.componentInstance;
    const records = TestBed.inject(RecordService);
    const restore = records.restoreDeletedRecord = jasmine.createSpy('restoreDeletedRecord').and.resolveTo({ success: false, outcome: 'unknown', message: 'Backend unavailable' } as any);
    await component.recordTableAction({}, { oid: 'deleted', revision: 12 }, 'restore');
    expect(restore).toHaveBeenCalledWith('deleted', 12);
    expect(component.actionNeedsRefresh).toBeTrue();
    expect(component.actionMessage).toContain('outcome is unknown');
    expect(component.actionMessage).toContain('Backend unavailable');
    await destroyView(fixture);
  });

});
