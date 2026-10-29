import type {
  ContextSchemaField,
  EditorDiagnostic,
  SchemaTarget,
  NamedQuerySchemaSelection,
} from '@researchdatabox/sails-ng-common';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { NamedQueryDefinition } from '../named-query-api.service';

export type NqDetailTab = 'basics' | 'mongo' | 'params' | 'mappings' | 'sort';

@Component({
  selector: 'nq-detail',
  templateUrl: './nq-detail.component.html',
  styleUrls: ['./nq-detail.component.scss'],
  standalone: false,
})
export class NqDetailComponent {
  @Input() draft!: NamedQueryDefinition;
  @Input() isNew = false;
  @Input() collections: string[] = [];

  @Input() fields: ContextSchemaField[] = [];
  @Input() mappingFields: ContextSchemaField[] = [];
  @Input() foreignFields: Record<string, ContextSchemaField[]> = {};
  @Input() relatedGuidance: Record<string, NamedQuerySchemaSelection> = {};
  @Input() targets: SchemaTarget[] = [];
  @Input() diagnostics: EditorDiagnostic[] = [];
  @Output() draftChange = new EventEmitter<void>();
  @Output() collectionChange = new EventEmitter<void>();
  @Output() foreignContextChange = new EventEmitter<{
    index: number;
    collectionName: string;
    selection?: NamedQuerySchemaSelection;
  }>();
  @Output() validityChange = new EventEmitter<boolean>();
  private invalidSections = new Set<string>();
  validity(section: string, valid: boolean): void {
    if (valid) this.invalidSections.delete(section);
    else this.invalidSections.add(section);
    this.validityChange.emit(this.invalidSections.size === 0);
  }

  activeTab: NqDetailTab = 'basics';

  /**
   * Configured collections, plus the draft's current collection if it isn't in the
   * configured list (so legacy queries with an unlisted collection remain editable).
   */
  get collectionOptions(): string[] {
    const options = [...this.collections];
    const current = this.draft?.collectionName;
    if (current && !options.includes(current)) {
      options.unshift(current);
    }
    return options;
  }

  setTab(tab: NqDetailTab): void {
    this.activeTab = tab;
  }

  get paramCount(): number {
    return this.draft?.queryParams ? Object.keys(this.draft.queryParams).length : 0;
  }

  get mappingCount(): number {
    return this.draft?.resultObjectMapping ? Object.keys(this.draft.resultObjectMapping).length : 0;
  }

  get mongoKeyCount(): number {
    return this.draft?.mongoQuery ? Object.keys(this.draft.mongoQuery).length : 0;
  }

  get sortCount(): number {
    return this.draft?.sort?.length ?? 0;
  }

  get filterCount(): number {
    return this.draft?.relatedRecordFilters?.length ?? 0;
  }
}
