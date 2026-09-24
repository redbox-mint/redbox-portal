import { platformBrowser } from '@angular/platform-browser';

import { HarvestRunsModule } from './app/harvest-runs.module';

platformBrowser().bootstrapModule(HarvestRunsModule)
  .catch(err => console.error(err));
