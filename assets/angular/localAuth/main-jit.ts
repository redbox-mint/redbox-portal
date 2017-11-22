import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { LocalAuthModule } from './local_auth.module';
console.log('Running LocalAuth on JIT');
platformBrowserDynamic().bootstrapModule(LocalAuthModule);
