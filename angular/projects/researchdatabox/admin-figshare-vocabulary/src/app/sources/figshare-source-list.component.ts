import { Component, EventEmitter, Input, Output, inject, ChangeDetectionStrategy } from '@angular/core';
import { AdminDateService } from '@researchdatabox/portal-ng-common';

import { FigshareSourceSummary } from '../services/figshare-vocabulary-api.service';

@Component({
  selector: 'figshare-source-list',
  templateUrl: './figshare-source-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class FigshareSourceListComponent {
  readonly adminDates = inject(AdminDateService);
  @Input() sources: FigshareSourceSummary[] = [];
  @Input() total = 0;
  @Input() scopeFilter: '' | 'public' | 'account' = '';
  @Input() loading = false;
  @Input() busySourceId = '';

  search = '';
  @Output() addRequested = new EventEmitter<void>();
  get filteredItems() {
    const q = this.search.trim().toLowerCase();
    return this.sources.filter(item => (!this.scopeFilter || item.scope === this.scopeFilter) && `${item.displayName} ${item.taxonomyId}`.toLowerCase().includes(q));
  }

  @Output() scopeFilterChanged = new EventEmitter<'' | 'public' | 'account'>();
  @Output() editRequested = new EventEmitter<FigshareSourceSummary>();
  @Output() resyncRequested = new EventEmitter<FigshareSourceSummary>();
  @Output() cloneRequested = new EventEmitter<FigshareSourceSummary>();
  @Output() historyRequested = new EventEmitter<FigshareSourceSummary>();

  onScopeFilter(value: string): void {
    const scope = value === 'public' || value === 'account' ? value : '';
    this.scopeFilterChanged.emit(scope);
  }

  formatDate(value?: string | null): string {
    return this.adminDates.format(value);
  }

  isBusy(source: FigshareSourceSummary): boolean {
    return !!this.busySourceId && this.busySourceId === source.id;
  }

  scopeLabelKey(scope: string): string {
    return scope === 'account' ? 'figshare-vocab-scope-account' : 'figshare-vocab-scope-public';
  }
}
