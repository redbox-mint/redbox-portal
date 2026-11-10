import { Component, Input, Output, EventEmitter } from '@angular/core';
import { DashboardFieldCatalogue, DashboardRowConfig, DashboardTableConfig } from '../dashboard-config-api.service';

@Component({
  selector: 'table-config-editor',
  template: `
    <section class="rb-admin-form-section">
      <header class="rb-admin-form-section-header"><h3>{{ 'admin-dashboard-columns' | i18next }} <span class="badge rb-admin-badge-info">{{ config.rowConfig?.length || 0 }}</span></h3></header>
      <div class="rb-admin-form-section-body"><column-editor [columns]="config.rowConfig || []" [catalogue]="catalogue" (columnsChange)="updateRowConfig($event)"></column-editor></div>
    </section>
    <details class="rb-admin-form-section">
      <summary class="rb-admin-form-section-header"><div><h3>{{ 'admin-dashboard-filters-sort' | i18next }}</h3><p>{{ 'admin-dashboard-filters-summary' | i18next }}</p></div></summary>
      <div class="rb-admin-form-section-body"><dashboard-filters-editor [targetKind]="targetKind" [queryFilterKeys]="queryFilterKeys" [columns]="config.rowConfig || []" [catalogue]="catalogue" [formatRules]="config.formatRules || {}" (formatRulesChange)="updateFormatRules($event)"></dashboard-filters-editor></div>
    </details>
    <details class="rb-admin-form-section">
      <summary class="rb-admin-form-section-header"><div><h3>{{ 'admin-dashboard-row-actions' | i18next }} <span class="badge rb-admin-badge-info">{{ config.rowRulesConfig?.length || 0 }}</span></h3><p>{{ 'admin-dashboard-row-actions-summary' | i18next }}</p></div></summary>
      <div class="rb-admin-form-section-body"><rule-set-editor [ruleSets]="config.rowRulesConfig || []" (ruleSetsChange)="updateRowRules($event)"></rule-set-editor></div>
    </details>
    <details class="rb-admin-form-section">
      <summary class="rb-admin-form-section-header"><div><h3>{{ 'admin-dashboard-grouping' | i18next }}</h3><p>{{ 'admin-dashboard-grouping-summary' | i18next }}</p></div></summary>
      <div class="rb-admin-form-section-body">
        <dashboard-grouping-editor [targetKind]="targetKind" [recordTypes]="recordTypes" [fields]="catalogue?.fields || []" [formatRules]="config.formatRules || {}" (formatRulesChange)="updateFormatRules($event)"></dashboard-grouping-editor>
        <h4 class="dc-subheading">{{ 'admin-dashboard-group-columns' | i18next }}</h4><column-editor [detailHeadingLevel]="5" [columns]="config.groupRowConfig || []" [catalogue]="catalogue" (columnsChange)="updateGroupRowConfig($event)"></column-editor>
        <h4 class="dc-subheading">{{ 'admin-dashboard-group-rules' | i18next }}</h4><rule-set-editor [headingLevel]="5" [ruleSets]="config.groupRowRulesConfig || []" (ruleSetsChange)="updateGroupRowRules($event)"></rule-set-editor>
      </div>
    </details>
  `,
  standalone: false
})
export class TableConfigEditorComponent {
  @Input() config: DashboardTableConfig = {};
  @Input() targetKind: 'workflow' | 'view' = 'workflow';
  @Input() queryFilterKeys: string[] = [];
  @Input() recordTypes: string[] = [];
  @Input() catalogue: DashboardFieldCatalogue | null = null;
  @Output() configChange = new EventEmitter<DashboardTableConfig>();


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
