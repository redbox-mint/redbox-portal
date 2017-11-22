import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { UserProfileModule } from './user_profile.module';
console.log('Running UserProfile on JIT');
platformBrowserDynamic().bootstrapModule(UserProfileModule);
