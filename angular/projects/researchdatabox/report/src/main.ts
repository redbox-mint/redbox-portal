import { platformBrowser } from '@angular/platform-browser';

import { ReportModule } from './app/report.module';


platformBrowser().bootstrapModule(ReportModule)
  .catch(err => console.error(err));
