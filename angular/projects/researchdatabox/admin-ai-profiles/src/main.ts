import { bootstrapApplication } from '@angular/platform-browser';
import { importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { AdminAiProfilesModule } from './app/admin-ai-profiles.module';
import { AdminAiProfilesComponent } from './app/admin-ai-profiles.component';

bootstrapApplication(AdminAiProfilesComponent, { providers: [importProvidersFrom(AdminAiProfilesModule), provideZoneChangeDetection()] })
  .catch(error => console.error(error));
