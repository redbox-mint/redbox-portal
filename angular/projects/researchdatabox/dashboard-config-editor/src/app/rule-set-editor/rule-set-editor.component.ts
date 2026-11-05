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
