import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { EmailTemplatesModule } from './app/email-templates.module';

platformBrowserDynamic()
  .bootstrapModule(EmailTemplatesModule)
  .catch(err => console.error(err));
