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
      const fixture = TestBed.createComponent(DeletedRecordsComponent);
      fixture.detectChanges();
      const app = fixture.componentInstance;
      await app.waitForInit();
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

    it(`${action}: keeps confirmed success distinct from refresh failure and only retries the read`, async () => {
      const { fixture, app, mutation, reload, run } = await setupAction();
      mutation.and.resolveTo({ success: true });
      reload.and.rejectWith(new Error('refresh failed'));
      await run();
      expect(app.actionMessage).toContain('succeeded');
      expect(fixture.nativeElement.textContent).toContain('Unable to refresh');
      expect(app.actionMessage).not.toContain('unknown');
      expect(app.actionNeedsRefresh).toBeTrue();
      expect(app.actionPending).toBeFalse();
      expect(app.initTracker.resultsReturned).toBeTrue();
      expect(app.currentDestroyRecordModalOid).toBeUndefined();
      await run();
      expect(mutation).toHaveBeenCalledTimes(1);
      reload.and.resolveTo(mockData.deletedRecords);
      (fixture.nativeElement.querySelector('.refresh-actions') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(reload).toHaveBeenCalledTimes(2);
      expect(mutation).toHaveBeenCalledTimes(1);
      expect(app.actionNeedsRefresh).toBeFalse();
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
