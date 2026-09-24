import { platformBrowser } from '@angular/platform-browser';

import { ManageUsersModule } from './app/manage-users.module';


platformBrowser().bootstrapModule(ManageUsersModule)
  .catch(err => console.error(err));
