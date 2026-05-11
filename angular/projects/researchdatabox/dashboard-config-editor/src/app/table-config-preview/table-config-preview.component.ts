import { Component, Input } from '@angular/core';
import { DashboardTableConfig, DashboardRowConfig, DashboardRulesConfig } from '../dashboard-config-api.service';

@Component({
  selector: 'table-config-preview',
  template: `
    <div class="table-config-preview">
      <div *ngIf="!hasAnyConfig()" class="empty-state">
        No configuration set.
      </div>

      <div *ngIf="hasColumns()" class="preview-section">
        <h5>Columns</h5>
        <table class="table table-condensed">
          <thead>
            <tr>
              <th>Title</th>
              <th>Variable</th>
              <th>Sort</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let col of safeConfig.rowConfig">
              <td>{{ col.title }}</td>
              <td><code>{{ col.variable }}</code></td>
              <td>
                <span *ngIf="col.defaultSort" class="label label-info">Default</span>
                <span *ngIf="col.initialSort" class="label label-default">{{ col.initialSort }}</span>
                <span *ngIf="col.secondarySort" class="label label-default">2nd: {{ col.secondarySort }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div *ngIf="hasFormatRules()" class="preview-section">
        <h5>Format Rules</h5>
        <dl class="dl-horizontal">
          <dt *ngIf="safeConfig.formatRules?.sortBy">Sort By</dt>
          <dd *ngIf="safeConfig.formatRules?.sortBy">{{ safeConfig.formatRules!.sortBy }}</dd>

          <dt *ngIf="safeConfig.formatRules?.groupBy">Group By</dt>
          <dd *ngIf="safeConfig.formatRules?.groupBy">{{ safeConfig.formatRules!.groupBy }}</dd>

          <dt *ngIf="safeConfig.formatRules?.filterBy">Filter By</dt>
          <dd *ngIf="safeConfig.formatRules?.filterBy"><pre>{{ safeConfig.formatRules!.filterBy | json }}</pre></dd>

          <dt *ngIf="safeConfig.formatRules?.filterWorkflowStepsBy?.length">Filter Workflow Steps</dt>
          <dd *ngIf="safeConfig.formatRules?.filterWorkflowStepsBy?.length">{{ safeConfig.formatRules!.filterWorkflowStepsBy!.join(', ') }}</dd>

          <dt *ngIf="safeConfig.formatRules?.recordTypeFilterBy">Record Type Filter</dt>
          <dd *ngIf="safeConfig.formatRules?.recordTypeFilterBy">{{ safeConfig.formatRules!.recordTypeFilterBy }}</dd>

          <dt *ngIf="safeConfig.formatRules?.sortGroupBy?.length">Sort Group By</dt>
          <dd *ngIf="safeConfig.formatRules?.sortGroupBy?.length"><pre>{{ safeConfig.formatRules!.sortGroupBy | json }}</pre></dd>
        </dl>
      </div>

      <div *ngIf="hasRowRules()" class="preview-section">
        <h5>Row Rules</h5>
        <div *ngFor="let ruleSet of safeConfig.rowRulesConfig" class="panel panel-default rule-set-panel">
          <div class="panel-heading">
            <span class="panel-title">{{ ruleSet.ruleSetName }}</span>
            <span *ngIf="ruleSet.applyRuleSet" class="label label-success">Active</span>
            <span *ngIf="!ruleSet.applyRuleSet" class="label label-warning">Inactive</span>
          </div>
          <div class="panel-body">
            <ul class="list-unstyled rule-list">
              <li *ngFor="let rule of ruleSet.rules">
                <span class="label" [class.label-success]="rule.action === 'show'" [class.label-danger]="rule.action === 'hide'">{{ rule.action }}</span>
                <strong>{{ rule.name }}</strong>
                <span *ngIf="rule.mode" class="text-muted">({{ rule.mode }})</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div *ngIf="hasGroupConfig()" class="preview-section">
        <h5>Group Config</h5>
        <div *ngIf="safeConfig.groupRowConfig?.length" class="preview-subsection">
          <h6>Group Columns</h6>
          <table class="table table-condensed">
            <thead>
              <tr>
                <th>Title</th>
                <th>Variable</th>
                <th>Sort</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let col of safeConfig.groupRowConfig">
                <td>{{ col.title }}</td>
                <td><code>{{ col.variable }}</code></td>
                <td>
                  <span *ngIf="col.defaultSort" class="label label-info">Default</span>
                  <span *ngIf="col.initialSort" class="label label-default">{{ col.initialSort }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div *ngIf="safeConfig.groupRowRulesConfig?.length" class="preview-subsection">
          <h6>Group Row Rules</h6>
          <div *ngFor="let ruleSet of safeConfig.groupRowRulesConfig" class="panel panel-default rule-set-panel">
            <div class="panel-heading">
              <span class="panel-title">{{ ruleSet.ruleSetName }}</span>
              <span *ngIf="ruleSet.applyRuleSet" class="label label-success">Active</span>
              <span *ngIf="!ruleSet.applyRuleSet" class="label label-warning">Inactive</span>
            </div>
            <div class="panel-body">
              <ul class="list-unstyled rule-list">
                <li *ngFor="let rule of ruleSet.rules">
                  <span class="label" [class.label-success]="rule.action === 'show'" [class.label-danger]="rule.action === 'hide'">{{ rule.action }}</span>
                  <strong>{{ rule.name }}</strong>
                  <span *ngIf="rule.mode" class="text-muted">({{ rule.mode }})</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .table-config-preview {
      font-size: 13px;
    }
    .empty-state {
      color: #888;
      font-style: italic;
      padding: 12px 0;
    }
    .preview-section {
      margin-bottom: 16px;
    }
    .preview-section h5 {
      margin-top: 0;
      margin-bottom: 8px;
      font-weight: 600;
      border-bottom: 1px solid #eee;
      padding-bottom: 4px;
    }
    .preview-subsection {
      margin-bottom: 12px;
    }
    .preview-subsection h6 {
      margin-top: 8px;
      margin-bottom: 6px;
      font-weight: 600;
      color: #555;
    }
    .table-condensed {
      margin-bottom: 0;
    }
    .table-condensed td, .table-condensed th {
      padding: 4px 8px;
    }
    .dl-horizontal dt {
      width: 140px;
      text-align: left;
      margin-bottom: 4px;
    }
    .dl-horizontal dd {
      margin-left: 150px;
      margin-bottom: 8px;
    }
    .dl-horizontal pre {
      margin: 0;
      padding: 4px 6px;
      font-size: 11px;
    }
    .rule-set-panel {
      margin-bottom: 8px;
    }
    .rule-set-panel .panel-heading {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
    }
    .rule-set-panel .panel-title {
      font-size: 13px;
      font-weight: 600;
      flex: 1;
    }
    .rule-list li {
      padding: 3px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .label {
      font-size: 11px;
      padding: 2px 6px;
    }
  `],
  standalone: false
})
export class TableConfigPreviewComponent {
  @Input() config: DashboardTableConfig | null = {};

  get safeConfig(): DashboardTableConfig {
    return this.config || {};
  }

  hasAnyConfig(): boolean {
    return this.hasColumns() || this.hasFormatRules() || this.hasRowRules() || this.hasGroupConfig();
  }

  hasColumns(): boolean {
    return !!(this.safeConfig.rowConfig && this.safeConfig.rowConfig.length > 0);
  }

  hasFormatRules(): boolean {
    const fr = this.safeConfig.formatRules;
    if (!fr) return false;
    return !!(
      fr.sortBy || fr.groupBy || fr.filterBy ||
      (fr.filterWorkflowStepsBy && fr.filterWorkflowStepsBy.length > 0) ||
      fr.recordTypeFilterBy ||
      (fr.sortGroupBy && fr.sortGroupBy.length > 0)
    );
  }

  hasRowRules(): boolean {
    return !!(this.safeConfig.rowRulesConfig && this.safeConfig.rowRulesConfig.length > 0);
  }

  hasGroupConfig(): boolean {
    return !!(
      (this.safeConfig.groupRowConfig && this.safeConfig.groupRowConfig.length > 0) ||
      (this.safeConfig.groupRowRulesConfig && this.safeConfig.groupRowRulesConfig.length > 0)
    );
  }
}
