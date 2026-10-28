import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { EmailContextSchemaResponse, EmailSchemaTarget } from '@researchdatabox/sails-ng-common';
import { I18NextPipe } from '@researchdatabox/portal-ng-common';
import { RAW_INTERPOLATION } from './email-templates.model';
import type { SchemaSelection } from './schema-selection';

/**
 * Record type and workflow stage that drive schema assistance (field tree,
 * suggestions, warnings and Context JSON checks). The status line says how
 * precise that assistance is.
 */
@Component({
  selector: 'email-templates-schema-target',
  standalone: true,
  imports: [I18NextPipe],
  template: `
    <div class="et-schema" role="group" aria-labelledby="et-schema-label" aria-describedby="et-schema-status">
      <span class="et-section-label" id="et-schema-label">{{ 'email-templates-schema-label' | i18next }}</span>
      @if (targets.length && schema?.precision !== 'integration') {
        <div class="et-schema-selects">
          <select
            id="et-schema-type"
            class="form-select form-select-sm"
            [attr.aria-label]="'email-templates-schema-type' | i18next"
            [disabled]="disabled"
            (change)="chooseType($any($event.target).value)"
          >
            @for (target of targets; track target.id) {
              <option [value]="target.id" [selected]="target.id === selection?.recordType">{{ target.label }}</option>
            }
          </select>
          <select
            id="et-schema-stage"
            class="form-select form-select-sm"
            [attr.aria-label]="'email-templates-schema-stage' | i18next"
            [disabled]="disabled || !currentType?.stages?.length"
            (change)="chooseStage($any($event.target).value)"
          >
            @for (stage of currentType?.stages ?? []; track stage.id) {
              <option [value]="stage.id" [selected]="stage.id === selection?.stage">{{ stage.label }}</option>
            }
          </select>
        </div>
      }
      <p id="et-schema-status" class="et-schema-status" [class.et-schema-status-problem]="error" role="status">
        @if (loading) {
          <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
          <span>{{ 'email-templates-schema-loading' | i18next }}</span>
        } @else if (error) {
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
          <span>{{ 'email-templates-schema-error' | i18next }}</span>
        } @else if (schema?.precision === 'integration') {
          <i class="fa-solid fa-circle-check et-schema-precise" aria-hidden="true"></i>
          <span>{{ 'email-templates-schema-precision-integration' | i18next }}</span>
        } @else if (!targets.length) {
          <i class="fa-regular fa-circle" aria-hidden="true"></i>
          <span>{{ 'email-templates-schema-no-types' | i18next }}</span>
        } @else if (schema?.precision === 'record-schema') {
          <i class="fa-solid fa-circle-check et-schema-precise" aria-hidden="true"></i>
          <span>{{
            'email-templates-schema-precision-record-schema'
              | i18next: { type: typeLabel, stage: stageLabel, interpolation: raw }
          }}</span>
        } @else if (schema?.precision === 'form-config') {
          <i class="fa-solid fa-list-ul" aria-hidden="true"></i>
          <span>{{
            'email-templates-schema-precision-form-config' | i18next: { type: typeLabel, interpolation: raw }
          }}</span>
        } @else if (schema) {
          <i class="fa-regular fa-circle" aria-hidden="true"></i>
          <span>{{ 'email-templates-schema-precision-none' | i18next }}</span>
        }
      </p>
    </div>
  `,
  styleUrls: ['./email-templates.shared.scss', './schema-target.component.scss'],
})
export class SchemaTargetComponent {
  @Input() targets: EmailSchemaTarget[] = [];
  @Input() selection: SchemaSelection | null = null;
  @Input() schema: EmailContextSchemaResponse | null = null;
  @Input() loading = false;
  @Input() error = false;
  @Input() disabled = false;
  @Output() choose = new EventEmitter<SchemaSelection>();

  readonly raw = RAW_INTERPOLATION;

  get currentType(): EmailSchemaTarget | undefined {
    return this.targets.find(target => target.id === this.selection?.recordType);
  }

  get typeLabel(): string {
    const id = this.schema?.recordType ?? this.selection?.recordType;
    return this.targets.find(target => target.id === id)?.label ?? id ?? '';
  }

  get stageLabel(): string {
    const type = this.targets.find(target => target.id === (this.schema?.recordType ?? this.selection?.recordType));
    const id = this.schema?.stage ?? this.selection?.stage;
    return type?.stages.find(stage => stage.id === id)?.label ?? id ?? '';
  }

  chooseType(id: string): void {
    const type = this.targets.find(target => target.id === id);
    const stage = type?.stages.find(item => item.starting) ?? type?.stages[0];
    if (type && stage) this.choose.emit({ recordType: type.id, stage: stage.id });
  }

  chooseStage(id: string): void {
    if (this.selection) this.choose.emit({ recordType: this.selection.recordType, stage: id });
  }
}
