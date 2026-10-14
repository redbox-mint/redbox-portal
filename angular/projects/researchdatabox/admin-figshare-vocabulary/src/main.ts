import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AdminFigshareVocabularyModule } from './app/admin-figshare-vocabulary.module';

platformBrowserDynamic().bootstrapModule(AdminFigshareVocabularyModule)
  .catch(err => console.error(err));
