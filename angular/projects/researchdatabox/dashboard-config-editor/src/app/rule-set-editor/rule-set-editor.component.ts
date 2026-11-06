import { Component, Input, Output, EventEmitter } from '@angular/core';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import { DashboardRulesConfig, DashboardRowRule } from '../dashboard-config-api.service';

@Component({
  selector: 'rule-set-editor',
  template: `
    <div class="dc-rule-set-editor">
      <header class="dc-rule-set-editor-header">
        <div>
          <h4 *ngIf="headingLevel === 4" class="dc-rule-set-editor-title">
            <i class="fa fa-filter"></i>
            {{ 'admin-dashboard-rule-sets' | i18next }}
          </h4>
          <h5 *ngIf="headingLevel === 5" class="dc-rule-set-editor-title">
            <i class="fa fa-filter"></i>
            {{ 'admin-dashboard-rule-sets' | i18next }}
          </h5>
          <small class="dc-rule-set-editor-subtitle">{{ 'admin-dashboard-rule-sets-help' | i18next }}</small>
        </div>
        <button type="button" class="btn btn-primary btn-sm" (click)="addRuleSet()">
          <i class="fa fa-plus"></i>
          {{ 'admin-dashboard-add-rule-set' | i18next }}
        </button>
      </header>

      <div class="dc-rule-set-list" *ngIf="ruleSets.length; else emptyTpl">
        <article *ngFor="let ruleSet of ruleSets; let rsIndex = index" class="dc-rule-set-card">
          <header class="dc-rule-set-card-header">
            <div class="dc-rule-set-name-wrap">
              <label class="dc-inline-label" [for]="id + '-name-' + rsIndex">{{ 'admin-dashboard-rule-set-name' | i18next }}</label>
              <input type="text" [id]="id + '-name-' + rsIndex" class="form-control" [(ngModel)]="ruleSet.ruleSetName" [placeholder]="'admin-dashboard-untitled-rule-set' | i18next" />
            </div>
            <div class="form-check form-switch">
              <input type="checkbox" role="switch" class="form-check-input" [id]="id + '-apply-' + rsIndex" [(ngModel)]="ruleSet.applyRuleSet" />
              <label class="form-check-label" [for]="id + '-apply-' + rsIndex">{{ 'admin-dashboard-apply-rule-set' | i18next }}</label>
            </div>
            <button type="button" class="btn btn-sm dc-btn-remove" (click)="removeRuleSet(rsIndex)">
              <i class="fa fa-trash"></i>
              {{ 'admin-dashboard-remove-rule-set' | i18next }}
            </button>
          </header>

          <div class="dc-rule-set-card-body">
            <rule-editor
              *ngFor="let rule of ruleSet.rules; let rIndex = index"
              [rule]="rule"
              [index]="rIndex"
              [headingLevel]="headingLevel + 1"
              (remove)="removeRule(rsIndex, rIndex)"
            ></rule-editor>
            <button type="button" class="btn btn-outline-secondary btn-sm dc-add-rule-btn" (click)="addRule(rsIndex)">
              <i class="fa fa-plus"></i>
              {{ 'admin-dashboard-add-rule' | i18next }}
            </button>
          </div>
        </article>
      </div>

      <ng-template #emptyTpl>
        <div class="dc-rule-set-empty">
          <i class="fa fa-filter"></i>
          <p>{{ 'admin-dashboard-no-rule-sets' | i18next }}</p>
        </div>
      </ng-template>
    </div>
  `,
  standalone: false
})
export class RuleSetEditorComponent {
  constructor(private translation: TranslationService) {}
  static nextId = 0;
  readonly id = `dc-rule-set-${++RuleSetEditorComponent.nextId}`;
  @Input() headingLevel = 4;
  @Input() ruleSets: DashboardRulesConfig[] = [];
  @Output() ruleSetsChange = new EventEmitter<DashboardRulesConfig[]>();

  addRuleSet(): void {
    this.ruleSets = [...this.ruleSets, { ruleSetName: this.translation.t('admin-dashboard-new-rule-set'), applyRuleSet: true, rules: [] }];
    this.ruleSetsChange.emit(this.ruleSets);
  }

  removeRuleSet(index: number): void {
    this.ruleSets = this.ruleSets.filter((_, i) => i !== index);
    this.ruleSetsChange.emit(this.ruleSets);
  }

  addRule(rsIndex: number): void {
    const rule: DashboardRowRule = { name: this.translation.t('admin-dashboard-new-rule'), action: 'show', renderItemTemplate: '' };
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
