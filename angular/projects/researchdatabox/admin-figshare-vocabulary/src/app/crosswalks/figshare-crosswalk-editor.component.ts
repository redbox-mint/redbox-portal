import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  FigshareCrosswalkMapping,
  FigshareCrosswalkSummary
} from '../services/figshare-vocabulary-api.service';

export interface MappingSearchState {
  q: string;
  status: string;
  offset: number;
}

export interface MappingChangeRequest {
  op: 'add' | 'remove';
  localEntryId: string;
  figshareCategoryId: string;
}

/**
 * Server-paged, many-to-many mapping editor. Publishing stays on the approved
 * revision until the working revision is explicitly approved.
 */
@Component({
  selector: 'figshare-crosswalk-editor',
  templateUrl: './figshare-crosswalk-editor.component.html',
  standalone: false
})
export class FigshareCrosswalkEditorComponent {
  @Input() crosswalk: FigshareCrosswalkSummary | null = null;
  @Input() mappings: FigshareCrosswalkMapping[] = [];
  @Input() total = 0;
  @Input() pageSize = 50;
  @Input() search: MappingSearchState = { q: '', status: '', offset: 0 };
  @Input() usage: Array<{ brandName: string; configKey: string; resolutionMode: string }> = [];
  @Input() loading = false;
  @Input() saving = false;
  @Input() errorMessage = '';
  @Input() statusMessage = '';

  @Output() searchChanged = new EventEmitter<MappingSearchState>();
  @Output() mappingRemoved = new EventEmitter<MappingChangeRequest>();
  @Output() approveRequested = new EventEmitter<number>();
  @Output() closed = new EventEmitter<void>();

  public confirmingApproval = false;

  get approvedRevisionLabel(): string {
    return this.crosswalk?.approvedRevision == null ? '—' : String(this.crosswalk.approvedRevision);
  }

  get canApprove(): boolean {
    return !!this.crosswalk && !this.saving && this.mappings.length > 0;
  }

  get canGoPrevious(): boolean {
    return this.search.offset > 0;
  }

  get canGoNext(): boolean {
    return this.search.offset + this.pageSize < this.total;
  }

  update(patch: Partial<MappingSearchState>): void {
    this.searchChanged.emit({ ...this.search, offset: 0, ...patch });
  }

  changePage(offset: number): void {
    this.searchChanged.emit({ ...this.search, offset: Math.max(0, offset) });
  }

  removeMapping(mapping: FigshareCrosswalkMapping): void {
    this.mappingRemoved.emit({
      op: 'remove',
      localEntryId: mapping.localEntryId,
      figshareCategoryId: mapping.figshareCategoryId
    });
  }

  requestApproval(): void {
    this.confirmingApproval = true;
  }

  cancelApproval(): void {
    this.confirmingApproval = false;
  }

  confirmApproval(): void {
    this.confirmingApproval = false;
    if (this.crosswalk) {
      this.approveRequested.emit(this.crosswalk.workingRevision);
    }
  }
}
