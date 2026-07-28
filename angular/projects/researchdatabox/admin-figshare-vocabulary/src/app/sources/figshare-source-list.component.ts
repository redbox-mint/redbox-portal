import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FigshareSourceSummary } from '../services/figshare-vocabulary-api.service';

@Component({
  selector: 'figshare-source-list',
  templateUrl: './figshare-source-list.component.html',
  standalone: false
})
export class FigshareSourceListComponent {
  @Input() sources: FigshareSourceSummary[] = [];
  @Input() total = 0;
  @Input() scopeFilter: '' | 'public' | 'account' = '';
  @Input() loading = false;

  @Output() scopeFilterChanged = new EventEmitter<'' | 'public' | 'account'>();
  @Output() resyncRequested = new EventEmitter<FigshareSourceSummary>();
  @Output() cloneRequested = new EventEmitter<FigshareSourceSummary>();
  @Output() historyRequested = new EventEmitter<FigshareSourceSummary>();

  onScopeFilter(value: string): void {
    const scope = value === 'public' || value === 'account' ? value : '';
    this.scopeFilterChanged.emit(scope);
  }
}
