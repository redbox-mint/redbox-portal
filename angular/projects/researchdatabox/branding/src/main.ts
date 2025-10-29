import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { BrandingAdminModule } from './app/branding-admin.module';


platformBrowserDynamic().bootstrapModule(BrandingAdminModule)
  .catch(err => console.error(err));
