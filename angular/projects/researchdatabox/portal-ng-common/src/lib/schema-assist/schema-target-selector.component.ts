import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { SchemaSelection, SchemaTarget } from '@researchdatabox/sails-ng-common';

let nextSelectorId = 0;

/** Selection only: no feature API, policy, default guidance choice or saved configuration mutation. */
@Component({
  selector: 'rb-schema-target-selector',
  standalone: true,
  template: `
    <div class="schema-target-selects">
      <select
        [id]="idPrefix + '-type'"
        class="form-select form-select-sm"
        [attr.aria-label]="typeLabel"
        [disabled]="disabled"
        (change)="chooseType($any($event.target).value)"
      >
        @if (!selection) {
          <option value="" selected>{{ emptyLabel }}</option>
        }
        @for (target of targets; track target.id) {
          <option [value]="target.id" [selected]="target.id === selection?.recordType">{{ target.label }}</option>
        }
      </select>
      <select
        [id]="idPrefix + '-stage'"
        class="form-select form-select-sm"
        [attr.aria-label]="stageLabel"
        [disabled]="disabled || !currentType?.stages?.length"
        (change)="chooseStage($any($event.target).value)"
      >
        @for (stage of currentType?.stages ?? []; track stage.id) {
          <option [value]="stage.id" [selected]="stage.id === selection?.stage">{{ stage.label }}</option>
        }
      </select>
    </div>
  `,
  styles: [
    '.schema-target-selects { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 8px; } select { font-size: 14px; }',
  ],
})
export class SchemaTargetSelectorComponent {
  @Input() targets: SchemaTarget[] = [];
  @Input() selection: SchemaSelection | null = null;
  @Input() disabled = false;
  @Input() idPrefix = `schema-target-${++nextSelectorId}`;
  @Input() typeLabel = 'Record type';
  @Input() stageLabel = 'Workflow stage';
  @Input() emptyLabel = 'Choose guidance context';
  @Output() choose = new EventEmitter<SchemaSelection>();

  get currentType(): SchemaTarget | undefined {
    return this.targets.find(target => target.id === this.selection?.recordType);
  }
  chooseType(id: string): void {
    const type = this.targets.find(target => target.id === id);
    const stage = type?.stages.find(item => item.starting) ?? type?.stages[0];
    if (type && stage && !this.disabled) this.choose.emit({ recordType: type.id, stage: stage.id });
  }
  chooseStage(id: string): void {
    if (!this.disabled && this.selection && this.currentType?.stages.some(stage => stage.id === id))
      this.choose.emit({ recordType: this.selection.recordType, stage: id });
  }
}
