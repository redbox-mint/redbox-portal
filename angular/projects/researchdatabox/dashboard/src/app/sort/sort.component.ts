import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'sort',
  templateUrl: './sort.component.html',
  styleUrls: ['./sort.component.scss']
})
export class SortComponent {

  @Input() sort: string | undefined | null = '';
  @Input() title: string | undefined = '';
  @Input() step: string | undefined  = '';
  @Input() variable: string | undefined  = '';
  @Output() sortChanged = new EventEmitter();

  sortClicked() {
    if (this.sort != null) {
      if (this.sort == "asc") {
        this.sort = "desc";
      } else {
        this.sort = "asc";
      }
    } else {
      this.sort = "asc";
    }
    this.sortChanged.emit({title:this.title, variable:this.variable, sort:this.sort, step:this.step});
    return false;
  }
}
