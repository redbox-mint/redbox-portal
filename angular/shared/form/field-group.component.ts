// Copyright (c) 2018 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
import { Input, Component, ViewChild, ViewContainerRef, OnInit } from '@angular/core';
import { EmbeddableComponent, RepeatableComponent } from './field-repeatable.component';
import * as _ from "lodash";
/**
#### Generic Group Component

Generic component for grouping components together. The resulting JSON will have the field names as keys.

```
{
   class: 'Container',
   compClass: 'GenericGroupComponent',
   definition: {
     name: "related_website",
     cssClasses: "form-inline",
     fields: [
       {
         class: 'TextField',
         editOnly: true,
         definition: {
           name: 'related_url',
           label: '@dmpt-related-website-url',
           type: 'text',
           required: true,
           groupName: 'related_website',
           groupClasses: 'width-30',
           cssClasses : "width-80 form-control"
         }
       },
       {
         class: 'TextField',
         editOnly: true,
         definition: {
           name: 'related_title',
           label: '@dmpt-related-website-title',
           type: 'text',
           required: true,
           groupName: 'related_website',
           groupClasses: 'width-30',
           cssClasses : "width-80 form-control"
         }
       },
       {
         class: 'TextField',
         editOnly: true,
         definition: {
           name: 'related_notes',
           label: '@dmpt-related-website-notes',
           type: 'text',
           required: true,
           groupName: 'related_website',
           groupClasses: 'width-30',
           cssClasses : "width-80 form-control"
         }
       }
     ]
   }
 }
```
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 */
@Component({
  selector: 'generic-group-field',
  template: `
  <ng-container *ngIf="field.editMode">
    <div *ngIf="field.label">
      <label>
        {{field.label}} {{getRequiredLabelStr()}}
        <button type="button" class="btn btn-default" *ngIf="field.help" (click)="toggleHelp()" [attr.aria-label]="'help' | translate "><span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
      </label>
      <span id="{{ 'helpBlock_' + field.name }}" class="help-block" *ngIf="this.helpShow" [innerHtml]="field.help">{{field.help}}</span>
    </div>
    <ng-container *ngIf="isEmbedded">
      <div [formGroup]='form' [ngClass]="field.cssClasses">
        <div class='row'>
          <div class="col-xs-11">
            <dmp-field *ngFor="let childField of field.fields" [name]="name" [index]="index" [field]="childField" [form]="form" [fieldMap]="fieldMap"></dmp-field>
          </div>
          <div class="col-xs-1">
            <button type='button' *ngIf="removeBtnText" [disabled]="!canRemove" (click)="onRemove($event)" [ngClass]="removeBtnClass" >{{removeBtnText}}</button>
            <button [disabled]="!canRemove" type='button' [ngClass]="removeBtnClass" (click)="onRemove($event)" [attr.aria-label]="'remove-button-label' | translate"></button>
          </div>
        </div>
      </div>
    </ng-container>
    <ng-container *ngIf="!isEmbedded">
      <div [formGroup]='form' [ngClass]="field.cssClasses">
        <dmp-field *ngFor="let field of field.fields" [field]="field" [form]="form" [fieldMap]="fieldMap"></dmp-field>
      </div>
    </ng-container>
  </ng-container>
  <ng-container *ngIf="!field.editMode">
    <div [formGroup]='form' [ngClass]="field.cssClasses">
      <dmp-field *ngFor="let fieldElem of field.fields" [field]="fieldElem" [form]="form" [fieldMap]="fieldMap"></dmp-field>
    </div>
  </ng-container>
  `,
})
export class GenericGroupComponent extends EmbeddableComponent {
  static clName = 'GenericGroupComponent';

}

/**
 * ### Repeatable Generic Component
 *
 *
 * ```
 * {
   class: 'RepeatableContainer',
   compClass: 'RepeatableGroupComponent',
   definition: {
     name: "related_websites",
     label: "@dmpt-related-website",
     help: "@dmpt-related-website-help",
     forceClone: ['fields', 'fieldMap'],
     fields: [
       {
         class: 'Container',
         compClass: 'GenericGroupComponent',
         definition: {
           name: "related_website",
           cssClasses: "form-inline",
           fields: [
             {
               class: 'TextField',
               editOnly: true,
               definition: {
                 name: 'related_url',
                 label: '@dmpt-related-website-url',
                 type: 'text',
                 required: true,
                 groupName: 'related_website',
                 groupClasses: 'width-30',
                 cssClasses : "width-80 form-control"
               }
             },
             {
               class: 'TextField',
               editOnly: true,
               definition: {
                 name: 'related_title',
                 label: '@dmpt-related-website-title',
                 type: 'text',
                 required: true,
                 groupName: 'related_website',
                 groupClasses: 'width-30',
                 cssClasses : "width-80 form-control"
               }
             },
             {
               class: 'TextField',
               editOnly: true,
               definition: {
                 name: 'related_notes',
                 label: '@dmpt-related-website-notes',
                 type: 'text',
                 required: true,
                 groupName: 'related_website',
                 groupClasses: 'width-30',
                 cssClasses : "width-80 form-control"
               }
             }
           ]
         }
       }
     ]
   }
 }
 ```
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 */
@Component({
  selector: 'repeatable-group',
  template: `
  <div *ngIf="field.editMode">
    <div *ngIf="field.label">
      <span class="label-font">
        {{field.label}} {{getRequiredLabelStr()}}
        <button type="button" class="btn btn-default" *ngIf="field.help" (click)="toggleHelp()" [attr.aria-label]="'help' | translate "><span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span></button>
      </span>
      <span id="{{ 'helpBlock_' + field.name }}" class="help-block" *ngIf="this.helpShow" [innerHtml]="field.help">{{field.help}}</span>
    </div>
    <ng-container *ngFor="let fieldElem of field.fields; let i = index;" >
      <div class="row">
        <span class="col-xs-12">
          <generic-group-field [name]="field.name" [field]="fieldElem" [form]="form" [fieldMap]="fieldMap" [isEmbedded]="true" [removeBtnText]="field.removeButtonText" [removeBtnClass]="field.removeButtonClass" [canRemove]="field.fields.length > 1" (onRemoveBtnClick)="removeElem($event[0], $event[1])" [index]="i"></generic-group-field>
        </span>
      </div>
      <div class="row">
        <span class="col-xs-12">&nbsp;</span>
      </div>
    </ng-container>
    <div class="row">
      <span class="col-xs-11">&nbsp;
      </span>
      <span class="col-xs-1">
        <button *ngIf="field.addButtonText" type='button' (click)="addElem($event)" [ngClass]="field.addButtonTextClass" >{{field.addButtonText}}</button>
        <button *ngIf="!field.addButtonText" type='button' (click)="addElem($event)" [ngClass]="field.addButtonClass" [attr.aria-label]="'add-button-label' | translate"></button>
      </span>
    </div>
  </div>
  <li *ngIf="!field.editMode" class="key-value-pair">
    <span *ngIf="field.label" class="key">{{field.label}}</span>
    <span class="value">
      <ul class="key-value-list">
        <generic-group-field *ngFor="let fieldElem of field.fields; let i = index;" [name]="field.name" [index]="i" [field]="fieldElem" [form]="form" [fieldMap]="fieldMap"></generic-group-field>
      </ul>
    </span>
  </li>
  `,
})
export class RepeatableGroupComponent extends RepeatableComponent {
  static clName = 'RepeatableGroupComponent';

}
