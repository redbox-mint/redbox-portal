import { platformBrowser } from '@angular/platform-browser';

import { BrandingAdminModule } from './app/branding-admin.module';


platformBrowser().bootstrapModule(BrandingAdminModule)
  .catch(err => console.error(err));
