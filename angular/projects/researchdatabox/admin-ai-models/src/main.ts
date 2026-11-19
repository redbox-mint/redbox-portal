import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AdminAiModelsModule } from './app/admin-ai-models.module';
platformBrowserDynamic().bootstrapModule(AdminAiModelsModule).catch(error => console.error(error));
