import { Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18NextPipe } from '@researchdatabox/portal-ng-common';
import { EmailTemplateAdminService } from './email-template-admin.service';
import type { EmailPreviewRecord } from './email-templates.model';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Search for a preview record in the current brand. The server only returns
 * records the admin can view, so this component never filters by itself.
 */
@Component({
  selector: 'email-templates-record-picker',
  standalone: true,
  imports: [FormsModule, I18NextPipe],
  templateUrl: './record-picker.component.html',
  styleUrls: ['./email-templates.shared.scss', './record-picker.component.scss'],
})
export class RecordPickerComponent implements OnDestroy {
  @Input() selected: EmailPreviewRecord | null = null;
  @Input() loadingContext = false;
  @Output() choose = new EventEmitter<EmailPreviewRecord>();

  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;

  searching = false;
  query = '';
  results: EmailPreviewRecord[] = [];
  page = 1;
  hasMore = false;
  busy = false;
  failed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private requestSeq = 0;
  private resultsQuery: string | null = null;

  get canPick(): boolean {
    return !this.busy && !this.failed && this.resultsQuery === this.query.trim();
  }

  constructor(private api: EmailTemplateAdminService) {}

  get showSearch(): boolean {
    return this.searching || !this.selected;
  }

  ngOnDestroy(): void {
    ++this.requestSeq;
    this.clearTimer();
  }

  startSearch(): void {
    this.searching = true;
    if (!this.results.length || this.resultsQuery !== this.query.trim()) {
      void this.runSearch(1);
    }
    setTimeout(() => this.searchInput?.nativeElement.focus());
  }

  cancelSearch(): void {
    this.searching = false;
    ++this.requestSeq;
    this.busy = false;
    this.clearTimer();
  }

  onQueryChange(): void {
    ++this.requestSeq; // Invalidate responses immediately, including during debounce.
    this.resultsQuery = null;
    this.busy = true;
    this.failed = false;
    this.hasMore = false;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runSearch(1);
    }, SEARCH_DEBOUNCE_MS);
  }

  ensureResults(): void {
    if (!this.results.length && !this.busy && !this.failed) {
      void this.runSearch(1);
    }
  }

  loadMore(): void {
    if (!this.canPick || !this.hasMore) return;
    void this.runSearch(this.page + 1);
  }

  pick(record: EmailPreviewRecord): void {
    if (!this.canPick || !this.results.includes(record)) return;
    this.searching = false;
    this.choose.emit(record);
  }

  async runSearch(page: number): Promise<void> {
    const seq = ++this.requestSeq;
    const query = this.query.trim();
    this.busy = true;
    this.failed = false;
    try {
      const response = await this.api.searchRecords(query, page);
      if (seq !== this.requestSeq || query !== this.query.trim()) {
        return;
      }
      this.results = page === 1 ? response.records : [...this.results, ...response.records];
      this.resultsQuery = query;
      this.page = response.page;
      this.hasMore = response.hasMore;
    } catch {
      if (seq === this.requestSeq) {
        this.failed = true;
      }
    } finally {
      if (seq === this.requestSeq) {
        this.busy = false;
      }
    }
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
