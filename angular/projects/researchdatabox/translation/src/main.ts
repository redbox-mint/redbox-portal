import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptorsFromDi, withXhr } from '@angular/common/http';
import { importProvidersFrom } from '@angular/core';
import { RedboxPortalCoreServicesModule } from '@researchdatabox/portal-ng-common';
import { AppComponent } from './app/translation.component';

bootstrapApplication(AppComponent, {
  providers: [
    // Ensure HttpClient uses DI-provided interceptors (e.g., CsrfInterceptor)
    provideHttpClient(withXhr(), withInterceptorsFromDi()),
    importProvidersFrom(RedboxPortalCoreServicesModule),
  ],
}).catch(err => console.error(err));
