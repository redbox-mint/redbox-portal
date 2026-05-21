import { Component, Input, Output, EventEmitter } from '@angular/core';
import { DashboardRulesConfig, DashboardRowRule } from '../dashboard-config-api.service';

@Component({
  selector: 'rule-set-editor',
  template: `
    <div class="dc-rule-set-editor">
      <header class="dc-rule-set-editor-header">
        <div>
          <h5 class="dc-rule-set-editor-title">
            <i class="fa fa-filter"></i>
            Row Rule Sets
          </h5>
          <small class="dc-rule-set-editor-subtitle">Each rule set evaluates against a row to decide whether to show or hide it.</small>
        </div>
        <button type="button" class="btn btn-primary btn-sm" (click)="addRuleSet()">
          <i class="fa fa-plus"></i>
          Add Rule Set
        </button>
      </header>

      <div class="dc-rule-set-list" *ngIf="ruleSets.length; else emptyTpl">
        <article *ngFor="let ruleSet of ruleSets; let rsIndex = index" class="dc-rule-set-card">
          <header class="dc-rule-set-card-header">
            <div class="dc-rule-set-name-wrap">
              <label class="dc-inline-label">Rule Set Name</label>
              <input type="text" class="form-control" [(ngModel)]="ruleSet.ruleSetName" placeholder="Untitled rule set" />
            </div>
            <label class="dc-toggle-label">
              <input type="checkbox" [(ngModel)]="ruleSet.applyRuleSet" class="dc-toggle-input" />
              <span class="dc-toggle-switch"></span>
              <span class="dc-toggle-text">Apply Rule Set</span>
            </label>
            <button type="button" class="btn btn-sm dc-btn-remove" (click)="removeRuleSet(rsIndex)">
              <i class="fa fa-trash"></i>
              Remove Set
            </button>
          </header>

          <div class="dc-rule-set-card-body">
            <rule-editor
              *ngFor="let rule of ruleSet.rules; let rIndex = index"
              [rule]="rule"
              [index]="rIndex"
              (remove)="removeRule(rsIndex, rIndex)"
            ></rule-editor>
            <button type="button" class="btn btn-default btn-sm dc-add-rule-btn" (click)="addRule(rsIndex)">
              <i class="fa fa-plus"></i>
              Add Rule
            </button>
          </div>
        </article>
      </div>

      <ng-template #emptyTpl>
        <div class="dc-rule-set-empty">
          <i class="fa fa-filter"></i>
          <p>No row rule sets yet. Add a rule set to start filtering or transforming rows.</p>
        </div>
      </ng-template>
    </div>
  `,
  styles: [`
    .dc-rule-set-editor {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .dc-rule-set-editor-header {
      align-items: flex-start;
      display: flex;
      gap: 12px;
      justify-content: space-between;
    }
    .dc-rule-set-editor-header .btn i {
      margin-right: 6px;
    }
    .dc-rule-set-editor-title {
      align-items: center;
      color: var(--dc-text, #1f2937);
      display: inline-flex;
      font-size: 0.95rem;
      font-weight: 600;
      gap: 8px;
      margin: 0 0 2px;
    }
    .dc-rule-set-editor-title i {
      color: var(--dc-text-subtle, #6b7280);
    }
    .dc-rule-set-editor-subtitle {
      color: var(--dc-text-subtle, #6b7280);
      font-size: 12px;
    }
    .dc-rule-set-list {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .dc-rule-set-card {
      background: #fff;
      border: 1px solid var(--dc-border, #e5e7eb);
      border-radius: 6px;
      overflow: hidden;
    }
    .dc-rule-set-card-header {
      align-items: flex-end;
      background: var(--dc-surface-muted, #f9fafb);
      border-bottom: 1px solid var(--dc-border, #e5e7eb);
      display: grid;
      gap: 14px;
      grid-template-columns: minmax(0, 1fr) auto auto;
      padding: 12px 14px;
    }
    .dc-rule-set-name-wrap {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .dc-inline-label {
      color: var(--dc-text-muted, #4b5563);
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      margin: 0;
      text-transform: uppercase;
    }
    .dc-toggle-label {
      align-items: center;
      cursor: pointer;
      display: inline-flex;
      font-weight: 500;
      gap: 10px;
      margin: 0;
      user-select: none;
    }
    .dc-toggle-input {
      height: 0;
      opacity: 0;
      position: absolute;
      width: 0;
    }
    .dc-toggle-switch {
      background: var(--dc-border-strong, #d1d5db);
      border-radius: 12px;
      display: inline-block;
      flex-shrink: 0;
      height: 22px;
      position: relative;
      transition: background 150ms ease;
      width: 40px;
    }
    .dc-toggle-switch::after {
      background: #fff;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      content: '';
      height: 18px;
      left: 2px;
      position: absolute;
      top: 2px;
      transition: transform 150ms ease;
      width: 18px;
    }
    .dc-toggle-input:checked + .dc-toggle-switch {
      background: var(--dc-accent, #2563eb);
    }
    .dc-toggle-input:checked + .dc-toggle-switch::after {
      transform: translateX(18px);
    }
    .dc-toggle-text {
      font-size: 13px;
    }
    .dc-btn-remove {
      background: var(--dc-danger-soft, #fef2f2) !important;
      border: 1px solid transparent !important;
      color: var(--dc-danger, #b91c1c) !important;
      font-weight: 500;
    }
    .dc-btn-remove:hover {
      background: #fee2e2 !important;
      border-color: rgba(185, 28, 28, 0.2) !important;
    }
    .dc-btn-remove i {
      margin-right: 6px;
    }
    .dc-rule-set-card-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px;
    }
    .dc-add-rule-btn {
      align-self: flex-start;
    }
    .dc-add-rule-btn i {
      margin-right: 6px;
    }
    .dc-rule-set-empty {
      align-items: center;
      background: var(--dc-surface-muted, #f9fafb);
      border: 1px dashed var(--dc-border, #e5e7eb);
      border-radius: 6px;
      color: var(--dc-text-subtle, #6b7280);
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 28px 16px;
      text-align: center;
    }
    .dc-rule-set-empty i {
      font-size: 20px;
    }
    .dc-rule-set-empty p {
      margin: 0;
      max-width: 360px;
    }
    @media (max-width: 767px) {
      .dc-rule-set-card-header {
        grid-template-columns: 1fr;
      }
    }
  `],
  standalone: false
})
export class RuleSetEditorComponent {
  @Input() ruleSets: DashboardRulesConfig[] = [];
  @Output() ruleSetsChange = new EventEmitter<DashboardRulesConfig[]>();

  addRuleSet(): void {
    this.ruleSets = [...this.ruleSets, { ruleSetName: 'New Rule Set', applyRuleSet: true, rules: [] }];
    this.ruleSetsChange.emit(this.ruleSets);
  }

  removeRuleSet(index: number): void {
    this.ruleSets = this.ruleSets.filter((_, i) => i !== index);
    this.ruleSetsChange.emit(this.ruleSets);
  }

  addRule(rsIndex: number): void {
    const rule: DashboardRowRule = { name: 'New Rule', action: 'show', renderItemTemplate: '' };
    const updated = [...this.ruleSets];
    updated[rsIndex] = { ...updated[rsIndex], rules: [...updated[rsIndex].rules, rule] };
    this.ruleSets = updated;
    this.ruleSetsChange.emit(this.ruleSets);
  }

  removeRule(rsIndex: number, rIndex: number): void {
    const updated = [...this.ruleSets];
    updated[rsIndex] = { ...updated[rsIndex], rules: updated[rsIndex].rules.filter((_, i) => i !== rIndex) };
    this.ruleSets = updated;
    this.ruleSetsChange.emit(this.ruleSets);
  }
}
