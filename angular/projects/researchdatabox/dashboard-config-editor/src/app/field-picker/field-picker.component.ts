import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DashboardFieldCatalogue, isKnownFieldPath } from '../dashboard-config-api.service';

let nextPickerId = 0;

/**
 * Text input for a record field path with suggestions from the stage's record
 * JSON schema. Any path can still be typed; unknown paths get a gentle hint
 * because records may legitimately contain fields the schema does not list.
 */
@Component({
  selector: 'dashboard-field-picker',
  template: `
    <input
      type="text"
      class="form-control dc-mono"
      [id]="inputId"
      [attr.list]="listId"
      [attr.aria-label]="ariaLabel || null"
      [attr.aria-describedby]="unknown ? hintId : null"
      [placeholder]="placeholder"
      [ngModel]="value"
      (ngModelChange)="onChange($event)"
      autocomplete="off"
    />
    <datalist [id]="listId">
      <option *ngFor="let field of suggestions" [value]="field.path">{{ field.label }}{{ field.repeated ? ' (list)' : '' }}</option>
    </datalist>
    <small class="dc-field-hint" [id]="hintId" *ngIf="unknown">
      <i class="fa fa-exclamation-triangle" aria-hidden="true"></i>
      Not a field of {{ catalogue?.recordType }}{{ catalogue?.workflowStage ? ' (' + catalogue?.workflowStage + ')' : '' }} in its record schema. Check the spelling.
    </small>
    <small class="dc-field-hint dc-field-hint-info" *ngIf="selected?.description">{{ selected?.description }}</small>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; gap: 3px; }
    .dc-mono { font-family: "SFMono-Regular", "Consolas", "Liberation Mono", "Menlo", monospace; font-size: 12px; }
    .dc-field-hint { color: var(--dc-warning, #d97706); font-size: 12px; }
    .dc-field-hint-info { color: var(--dc-text-subtle, #6b7280); }
  `],
  standalone: false
})
export class FieldPickerComponent {
  @Input() value = '';
  @Input() catalogue: DashboardFieldCatalogue | null = null;
  @Input() placeholder = 'metadata.title';
  @Input() ariaLabel = '';
  @Input() inputId = `dc-field-picker-${++nextPickerId}`;
  /** Restrict suggestions, e.g. to scalar fields for sorting. */
  @Input() filter: 'all' | 'scalar' = 'all';
  @Output() valueChange = new EventEmitter<string>();

  readonly listId = `${this.inputId}-list`;
  readonly hintId = `${this.inputId}-hint`;

  get suggestions() {
    const fields = this.catalogue?.fields ?? [];
    return this.filter === 'scalar' ? fields.filter((f) => f.type !== 'object' && f.type !== 'array' && f.type !== 'any') : fields;
  }

  get selected() {
    return this.catalogue?.fields.find((f) => f.path === (this.value ?? '').trim());
  }

  get unknown(): boolean {
    return !!(this.value ?? '').trim() && !isKnownFieldPath(this.catalogue, this.value);
  }

  onChange(value: string): void {
    this.value = value;
    this.valueChange.emit(value);
  }
}
