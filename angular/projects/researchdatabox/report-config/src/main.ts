import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { ReportConfigModule } from './app/report-config.module';

platformBrowserDynamic().bootstrapModule(ReportConfigModule)
  .catch(err => console.error(err));
