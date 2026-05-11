import { Component, Input, Output, EventEmitter } from '@angular/core';
import { DashboardRowConfig, DashboardTableConfig } from '../dashboard-config-api.service';

@Component({
  selector: 'table-config-editor',
  template: `
    <div class="table-config-editor">
      <ul class="nav nav-tabs">
        <li [class.active]="activeTab === 'columns'" (click)="activeTab = 'columns'"><a>Columns</a></li>
        <li [class.active]="activeTab === 'formatRules'" (click)="activeTab = 'formatRules'"><a>Format Rules</a></li>
        <li [class.active]="activeTab === 'rowRules'" (click)="activeTab = 'rowRules'"><a>Row Rules</a></li>
        <li [class.active]="activeTab === 'groupConfig'" (click)="activeTab = 'groupConfig'"><a>Group Config</a></li>
      </ul>
      <div class="tab-content">
        <div *ngIf="activeTab === 'columns'">
          <column-editor [columns]="config.rowConfig || []" (columnsChange)="updateRowConfig($event)"></column-editor>
        </div>
        <div *ngIf="activeTab === 'formatRules'">
          <format-rules-editor [formatRules]="config.formatRules || {}" (formatRulesChange)="updateFormatRules($event)"></format-rules-editor>
        </div>
        <div *ngIf="activeTab === 'rowRules'">
          <rule-set-editor [ruleSets]="config.rowRulesConfig || []" (ruleSetsChange)="updateRowRules($event)"></rule-set-editor>
        </div>
        <div *ngIf="activeTab === 'groupConfig'">
          <h5>Group Row Config</h5>
          <column-editor [columns]="config.groupRowConfig || []" (columnsChange)="updateGroupRowConfig($event)"></column-editor>
          <h5>Group Row Rules</h5>
          <rule-set-editor [ruleSets]="config.groupRowRulesConfig || []" (ruleSetsChange)="updateGroupRowRules($event)"></rule-set-editor>
        </div>
      </div>
    </div>
  `,
  standalone: false
})
export class TableConfigEditorComponent {
  @Input() config: DashboardTableConfig = {};
  @Output() configChange = new EventEmitter<DashboardTableConfig>();

  activeTab: 'columns' | 'formatRules' | 'rowRules' | 'groupConfig' = 'columns';

  private emitConfig(): void {
    this.configChange.emit(this.config);
  }

  updateRowConfig(columns: DashboardRowConfig[]): void {
    this.config.rowConfig = columns;
    this.emitConfig();
  }

  updateFormatRules(formatRules: DashboardTableConfig['formatRules']): void {
    this.config.formatRules = formatRules;
    this.emitConfig();
  }

  updateRowRules(ruleSets: DashboardTableConfig['rowRulesConfig']): void {
    this.config.rowRulesConfig = ruleSets;
    this.emitConfig();
  }

  updateGroupRowConfig(columns: DashboardRowConfig[]): void {
    this.config.groupRowConfig = columns;
    this.emitConfig();
  }

  updateGroupRowRules(ruleSets: DashboardTableConfig['groupRowRulesConfig']): void {
    this.config.groupRowRulesConfig = ruleSets;
    this.emitConfig();
  }
}
