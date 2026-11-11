import { bootstrapApplication } from '@angular/platform-browser';
import { importProvidersFrom, provideZonelessChangeDetection } from '@angular/core';
import { BrandingAdminModule } from './app/branding-admin.module';
import { BrandingAdminComponent } from './app/branding-admin.component';

bootstrapApplication(BrandingAdminComponent, { providers: [importProvidersFrom(BrandingAdminModule), provideZonelessChangeDetection()] })
  .catch(err => console.error(err));
