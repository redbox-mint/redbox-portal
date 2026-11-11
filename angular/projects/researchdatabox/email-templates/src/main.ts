import { bootstrapApplication } from '@angular/platform-browser';
import { importProvidersFrom, provideZonelessChangeDetection } from '@angular/core';
import { EmailTemplatesModule } from './app/email-templates.module';
import { EmailTemplatesComponent } from './app/email-templates.component';

bootstrapApplication(EmailTemplatesComponent, { providers: [importProvidersFrom(EmailTemplatesModule), provideZonelessChangeDetection()] })
  .catch(err => console.error(err));
