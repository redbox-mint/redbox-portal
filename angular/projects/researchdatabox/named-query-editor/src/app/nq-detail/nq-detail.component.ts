import { Component, Input } from '@angular/core';
import { NamedQueryDefinition } from '../named-query-api.service';

export type NqDetailTab = 'basics' | 'mongo' | 'params' | 'mappings' | 'sort';

@Component({
  selector: 'nq-detail',
  templateUrl: './nq-detail.component.html',
  styleUrls: ['./nq-detail.component.scss'],
  standalone: false
})
export class NqDetailComponent {
  @Input() draft!: NamedQueryDefinition;
  @Input() isNew = false;

  activeTab: NqDetailTab = 'basics';

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
