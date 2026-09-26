import { platformBrowser } from '@angular/platform-browser';
import { ReportConfigModule } from './app/report-config.module';

platformBrowser().bootstrapModule(ReportConfigModule)
  .catch(err => console.error(err));
