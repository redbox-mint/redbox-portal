import { Component, Input, Output, EventEmitter } from '@angular/core';
import { DashboardRowRule } from '../dashboard-config-api.service';

@Component({
  selector: 'rule-editor',
  template: `
    <div class="dc-rule-card">
      <header class="dc-rule-card-header">
        <div class="dc-rule-card-title">
          <span class="dc-rule-index">{{ (index ?? 0) + 1 }}</span>
          <span class="dc-rule-name">{{ rule.name || 'Untitled rule' }}</span>
          <span class="dc-rule-action" [class.dc-rule-action-show]="rule.action === 'show'" [class.dc-rule-action-hide]="rule.action === 'hide'">
            <i class="fa" [class.fa-eye]="rule.action === 'show'" [class.fa-eye-slash]="rule.action === 'hide'"></i>
            {{ rule.action }}
          </span>
        </div>
        <button type="button" class="btn btn-sm dc-btn-remove" (click)="remove.emit()">
          <i class="fa fa-trash"></i>
          Remove
        </button>
      </header>
      <div class="dc-rule-card-body">
        <div class="dc-rule-grid">
          <div class="form-group">
            <label class="dc-form-label">Name</label>
            <input type="text" class="form-control" [(ngModel)]="rule.name" placeholder="Descriptive name" />
          </div>
          <div class="form-group">
            <label class="dc-form-label">Action</label>
            <select class="form-control" [(ngModel)]="rule.action">
              <option value="show">Show</option>
              <option value="hide">Hide</option>
            </select>
          </div>
          <div class="form-group">
            <label class="dc-form-label">Mode</label>
            <select class="form-control" [(ngModel)]="rule.mode">
              <option value="">None</option>
              <option value="all">All conditions must match</option>
              <option value="alo">Any condition matches</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="dc-form-label">Render Item Template</label>
          <textarea class="form-control dc-mono" rows="3" [(ngModel)]="rule.renderItemTemplate" placeholder="Handlebars template returning the row markup"></textarea>
        </div>
        <div class="form-group">
          <label class="dc-form-label">Evaluate Rules Template</label>
          <textarea class="form-control dc-mono" rows="3" [(ngModel)]="rule.evaluateRulesTemplate" placeholder="Optional expression evaluated per row"></textarea>
        </div>
      </div>
    </div>
  `,
  standalone: false
})
export class RuleEditorComponent {
  @Input() rule!: DashboardRowRule;
  @Input() index?: number;
  @Output() remove = new EventEmitter<void>();
}
