import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { DashboardFieldInfo, DashboardFormatRules } from '../dashboard-config-api.service';

type GroupBy = '' | 'groupedByRecordType' | 'groupedByRelationships';

interface GroupLevel {
  compareFieldValue: string;
  compareField: string;
  relatedTo: string;
  /** Properties this editor does not manage are kept. */
  extra: Record<string, unknown>;
}

const RECORD_TYPE_FIELD = 'metadata.metaMetadata.type';

/**
 * Guided editor for custom-view grouping: the grouping strategy and its
 * ordered levels. Replaces the raw JSON for `groupBy` and `sortGroupBy`.
 */
@Component({
  selector: 'dashboard-grouping-editor',
  template: `
    <div class="dc-guided-editor">
      <header class="dc-guided-header">
        <h5><i class="fa fa-object-group"></i> How records are grouped</h5>
        <p *ngIf="targetKind === 'view'">Group related records together in this view step. Group rows (below) can show a summary or actions after each group.</p>
        <p *ngIf="targetKind === 'workflow'" class="dc-form-help-warning">Grouping is only applied by custom views. Workflow stage dashboards list records without grouping.</p>
      </header>

      <div class="dc-choice-cards" role="radiogroup" aria-label="How records are grouped">
        <label class="dc-choice-card" [class.active]="groupBy === ''">
          <input type="radio" name="dc-group-by" value="" [(ngModel)]="groupBy" (ngModelChange)="onGroupByChange()" />
          <span><strong>No grouping</strong><small>List records one after another.</small></span>
        </label>
        <label class="dc-choice-card" [class.active]="groupBy === 'groupedByRecordType'">
          <input type="radio" name="dc-group-by" value="groupedByRecordType" [(ngModel)]="groupBy" (ngModelChange)="onGroupByChange()" />
          <span><strong>By record type</strong><small>One block per record type, in the order you choose.</small></span>
        </label>
        <label class="dc-choice-card" [class.active]="groupBy === 'groupedByRelationships'">
          <input type="radio" name="dc-group-by" value="groupedByRelationships" [(ngModel)]="groupBy" (ngModelChange)="onGroupByChange()" />
          <span><strong>By related records</strong><small>Each record followed by the records linked to it, e.g. plan → datasets → publications.</small></span>
        </label>
      </div>

      <section *ngIf="groupBy" class="dc-levels">
        <h6 class="dc-levels-title">Group levels</h6>
        <p class="dc-form-help">{{ groupBy === 'groupedByRecordType' ? 'Records of each type are shown as a separate group, top to bottom.' : 'Level 1 is the top-level record. Each further level lists the records linked to the level above it.' }}</p>

        <ol class="dc-level-list">
          <li *ngFor="let level of levels; let i = index; let last = last" class="dc-level">
            <div class="dc-level-number">{{ i + 1 }}</div>
            <div class="dc-level-fields">
              <div class="dc-form-group">
                <label class="dc-form-label" [attr.for]="'dc-level-type-' + i">Record type</label>
                <select class="form-control" [id]="'dc-level-type-' + i" [(ngModel)]="level.compareFieldValue" (ngModelChange)="emit()">
                  <option value="" disabled>Choose a record type…</option>
                  <option *ngFor="let type of recordTypeOptions(level)" [value]="type">{{ type }}</option>
                </select>
              </div>
              <ng-container *ngIf="groupBy === 'groupedByRelationships'">
                <div class="dc-form-group" *ngIf="i > 0">
                  <label class="dc-form-label" [attr.for]="'dc-level-related-' + i">Linked to the level above by</label>
                  <input class="form-control dc-mono" [id]="'dc-level-related-' + i" list="dc-grouping-link-suggestions" [(ngModel)]="level.relatedTo" (ngModelChange)="emit()" [placeholder]="'metadata.metadata.' + (levels[i - 1].compareFieldValue || 'parent') + '.oid'" />
                  <small class="dc-form-help">Field on these records that holds the oid of the record above.</small>
                </div>
                <details class="dc-level-advanced">
                  <summary>Advanced</summary>
                  <div class="dc-form-group">
                    <label class="dc-form-label" [attr.for]="'dc-level-field-' + i">Field holding the record type</label>
                    <input class="form-control dc-mono" [id]="'dc-level-field-' + i" [(ngModel)]="level.compareField" (ngModelChange)="emit()" />
                  </div>
                </details>
              </ng-container>
              <small class="dc-form-help-error" *ngFor="let problem of levelProblems(level, i)">{{ problem }}</small>
            </div>
            <div class="dc-row-actions">
              <button type="button" class="btn btn-default btn-xs" (click)="move(i, -1)" [disabled]="i === 0" aria-label="Move level up"><i class="fa fa-arrow-up"></i></button>
              <button type="button" class="btn btn-default btn-xs" (click)="move(i, 1)" [disabled]="last" aria-label="Move level down"><i class="fa fa-arrow-down"></i></button>
              <button type="button" class="btn btn-default btn-xs" (click)="remove(i)" aria-label="Remove level"><i class="fa fa-times"></i></button>
            </div>
          </li>
        </ol>
        <div *ngIf="levels.length === 0" class="dc-empty-inline">No levels yet — records are not grouped until you add one.</div>
        <button type="button" class="btn btn-default btn-sm" (click)="add()"><i class="fa fa-plus"></i> Add level</button>
      </section>

      <datalist id="dc-grouping-link-suggestions">
        <option *ngFor="let path of linkSuggestions" [value]="path"></option>
      </datalist>
    </div>
  `,
  styles: [`
    .dc-guided-editor { display: flex; flex-direction: column; gap: 14px; }
    .dc-guided-header h5 { align-items: center; color: var(--dc-text, #1f2937); display: flex; font-size: 0.95rem; font-weight: 600; gap: 8px; margin: 0 0 4px; }
    .dc-guided-header h5 i { color: var(--dc-text-subtle, #6b7280); }
    .dc-guided-header p { color: var(--dc-text-subtle, #6b7280); font-size: 12px; margin: 0; }
    .dc-form-help-warning { color: var(--dc-warning, #d97706) !important; }
    .dc-choice-cards { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .dc-choice-card { align-items: flex-start; border: 1px solid var(--dc-border, #e5e7eb); border-radius: 6px; cursor: pointer; display: flex; font-weight: normal; gap: 10px; margin: 0; padding: 10px 12px; }
    .dc-choice-card.active { background: var(--dc-accent-soft, #eff6ff); border-color: var(--dc-accent, #2563eb); }
    .dc-choice-card input { margin-top: 3px; }
    .dc-choice-card span { display: flex; flex-direction: column; gap: 2px; }
    .dc-choice-card small { color: var(--dc-text-subtle, #6b7280); font-size: 12px; }
    .dc-levels-title { font-size: 0.85rem; font-weight: 600; margin: 4px 0 2px; }
    .dc-level-list { display: flex; flex-direction: column; gap: 8px; list-style: none; margin: 8px 0; padding: 0; }
    .dc-level { align-items: flex-start; border: 1px solid var(--dc-border, #e5e7eb); border-radius: 6px; display: grid; gap: 12px; grid-template-columns: auto minmax(0, 1fr) auto; padding: 10px 12px; }
    .dc-level-number { align-items: center; background: var(--dc-accent-soft, #eff6ff); border-radius: 999px; color: var(--dc-accent, #2563eb); display: flex; font-weight: 600; height: 26px; justify-content: center; width: 26px; }
    .dc-level-fields { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .dc-level-advanced { grid-column: 1 / -1; font-size: 12px; }
    .dc-level-advanced summary { color: var(--dc-text-subtle, #6b7280); cursor: pointer; }
    .dc-form-group { display: flex; flex-direction: column; }
    .dc-form-label { color: var(--dc-text-muted, #4b5563); font-size: 0.85rem; font-weight: 600; margin-bottom: 4px; }
    .dc-form-help { color: var(--dc-text-subtle, #6b7280); font-size: 12px; margin-top: 3px; }
    .dc-form-help-error { color: var(--dc-danger, #b91c1c); font-size: 12px; grid-column: 1 / -1; }
    .dc-mono { font-family: "SFMono-Regular", "Consolas", "Liberation Mono", "Menlo", monospace; font-size: 12px; }
    .dc-row-actions { display: flex; gap: 4px; }
    .dc-empty-inline { color: var(--dc-text-subtle, #6b7280); font-size: 12px; font-style: italic; }
    @media (max-width: 991px) { .dc-choice-cards, .dc-level-fields { grid-template-columns: 1fr; } }
  `],
  standalone: false
})
export class GroupingEditorComponent implements OnChanges {
  @Input() formatRules: DashboardFormatRules = {};
  @Input() targetKind: 'workflow' | 'view' = 'view';
  @Input() recordTypes: string[] = [];
  @Input() fields: DashboardFieldInfo[] = [];
  @Output() formatRulesChange = new EventEmitter<DashboardFormatRules>();

