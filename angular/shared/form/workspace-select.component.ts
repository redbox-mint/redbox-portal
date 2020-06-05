import { Component } from '@angular/core';
import { SimpleComponent } from './field-simple.component';
import { FieldBase } from './field-base';
import { WorkspaceSelectorField } from './workspace-field.component';

import * as _ from "lodash";
@Component({
  selector: 'workspace-select-parent',
  template: ''
})
export class WorkspaceSelectComponent extends SimpleComponent {
  static clName = 'WorkspaceSelectComponent';

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
  selector: 'workspace-select',
  template: `
  <div [formGroup]='form' *ngIf="field.editMode" [ngClass]="getGroupClass()">
  <label [attr.for]="field.name">
    {{field.label}} {{ getRequiredLabelStr()}}
    <button type="button" class="btn btn-default" *ngIf="field.help" (click)="toggleHelp()" [attr.aria-label]="'help' | translate "><span
      class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
  </label>
  <br/>
  <span id="{{ 'helpBlock_' + field.name }}" class="help-block" *ngIf="this.helpShow" [innerHtml]="field.help"></span>
  <div class="row">
    <div class="card-deck">
      <div class="card service col-lg-4 col-md-5 col-sm-6 col-xs-12" *ngFor="let s of field.services" style="display: flex; flex-direction: column;width: 30rem;">
        <div class="panel panel-default">
          <div class="panel-heading">
            <h5 class="panel-title card-title" style="margin-top: 1px">
              <span *ngIf="s.displayName">{{ s.displayName }}</span>
            </h5>
          </div>
          <div class="panel-body workspaces-panel-body">
            <img style="max-height:100px;" class="card-img-top" src="{{ s.logo }}" alt="{{ s.name }}">
            <div class="card-body" style="margin-bottom: auto;">
              <h5 class="card-title" style="margin-top: 2px">
                <span *ngIf="s.title">{{ s.title }}</span>
              </h5>
              <p class="card-text">{{ s.desc }}</p>
            </div>
          </div>
          <div class="card-footer" style="margin-top: auto;">
            <a *ngIf="field.rdmp" (click)="saveAndOpenWorkspace(s.app)" class="btn btn-block btn-primary">
            {{ field.open }}
            </a>
            <a *ngIf="!field.rdmp" [attr.disabled]="field.rdmp ? null : ''" class="btn btn-block btn-secondary">
            {{ field.saveFirst }}
            </a>
          </div>
        </div>
      </div>
      <br />
    </div>
  </div>
  <div class="row">
    <div *ngIf="field.workspaceApp" class="panel panel-default">
      <div class="panel-heading">
        <h4 class="panel-title">{{ field.workspaceApp.name | uppercase }}</h4>
      </div>
      <div class="panel-body">
        <div class="row">
          <div class="col-md-8 col-sm-8 col-xs-8 col-lg-8">
            <h5>{{ field.workspaceApp.subtitle }}</h5>
            <span *ngIf="field.rdmp">
              <p>{{ field.workspaceApp.description }}</p>
              <button (click)="saveAndOpenWorkspace()"  class="btn btn-primary">{{ field.open }}</button>
            </span>
            <span *ngIf="!field.rdmp">
              <p class="text-danger">
                <strong>{{ field.saveFirst }}</strong>
              </p>
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
export class WorkspaceSelectFieldComponent extends WorkspaceSelectComponent {
  field: WorkspaceSelectorField
  static clName = 'WorkspaceSelectFieldComponent';

  ngOnInit() {
    this.field.init();
    this.field.registerEvents();
  }

  saveAndOpenWorkspace(app) {
    this.fieldMap._rootComp.onSubmit().subscribe(response => {
      let href = '';
      if (app && app.id) {
        let type = '';
        if (app.type) {
          type = `&appType=${app.type}`;
          href = `${this.field.appLink}${app.id}/edit?rdmp=${this.field.rdmp}${type}`;
        } else {
          href = `${this.field.appLink}${app.id}/edit?rdmp=${this.field.rdmp}`;
        }
        window.location.href = href;
      } else {
        console.error('No App with app id was found, please check config/workspaces.js');
      }
    });
  }

}
