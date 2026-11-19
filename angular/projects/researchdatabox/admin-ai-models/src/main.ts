import { bootstrapApplication } from '@angular/platform-browser';
import { importProvidersFrom, provideZonelessChangeDetection } from '@angular/core';
import { AdminAiModelsModule } from './app/admin-ai-models.module';
import { AdminAiModelsComponent } from './app/admin-ai-models.component';

bootstrapApplication(AdminAiModelsComponent, { providers: [importProvidersFrom(AdminAiModelsModule), provideZonelessChangeDetection()] })
  .catch(error => console.error(error));
