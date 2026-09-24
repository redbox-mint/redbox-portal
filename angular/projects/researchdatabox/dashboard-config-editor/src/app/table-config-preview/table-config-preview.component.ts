import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { DashboardTableConfig } from '../dashboard-config-api.service';

@Component({
  selector: 'table-config-preview',
  template: `
    <div class="dc-preview">
      @if (!hasAnyConfig()) {
        <div class="dc-preview-empty">
          <i class="fa fa-circle-o"></i>
          <span>No configuration set.</span>
        </div>
      }

      @if (hasColumns()) {
        <section class="dc-preview-section">
          <h6 class="dc-preview-section-title">
            <i class="fa fa-columns"></i>
            Columns
          </h6>
          <div class="dc-preview-table-wrap">
            <table class="dc-preview-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Variable</th>
                  <th>Sort</th>
                </tr>
              </thead>
              <tbody>
                @for (col of safeConfig.rowConfig; track col) {
                  <tr>
                    <td>{{ col.title }}</td>
                    <td>
                      <code>{{ col.variable }}</code>
                    </td>
                    <td>
                      @if (col.defaultSort) {
                        <span class="dc-pill dc-pill-info">Default</span>
                      }
                      @if (col.initialSort) {
                        <span class="dc-pill">{{ col.initialSort }}</span>
                      }
                      @if (col.secondarySort) {
                        <span class="dc-pill">2nd: {{ col.secondarySort }}</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      @if (hasFormatRules()) {
        <section class="dc-preview-section">
          <h6 class="dc-preview-section-title">
            <i class="fa fa-sliders"></i>
            Format Rules
          </h6>
          <dl class="dc-preview-dl">
            @if (safeConfig.formatRules?.sortBy) {
              <dt>Sort By</dt>
              <dd>{{ safeConfig.formatRules!.sortBy }}</dd>
            }
            @if (safeConfig.formatRules?.groupBy) {
              <dt>Group By</dt>
              <dd>{{ safeConfig.formatRules!.groupBy }}</dd>
            }
            @if (safeConfig.formatRules?.filterBy) {
              <dt>Filter By</dt>
              <dd>
                <pre>{{ safeConfig.formatRules!.filterBy | json }}</pre>
              </dd>
            }
            @if (safeConfig.formatRules?.filterWorkflowStepsBy?.length) {
              <dt>Filter Workflow Steps</dt>
              <dd>{{ safeConfig.formatRules!.filterWorkflowStepsBy!.join(', ') }}</dd>
            }
            @if (safeConfig.formatRules?.recordTypeFilterBy) {
              <dt>Record Type Filter</dt>
              <dd>{{ safeConfig.formatRules!.recordTypeFilterBy }}</dd>
            }
            @if (safeConfig.formatRules?.sortGroupBy?.length) {
              <dt>Sort Group By</dt>
              <dd>
                <pre>{{ safeConfig.formatRules!.sortGroupBy | json }}</pre>
              </dd>
            }
          </dl>
        </section>
      }

      @if (hasRowRules()) {
        <section class="dc-preview-section">
          <h6 class="dc-preview-section-title">
            <i class="fa fa-filter"></i>
            Row Rules
          </h6>
          @for (ruleSet of safeConfig.rowRulesConfig; track ruleSet) {
            <div class="dc-preview-rule-set">
              <div class="dc-preview-rule-set-header">
                <span class="dc-preview-rule-set-name">{{ ruleSet.ruleSetName }}</span>
                @if (ruleSet.applyRuleSet) {
                  <span class="dc-pill dc-pill-success">Active</span>
                }
                @if (!ruleSet.applyRuleSet) {
                  <span class="dc-pill dc-pill-warning">Inactive</span>
                }
              </div>
              <ul class="dc-preview-rule-list">
                @for (rule of ruleSet.rules; track rule) {
                  <li>
                    <span
                      class="dc-pill"
                      [class.dc-pill-success]="rule.action === 'show'"
                      [class.dc-pill-danger]="rule.action === 'hide'"
                      >{{ rule.action }}</span
                    >
                    <strong>{{ rule.name }}</strong>
                    @if (rule.mode) {
                      <span class="dc-preview-meta">({{ rule.mode }})</span>
                    }
                  </li>
                }
              </ul>
            </div>
          }
        </section>
      }

      @if (hasGroupConfig()) {
        <section class="dc-preview-section">
          <h6 class="dc-preview-section-title">
            <i class="fa fa-object-group"></i>
            Group Config
          </h6>
          @if (safeConfig.groupRowConfig?.length) {
            <div class="dc-preview-subsection">
              <h6 class="dc-preview-subsection-title">Group Columns</h6>
              <div class="dc-preview-table-wrap">
                <table class="dc-preview-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Variable</th>
                      <th>Sort</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (col of safeConfig.groupRowConfig; track col) {
                      <tr>
                        <td>{{ col.title }}</td>
                        <td>
                          <code>{{ col.variable }}</code>
                        </td>
                        <td>
                          @if (col.defaultSort) {
                            <span class="dc-pill dc-pill-info">Default</span>
                          }
                          @if (col.initialSort) {
                            <span class="dc-pill">{{ col.initialSort }}</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
          @if (safeConfig.groupRowRulesConfig?.length) {
            <div class="dc-preview-subsection">
              <h6 class="dc-preview-subsection-title">Group Row Rules</h6>
              @for (ruleSet of safeConfig.groupRowRulesConfig; track ruleSet) {
                <div class="dc-preview-rule-set">
                  <div class="dc-preview-rule-set-header">
                    <span class="dc-preview-rule-set-name">{{ ruleSet.ruleSetName }}</span>
                    @if (ruleSet.applyRuleSet) {
                      <span class="dc-pill dc-pill-success">Active</span>
                    }
                    @if (!ruleSet.applyRuleSet) {
                      <span class="dc-pill dc-pill-warning">Inactive</span>
                    }
                  </div>
                  <ul class="dc-preview-rule-list">
                    @for (rule of ruleSet.rules; track rule) {
                      <li>
                        <span
                          class="dc-pill"
                          [class.dc-pill-success]="rule.action === 'show'"
                          [class.dc-pill-danger]="rule.action === 'hide'"
                          >{{ rule.action }}</span
                        >
                        <strong>{{ rule.name }}</strong>
                        @if (rule.mode) {
                          <span class="dc-preview-meta">({{ rule.mode }})</span>
                        }
                      </li>
                    }
                  </ul>
                </div>
              }
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: [
    `
      .dc-preview {
        color: var(--dc-text, #1f2937);
        font-size: 13px;
      }
      .dc-preview-empty {
        align-items: center;
        color: var(--dc-text-subtle, #6b7280);
        display: flex;
        font-style: italic;
        gap: 8px;
        padding: 12px 0;
      }
      .dc-preview-section + .dc-preview-section {
        border-top: 1px dashed var(--dc-border, #e5e7eb);
        margin-top: 16px;
        padding-top: 16px;
      }
      .dc-preview-section-title {
        align-items: center;
        color: var(--dc-text-muted, #4b5563);
        display: inline-flex;
        font-size: 0.75rem;
        font-weight: 600;
        gap: 8px;
        letter-spacing: 0.05em;
        margin: 0 0 8px;
        text-transform: uppercase;
      }
      .dc-preview-section-title i {
        color: var(--dc-text-subtle, #6b7280);
      }
      .dc-preview-table-wrap {
        overflow-x: auto;
      }
      .dc-preview-table {
        border-collapse: collapse;
        font-size: 12px;
        width: 100%;
      }
      .dc-preview-table th,
      .dc-preview-table td {
        border-bottom: 1px solid var(--dc-border, #e5e7eb);
        padding: 6px 10px;
        text-align: left;
        vertical-align: top;
      }
      .dc-preview-table th {
        color: var(--dc-text-subtle, #6b7280);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .dc-preview-table code {
        background: rgba(0, 0, 0, 0.04);
        border-radius: 3px;
        font-size: 11px;
        padding: 1px 5px;
      }
      .dc-preview-dl {
        display: grid;
        gap: 4px 12px;
        grid-template-columns: max-content minmax(0, 1fr);
        margin: 0;
      }
      .dc-preview-dl dt {
        color: var(--dc-text-muted, #4b5563);
        font-size: 12px;
        font-weight: 600;
      }
      .dc-preview-dl dd {
        color: var(--dc-text, #1f2937);
        margin: 0;
      }
      .dc-preview-dl pre {
        background: rgba(0, 0, 0, 0.03);
        border-radius: 3px;
        font-size: 11px;
        margin: 0;
        padding: 4px 8px;
      }
      .dc-preview-rule-set + .dc-preview-rule-set {
        margin-top: 8px;
      }
      .dc-preview-rule-set-header {
        align-items: center;
        display: flex;
        gap: 8px;
        margin-bottom: 4px;
      }
      .dc-preview-rule-set-name {
        color: var(--dc-text, #1f2937);
        font-size: 12px;
        font-weight: 600;
      }
      .dc-preview-rule-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .dc-preview-rule-list li {
        align-items: center;
        display: flex;
        gap: 8px;
        padding: 3px 0;
      }
      .dc-preview-meta {
        color: var(--dc-text-subtle, #6b7280);
        font-size: 11px;
      }
      .dc-preview-subsection + .dc-preview-subsection {
        margin-top: 12px;
      }
      .dc-preview-subsection-title {
        color: var(--dc-text-muted, #4b5563);
        font-size: 11px;
        font-weight: 600;
        margin: 0 0 6px;
      }
      .dc-pill {
        background: var(--dc-surface-deeper, #f3f4f6);
        border: 1px solid var(--dc-border, #e5e7eb);
        border-radius: 999px;
        color: var(--dc-text-muted, #4b5563);
        display: inline-block;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.04em;
        margin-right: 4px;
        padding: 2px 8px;
        text-transform: uppercase;
      }
      .dc-pill-info {
        background: var(--dc-accent-soft, #eff6ff);
        border-color: #bfdbfe;
        color: var(--dc-accent, #2563eb);
      }
      .dc-pill-success {
        background: var(--dc-success-soft, #f0fdf4);
        border-color: #bbf7d0;
        color: var(--dc-success, #16a34a);
      }
      .dc-pill-warning {
        background: var(--dc-warning-soft, #fffbeb);
        border-color: #fde68a;
        color: var(--dc-warning, #d97706);
      }
      .dc-pill-danger {
        background: var(--dc-danger-soft, #fef2f2);
        border-color: #fecaca;
        color: var(--dc-danger, #b91c1c);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
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
      fr.sortBy ||
      fr.groupBy ||
      fr.filterBy ||
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
