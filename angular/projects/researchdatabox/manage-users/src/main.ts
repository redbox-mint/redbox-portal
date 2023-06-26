import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { ManageUsersModule } from './app/manage-users.module';


platformBrowserDynamic().bootstrapModule(ManageUsersModule)
  .catch(err => console.error(err));
