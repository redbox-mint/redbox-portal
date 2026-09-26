import { platformBrowser } from '@angular/platform-browser';

import { ExportModule } from './app/export.module';


platformBrowser().bootstrapModule(ExportModule)
  .catch(err => console.error(err));
