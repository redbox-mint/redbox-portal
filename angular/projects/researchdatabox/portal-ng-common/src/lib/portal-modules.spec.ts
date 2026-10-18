import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { MockPlatformLocation } from '@angular/common/testing';
import { HttpClient, HttpContext } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationInitStatus, Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { ConfigService } from './config.service';
import { RB_HTTP_INTERCEPTOR_AUTH_CSRF } from './csrf.interceptor';
import { getStubConfigService, getStubTranslationService } from './helper.spec';
import { RedboxPortalCoreModule } from './portal-ng-common.module';
import { RedboxPortalCoreServicesModule } from './portal-core-services.module';
import { RedboxPortalRecordsModule } from './portal-records.module';
import { RedboxPortalReportsModule } from './portal-reports.module';
import { RecordService } from './record.service';
import { RecordTableComponent } from './record-table.component';
import { ReportService } from './report.service';
import { TranslationService } from './translation.service';

@Component({
  standalone: false,
  template: `<record-table [dataSource]="source" [columnConfig]="columns" [enableSort]="true" />`
})
class LegacyHookComponent {
  readonly columns = [{ property: 'title', label: 'Title' }];
  readonly page = { records: [{ title: 'Saved record' }], total: 20, pageNum: 1 };
  readonly source = {
    getCurrentPage: () => this.page,
    gotoPage: jasmine.createSpy('gotoPage').and.resolveTo(),
    recordTableAction: jasmine.createSpy('recordTableAction').and.resolveTo(),
    headerSortChanged: jasmine.createSpy('headerSortChanged')
  };
}

for (const module of [RedboxPortalCoreServicesModule, RedboxPortalCoreModule]) {
  describe(module.name, () => {
    it('retains the EJS base URL, CSRF interceptor and translation bootstrap barrier', async () => {
      let finishTranslation!: () => void;
      const translations = { waitForInit: jasmine.createSpy('waitForInit').and.returnValue(
        new Promise<void>(resolve => { finishTranslation = resolve; })
      ) };
      TestBed.configureTestingModule({
        imports: [module],
        providers: [
          provideHttpClientTesting(),
          { provide: PlatformLocation, useValue: new MockPlatformLocation({ appBaseHref: '/portal/' }) },
          { provide: ConfigService, useValue: getStubConfigService() },
          { provide: TranslationService, useValue: translations }
        ]
      });
      expect(TestBed.inject(APP_BASE_HREF)).toBe('/portal');
      const status = TestBed.inject(ApplicationInitStatus);
      expect(translations.waitForInit).toHaveBeenCalledTimes(1);
      expect(status.done).toBeFalse();
      finishTranslation();
      await status.donePromise;
      expect(status.done).toBeTrue();

      TestBed.inject(HttpClient).post('/portal/save', {}, {
        context: new HttpContext().set(RB_HTTP_INTERCEPTOR_AUTH_CSRF, 'csrf-token')
      }).subscribe();
      const http = TestBed.inject(HttpTestingController);
      const request = http.expectOne('/portal/save');
      expect(request.request.headers.get('X-CSRF-Token')).toBe('csrf-token');
      expect(request.request.headers.get('X-Source')).toBe('jsclient');
      request.flush({});
      http.verify();
    });
  });
}

describe('Optional portal features', () => {
  it('keeps records and reports out of the lean core injector', () => {
    TestBed.configureTestingModule({
      imports: [RedboxPortalCoreServicesModule],
      providers: [
        { provide: ConfigService, useValue: getStubConfigService() },
        { provide: TranslationService, useValue: getStubTranslationService() }
      ]
    });
    expect(TestBed.inject(RecordService, null)).toBeNull();
    expect(TestBed.inject(ReportService, null)).toBeNull();
  });

  it('allows apps to opt into record and report providers', () => {
    TestBed.configureTestingModule({
      imports: [RedboxPortalCoreServicesModule, RedboxPortalRecordsModule, RedboxPortalReportsModule],
      providers: [
        { provide: ConfigService, useValue: getStubConfigService() },
        { provide: TranslationService, useValue: getStubTranslationService() }
      ]
    });
    expect(TestBed.inject(RecordService)).toBeTruthy();
    expect(TestBed.inject(ReportService)).toBeTruthy();
  });

  it('keeps table rendering, sorting and pagination available to legacy hook modules', async () => {
    await TestBed.configureTestingModule({
      imports: [RedboxPortalCoreModule],
      declarations: [LegacyHookComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ConfigService, useValue: getStubConfigService() },
        { provide: TranslationService, useValue: getStubTranslationService() }
      ]
    }).compileComponents();
    expect(TestBed.inject(RecordService)).toBeTruthy();
    expect(TestBed.inject(ReportService)).toBeTruthy();
    const fixture = TestBed.createComponent(LegacyHookComponent);
    fixture.detectChanges();
    const table = fixture.debugElement.query(By.directive(RecordTableComponent)).componentInstance;
    await table.waitForInit();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Saved record');
    const sort: HTMLButtonElement = fixture.nativeElement.querySelector('header-sort button');
    sort.click();
    expect(fixture.componentInstance.source.headerSortChanged).toHaveBeenCalled();
    const secondPage: HTMLAnchorElement = [...fixture.nativeElement.querySelectorAll('pagination a')]
      .find((link: any) => link.textContent.trim() === '2');
    secondPage.click();
    expect(fixture.componentInstance.source.gotoPage).toHaveBeenCalledWith(2);
  });
});
