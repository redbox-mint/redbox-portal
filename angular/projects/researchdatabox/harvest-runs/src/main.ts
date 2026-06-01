import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { HarvestRunsModule } from './app/harvest-runs.module';

platformBrowserDynamic().bootstrapModule(HarvestRunsModule)
  .catch(err => console.error(err));
