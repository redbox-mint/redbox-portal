import { bootstrapApplication } from '@angular/platform-browser';
import { DataGridsComponent } from './app/data-grids.component';
import { dataGridsConfig } from './app/data-grids.config';

bootstrapApplication(DataGridsComponent, dataGridsConfig).catch(err => console.error(err));
