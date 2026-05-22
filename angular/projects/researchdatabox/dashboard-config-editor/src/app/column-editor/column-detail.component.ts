import { Component, Input } from '@angular/core';
import { DashboardRowConfig } from '../dashboard-config-api.service';

@Component({
  selector: 'column-detail',
  template: `
    <div class="dc-column-detail" *ngIf="column">
      <h6 class="dc-column-detail-title">
        <i class="fa fa-pencil"></i>
        Edit “{{ column.title || 'Untitled' }}”
      </h6>
      <div class="dc-column-detail-grid">
        <div class="form-group">
          <label class="dc-form-label">Title</label>
          <input type="text" class="form-control" [(ngModel)]="column.title" placeholder="Display title" />
        </div>
        <div class="form-group">
          <label class="dc-form-label">Variable</label>
          <input type="text" class="form-control dc-mono" [(ngModel)]="column.variable" placeholder="e.g. metadata.title" />
        </div>
        <div class="form-group dc-column-detail-full">
          <label class="dc-form-label">Template</label>
          <textarea class="form-control dc-mono" rows="4" [(ngModel)]="column.template" [placeholder]="templatePlaceholder"></textarea>
        </div>
        <div class="form-group">
          <label class="dc-form-label">Initial Sort</label>
          <select class="form-control" [(ngModel)]="column.initialSort">
            <option value="">None</option>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
        <div class="form-group dc-column-detail-flag">
          <label class="dc-inline-toggle">
            <input type="checkbox" [(ngModel)]="column.defaultSort" />
            <span>Use as default sort column</span>
          </label>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dc-column-detail {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .dc-column-detail-title {
      align-items: center;
      color: var(--dc-text-muted, #4b5563);
      display: inline-flex;
      font-size: 0.8rem;
      font-weight: 600;
      gap: 8px;
      letter-spacing: 0.04em;
      margin: 0;
      text-transform: uppercase;
    }
    .dc-column-detail-title i {
      color: var(--dc-text-subtle, #6b7280);
    }
    .dc-column-detail-grid {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .dc-column-detail-full {
      grid-column: 1 / -1;
    }
    .dc-column-detail-flag {
      align-items: center;
      display: flex;
    }
    .dc-form-label {
      color: var(--dc-text-muted, #4b5563);
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .dc-inline-toggle {
      align-items: center;
      cursor: pointer;
      display: inline-flex;
      font-weight: 500;
      gap: 8px;
      margin: 0;
    }
    .dc-mono {
      font-family: "SFMono-Regular", "Consolas", "Liberation Mono", "Menlo", monospace;
      font-size: 12px;
    }
    @media (max-width: 767px) {
      .dc-column-detail-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
  standalone: false
})
export class ColumnDetailComponent {
  @Input() column: DashboardRowConfig | null = null;
  readonly templatePlaceholder = 'Handlebars template, e.g. {{title}}';
}