  groupBy: GroupBy = '';
  levels: GroupLevel[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['formatRules']) {
      this.formatRules = this.formatRules ?? {};
      const groupBy = this.formatRules.groupBy;
      this.groupBy = groupBy === 'groupedByRecordType' || groupBy === 'groupedByRelationships' ? groupBy : '';
      const raw = Array.isArray(this.formatRules.sortGroupBy) ? [...this.formatRules.sortGroupBy] : [];
      raw.sort((a, b) => Number(a?.['rowLevel'] ?? 0) - Number(b?.['rowLevel'] ?? 0));
      this.levels = raw.map((level) => {
        const { rowLevel, compareFieldValue, compareField, relatedTo, ...extra } = (level ?? {}) as Record<string, unknown>;
        return {
          compareFieldValue: String(compareFieldValue ?? ''),
          compareField: String(compareField ?? ''),
          relatedTo: String(relatedTo ?? ''),
          extra
        };
      });
    }
  }

  recordTypeOptions(level: GroupLevel): string[] {
    const options = [...this.recordTypes];
    if (level.compareFieldValue && !options.includes(level.compareFieldValue)) {
      options.push(level.compareFieldValue);
    }
    return options;
  }

  get linkSuggestions(): string[] {
    const fromSchema = (this.fields ?? []).filter((f) => f.path.endsWith('.oid')).map((f) => `metadata.${f.path}`);
    const fromTypes = this.levels.map((l) => l.compareFieldValue).filter((t) => !!t).map((t) => `metadata.metadata.${t}.oid`);
    return Array.from(new Set([...fromTypes, ...fromSchema]));
  }

  levelProblems(level: GroupLevel, index: number): string[] {
    const problems: string[] = [];
    if (!level.compareFieldValue) {
      problems.push('Choose a record type.');
    }
    if (this.groupBy === 'groupedByRelationships' && index > 0 && !level.relatedTo.trim()) {
      problems.push('Choose the field that links these records to the level above.');
    }
    return problems;
  }

  onGroupByChange(): void {
    if (this.groupBy === 'groupedByRelationships') {
      this.levels.forEach((level, i) => {
        level.compareField = level.compareField || RECORD_TYPE_FIELD;
        if (i === 0) {
          level.relatedTo = '';
        }
      });
    }
    this.emit();
  }

  add(): void {
    const used = new Set(this.levels.map((l) => l.compareFieldValue));
    const next = this.recordTypes.find((t) => !used.has(t)) ?? '';
    const previous = this.levels[this.levels.length - 1];
    this.levels.push({
      compareFieldValue: next,
      compareField: this.groupBy === 'groupedByRelationships' ? RECORD_TYPE_FIELD : '',
      relatedTo: this.groupBy === 'groupedByRelationships' && previous?.compareFieldValue ? `metadata.metadata.${previous.compareFieldValue}.oid` : '',
      extra: {}
    });
    this.emit();
  }

  remove(index: number): void {
    this.levels.splice(index, 1);
    this.emit();
  }

  move(index: number, delta: number): void {
    const [level] = this.levels.splice(index, 1);
    this.levels.splice(index + delta, 0, level);
    this.emit();
  }

  emit(): void {
    if (this.groupBy) {
      this.formatRules.groupBy = this.groupBy;
    } else {
      delete this.formatRules.groupBy;
    }
    if (this.levels.length) {
      this.formatRules.sortGroupBy = this.levels.map((level, rowLevel) => {
        const result: Record<string, unknown> = { ...level.extra, rowLevel, compareFieldValue: level.compareFieldValue };
        if (this.groupBy === 'groupedByRelationships') {
          result['compareField'] = level.compareField || RECORD_TYPE_FIELD;
          result['relatedTo'] = rowLevel === 0 ? '' : level.relatedTo.trim();
        } else {
          if (level.compareField) result['compareField'] = level.compareField;
          if (level.relatedTo) result['relatedTo'] = level.relatedTo;
        }
        return result;
      });
    } else {
      delete this.formatRules.sortGroupBy;
    }
    this.formatRulesChange.emit(this.formatRules);
  }
}
