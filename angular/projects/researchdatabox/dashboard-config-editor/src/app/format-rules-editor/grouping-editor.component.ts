import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { TranslationService } from '@researchdatabox/portal-ng-common';
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
        <h4><i class="fa fa-object-group" aria-hidden="true"></i> {{ 'admin-dashboard-grouping-title' | i18next }}</h4>
        @if (targetKind === 'view') {
          <p>{{ 'admin-dashboard-grouping-view-help' | i18next }}</p>
        }
        @if (targetKind === 'workflow') {
          <p class="dc-form-help-warning">{{ 'admin-dashboard-grouping-workflow-help' | i18next }}</p>
        }
      </header>

      <div class="dc-choice-cards" role="radiogroup" [attr.aria-label]="'admin-dashboard-grouping-title' | i18next">
        <label class="dc-choice-card" [class.active]="groupBy === ''">
          <input type="radio" [name]="id + '-by'" value="" [(ngModel)]="groupBy" (ngModelChange)="onGroupByChange()" />
          <span
            ><strong>{{ 'admin-dashboard-grouping-none' | i18next }}</strong
            ><small>{{ 'admin-dashboard-grouping-none-help' | i18next }}</small></span
          >
        </label>
        <label class="dc-choice-card" [class.active]="groupBy === 'groupedByRecordType'">
          <input
            type="radio"
            [name]="id + '-by'"
            value="groupedByRecordType"
            [(ngModel)]="groupBy"
            (ngModelChange)="onGroupByChange()"
          />
          <span
            ><strong>{{ 'admin-dashboard-grouping-type' | i18next }}</strong
            ><small>{{ 'admin-dashboard-grouping-type-help' | i18next }}</small></span
          >
        </label>
        <label class="dc-choice-card" [class.active]="groupBy === 'groupedByRelationships'">
          <input
            type="radio"
            [name]="id + '-by'"
            value="groupedByRelationships"
            [(ngModel)]="groupBy"
            (ngModelChange)="onGroupByChange()"
          />
          <span
            ><strong>{{ 'admin-dashboard-grouping-related' | i18next }}</strong
            ><small>{{ 'admin-dashboard-grouping-related-help' | i18next }}</small></span
          >
        </label>
      </div>

      @if (groupBy) {
        <section class="dc-levels">
          <h5 class="dc-levels-title">{{ 'admin-dashboard-group-levels' | i18next }}</h5>
          <p class="dc-form-help">
            {{
              (groupBy === 'groupedByRecordType'
                ? 'admin-dashboard-group-type-levels-help'
                : 'admin-dashboard-group-related-levels-help'
              ) | i18next
            }}
          </p>
          <ol class="dc-level-list">
            @for (level of levels; track level; let i = $index; let last = $last) {
              <li class="dc-level">
                <div class="dc-level-number">{{ i + 1 }}</div>
                <div class="dc-level-fields">
                  <div class="dc-form-group">
                    <label class="dc-form-label" [attr.for]="id + '-level-type-' + i">{{
                      'admin-dashboard-record-type' | i18next
                    }}</label>
                    <select
                      class="form-select"
                      [id]="id + '-level-type-' + i"
                      [(ngModel)]="level.compareFieldValue"
                      (ngModelChange)="emit()"
                    >
                      <option value="" disabled>{{ 'admin-dashboard-choose-record-type' | i18next }}</option>
                      @for (type of recordTypeOptions(level); track type) {
                        <option [value]="type">{{ type }}</option>
                      }
                    </select>
                  </div>
                  @if (groupBy === 'groupedByRelationships') {
                    @if (i > 0) {
                      <div class="dc-form-group">
                        <label class="dc-form-label" [attr.for]="id + '-level-related-' + i">{{
                          'admin-dashboard-group-link' | i18next
                        }}</label>
                        <input
                          class="form-control dc-mono"
                          [id]="id + '-level-related-' + i"
                          [attr.list]="id + '-links'"
                          [(ngModel)]="level.relatedTo"
                          (ngModelChange)="emit()"
                          [placeholder]="'metadata.metadata.' + (levels[i - 1].compareFieldValue || 'parent') + '.oid'"
                        />
                        <small class="dc-form-help">{{ 'admin-dashboard-group-link-help' | i18next }}</small>
                      </div>
                    }
                    <details class="dc-level-advanced">
                      <summary>{{ 'admin-dashboard-advanced' | i18next }}</summary>
                      <div class="dc-form-group">
                        <label class="dc-form-label" [attr.for]="id + '-level-field-' + i">{{
                          'admin-dashboard-group-type-field' | i18next
                        }}</label>
                        <input
                          class="form-control dc-mono"
                          [id]="id + '-level-field-' + i"
                          [(ngModel)]="level.compareField"
                          (ngModelChange)="emit()"
                        />
                      </div>
                    </details>
                  }
                  @for (problem of levelProblems(level, i); track problem) {
                    <small class="dc-form-help-error">{{ problem }}</small>
                  }
                </div>
                <div class="dc-row-actions">
                  <button
                    type="button"
                    class="btn btn-outline-secondary btn-sm rb-admin-row-action"
                    (click)="move(i, -1)"
                    [disabled]="i === 0"
                    [attr.aria-label]="'admin-dashboard-move-level-up' | i18next"
                  >
                    <i class="fa fa-arrow-up" aria-hidden="true"></i>
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-secondary btn-sm rb-admin-row-action"
                    (click)="move(i, 1)"
                    [disabled]="last"
                    [attr.aria-label]="'admin-dashboard-move-level-down' | i18next"
                  >
                    <i class="fa fa-arrow-down" aria-hidden="true"></i>
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-secondary btn-sm rb-admin-row-action"
                    (click)="remove(i)"
                    [attr.aria-label]="'admin-dashboard-remove-level' | i18next"
                  >
                    <i class="fa fa-times" aria-hidden="true"></i>
                  </button>
                </div>
              </li>
            }
          </ol>
          @if (levels.length === 0) {
            <div class="dc-empty-inline">{{ 'admin-dashboard-no-group-levels' | i18next }}</div>
          }
          <button type="button" class="btn btn-outline-secondary btn-sm" (click)="add()">
            <i class="fa fa-plus" aria-hidden="true"></i> {{ 'admin-dashboard-add-level' | i18next }}
          </button>
        </section>
      }

      <datalist [id]="id + '-links'">
        @for (path of linkSuggestions; track path) {
          <option [value]="path"></option>
        }
      </datalist>
    </div>
  `,
  standalone: false,
})
export class GroupingEditorComponent implements OnChanges {
  constructor(private translation: TranslationService) {}
  static nextId = 0;
  readonly id = `dc-grouping-${++GroupingEditorComponent.nextId}`;
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
      this.levels = raw.map(level => {
        const { rowLevel, compareFieldValue, compareField, relatedTo, ...extra } = (level ?? {}) as Record<
          string,
          unknown
        >;
        return {
          compareFieldValue: String(compareFieldValue ?? ''),
          compareField: String(compareField ?? ''),
          relatedTo: String(relatedTo ?? ''),
          extra,
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
    const fromSchema = (this.fields ?? []).filter(f => f.path.endsWith('.oid')).map(f => `metadata.${f.path}`);
    const fromTypes = this.levels
      .map(l => l.compareFieldValue)
      .filter(t => !!t)
      .map(t => `metadata.metadata.${t}.oid`);
    return Array.from(new Set([...fromTypes, ...fromSchema]));
  }

  levelProblems(level: GroupLevel, index: number): string[] {
    const problems: string[] = [];
    if (!level.compareFieldValue) {
      problems.push(this.translation.t('admin-dashboard-group-type-required'));
    }
    if (this.groupBy === 'groupedByRelationships' && index > 0 && !level.relatedTo.trim()) {
      problems.push(this.translation.t('admin-dashboard-group-link-required'));
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
    const used = new Set(this.levels.map(l => l.compareFieldValue));
    const next = this.recordTypes.find(t => !used.has(t)) ?? '';
    const previous = this.levels[this.levels.length - 1];
    this.levels.push({
      compareFieldValue: next,
      compareField: this.groupBy === 'groupedByRelationships' ? RECORD_TYPE_FIELD : '',
      relatedTo:
        this.groupBy === 'groupedByRelationships' && previous?.compareFieldValue
          ? `metadata.metadata.${previous.compareFieldValue}.oid`
          : '',
      extra: {},
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
        const result: Record<string, unknown> = {
          ...level.extra,
          rowLevel,
          compareFieldValue: level.compareFieldValue,
        };
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
