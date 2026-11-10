import { Component, Input, Output, EventEmitter } from '@angular/core';
import { DashboardRowRule } from '../dashboard-config-api.service';

@Component({
  selector: 'rule-editor',
  template: `
    <div class="dc-rule-card">
      <header class="dc-rule-card-header">
        <div class="dc-rule-card-title">
          <span class="dc-rule-index">{{ (index ?? 0) + 1 }}</span>
          <h5 *ngIf="headingLevel === 5" class="dc-rule-name">{{ rule.name || ('admin-dashboard-untitled-rule' | i18next) }}</h5>
          <h6 *ngIf="headingLevel === 6" class="dc-rule-name">{{ rule.name || ('admin-dashboard-untitled-rule' | i18next) }}</h6>
          <span class="dc-rule-action" [class.dc-rule-action-show]="rule.action === 'show'" [class.dc-rule-action-hide]="rule.action === 'hide'">
            <i class="fa" [class.fa-eye]="rule.action === 'show'" [class.fa-eye-slash]="rule.action === 'hide'" aria-hidden="true"></i>
            {{ (rule.action === 'show' ? 'admin-dashboard-rule-show' : 'admin-dashboard-rule-hide') | i18next }}
          </span>
        </div>
        <button type="button" class="btn btn-sm dc-btn-remove" (click)="remove.emit()">
          <i class="fa fa-trash" aria-hidden="true"></i>
          {{ 'admin-dashboard-remove-rule' | i18next }}
        </button>
      </header>
      <div class="dc-rule-card-body">
        <div class="dc-rule-grid">
          <div class="form-group">
            <label class="dc-form-label" [for]="id + '-name'">{{ 'admin-dashboard-rule-name' | i18next }}</label>
            <input [id]="id + '-name'" type="text" class="form-control" [(ngModel)]="rule.name" [placeholder]="'admin-dashboard-rule-name-placeholder' | i18next" />
          </div>
          <div class="form-group">
            <label class="dc-form-label" [for]="id + '-action'">{{ 'admin-dashboard-rule-action' | i18next }}</label>
            <select [id]="id + '-action'" class="form-select" [(ngModel)]="rule.action">
              <option value="show">{{ 'admin-dashboard-rule-show' | i18next }}</option>
              <option value="hide">{{ 'admin-dashboard-rule-hide' | i18next }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="dc-form-label" [for]="id + '-mode'">{{ 'admin-dashboard-rule-mode' | i18next }}</label>
            <select [id]="id + '-mode'" class="form-select" [(ngModel)]="rule.mode">
              <option value="">{{ 'admin-dashboard-none' | i18next }}</option>
              <option value="all">{{ 'admin-dashboard-rule-all' | i18next }}</option>
              <option value="alo">{{ 'admin-dashboard-rule-any' | i18next }}</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="dc-form-label" [for]="id + '-render'">{{ 'admin-dashboard-rule-render-template' | i18next }}</label>
          <textarea [id]="id + '-render'" class="form-control dc-mono" rows="3" [(ngModel)]="rule.renderItemTemplate" [placeholder]="'admin-dashboard-rule-render-placeholder' | i18next"></textarea>
        </div>
        <div class="form-group">
          <label class="dc-form-label" [for]="id + '-evaluate'">{{ 'admin-dashboard-rule-evaluate-template' | i18next }}</label>
          <textarea [id]="id + '-evaluate'" class="form-control dc-mono" rows="3" [(ngModel)]="rule.evaluateRulesTemplate" [placeholder]="'admin-dashboard-rule-evaluate-placeholder' | i18next"></textarea>
        </div>
      </div>
    </div>
  `,
  standalone: false
})
export class RuleEditorComponent {
  static nextId = 0;
  readonly id = `dc-rule-${++RuleEditorComponent.nextId}`;
  @Input() headingLevel = 5;
  @Input() rule!: DashboardRowRule;
  @Input() index?: number;
  @Output() remove = new EventEmitter<void>();
}
