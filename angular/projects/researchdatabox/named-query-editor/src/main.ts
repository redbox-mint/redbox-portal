import { platformBrowser } from '@angular/platform-browser';

import { NamedQueryEditorModule } from './app/named-query-editor.module';

platformBrowser().bootstrapModule(NamedQueryEditorModule)
  .catch(err => console.error(err));
