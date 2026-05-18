import { Component, Input, Output, EventEmitter } from '@angular/core';
import { DashboardRowConfig, DashboardTableConfig } from '../dashboard-config-api.service';

type Tab = 'columns' | 'formatRules' | 'rowRules' | 'groupConfig';

@Component({
  selector: 'table-config-editor',
  template: `
    <div class="dc-table-config-editor">
      <ul class="nav nav-tabs dc-tabs" role="tablist">
        <li role="presentation" [class.active]="activeTab === 'columns'">
          <a role="tab" (click)="activeTab = 'columns'">
            <i class="fa fa-columns"></i>
            Columns
            <span class="dc-tab-count" *ngIf="(config.rowConfig?.length || 0) as count">{{ count }}</span>
          </a>
        </li>
        <li role="presentation" [class.active]="activeTab === 'formatRules'">
          <a role="tab" (click)="activeTab = 'formatRules'">
            <i class="fa fa-sliders"></i>
            Format Rules
          </a>
        </li>
        <li role="presentation" [class.active]="activeTab === 'rowRules'">
          <a role="tab" (click)="activeTab = 'rowRules'">
            <i class="fa fa-filter"></i>
            Row Rules
            <span class="dc-tab-count" *ngIf="(config.rowRulesConfig?.length || 0) as count">{{ count }}</span>
          </a>
        </li>
        <li role="presentation" [class.active]="activeTab === 'groupConfig'">
          <a role="tab" (click)="activeTab = 'groupConfig'">
            <i class="fa fa-object-group"></i>
            Group Config
          </a>
        </li>
      </ul>
      <div class="tab-content dc-tab-content">
        <div *ngIf="activeTab === 'columns'" class="dc-tab-pane">
          <column-editor [columns]="config.rowConfig || []" (columnsChange)="updateRowConfig($event)"></column-editor>
        </div>
        <div *ngIf="activeTab === 'formatRules'" class="dc-tab-pane">
          <format-rules-editor [formatRules]="config.formatRules || {}" (formatRulesChange)="updateFormatRules($event)"></format-rules-editor>
        </div>
        <div *ngIf="activeTab === 'rowRules'" class="dc-tab-pane">
          <rule-set-editor [ruleSets]="config.rowRulesConfig || []" (ruleSetsChange)="updateRowRules($event)"></rule-set-editor>
        </div>
        <div *ngIf="activeTab === 'groupConfig'" class="dc-tab-pane">
          <section class="dc-group-section">
            <h5 class="dc-group-section-title">
              <i class="fa fa-columns"></i>
              Group Row Config
            </h5>
            <column-editor [columns]="config.groupRowConfig || []" (columnsChange)="updateGroupRowConfig($event)"></column-editor>
          </section>
          <section class="dc-group-section">
            <h5 class="dc-group-section-title">
              <i class="fa fa-filter"></i>
              Group Row Rules
            </h5>
            <rule-set-editor [ruleSets]="config.groupRowRulesConfig || []" (ruleSetsChange)="updateGroupRowRules($event)"></rule-set-editor>
          </section>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dc-table-config-editor {
      display: flex;
      flex-direction: column;
    }
    .dc-tabs {
      border-bottom: 1px solid var(--dc-border, #e5e7eb);
      margin-bottom: 0;
    }
    .dc-tabs > li > a {
      align-items: center;
      border-radius: 4px 4px 0 0;
      color: var(--dc-text-muted, #4b5563);
      cursor: pointer;
      display: inline-flex;
      font-size: 13px;
      font-weight: 500;
      gap: 8px;
      padding: 10px 14px;
      transition: color 120ms ease, background 120ms ease;
    }
    .dc-tabs > li > a:hover {
      background: var(--dc-surface-muted, #f9fafb);
      color: var(--dc-text, #1f2937);
    }
    .dc-tabs > li.active > a,
    .dc-tabs > li.active > a:hover,
    .dc-tabs > li.active > a:focus {
      background: #fff;
      border: 1px solid var(--dc-border, #e5e7eb);
      border-bottom-color: #fff;
      color: var(--dc-accent, #2563eb);
      font-weight: 600;
    }
    .dc-tabs > li > a i {
      color: var(--dc-text-subtle, #6b7280);
      font-size: 12px;
    }
    .dc-tabs > li.active > a i {
      color: var(--dc-accent, #2563eb);
    }
    .dc-tab-count {
      background: var(--dc-surface-deeper, #f3f4f6);
      border-radius: 999px;
      color: var(--dc-text-muted, #4b5563);
      font-size: 11px;
      font-weight: 600;
      padding: 1px 8px;
    }
    .dc-tabs > li.active > a .dc-tab-count {
      background: var(--dc-accent-soft, #eff6ff);
      color: var(--dc-accent, #2563eb);
    }
    .dc-tab-content {
      background: #fff;
      border: 1px solid var(--dc-border, #e5e7eb);
      border-top: 0;
      border-radius: 0 0 6px 6px;
    }
    .dc-tab-pane {
      padding: 16px;
    }
    .dc-group-section + .dc-group-section {
      border-top: 1px solid var(--dc-border, #e5e7eb);
      margin-top: 20px;
      padding-top: 20px;
    }
    .dc-group-section-title {
      align-items: center;
      color: var(--dc-text-muted, #4b5563);
      display: inline-flex;
      font-size: 0.85rem;
      font-weight: 600;
      gap: 8px;
      letter-spacing: 0.03em;
      margin: 0 0 12px;
      text-transform: uppercase;
    }
    .dc-group-section-title i {
      color: var(--dc-text-subtle, #6b7280);
    }
  `],
  standalone: false
})
export class TableConfigEditorComponent {
  @Input() config: DashboardTableConfig = {};
  @Output() configChange = new EventEmitter<DashboardTableConfig>();

  activeTab: Tab = 'columns';

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
