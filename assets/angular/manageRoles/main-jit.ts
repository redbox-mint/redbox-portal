import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { ManageRolesModule } from './manage_roles.module';
console.log('Running ManageRoles on JIT');
platformBrowserDynamic().bootstrapModule(ManageRolesModule);
