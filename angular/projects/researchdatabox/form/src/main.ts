import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { FormModule } from './app/form.module';


platformBrowserDynamic().bootstrapModule(FormModule)
  .catch(err => console.error(err));
