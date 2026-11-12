import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Inject, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { A11yModule } from '@angular/cdk/a11y';
import { AdminModalDirective, I18NextPipe } from '@researchdatabox/portal-ng-common';
import type { NamedQueryPromotionDraft, SavedExplorerQuerySummary } from '@researchdatabox/sails-ng-common';
import { NamedQueryApiService } from './named-query-api.service';

export interface SavedQueryChoice {
  summary: SavedExplorerQuerySummary;
  prepared: NamedQueryPromotionDraft;
}
@Component({
  selector: 'nq-saved-query-chooser',
  imports: [CommonModule, FormsModule, A11yModule, AdminModalDirective, I18NextPipe],
  templateUrl: './saved-query-chooser.component.html',
  styleUrls: ['./saved-query-chooser.component.scss'],
})
export class SavedQueryChooserComponent implements OnInit, OnDestroy {
  @Input() replacing = false;
  @Input() selectedId = '';
  @Output() closed = new EventEmitter<void>();
  @Output() chosen = new EventEmitter<SavedQueryChoice>();
  @Output() database = new EventEmitter<void>();
  start: 'saved' | 'graphql' | 'database' = 'saved';
  search = '';
  mode: '' | 'visual' | 'graphql' = '';
  rows: SavedExplorerQuerySummary[] = [];
  next: string | null = null;
  selected: SavedExplorerQuerySummary | null = null;
  loading = false;
  busy = false;
  error = '';
  private sequence = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(@Inject(NamedQueryApiService) public api: NamedQueryApiService) {}
  ngOnInit(): void {
    void this.load();
  }
  ngOnDestroy(): void {
    ++this.sequence;
    if (this.timer) clearTimeout(this.timer);
  }
  filtersChanged(): void {
    if (this.timer) clearTimeout(this.timer);
    ++this.sequence;
    this.selected = null;
    this.next = null;
    this.loading = true;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.load();
    }, 250);
  }
  async load(more = false, retainError = false): Promise<void> {
    const sequence = ++this.sequence;
    this.loading = true;
    if (!retainError) this.error = '';
    if (!more) {
      this.rows = [];
      this.selected = null;
      this.next = null;
    }
    try {
      const page = await this.api.savedQueries({
        ...(this.search.trim() ? { q: this.search.trim() } : {}),
        ...(this.mode ? { mode: this.mode } : {}),
        ...(more && this.next ? { after: this.next } : {}),
      });
      if (sequence !== this.sequence) return;
      this.rows = more ? [...this.rows, ...page.grids] : page.grids;
      this.next = page.next;
      if (this.selectedId && !more) this.selected = this.rows.find(row => row.id === this.selectedId) ?? null;
    } catch {
      if (sequence === this.sequence) this.error = 'nq-ux-chooser-load-error';
    } finally {
      if (sequence === this.sequence) this.loading = false;
    }
  }
  async continue(): Promise<void> {
    if (this.busy || this.loading) return;
    if (this.start === 'database') {
      this.database.emit();
      return;
    }
    if (this.start === 'graphql') {
      window.location.assign(this.api.brandingAndPortalUrl + '/admin/data-grids#new=graphql');
      return;
    }
    const summary = this.selected;
    if (!summary) return;
    this.busy = true;
    this.error = '';
    const sequence = ++this.sequence;
    try {
      const prepared = await this.api.fromSavedQuery(summary.id, summary.revision);
      if (sequence === this.sequence) this.chosen.emit({ summary, prepared });
    } catch (error) {
      if (sequence !== this.sequence) return;
      const status = (error as { status?: number }).status;
      this.error =
        status === 409
          ? 'nq-ux-source-conflict'
          : status === 404
            ? 'nq-ux-source-gone'
            : status === 403
              ? 'nq-ux-source-denied'
              : 'nq-ux-prepare-error';
      if (status === 409 || status === 404) {
        this.selectedId = '';
        await this.load(false, true);
      }
    } finally {
      this.busy = false;
    }
  }
  close(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.busy) this.closed.emit();
  }
}
