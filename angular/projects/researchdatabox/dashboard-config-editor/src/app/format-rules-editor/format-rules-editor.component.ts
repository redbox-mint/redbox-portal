import { Component, Input, Output, EventEmitter } from '@angular/core';
import { DashboardFormatRules } from '../dashboard-config-api.service';

@Component({
  selector: 'format-rules-editor',
  template: `
    <div class="format-rules-editor">
      <h4>Format Rules</h4>
      <div class="form-group">
        <label>Sort By</label>
        <input type="text" class="form-control" [(ngModel)]="formatRules.sortBy" />
      </div>
      <div class="form-group">
        <label>Group By</label>
        <input type="text" class="form-control" [(ngModel)]="formatRules.groupBy" />
      </div>
      <div class="form-group">
        <label>Filter By</label>
        <textarea class="form-control" rows="3" [(ngModel)]="filterByJson" (ngModelChange)="onFilterByChange($event)"></textarea>
      </div>
      <div class="form-group">
        <label>Sort Group By</label>
        <textarea class="form-control" rows="3" [(ngModel)]="sortGroupByJson" (ngModelChange)="onSortGroupByChange($event)"></textarea>
      </div>
    </div>
  `,
  standalone: false
})
export class FormatRulesEditorComponent {
  @Input() formatRules: DashboardFormatRules = {};
  @Output() formatRulesChange = new EventEmitter<DashboardFormatRules>();

  filterByJson = '';
  sortGroupByJson = '';

  ngOnInit(): void {
    this.filterByJson = this.formatRules.filterBy ? JSON.stringify(this.formatRules.filterBy, null, 2) : '';
    this.sortGroupByJson = this.formatRules.sortGroupBy ? JSON.stringify(this.formatRules.sortGroupBy, null, 2) : '';
  }

  onFilterByChange(value: string): void {
    try {
      this.formatRules.filterBy = value ? JSON.parse(value) : undefined;
      this.formatRulesChange.emit(this.formatRules);
    } catch { /* ignore invalid JSON */ }
  }

  onSortGroupByChange(value: string): void {
    try {
      this.formatRules.sortGroupBy = value ? JSON.parse(value) : undefined;
      this.formatRulesChange.emit(this.formatRules);
    } catch { /* ignore invalid JSON */ }
  }
}
