import { Component, Input, Output, EventEmitter } from '@angular/core';
import { DashboardRowRule } from '../dashboard-config-api.service';

@Component({
  selector: 'rule-editor',
  template: `
    <div class="rule-editor panel panel-default">
      <div class="panel-body">
        <div class="form-group">
          <label>Name</label>
          <input type="text" class="form-control" [(ngModel)]="rule.name" />
        </div>
        <div class="form-group">
          <label>Action</label>
          <select class="form-control" [(ngModel)]="rule.action">
            <option value="show">Show</option>
            <option value="hide">Hide</option>
          </select>
        </div>
        <div class="form-group">
          <label>Mode</label>
          <select class="form-control" [(ngModel)]="rule.mode">
            <option value="">None</option>
            <option value="all">All</option>
            <option value="alo">Any</option>
          </select>
        </div>
        <div class="form-group">
          <label>Render Item Template</label>
          <textarea class="form-control" rows="3" [(ngModel)]="rule.renderItemTemplate"></textarea>
        </div>
        <div class="form-group">
          <label>Evaluate Rules Template</label>
          <textarea class="form-control" rows="3" [(ngModel)]="rule.evaluateRulesTemplate"></textarea>
        </div>
        <button type="button" class="btn btn-sm btn-danger" (click)="remove.emit()">Remove Rule</button>
      </div>
    </div>
  `,
  standalone: false
})
export class RuleEditorComponent {
  @Input() rule!: DashboardRowRule;
  @Output() remove = new EventEmitter<void>();
}
