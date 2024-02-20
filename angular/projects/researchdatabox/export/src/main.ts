import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { ExportModule } from './app/export.module';


platformBrowserDynamic().bootstrapModule(ExportModule)
  .catch(err => console.error(err));
