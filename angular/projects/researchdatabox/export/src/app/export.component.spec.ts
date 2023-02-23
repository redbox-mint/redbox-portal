import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF } from '@angular/common'; 
import { UtilityService, LoggerService, TranslationService, RecordService, ConfigService } from '@researchdatabox/redbox-portal-core';
import { getStubConfigService, getStubTranslationService, getStubRecordService } from 'projects/researchdatabox/redbox-portal-core/src/lib/helper.spec';
import { ExportComponent } from './export.component';

let configService:any;
let recordService: any;
let translationService: any;
let recordData: any;
let recordTypes: any;

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
    await TestBed.configureTestingModule({
      declarations: [
        ExportComponent
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
    }).compileComponents();
  });

  it('should create the app and generate download urls', async function () {
    const fixture = TestBed.createComponent(ExportComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
    await app.ngOnInit();
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
    app.modAfter = new Date('2023-02-23');
    app.download();
    generatedUrl = `${recordService.brandingAndPortalUrl}/export/record/download/csv?before=&after=2023-02-23&recType=rdmp`;
    expect(url).toEqual(generatedUrl);
    // test with modified before set
    app.modBefore = new Date('2023-02-23');
    app.download();
    generatedUrl = `${recordService.brandingAndPortalUrl}/export/record/download/csv?before=2023-02-23&after=2023-02-23&recType=rdmp`;
    expect(url).toEqual(generatedUrl);
    // test with different data type
    app.setRecordType('dataRecord', event);
    app.download();
    generatedUrl = `${recordService.brandingAndPortalUrl}/export/record/download/csv?before=2023-02-23&after=2023-02-23&recType=dataRecord`;
    expect(url).toEqual(generatedUrl);
    // test with different format
    app.setExportFormat('json', event);
    app.download();
    generatedUrl = `${recordService.brandingAndPortalUrl}/export/record/download/json?before=2023-02-23&after=2023-02-23&recType=dataRecord`;
    expect(url).toEqual(generatedUrl);
  });
});
