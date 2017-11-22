import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { ManageUsersModule } from './manage_users.module';
console.log('Running ManageRoles on JIT');
platformBrowserDynamic().bootstrapModule(ManageUsersModule);
