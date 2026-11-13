import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslationService } from './translation.service';
import { ConfigService } from './config.service';
import { UtilityService } from './utility.service';
import { LoggerService } from './logger.service';
import { getStubConfigService } from './helper.spec';

describe('Translation admin read failures', () => {
  let translationService: TranslationService;
  let httpTestingController: HttpTestingController;

  beforeEach(async () => {
    const configService = getStubConfigService();
    configService.getConfig = () => ({
      csrfToken: 'test', rootContext: 'base', branding: 'default', portal: 'rdmp', baseUrl: '',
      i18NextOpts: { lng: 'en', resources: { en: { translation: {} } } }
    });
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: APP_BASE_HREF, useValue: 'base' },
        { provide: ConfigService, useValue: configService },
        LoggerService, UtilityService, TranslationService
      ]
    });
    translationService = TestBed.inject(TranslationService);
    httpTestingController = TestBed.inject(HttpTestingController);
    await translationService.waitForInit();
  });

  it('propagates admin read failures so callers can distinguish failure from empty data', fakeAsync(() => {
    const reads = [
      () => translationService.listEntries('en', 'translation'),
      () => translationService.listLanguages(),
      () => translationService.getBundle('en', 'translation')
    ];
    for (const read of reads) {
      let failure: { status: number } | undefined;
      let succeeded = false;
      void read().then(() => { succeeded = true; }, error => { failure = error; });
      flushMicrotasks();
      const request = httpTestingController.expectOne(() => true);
      expect(request.request.method).toBe('GET');
      request.flush('unavailable', { status: 503, statusText: 'Unavailable' });
      flushMicrotasks();
      expect(failure?.status).toBe(503);
      expect(succeeded).toBeFalse();
    }
    httpTestingController.verify();
  }));

});
