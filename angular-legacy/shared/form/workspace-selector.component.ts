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
  <ng-container *ngIf="field.visible">
    <div [formGroup]='form' *ngIf="field.editMode" [ngClass]="getGroupClass()">
      <label [attr.for]="field.name">
      <span [outerHTML]="field.label"></span><span class="form-field-required-indicator" [innerHTML]="getRequiredLabelStr()"></span>
        <button type="button" class="btn btn-default" *ngIf="field.help" (click)="toggleHelp()" [attr.aria-label]="'help' | translate "><span
          class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
      </label>
      <br/>
      <span id="{{ 'helpBlock_' + field.name }}" class="help-block" *ngIf="this.helpShow" [innerHtml]="field.help"></span>
      <!-- The SELECT field for dropdown -->
      <ng-container *ngIf="field.displayType == 'dropdown'">
        <select [id]="field.name" [ngClass]="field.cssClasses"
                (change)="field.loadWorkspaceDetails($event.target.value)">
          <option *ngFor="let opt of field.workspaceApps; let i = index"
          [ngValue]="opt" [selected]="i == 0"
          [value]="opt.name">{{opt.label}}
          </option>
        </select>
        <!-- divider -->
        <br/><br/><br/>
      </ng-container>
      <!-- The selected workspace type when choosing from the dropdown -->
      <ng-container *ngIf="field.displayType == 'dropdown'">
        <div class="row">
          <div *ngIf="field.workspaceApp" class="panel panel-default">
            <div class="panel-heading">
              <h4 class="panel-title">{{ field.workspaceApp.label | uppercase }}</h4>
            </div>
            <div class="panel-body">
              <div class="row">
                <div class="col-md-8 col-sm-8 col-xs-8 col-lg-8">
                  <h5>{{ field.workspaceApp.subtitle }}</h5>
                  <span *ngIf="field.allowAdd">
                    <p [innerHtml]="field.workspaceApp.description"></p>
                    <button *ngIf="field.workspaceApp.externallyProvisioned != true" type='button' (click)="saveAndOpenWorkspace()"  class="btn btn-primary">{{ field.open }}</button>
                  </span>
                  <span *ngIf="!field.allowAdd">
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
      </ng-container>
      <!-- When displayed as cards -->
      <ng-container *ngIf="field.displayType == 'cards'">
        <div class="workspace-selector-cards row row-cols-1 row-cols-md-3 g-4">
          <div class="col" *ngFor="let workspaceType of field.workspaceApps">
            <div class="workspace card h-100" >
              <div class="card-header">
                <h5>
                  {{ workspaceType.label | uppercase }}
                </h5>
              </div>
              <div class="card-body">
                <img class="card-img-top" src="{{ workspaceType.logo }}" alt="{{workspaceType.name}}" />
                <h5 class="card-title" style="margin-top: 2px">
                  <span>{{ workspaceType.subtitle }}</span>
                </h5>
                <p class="card-text">{{ workspaceType.description }}</p>
              </div>
              <div class="card-footer" >
                <ng-container *ngIf="field.allowAdd">
                  <button type='button' (click)="saveAndOpenWorkspace(workspaceType)"  class="btn btn-block btn-primary">{{ field.open }}</button>
                </ng-container>
                <ng-container *ngIf="!field.allowAdd">
                  <p class="text-danger">
                    <strong>{{ field.saveFirst }}</strong>
                  </p>
                </ng-container>
              </div>

            </div>
          </div>
        </div>
      </ng-container>
      <ng-container *ngIf="field.displayType == 'panels'">
        <div class="row" *ngFor="let workspaceType of field.workspaceApps">
          <div class="panel panel-default">
            <div class="panel-heading">
              <h4 class="panel-title">{{ workspaceType.label | uppercase }}</h4>
            </div>
            <div class="panel-body">
              <div class="row">
                <div class="col-md-8 col-sm-8 col-xs-8 col-lg-8">
                  <h5>{{ workspaceType.subtitle }}</h5>
                  <span *ngIf="field.allowAdd">
                    <p>{{ workspaceType.description }}</p>
                    <button type='button' (click)="saveAndOpenWorkspace(workspaceType)"  class="btn btn-primary">{{ field.open }}</button>
                  </span>
                  <span *ngIf="!field.allowAdd">
                    <p class="text-danger">
                      <strong>{{ field.saveFirst }}</strong>
                    </p>
                  </span>
                </div>
                <div class="col-md-4 col-sm-4 col-xs-4 col-lg-4">
                  <img src="{{ workspaceType.logo }}" alt="{{workspaceType.name}}">
                </div>
              </div>
            </div>
          </div>
        </div>
      </ng-container>
    </div>
  </ng-container>
  `,
})
export class WorkspaceSelectorFieldComponent extends WorkspaceSelectorComponent {
  field: WorkspaceSelectorField
  static clName = 'WorkspaceSelectorFieldComponent';

  ngOnInit() {
    this.field.init();
    this.field.registerEvents();
  }

  saveAndOpenWorkspace(workspaceType: any = undefined){
    if (_.isUndefined(workspaceType)) {
      workspaceType = this.field.workspaceApp;
    }
    if (this.field.shouldSaveForm) {
      this.fieldMap._rootComp.onSubmit().subscribe(response => {
        if (response == true) {
          window.location.href = `${this.field.appLink}${workspaceType.name}/edit?rdmp=${this.field.rdmp}`;
        }
      });
    } else {
      window.location.href = `${this.field.appLink}${workspaceType.name}/edit?rdmp=${this.field.rdmp}`;
    }
  }

}
