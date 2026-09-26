import { platformBrowser } from '@angular/platform-browser';

import { DeletedRecordsModule } from './app/deleted-records.module';


platformBrowser().bootstrapModule(DeletedRecordsModule)
  .catch(err => console.error(err));
