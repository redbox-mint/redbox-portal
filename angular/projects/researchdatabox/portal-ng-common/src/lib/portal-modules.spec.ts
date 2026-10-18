import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { MockPlatformLocation } from '@angular/common/testing';
import { HTTP_INTERCEPTORS, HttpClient, HttpContext } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationInitStatus, Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserModule, By } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';

import { ConfigService } from './config.service';
import { CsrfInterceptor, RB_HTTP_INTERCEPTOR_AUTH_CSRF } from './csrf.interceptor';
import { AppConfigService } from './appconfig.service';
import { LoggerService } from './logger.service';
import { UserService } from './user.service';
import { UtilityService } from './utility.service';
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
  template: `<span>{{ 'key1' | i18next }}</span>
    <input [(ngModel)]="title" />
    <record-table [dataSource]="source" [columnConfig]="columns" [enableSort]="true" />`
})
class LegacyHookComponent {
  title = 'Legacy form';
  readonly columns = [{ property: 'title', label: 'Title' }];
  readonly page = { records: [{ title: 'Saved record' }], total: 20, pageNum: 1 };
  readonly source = {
    getCurrentPage: () => this.page,
    gotoPage: jasmine.createSpy('gotoPage').and.resolveTo(),
    recordTableAction: jasmine.createSpy('recordTableAction').and.resolveTo(),
    headerSortChanged: jasmine.createSpy('headerSortChanged')
  };
}

for (const imports of [[RedboxPortalCoreServicesModule], [RedboxPortalCoreModule],
  [RedboxPortalCoreServicesModule, RedboxPortalCoreModule]]) {
  describe(imports.map(module => module.name).join(' + '), () => {
    it('retains the EJS base URL, CSRF interceptor and translation bootstrap barrier', async () => {
      let finishTranslation!: () => void;
      const translations = { waitForInit: jasmine.createSpy('waitForInit').and.returnValue(
        new Promise<void>(resolve => { finishTranslation = resolve; })
      ) };
      TestBed.configureTestingModule({
        imports,
        providers: [
          provideHttpClientTesting(),
          { provide: PlatformLocation, useValue: new MockPlatformLocation({ appBaseHref: '/portal/' }) },
          { provide: ConfigService, useValue: getStubConfigService() },
          { provide: TranslationService, useValue: translations }
        ]
      });
      expect(TestBed.inject(APP_BASE_HREF)).toBe('/portal');
      expect(TestBed.inject(AppConfigService)).toBeTruthy();
      expect(TestBed.inject(LoggerService)).toBeTruthy();
      expect(TestBed.inject(UserService)).toBeTruthy();
      expect(TestBed.inject(UtilityService)).toBeTruthy();
      expect(TestBed.inject(HTTP_INTERCEPTORS).filter(interceptor => interceptor instanceof CsrfInterceptor).length).toBe(1);
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
      // The original compatibility module imported BrowserModule/FormsModule
      // internally, but did not export their template directives to hooks.
      imports: [BrowserModule, FormsModule, RedboxPortalCoreModule],
      declarations: [LegacyHookComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ConfigService, useValue: getStubConfigService() },
        { provide: TranslationService, useValue: getStubTranslationService() }
      ]
    }).compileComponents();
    expect(TestBed.inject(RecordService)).toBeTruthy();
    expect(TestBed.inject(ReportService)).toBeTruthy();
    expect(TestBed.inject(BrowserModule)).toBeTruthy();
    expect(TestBed.inject(FormsModule)).toBeTruthy();
    const fixture = TestBed.createComponent(LegacyHookComponent);
    fixture.detectChanges();
    const table = fixture.debugElement.query(By.directive(RecordTableComponent)).componentInstance;
    await table.waitForInit();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Saved record');
    expect(fixture.nativeElement.textContent).toContain('value1');
    expect(fixture.nativeElement.querySelector('input').value).toBe('Legacy form');
    const sort: HTMLButtonElement = fixture.nativeElement.querySelector('header-sort button');
    sort.click();
    expect(fixture.componentInstance.source.headerSortChanged).toHaveBeenCalled();
    const secondPage: HTMLAnchorElement = [...fixture.nativeElement.querySelectorAll('pagination a')]
      .find((link: any) => link.textContent.trim() === '2');
    secondPage.click();
    expect(fixture.componentInstance.source.gotoPage).toHaveBeenCalledWith(2);
  });
});
