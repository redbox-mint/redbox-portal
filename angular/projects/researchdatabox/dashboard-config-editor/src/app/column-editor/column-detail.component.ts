import { Component, Input } from '@angular/core';
import { DashboardRowConfig } from '../dashboard-config-api.service';

@Component({
  selector: 'column-detail',
  template: `
    <div class="column-detail" *ngIf="column">
      <div class="form-group">
        <label>Title</label>
        <input type="text" class="form-control" [(ngModel)]="column.title" />
      </div>
      <div class="form-group">
        <label>Variable</label>
        <input type="text" class="form-control" [(ngModel)]="column.variable" />
      </div>
      <div class="form-group">
        <label>Template</label>
        <textarea class="form-control" rows="4" [(ngModel)]="column.template"></textarea>
      </div>
      <div class="form-group">
        <label>Initial Sort</label>
        <select class="form-control" [(ngModel)]="column.initialSort">
          <option value="">None</option>
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </div>
      <div class="form-group">
        <label>
          <input type="checkbox" [(ngModel)]="column.defaultSort" /> Default Sort
        </label>
      </div>
    </div>
  `,
  standalone: false
})
export class ColumnDetailComponent {
  @Input() column: DashboardRowConfig | null = null;
}
