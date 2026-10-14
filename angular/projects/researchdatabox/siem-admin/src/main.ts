import { platformBrowser } from '@angular/platform-browser';

import { SiemAdminModule } from './app/siem-admin.module';

platformBrowser()
  .bootstrapModule(SiemAdminModule)
  .catch(err => console.error(err));
