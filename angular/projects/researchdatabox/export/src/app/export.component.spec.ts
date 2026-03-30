import { LOCALE_ID, inject as inject_1, provideAppInitializer } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF } from '@angular/common'; 
import { UtilityService, LoggerService, TranslationService, RecordService, ConfigService } from '@researchdatabox/portal-ng-common';
import { getStubConfigService, getStubTranslationService, getStubRecordService, appInit, localeId } from '@researchdatabox/portal-ng-common';
import { ExportComponent } from './export.component';
import i18next from 'i18next';
import { I18NextModule, StrictErrorHandlingStrategy, provideI18Next, withCustomErrorHandlingStrategy } from 'angular-i18next';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { FormsModule } from "@angular/forms";
import { DateTime } from 'luxon';

let configService:any;
let recordService: any;
let translationService: any;
let recordData: any;
let recordTypes: any;

function toStartOfDayIso(date: Date): string {
  const normalized = new Date(date.getTime());
  normalized.setHours(0, 0, 0, 0);
  return normalized.toISOString();
}

function toEndOfDayIso(date: Date): string {
  const normalized = new Date(date.getTime());
  normalized.setHours(23, 59, 59, 999);
  return normalized.toISOString();
}

export function i18AppInit() {
  return () => i18next
  .init({
    fallbackLng: 'en',
    debug: true
  });
}

describe('ExportComponent', () => {
  beforeEach(async () => {
    configService = getStubConfigService();
    translationService = getStubTranslationService();
    recordTypes = ['rdmp', 'dataRecord', 'dataPublication'];
    recordData = { types: [] };
    for (let recType of recordTypes) {
      recordData.types.push({name: recType});
    }
    recordService = getStubRecordService(recordData);
    const testModule = TestBed.configureTestingModule({
      declarations: [
        ExportComponent
      ],
      imports: [
        FormsModule,
        I18NextModule.forRoot(),
        BsDatepickerModule.forRoot()
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
        provideAppInitializer(i18AppInit()),
        provideI18Next(
          withCustomErrorHandlingStrategy(StrictErrorHandlingStrategy)
        )
      ]
    });
    await testModule.compileComponents();
  });

  it('should create the app and generate download urls', async function () {
    const fixture = TestBed.createComponent(ExportComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();
    expect(app.record_type).toEqual('rdmp');
    // check record types
    const typeNames = app.getRecordTypeNames();
    expect(typeNames).toEqual(recordTypes);
    // check export formats
    const formats = app.getExportFormatNames();
    expect(formats).toEqual([{name: 'CSV', id: 'csv', checked: 'true'},{name: 'JSON', id: 'json', checked: null}]);
    let url:string = '';
    let windowName:string = '';
    const event = { preventDefault: function() {}};
    app.window = { open: function(openUrl:string, openWindowName:string) { url = openUrl; windowName = openWindowName; } };
    // test default download
    app.download();
    let generatedUrl:string = `${recordService.brandingAndPortalUrl}/export/record/download/csv?before=&after=&recType=rdmp`;
    expect(url).toEqual(generatedUrl);
    // test with modified after set
    let dateNow = DateTime.local();
    dateNow = dateNow.startOf('day');
    const dateNowStr = toStartOfDayIso(dateNow.toJSDate());
    const dateEndStr = toEndOfDayIso(dateNow.toJSDate());
    app.modAfter = dateNow.toJSDate();
    app.download();
    generatedUrl = `${recordService.brandingAndPortalUrl}/export/record/download/csv?before=&after=${dateNowStr}&recType=rdmp`;
    expect(url).toEqual(generatedUrl);
    // test with modified before set
    app.modBefore = dateNow.toJSDate();
    app.download();
    generatedUrl = `${recordService.brandingAndPortalUrl}/export/record/download/csv?before=${dateEndStr}&after=${dateNowStr}&recType=rdmp`;
    expect(url).toEqual(generatedUrl);
    // test with different data type
    app.setRecordType('dataRecord', event);
    app.download();
    generatedUrl = `${recordService.brandingAndPortalUrl}/export/record/download/csv?before=${dateEndStr}&after=${dateNowStr}&recType=dataRecord`;
    expect(url).toEqual(generatedUrl);
    // test with different format
    app.setExportFormat('json', event);
    app.download();
    generatedUrl = `${recordService.brandingAndPortalUrl}/export/record/download/json?before=${dateEndStr}&after=${dateNowStr}&recType=dataRecord`;
    expect(url).toEqual(generatedUrl);
  });
});
