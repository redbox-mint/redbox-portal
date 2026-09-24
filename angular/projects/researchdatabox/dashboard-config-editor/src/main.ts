import { platformBrowser } from '@angular/platform-browser';

import { DashboardConfigEditorModule } from './app/dashboard-config-editor.module';

platformBrowser().bootstrapModule(DashboardConfigEditorModule)
  .catch(err => console.error(err));
