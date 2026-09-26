import { platformBrowser } from '@angular/platform-browser';

import { RecordSearchModule } from './app/record-search.module';

platformBrowser()
  .bootstrapModule(RecordSearchModule)
  .catch(err => console.error(err));
