import { platformBrowser } from '@angular/platform-browser';

import { ManageRolesModule } from './app/manage-roles.module';


platformBrowser().bootstrapModule(ManageRolesModule)
  .catch(err => console.error(err));
