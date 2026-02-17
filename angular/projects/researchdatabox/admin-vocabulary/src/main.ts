import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AdminVocabularyModule } from './app/admin-vocabulary.module';

platformBrowserDynamic().bootstrapModule(AdminVocabularyModule)
  .catch(err => console.error(err));
