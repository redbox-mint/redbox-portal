import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AdminAiProfilesModule } from './app/admin-ai-profiles.module';
platformBrowserDynamic().bootstrapModule(AdminAiProfilesModule).catch(error => console.error(error));
