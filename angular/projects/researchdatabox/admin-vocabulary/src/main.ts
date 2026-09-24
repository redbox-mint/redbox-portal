import { platformBrowser } from '@angular/platform-browser';

import { AdminVocabularyModule } from './app/admin-vocabulary.module';

platformBrowser().bootstrapModule(AdminVocabularyModule)
  .catch(err => console.error(err));
