import { Component, Inject, Input, Output, ElementRef, EventEmitter } from '@angular/core';
import { RecordSearchRefiner} from './shared/form/records.service';
import * as _ from "lodash";

@Component({
  selector: 'record-search-refiner',
  templateUrl: './record_search_refiner.html'
})
export class RecordSearchRefinerComponent {
  @Input() refinerConfig: RecordSearchRefiner;
  @Input() isSearching: boolean;
  @Output() onApplyFilter: EventEmitter<any> = new EventEmitter<any>();

  applyFilter(event:any, refinerValue:any = null) {
    event.preventDefault();
    if (this.hasValue()) {
      this.refinerConfig.activeValue = refinerValue;
      this.onApplyFilter.emit(this.refinerConfig);
    }
  }

  hasValue() {
    return !_.isEmpty(this.refinerConfig.value);
  }

}
