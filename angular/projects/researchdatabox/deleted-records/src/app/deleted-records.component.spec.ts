import { LOCALE_ID, inject as inject_1, provideAppInitializer } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
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
      return { success: true, oid };
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
      return { success: true, oid };
    };

    // trigger destroy
    await app.recordTableAction(undefined, {oid: 'rdmp-record-1'}, 'destroy');
    expect(app.isDestroyRecordModalShown).toEqual(true);
    expect(app.currentDestroyRecordModalOid).toEqual('rdmp-record-1');

    await app.confirmDestroyRecordModal(undefined);
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
      await fixture.whenStable();
      await app.gotoPage(2);
      fixture.detectChanges();
      await fixture.whenStable();
      const method = action === 'restore' ? 'restoreDeletedRecord' : 'destroyDeletedRecord';
      const mutation = jasmine.createSpy(method);
      recordService[method] = mutation;
      const reload = spyOn(recordService, 'getDeletedRecords').and.resolveTo(mockData.deletedRecords);
      const run = async () => {
        if (action === 'destroy') {
          await app.recordTableAction(null, { oid: 'rdmp-record-1' }, action);
          fixture.detectChanges();
          await app.confirmDestroyRecordModal(null);
        } else {
          await app.recordTableAction(null, { oid: 'rdmp-record-1' }, action);
        }
        fixture.detectChanges();
      };
      return { fixture, app, mutation, reload, run };
    }

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
      await fixture.whenStable();
      fixture.detectChanges();
      expect(mutation).toHaveBeenCalledTimes(2);
      expect(reload).toHaveBeenCalledTimes(1);
      expect(app.currentDestroyRecordModalOid).toBeUndefined();
      expect(app.actionPending).toBeFalse();
      fixture.destroy();
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
        await fixture.whenStable();
        fixture.detectChanges();
        expect(app.actionNeedsRefresh).toBeTrue();
        expect(app.initTracker.resultsReturned).toBeTrue();
        expect(app.actionPending).toBeFalse();
        reload.and.resolveTo(mockData.deletedRecords);
        (fixture.nativeElement.querySelector('.refresh-actions') as HTMLButtonElement).click();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(app.actionNeedsRefresh).toBeFalse();
        expect(app.currentDestroyRecordModalOid).toBeUndefined();
        expect(fixture.nativeElement.textContent).toContain('Verify the record state');
        expect(mutation).toHaveBeenCalledTimes(1);
        fixture.destroy();
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
        fixture.destroy();
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
          await fixture.whenStable();
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
        await app.headerSortChanged({ variable: 'title', sort: 'asc' }, null);
        await app.refreshActionList();
        await app.recordTableAction(null, { oid: 'other' }, 'restore');
        expect(reload).toHaveBeenCalledTimes(2);
        expect(reload.calls.mostRecent().args[2]).toBe(2);
        expect(mutation).toHaveBeenCalledTimes(1);
        expect(app.actionNeedsRefresh).toBeTrue();
        expect(app.deletedRecordsResult).toBe(previous);
        finishRead({ items: [{ oid: 'remaining', title: 'Verified page two' }], totalItems: 21, currentPage: 2 });
        await fixture.whenStable();
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
        fixture.destroy();
      });
    }

    it(`${action}: refuses a mutation while a paginator read is pending`, async () => {
      const { fixture, app, mutation, reload } = await setupAction();
      if (action === 'destroy') {
        await app.recordTableAction(null, { oid: 'rdmp-record-1' }, action);
        fixture.detectChanges();
      }
      let finishRead!: (result: any) => void;
      reload.and.returnValue(new Promise(resolve => { finishRead = resolve; }));
      const pageThree = Array.from(fixture.nativeElement.querySelectorAll('pagination .pagination-page a') as NodeListOf<HTMLAnchorElement>)
        .find(link => link.textContent?.trim() === '3')!;
      pageThree.click();
      // Exercise method guards before Angular updates disabled/hidden controls.
      await app.recordTableAction(null, { oid: 'rdmp-record-1' }, action);
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
      await fixture.whenStable();
      fixture.detectChanges();
      expect(app.currentPageNumber).toBe(3);
      expect(app.initTracker.resultsReturned).toBeTrue();
      fixture.destroy();
    });

    it(`${action}: blocks double clicks and competing actions until mutation and refresh settle`, async () => {
      const { fixture, app, mutation, reload } = await setupAction();
      let complete!: (result: any) => void;
      mutation.and.returnValue(new Promise(resolve => { complete = resolve; }));
      if (action === 'destroy') {
        await app.recordTableAction(null, { oid: 'rdmp-record-1' }, action);
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
      await fixture.whenStable();
      expect(app.actionPending).toBeFalse();
      expect(reload).toHaveBeenCalledTimes(1);
      fixture.destroy();
    });

    it(`${action}: treats a missing result as uncertain`, async () => {
      const { fixture, app, mutation, reload, run } = await setupAction();
      mutation.and.resolveTo(undefined);
      await run();
      expect(app.actionNeedsRefresh).toBeTrue();
      expect(app.actionMessage).toContain('may have completed');
      expect(reload).not.toHaveBeenCalled();
      fixture.destroy();
    });
  }

});
