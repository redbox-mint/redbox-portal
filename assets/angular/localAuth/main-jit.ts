import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app.module';
console.log('Running LocalAuth on JIT');
platformBrowserDynamic().bootstrapModule(AppModule);
