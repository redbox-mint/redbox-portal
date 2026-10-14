import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  FigshareDiffRow,
  FigsharePagedPreview,
  FigshareProposalRow
} from '../services/figshare-vocabulary-api.service';

export interface PreviewFilterState {
  view: 'proposals' | 'diff';
  q: string;
  changeClass: string;
  unresolvedOnly: boolean;
  historicalOnly: boolean;
  offset: number;
}

/**
 * Paged review of a synchronisation preview. Nothing stored changes until the
 * administrator confirms Apply; exact-code and identity proposals arrive preselected
 * while label suggestions are visible but never pre-approved.
 */
@Component({
  selector: 'figshare-sync-preview',
  templateUrl: './figshare-sync-preview.component.html',
  standalone: false
})
export class FigshareSyncPreviewComponent {
  @Input() preview: FigsharePagedPreview | null = null;
  @Input() loading = false;
  @Input() applying = false;
  @Input() errorMessage = '';
  @Input() filters: PreviewFilterState = {
    view: 'proposals',
    q: '',
    changeClass: '',
    unresolvedOnly: false,
    historicalOnly: false,
    offset: 0
  };
  /** Proposal ids the reviewer has approved. */
  @Input() approvedProposalIds: string[] = [];

  @Output() filtersChanged = new EventEmitter<PreviewFilterState>();
  @Output() proposalToggled = new EventEmitter<{ proposalId: string; approved: boolean }>();
  @Output() applyRequested = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  public confirming = false;

  get proposals(): FigshareProposalRow[] {
    if (!this.preview || this.preview.page.view !== 'proposals') {
      return [];
    }
    return this.preview.page.records as FigshareProposalRow[];
  }

  get diffRows(): FigshareDiffRow[] {
    if (!this.preview || this.preview.page.view !== 'diff') {
      return [];
    }
    return this.preview.page.records as FigshareDiffRow[];
  }

  get approvedCount(): number {
    return this.approvedProposalIds.length;
  }

  isApproved(proposalId: string): boolean {
    return this.approvedProposalIds.includes(proposalId);
  }

  toggle(proposalId: string, approved: boolean): void {
    this.proposalToggled.emit({ proposalId, approved });
  }

  update(patch: Partial<PreviewFilterState>): void {
    this.filtersChanged.emit({ ...this.filters, offset: 0, ...patch });
  }

  changePage(offset: number): void {
    this.filtersChanged.emit({ ...this.filters, offset: Math.max(0, offset) });
  }

  get canGoPrevious(): boolean {
    return (this.preview?.page.offset ?? 0) > 0;
  }

  get canGoNext(): boolean {
    if (!this.preview) {
      return false;
    }
    return this.preview.page.offset + this.preview.page.limit < this.preview.page.total;
  }

  requestApply(): void {
    this.confirming = true;
  }

  cancelApply(): void {
    this.confirming = false;
  }

  confirmApply(): void {
    this.confirming = false;
    this.applyRequested.emit();
  }
}
