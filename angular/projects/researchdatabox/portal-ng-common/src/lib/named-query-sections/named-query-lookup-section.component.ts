import { Component, EventEmitter, Input, Output, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { GraphqlNamedQueryMappings } from '@researchdatabox/sails-ng-common';
import { I18NextPipe } from '../i18next.pipe';
import { NamedQueryResultField } from './named-query-sections.model';

@Component({
  selector: 'rb-named-query-lookup-fields',
  imports: [FormsModule, I18NextPipe],
  styleUrls: ['./named-query-sections.scss'],
  template: ` <section class="rb-admin-form-section" aria-labelledby="nq-lookup-title">
    <header class="rb-admin-form-section-header">
      <div>
        <h3 [attr.aria-level]="headingLevel" id="nq-lookup-title">{{ 'nq-section-lookup-fields' | i18next }}</h3>
        <p>{{ 'nq-section-lookup-help' | i18next }}</p>
      </div>
    </header>
    <div class="rb-admin-form-section-body">
      <div class="rb-admin-form-grid">
        @for (target of targets; track target) {
          <label class="rb-admin-field"
            >{{ 'nq-section-mapping-' + target | i18next }}
            <select
              class="form-select"
              [ngModel]="pathKey(mappings[target])"
              (ngModelChange)="select(target, $event)"
              [disabled]="disabled"
            >
              <option value="">{{ 'nq-section-none' | i18next }}</option>
              @if (unknown(mappings[target])) {
                <option [value]="pathKey(mappings[target])">{{ 'data-grids-unavailable-field' | i18next }}</option>
              }
              @for (field of choices(target); track pathKey(field.path)) {
                <option [value]="pathKey(field.path)">{{ field.label }}</option>
              }
            </select>
          </label>
        }
      </div>
      <details class="mt-3">
        <summary>{{ 'nq-section-advanced-paths' | i18next }}</summary>
        <label class="rb-admin-field mt-2"
          >{{ 'nq-section-raw-mappings' | i18next }}
          <textarea
            class="form-control"
            rows="5"
            spellcheck="false"
            [ngModel]="rawMappings"
            (ngModelChange)="setRaw($event)"
            [disabled]="disabled"
          ></textarea>
        </label>
        @if (invalid) {
          <p class="text-danger" role="alert">{{ 'nq-section-invalid-paths' | i18next }}</p>
        }
      </details>
    </div>
  </section>`,
})
export class NamedQueryLookupSectionComponent implements OnChanges {
  /** Page editors use level 2; publishing panels retain level 3. */
  @Input() headingLevel: 2 | 3 = 3;
  @Input() mappings: GraphqlNamedQueryMappings = {};
  @Input() fields: NamedQueryResultField[] = [];
  @Input() disabled = false;
  @Output() mappingsChange = new EventEmitter<GraphqlNamedQueryMappings>();
  @Output() validityChange = new EventEmitter<boolean>();
  readonly targets = ['oid', 'title', 'metadata'] as const;
  invalid = false;
  pathKey(path?: string[]): string {
    return path ? JSON.stringify(path) : '';
  }
  choices(target: string): NamedQueryResultField[] {
    return this.fields.filter(field =>
      target === 'metadata'
        ? ['object', 'structured'].includes(field.type ?? '')
        : !['object', 'structured'].includes(field.type ?? '')
    );
  }
  unknown(path?: string[]): boolean {
    return !!path && !this.fields.some(f => this.pathKey(f.path) === this.pathKey(path));
  }
  rawMappings = '';
  ngOnChanges(): void {
    if (!this.invalid) this.rawMappings = JSON.stringify(this.mappings, null, 2);
  }
  select(target: (typeof this.targets)[number], key: string): void {
    const mappings = { ...this.mappings };
    if (key) mappings[target] = JSON.parse(key);
    else delete mappings[target];
    this.rawMappings = JSON.stringify(mappings, null, 2);
    this.invalid = false;
    this.validityChange.emit(true);
    this.mappingsChange.emit(mappings);
  }
  setRaw(text: string): void {
    this.rawMappings = text;
    try {
      const mappings = JSON.parse(text);
      const forbidden = ['__proto__', 'prototype', 'constructor'];
      if (
        !mappings ||
        typeof mappings !== 'object' ||
        Array.isArray(mappings) ||
        Object.entries(mappings).some(
          ([key, path]) =>
            !['oid', 'title', 'metadata', 'dateCreated', 'lastSaveDate'].includes(key) ||
            !Array.isArray(path) ||
            !path.length ||
            path.some(p => typeof p !== 'string' || !p || forbidden.includes(p))
        )
      )
        throw Error();
      this.invalid = false;
      this.mappingsChange.emit(mappings);
    } catch {
      this.invalid = true;
    }
    this.validityChange.emit(!this.invalid);
  }
}
