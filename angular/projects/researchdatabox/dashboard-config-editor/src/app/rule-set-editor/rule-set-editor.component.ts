import { Component, Input, Output, EventEmitter } from '@angular/core';
import { DashboardRulesConfig, DashboardRowRule } from '../dashboard-config-api.service';

@Component({
  selector: 'rule-set-editor',
  template: `
    <div class="rule-set-editor">
      <div *ngFor="let ruleSet of ruleSets; let rsIndex = index" class="panel panel-default">
        <div class="panel-heading">
          <input type="text" class="form-control" [(ngModel)]="ruleSet.ruleSetName" placeholder="Rule Set Name" />
          <label>
            <input type="checkbox" [(ngModel)]="ruleSet.applyRuleSet" /> Apply Rule Set
          </label>
          <button type="button" class="btn btn-sm btn-danger" (click)="removeRuleSet(rsIndex)">Remove Set</button>
        </div>
        <div class="panel-body">
          <rule-editor *ngFor="let rule of ruleSet.rules; let rIndex = index" [rule]="rule" (remove)="removeRule(rsIndex, rIndex)"></rule-editor>
          <button type="button" class="btn btn-sm btn-primary" (click)="addRule(rsIndex)">Add Rule</button>
        </div>
      </div>
      <button type="button" class="btn btn-sm btn-primary" (click)="addRuleSet()">Add Rule Set</button>
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
