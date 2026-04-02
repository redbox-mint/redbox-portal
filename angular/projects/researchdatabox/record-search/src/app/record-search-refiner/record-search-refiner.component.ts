import { Component, Input, Output, EventEmitter } from '@angular/core';
import { isEmpty as _isEmpty } from 'lodash-es';
import { RecordSearchRefiner } from '../search-models';

@Component({
  selector: 'record-search-refiner',
  templateUrl: './record-search-refiner.component.html',
  standalone: false,
})
export class RecordSearchRefinerComponent {
  @Input() refinerConfig!: RecordSearchRefiner;
  @Input() isSearching: boolean = false;
  @Output() onApplyFilter: EventEmitter<RecordSearchRefiner> = new EventEmitter<RecordSearchRefiner>();

  applyFilter(event: Event, refinerValue: any = null): void {
    event.preventDefault();
    if (this.isSearching || !this.hasValue()) {
      return;
    }
    this.refinerConfig.activeValue = refinerValue;
    this.onApplyFilter.emit(this.refinerConfig);
  }

  hasValue(): boolean {
    return !_isEmpty(this.refinerConfig.value);
  }
}
