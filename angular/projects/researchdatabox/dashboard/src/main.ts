import { platformBrowser } from '@angular/platform-browser';

import { DashboardModule } from './app/dashboard.module';


platformBrowser().bootstrapModule(DashboardModule)
  .catch(err => console.error(err));
