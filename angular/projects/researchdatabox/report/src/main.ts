import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { ReportModule } from './app/report.module';


platformBrowserDynamic().bootstrapModule(ReportModule)
  .catch(err => console.error(err));
