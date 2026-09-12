import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { importProvidersFrom } from '@angular/core';
import { RedboxPortalCoreModule } from '@researchdatabox/portal-ng-common';
import { AppComponent } from './app/translation.component';

bootstrapApplication(AppComponent, {
  providers: [
  // Ensure HttpClient uses DI-provided interceptors (e.g., CsrfInterceptor)
  provideHttpClient(withInterceptorsFromDi()),
  importProvidersFrom(RedboxPortalCoreModule)
  ]
}).catch(err => console.error(err));
