import { platformBrowser } from '@angular/platform-browser';

import { AdminFigshareVocabularyModule } from './app/admin-figshare-vocabulary.module';

platformBrowser().bootstrapModule(AdminFigshareVocabularyModule)
  .catch(err => console.error(err));
