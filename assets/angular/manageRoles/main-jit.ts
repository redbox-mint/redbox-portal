import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app.module';
console.log('Running ManageRoles on JIT');
platformBrowserDynamic().bootstrapModule(AppModule);
