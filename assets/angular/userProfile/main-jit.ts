import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app.module';
console.log('Running UserProfile on JIT');
platformBrowserDynamic().bootstrapModule(AppModule);
