import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { ManageRolesModule } from './app/manage-roles.module';


platformBrowserDynamic().bootstrapModule(ManageRolesModule)
  .catch(err => console.error(err));
