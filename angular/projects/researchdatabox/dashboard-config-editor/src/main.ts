import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { DashboardConfigEditorModule } from './app/dashboard-config-editor.module';

platformBrowserDynamic().bootstrapModule(DashboardConfigEditorModule)
  .catch(err => console.error(err));
