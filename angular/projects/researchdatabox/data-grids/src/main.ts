import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { DataGridsModule } from './app/data-grids.module';

platformBrowserDynamic()
  .bootstrapModule(DataGridsModule)
  .catch(err => console.error(err));
