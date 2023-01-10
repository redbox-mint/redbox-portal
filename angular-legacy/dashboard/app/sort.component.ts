import { Component, Injectable, Inject, ElementRef, Input, Output, EventEmitter } from '@angular/core';
import { DOCUMENT } from '@angular/platform-browser';
import { FormArray, FormGroup, FormControl, Validators, FormBuilder } from '@angular/forms';
import { UserSimpleService } from './shared/user.service-simple';
import { DashboardService } from './shared/dashboard-service';
import { PlanTable, Plan } from './shared/dashboard-models';
import * as _ from "lodash";
import { LoadableComponent } from './shared/loadable.component';
import { OnInit } from '@angular/core';
import { PaginationModule, TooltipModule } from 'ngx-bootstrap';
import { TranslationService } from './shared/translation-service';
import { RecordsService } from './shared/form/records.service';

declare var pageData: any;
@Component({
  selector: 'sort',
  templateUrl: './sort.html'
})

@Injectable()
export class SortComponent  {

  @Input() sort: string = null;
  @Input() title: string = null;
  @Input() step: string = null;
  @Input() variable: string = null;
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
