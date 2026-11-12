import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { GraphqlNamedQueryVariable } from '@researchdatabox/sails-ng-common';
import { I18NextPipe } from '../i18next.pipe';
import { NamedQueryBindingChange, NamedQueryParameterRow } from './named-query-sections.model';

@Component({
  selector: 'rb-named-query-parameters',
  imports: [FormsModule, I18NextPipe],
  styleUrls: ['./named-query-sections.scss'],
  template: ` <section class="rb-admin-form-section" aria-labelledby="nq-parameters-title">
    <header class="rb-admin-form-section-header">
      <div>
        <h3 id="nq-parameters-title">{{ 'nq-section-parameters' | i18next }}</h3>
        <p>{{ 'nq-section-parameters-help' | i18next }}</p>
      </div>
    </header>
    <div class="table-responsive">
      <table class="table mb-0">
        <thead>
          <tr>
            <th scope="col">{{ 'nq-section-condition' | i18next }}</th>
            <th scope="col">{{ 'nq-section-saved-value' | i18next }}</th>
            <th scope="col">{{ 'nq-section-when-called' | i18next }}</th>
          </tr>
        </thead>
        <tbody>
          @for (row of visibleRows; track row.variable) {
            <tr>
              <th scope="row">{{ row.paging ? ('nq-section-paging' | i18next) : row.label }}</th>
              <td class="nq-saved-value">
                @if (row.paging) {
                  @if (row.value !== null && row.value !== undefined) {
                    {{ row.value }} {{ 'nq-section-per-page' | i18next }}
                  } @else {
                    {{ 'nq-section-default-page' | i18next }}
                  }
                } @else {
                  {{ displayValue(row) }}
                }
              </td>
              <td>
                @if (row.paging) {
                  <span>{{ 'nq-section-paging-managed' | i18next }}</span>
                } @else {
                  <select
                    class="form-select"
                    [attr.aria-label]="row.label + ': ' + ('nq-section-when-called' | i18next)"
                    [ngModel]="row.binding?.ownership || 'omitted'"
                    (ngModelChange)="classify(row, $event)"
                    [disabled]="disabled"
                  >
                    <option value="fixed">{{ 'nq-section-keep-value' | i18next }}</option>
                    @if (row.consumerAllowed) {
                      <option value="consumer">{{ 'nq-section-caller-provides' | i18next }}</option>
                    }
                    <option value="omitted">{{ 'nq-section-leave-out' | i18next }}</option>
                  </select>
                  @if (row.binding?.ownership === 'consumer') {
                    <label class="rb-admin-field mt-2"
                      >{{ 'nq-section-parameter-name' | i18next }}
                      <input
                        class="form-control"
                        [ngModel]="parameter(row)"
                        (ngModelChange)="rename(row, $event)"
                        [disabled]="disabled"
                      />
                    </label>
                  }
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  </section>`,
})
export class NamedQueryParametersSectionComponent {
  @Input() rows: NamedQueryParameterRow[] = [];
  @Input() disabled = false;
  @Output() bindingChange = new EventEmitter<NamedQueryBindingChange>();
  get visibleRows(): NamedQueryParameterRow[] {
    const page =
      this.rows.find(row => row.paging && typeof row.value === 'number') ?? this.rows.find(row => row.paging);
    return this.rows.filter(row => !row.paging || row === page);
  }
  displayValue(row: NamedQueryParameterRow): string {
    return (
      row.displayValue ??
      (row.value === undefined ? '—' : typeof row.value === 'string' ? row.value : JSON.stringify(row.value))
    );
  }
  parameter(row: NamedQueryParameterRow): string {
    return row.binding?.ownership === 'consumer' ? row.binding.parameter : '';
  }
  classify(row: NamedQueryParameterRow, ownership: 'fixed' | 'consumer' | 'omitted'): void {
    if (row.paging || (ownership === 'consumer' && !row.consumerAllowed)) return;
    const binding: GraphqlNamedQueryVariable =
      ownership === 'fixed'
        ? { ownership, value: row.value ?? null }
        : ownership === 'consumer'
          ? { ownership, parameter: row.variable, inputType: row.inputType, required: row.inputType.endsWith('!') }
          : { ownership: 'omitted' };
    this.bindingChange.emit({ variable: row.variable, binding });
  }
  rename(row: NamedQueryParameterRow, parameter: string): void {
    if (row.binding?.ownership === 'consumer')
      this.bindingChange.emit({ variable: row.variable, binding: { ...row.binding, parameter } });
  }
}
