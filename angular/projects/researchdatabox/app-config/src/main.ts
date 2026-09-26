import { platformBrowser } from '@angular/platform-browser';

import { AppConfigModule } from './app/app-config.module';


platformBrowser().bootstrapModule(AppConfigModule)
  .catch(err => console.error(err));
