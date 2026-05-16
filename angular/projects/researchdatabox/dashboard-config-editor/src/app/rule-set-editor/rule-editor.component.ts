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
  styles: [`
    .dc-rule-card {
      background: var(--dc-surface-muted, #f9fafb);
      border: 1px solid var(--dc-border, #e5e7eb);
      border-radius: 6px;
      overflow: hidden;
    }
    .dc-rule-card-header {
      align-items: center;
      background: #fff;
      border-bottom: 1px solid var(--dc-border, #e5e7eb);
      display: flex;
      gap: 12px;
      justify-content: space-between;
      padding: 10px 14px;
    }
    .dc-rule-card-title {
      align-items: center;
      display: inline-flex;
      gap: 10px;
      min-width: 0;
    }
    .dc-rule-index {
      background: var(--dc-surface-deeper, #f3f4f6);
      border-radius: 4px;
      color: var(--dc-text-muted, #4b5563);
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
    }
    .dc-rule-name {
      color: var(--dc-text, #1f2937);
      font-size: 13px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dc-rule-action {
      align-items: center;
      border-radius: 999px;
      display: inline-flex;
      font-size: 11px;
      font-weight: 600;
      gap: 4px;
      padding: 2px 8px;
      text-transform: uppercase;
    }
    .dc-rule-action-show {
      background: var(--dc-success-soft, #f0fdf4);
      color: var(--dc-success, #16a34a);
    }
    .dc-rule-action-hide {
      background: var(--dc-danger-soft, #fef2f2);
      color: var(--dc-danger, #b91c1c);
    }
    .dc-rule-action i {
      font-size: 11px;
    }
    .dc-btn-remove {
      background: var(--dc-danger-soft, #fef2f2) !important;
      border: 1px solid transparent !important;
      color: var(--dc-danger, #b91c1c) !important;
      font-size: 12px;
      font-weight: 500;
    }
    .dc-btn-remove:hover {
      background: #fee2e2 !important;
      border-color: rgba(185, 28, 28, 0.2) !important;
    }
    .dc-btn-remove i {
      margin-right: 4px;
    }
    .dc-rule-card-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px;
    }
    .dc-rule-grid {
      display: grid;
      gap: 12px;
      grid-template-columns: 2fr 1fr 1fr;
    }
    @media (max-width: 767px) {
      .dc-rule-grid {
        grid-template-columns: 1fr;
      }
    }
    .dc-form-label {
      color: var(--dc-text-muted, #4b5563);
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .dc-mono {
      font-family: "SFMono-Regular", "Consolas", "Liberation Mono", "Menlo", monospace;
      font-size: 12px;
    }
  `],
  standalone: false
})
export class RuleEditorComponent {
  @Input() rule!: DashboardRowRule;
  @Input() index?: number;
  @Output() remove = new EventEmitter<void>();
}
