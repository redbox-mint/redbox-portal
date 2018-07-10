// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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
import { Input, Component, ChangeDetectorRef } from '@angular/core';
import { PercentPipe } from '@angular/common';
import { SimpleComponent } from './field-simple.component';
import { NotInFormField } from './field-simple';
import { RecordsService } from './records.service';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import * as _ from "lodash";
import { Observable } from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';
import 'rxjs/add/operator/bufferTime';
import 'rxjs/add/operator/filter';
import moment from 'moment-es6';

declare var jQuery: any;
declare var io: any;

/**
 * Async / background tasks field
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
export class AsynchField extends NotInFormField {
  public listenType: any;
  public relatedRecordId: string;
  public criteria: any;
  public nameLabel: string;
  public statusLabel: string;
  public dateStartedLabel: string;
  public dateCompletedLabel: string;
  public startedByLabel: string;
  public messageLabel: string;
  public lastUpdateLabel: string;
  public completionLabel: string;
  public completionRateType: string;
  public progressArr: any[];
  public RecordsService: RecordsService;
  public dateFormat:string;
  public taskType: string;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.relatedRecordId = options['relatedRecordId'] || undefined;
    this.completionRateType = options['completionRateType'] || 'percentage';
    this.nameLabel = options['nameLabel'] ? this.getTranslated(options['nameLabel'], options['nameLabel']) : 'Name';
    this.statusLabel = options['statusLabel'] ? this.getTranslated(options['statusLabel'], options['statusLabel']) : 'Status';
    this.dateStartedLabel = options['dateStartedLabel'] ? this.getTranslated(options['dateStartedLabel'], options['dateStartedLabel']) : 'Date Started';
    this.dateCompletedLabel = options['dateCompletedLabel'] ? this.getTranslated(options['dateCompletedLabel'], options['dateCompletedLabel']) : 'Date Completed';
    this.startedByLabel = options['startedByLabel'] ? this.getTranslated(options['startedByLabel'], options['startedByLabel']) : 'Started By';
    this.messageLabel = options['messageLabel'] ? this.getTranslated(options['messageLabel'], options['messageLabel']) : 'Message';
    this.completionLabel = options['completionLabel'] ? this.getTranslated(options['completionLabel'], options['completionLabel']) : 'Completion';
    this.lastUpdateLabel = options['lastUpdateLabel'] ? this.getTranslated(options['lastUpdateLabel'], options['lastUpdateLabel']) : 'Last Updated';
    this.dateFormat = options['dateFormat'] || 'L LT';
    this.listenType = options['listenType'] || "record"; // listens to record wide
    this.taskType = options['taskType'] || '';
    this.criteria = options['criteria'] || {where: {relatedRecordId: '@oid'}}; // defaults to all happenings for this oid

    this.RecordsService = this.getFromInjector(RecordsService);
  }

  public getStatusLabel(status) {
    return this.getTranslated(`${this.options.statusLabel}-${status}`, status);
  }

}
/**
*
* Component to display asynchronous processes
*
*
*/
@Component({
  selector: 'asynch-component',
  templateUrl: './field-asynch.component.html'
})
export class AsynchComponent extends SimpleComponent {
  field: AsynchField;
  public isListening:boolean;
  public locale;
  constructor(private changeRef: ChangeDetectorRef) {
    super();
    this.locale = window.navigator.language;
  }

  public ngOnInit() {
    let oid = this.field.relatedRecordId || this.field.fieldMap._rootComp.oid;
    const that = this;
    if (_.isNull(oid) || _.isUndefined(oid) || _.isEmpty(oid)) {
      // wait for the OID to be set when record is created
      if (!this.field.fieldMap._rootComp.getSubscription('recordCreated')) {
        console.log(`Subscribing to record creation..... ${this.field.name}`);
        this.field.fieldMap._rootComp.subscribe('recordCreated', this.field.name, (createdInfo) => {
          that.field.relatedRecordId = createdInfo.oid;
          that.startListen();
        });
      }
    }
    if (oid) {
      this.field.relatedRecordId = this.field.fieldMap._rootComp.oid;
      this.startListen();
    }
  }

  protected startListen() {
    if (!this.isListening && (!_.isUndefined(this.field.relatedRecordId) && !_.isEmpty(this.field.relatedRecordId))) {
      const fq = JSON.stringify(this.field.criteria).replace(/@oid/g, this.field.relatedRecordId);

      this.field.RecordsService.getAsyncProgress(fq).then(progressArr => {
        _.each(progressArr, (progress) => {
          progress.completionRate = progress.currentIdx / progress.targetIdx;
          if (this.field.listenType == "progress") {
            this.field.RecordsService.subscribeToAsyncProgress(progress.id, (data, socketRes) => {
              console.log(`Subscribed to async tasks: ${progress.id}`);
              console.log(data);
              console.log(socketRes);
            });
          }
        });
        if (this.field.listenType == "record") {
          this.field.RecordsService.subscribeToAsyncProgress(this.field.relatedRecordId, (data, socketRes) => {
            console.log(`Subscribed to async tasks for record: ${this.field.relatedRecordId}`);
            console.log(data);
            console.log(socketRes);
          });
        } else if (this.field.listenType == "taskType") {
          this.field.RecordsService.subscribeToAsyncProgress(`${this.field.relatedRecordId}-${this.field.taskType}`, (data, socketRes) => {
            console.log(`Subscribed to async tasks for record with taskType: ${this.field.relatedRecordId}-${this.field.taskType}`);
            console.log(data);
            console.log(socketRes);
          });
        }
        io.socket.on('start', this.onStart.bind(this));
        io.socket.on('stop', this.onStop.bind(this));
        io.socket.on('update', this.onUpdate.bind(this));
        this.field.progressArr = progressArr;
        this.isListening = true;
      });
    }
  }

  public onStart(progress) {
    console.log(`Got start event:`);
    console.log(progress);
    this.field.progressArr ? this.field.progressArr.push(progress) : this.field.progressArr = [progress];
    this.changeRef.detectChanges();
  }

  public onStop(progress) {
    console.log(`Got stop event:`);
    console.log(progress);
    this.updateProgress(progress);
  }

  public onUpdate(progress) {
    console.log(`Got update event:`);
    console.log(progress);
    this.updateProgress(progress);
  }

  protected updateProgress(progress) {

    const targetProgress = _.find(this.field.progressArr, (prog) => { return prog.id == progress.id; });
    _.assign(targetProgress, progress);
    this.changeRef.detectChanges();
  }

  public formatDateForDisplay(value: string) {
    return value ? moment(value).locale(this.locale).format(this.field.dateFormat) : '';
  }
}
