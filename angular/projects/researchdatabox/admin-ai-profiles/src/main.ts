import { bootstrapApplication } from '@angular/platform-browser';
import { importProvidersFrom, provideZonelessChangeDetection } from '@angular/core';
import { AdminAiProfilesModule } from './app/admin-ai-profiles.module';
import { AdminAiProfilesComponent } from './app/admin-ai-profiles.component';

bootstrapApplication(AdminAiProfilesComponent, { providers: [importProvidersFrom(AdminAiProfilesModule), provideZonelessChangeDetection()] })
  .catch(error => console.error(error));
