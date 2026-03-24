import {Component, Input, Output, EventEmitter, Inject} from '@angular/core';
import {BaseComponent} from "./base.component";
import {LoggerService} from "./logger.service";

@Component({
    selector: 'header-sort',
    templateUrl: './header-sort.component.html',
    styles: [`
      .record-table-heading-sort {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        font-weight: inherit;
        line-height: inherit;
        text-align: left;
        box-shadow: none;
      }

      .record-table-heading-sort:focus-visible {
        outline: 2px solid #0d6efd;
        outline-offset: 2px;
      }

      .record-table-heading-sort-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 0.75rem;
      }
    `],
    standalone: false
})
export class HeaderSortComponent extends BaseComponent {
  @Input() sort: string = '';
  @Input() title: string = '';
  @Input() step: string = '';
  @Input() variable: string = '';
  @Output() headerSortChanged = new EventEmitter<{title: string, variable: string, sort:string, step: string}>();

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
  ) {
    super();
    // no deps
    this.initDependencies = [];
  }

  protected override async initComponent(): Promise<void> {
  }

  headerSortClicked() {
    if (this.sort != null) {
      if (this.sort == "asc") {
        this.sort = "desc";
      } else {
        this.sort = "asc";
      }
    } else {
      this.sort = "asc";
    }
    this.headerSortChanged.emit({title: this.title, variable: this.variable, sort: this.sort, step: this.step});
    return false;
  }
}
