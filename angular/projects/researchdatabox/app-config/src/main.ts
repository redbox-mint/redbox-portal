import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppConfigModule } from './app/app-config.module';


platformBrowserDynamic().bootstrapModule(AppConfigModule)
  .catch(err => console.error(err));
