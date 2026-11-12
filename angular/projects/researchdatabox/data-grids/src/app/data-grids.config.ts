import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import {
  ConfigService,
  TranslationService,
  LoggerService,
  UtilityService,
  CsrfInterceptor,
  trimLastSlashFromUrl,
} from '@researchdatabox/portal-ng-common';
import { NamedQueryApiService } from '../../../named-query-editor/src/app/named-query-api.service';
import { DATA_GRID_SOURCE } from './data-grid-source';
import { RecordGridService } from './record-grid.service';

/** Retain the portal's configuration and CSRF boundary without loading unrelated admin widgets. */
export const dataGridsConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true, runCoalescing: true }),
    provideHttpClient(withInterceptorsFromDi()),
    ConfigService,
    TranslationService,
    LoggerService,
    UtilityService,
    { provide: HTTP_INTERCEPTORS, useClass: CsrfInterceptor, multi: true },
    NamedQueryApiService,
    { provide: DATA_GRID_SOURCE, useExisting: RecordGridService },
    {
      provide: APP_BASE_HREF,
      useFactory: (location: PlatformLocation) => trimLastSlashFromUrl(location.getBaseHrefFromDOM()),
      deps: [PlatformLocation],
    },
  ],
};
