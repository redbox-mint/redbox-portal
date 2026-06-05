import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { SiemAdminModule } from './app/siem-admin.module';

platformBrowserDynamic().bootstrapModule(SiemAdminModule)
  .catch(err => console.error(err));
