import { Component, Input, Output, EventEmitter } from '@angular/core';
import { DashboardRowConfig } from '../dashboard-config-api.service';

@Component({
  selector: 'column-editor',
  template: `
    <div class="column-editor">
      <h4>Columns</h4>
      <div class="column-list">
        <div *ngFor="let col of columns; let i = index" class="column-item" (click)="selectColumn(col)">
          <div class="column-details">
            <span class="column-title">{{ col.title }}</span>
            <span class="column-variable text-muted">({{ col.variable }})</span>
          </div>
          <div class="column-actions">
            <button type="button" class="btn btn-sm btn-danger" (click)="removeColumn(i, $event)">Remove</button>
          </div>
        </div>
      </div>
      <button type="button" class="btn btn-sm btn-primary" (click)="addColumn()">Add Column</button>
      <hr />
      <column-detail [column]="selectedColumn"></column-detail>
    </div>
  `,
  styles: [`
    .column-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      cursor: pointer;
    }

    .column-details {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1 1 auto;
    }

    .column-title,
    .column-variable {
      display: block;
      line-height: 1.4;
    }

    .column-variable {
      word-break: break-word;
    }

    .column-actions {
      flex: 0 0 auto;
      margin-left: auto;
    }

    .column-actions .btn {
      min-width: 92px;
    }
  `],
  standalone: false
})
export class ColumnEditorComponent {
  @Input() columns: DashboardRowConfig[] = [];
  @Output() columnsChange = new EventEmitter<DashboardRowConfig[]>();
  selectedColumn: DashboardRowConfig | null = null;

  selectColumn(col: DashboardRowConfig): void {
    this.selectedColumn = col;
  }

  addColumn(): void {
    const newCol: DashboardRowConfig = { title: 'New Column', variable: '', template: '' };
    this.columns = [...this.columns, newCol];
    this.columnsChange.emit(this.columns);
    this.selectedColumn = newCol;
  }

  removeColumn(index: number, event: Event): void {
    event.stopPropagation();
    this.columns = this.columns.filter((_, i) => i !== index);
    this.columnsChange.emit(this.columns);
    if (this.selectedColumn && !this.columns.includes(this.selectedColumn)) {
      this.selectedColumn = null;
    }
  }
}
