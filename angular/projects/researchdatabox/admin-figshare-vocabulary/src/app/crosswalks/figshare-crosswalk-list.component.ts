import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FigshareCrosswalkSummary } from '../services/figshare-vocabulary-api.service';

@Component({
  selector: 'figshare-crosswalk-list',
  templateUrl: './figshare-crosswalk-list.component.html',
  standalone: false
})
export class FigshareCrosswalkListComponent {
  @Input() crosswalks: FigshareCrosswalkSummary[] = [];
  @Input() total = 0;
  @Input() statusFilter = '';
  @Input() loading = false;

  search = '';
  @Output() addRequested = new EventEmitter<void>();
  get filteredItems() {
    const q = this.search.trim().toLowerCase();
    return this.crosswalks.filter(item => (!this.statusFilter || item.status === this.statusFilter) && `${item.name} ${item.localVocabularyName} ${item.figshareSourceName}`.toLowerCase().includes(q));
  }

  @Output() statusFilterChanged = new EventEmitter<string>();
  @Output() editRequested = new EventEmitter<FigshareCrosswalkSummary>();
  @Output() deleteRequested = new EventEmitter<FigshareCrosswalkSummary>();

  public pendingDelete: FigshareCrosswalkSummary | null = null;

  requestDelete(crosswalk: FigshareCrosswalkSummary): void {
    this.pendingDelete = crosswalk;
  }

  cancelDelete(): void {
    this.pendingDelete = null;
  }

  confirmDelete(): void {
    const crosswalk = this.pendingDelete;
    this.pendingDelete = null;
    if (crosswalk) {
      this.deleteRequested.emit(crosswalk);
    }
  }
}
