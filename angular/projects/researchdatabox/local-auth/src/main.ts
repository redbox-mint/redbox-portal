import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { LocalAuthModule } from './app/local-auth.module';


platformBrowserDynamic().bootstrapModule(LocalAuthModule)
  .catch(err => console.error(err));
