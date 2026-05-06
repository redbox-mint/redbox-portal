import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { RecordAuditModule } from './app/record-audit.module';

platformBrowserDynamic().bootstrapModule(RecordAuditModule)
  .catch(err => console.error(err));
