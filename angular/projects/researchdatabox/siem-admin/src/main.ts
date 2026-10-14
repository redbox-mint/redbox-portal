import { provideZoneChangeDetection } from '@angular/core';
import { platformBrowser } from '@angular/platform-browser';

import { SiemAdminModule } from './app/siem-admin.module';

platformBrowser()
  .bootstrapModule(SiemAdminModule, {
    applicationProviders: [provideZoneChangeDetection()],
  })
  .catch(err => console.error(err));
