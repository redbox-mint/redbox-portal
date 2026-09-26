import { platformBrowser } from '@angular/platform-browser';

import { LocalAuthModule } from './app/local-auth.module';


platformBrowser().bootstrapModule(LocalAuthModule)
  .catch(err => console.error(err));
