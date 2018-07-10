import { Component } from '@angular/core';
import { SimpleComponent } from './field-simple.component';
import { FieldBase } from './field-base';
import { WorkspaceSelectorField } from './workspace-field.component';

import * as _ from "lodash";
@Component({
  selector: 'workspace-selector-parent',
  template: ''
})
export class WorkspaceSelectorComponent extends SimpleComponent {
  static clName = 'WorkspaceSelectorComponent';

  getLabel(val: any): string {
    const opt = _.find(this.field.options, (opt) => {
      return opt.value == val;
    });
    if (opt) {
      return opt.label;
    } else {
      return '';
    }
  }
  
}

@Component({
  selector: 'workspace-selector',
  template: `
  <div [formGroup]='form' *ngIf="field.editMode" [ngClass]="getGroupClass()">
  <label [attr.for]="field.name">
    {{field.label}} {{ getRequiredLabelStr()}}
    <button type="button" class="btn btn-default" *ngIf="field.help" (click)="toggleHelp()"><span
      class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
  </label>
  <br/>
  <span id="{{ 'helpBlock_' + field.name }}" class="help-block" *ngIf="this.helpShow" [innerHtml]="field.help"></span>
  <select [formControl]="getFormControl()" [ngClass]="field.cssClasses"
          (change)="field.loadWorkspaceDetails($event.target.value)">
    <option *ngFor="let opt of field.workspaceApps; let i = index"
     [ngValue]="opt" [selected]="i == 0"
     [value]="opt.name">{{opt.label}}
    </option>
  </select>
  <div class="text-danger"
       *ngIf="getFormControl().hasError('required') && getFormControl().touched && !field.validationMessages?.required">
    {{field.label}} is required
  </div>
  <div class="text-danger"
       *ngIf="getFormControl().hasError('required') && getFormControl().touched && field.validationMessages?.required">
    {{field.validationMessages.required}}
  </div>
  <br/><br/><br/>
  <div class="row">
    <div *ngIf="field.workspaceApp" class="panel panel-default">
      <div class="panel-heading">
        <h4 class="panel-title">{{ field.workspaceApp.name | uppercase }}</h4>
      </div>
      <div class="panel-body">
        <div class="row">
          <div class="col-md-8 col-sm-8 col-xs-8 col-lg-8">
            <h5>{{ field.workspaceApp.subtitle }}</h5>
            <p>{{ field.workspaceApp.description }}</p>
            <span *ngIf="field.rdmp">
              <button (click)="saveAndOpenWorkspace()"  class="btn btn-primary">{{ field.open }}</button>
            </span>
            <span *ngIf="!field.rdmp">
              <a disabled href="#" class="btn btn-default">{{ field.saveFirst }}</a>
            </span>
          </div>
          <div class="col-md-4 col-sm-4 col-xs-4 col-lg-4">
            <img src="{{ field.workspaceApp.logo }}" alt="{{field.workspaceApp.name}}">
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
  `,
})
export class WorkspaceSelectorFieldComponent extends WorkspaceSelectorComponent {
  field: WorkspaceSelectorField
  static clName = 'WorkspaceSelectorFieldComponent';

  ngOnInit() {
    this.field.init();
    this.field.registerEvents();
  }

  saveAndOpenWorkspace(){
    this.fieldMap._rootComp.onSubmit().subscribe(response => {
      window.location.href = `${this.field.appLink}${this.field.workspaceApp.name}/edit?rdmp=${this.field.rdmp}`;
    });
  }

}
