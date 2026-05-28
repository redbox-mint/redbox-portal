import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { NamedQueryEditorModule } from './app/named-query-editor.module';

platformBrowserDynamic().bootstrapModule(NamedQueryEditorModule)
  .catch(err => console.error(err));
