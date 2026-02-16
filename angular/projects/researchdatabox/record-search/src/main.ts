import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { RecordSearchModule } from './app/record-search.module';

platformBrowserDynamic()
  .bootstrapModule(RecordSearchModule)
  .catch(err => console.error(err));
