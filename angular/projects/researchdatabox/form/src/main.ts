import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { LoggerService } from '@researchdatabox/portal-ng-common';

import { FormModule } from './app/form.module';

const logger = new LoggerService();

platformBrowserDynamic().bootstrapModule(FormModule)
  .catch(err => logger.error('Failed to bootstrap form app', err));
