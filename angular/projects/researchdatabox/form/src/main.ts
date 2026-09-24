import { platformBrowser } from '@angular/platform-browser';
import { LoggerService } from '@researchdatabox/portal-ng-common';

import { FormModule } from './app/form.module';

const logger = new LoggerService();

platformBrowser().bootstrapModule(FormModule)
  .catch(err => logger.error('Failed to bootstrap form app', err));
