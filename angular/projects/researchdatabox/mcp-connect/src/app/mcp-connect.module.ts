import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { APP_BASE_HREF, PlatformLocation, CommonModule } from '@angular/common';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import {
  ConfigService,
  CsrfInterceptor,
  I18NextPipe,
  LoggerService,
  TranslationService,
  UtilityService,
  trimLastSlashFromUrl,
} from '@researchdatabox/portal-ng-common';
import { McpConnectComponent } from './mcp-connect.component';
import { McpConnectApiService } from './mcp-connect-api.service';

@NgModule({
  declarations: [McpConnectComponent],
  imports: [BrowserModule, CommonModule, I18NextPipe],
  providers: [
    provideHttpClient(withInterceptorsFromDi()),
    { provide: HTTP_INTERCEPTORS, useClass: CsrfInterceptor, multi: true },
    ConfigService,
    TranslationService,
    LoggerService,
    UtilityService,
    McpConnectApiService,
    {
      provide: APP_BASE_HREF,
      useFactory: (s: PlatformLocation) => trimLastSlashFromUrl(s.getBaseHrefFromDOM()),
      deps: [PlatformLocation],
    },
  ],
  bootstrap: [McpConnectComponent],
})
export class McpConnectModule {}
