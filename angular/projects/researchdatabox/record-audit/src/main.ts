import { platformBrowser } from '@angular/platform-browser';
import { RecordAuditModule } from './app/record-audit.module';

platformBrowser().bootstrapModule(RecordAuditModule)
  .catch(err => console.error(err));
