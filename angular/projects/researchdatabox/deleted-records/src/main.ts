import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { DeletedRecordsModule } from './app/deleted-records.module';


platformBrowserDynamic().bootstrapModule(DeletedRecordsModule)
  .catch(err => console.error(err));
