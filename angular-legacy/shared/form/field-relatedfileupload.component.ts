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
import {Input, Component, OnInit, Inject, Injector} from '@angular/core';
import {SimpleComponent} from './field-simple.component';
import {FieldBase} from './field-base';
import {FormGroup, FormControl, Validators} from '@angular/forms';
import * as _ from "lodash";
import {RecordsService} from './records.service';
import * as Uppy from 'uppy';

declare var jQuery: any;

/**
 * Contributor Model
 * @author <a target='_' href='https://github.com/moisbo'>Moises Sacal</a>
 *
 */
export class RelatedFileUploadField extends FieldBase<any> {

  showHeader: boolean;
  validators: any;
  enabledValidators: boolean;
  value: any[];
  accessDeniedObjects: object[];
  failedObjects: object[];
  recordsService: RecordsService;
  columns: object[];
  newLocation: any = {location: "", notes: ""};
  attachmentText: string;
  attachmentTextDisabled: string;
  dataTypes: object[] = [{
    'label': 'Attachment',
    'value': 'attachment'
  }];
  restrictions: any;
  locationHeader: string;
  notesHeader: string;
  uppyDashboardNote: string;
  securityClassifictionOptions: any;
  notesEnabled: boolean;

  constructor(options: any, injector: any) {
    super(options, injector);
    this.accessDeniedObjects = [];
    this.locationHeader = this.getTranslated(options['locationHeader'], 'Location');
    this.notesEnabled = !_.isUndefined(options['notesEnabled']) ? options['notesEnabled'] : true;
    this.notesHeader = options['notesHeader'] ? this.getTranslated(options['notesHeader'], options['notesHeader']) : null;
    this.uppyDashboardNote = this.getTranslated(options['uppyDashboardNote'], 'Maximum upload size: 1 Gb per file');
    this.columns = options['columns'] || [];
    this.restrictions = options['restrictions'] || null;
    this.attachmentText = options['attachmentText'] || 'Add attachment(s)';
    this.attachmentTextDisabled = options['attachmentTextDisabled'] || 'Save your record to attach files';
    this.value = options['value'] || this.setEmptyValue();
    this.recordsService = this.getFromInjector(RecordsService);
  }

  setValue(value: any, emitEvent: boolean = true) {
    this.formModel.setValue(value, {emitEvent: emitEvent, emitModelToViewChange: true});
    this.formModel.markAsTouched();
    this.formModel.markAsDirty();
  }

  setEmptyValue() {
    this.value = [];
    return this.value;
  }

  addLocation() {
    this.value.push(this.newLocation);
    this.setValue(this.value);
    this.newLocation = {location: "", notes: ""};
  }

  appendLocation(newLoc: any) {
    this.value.push(newLoc);
    this.setValue(this.value, true);
  }

  clearPendingAtt(value) {
    _.each(value, (val: any) => {
      _.unset(val, 'pending');
    });
  }

  removeLocation(loc: any) {
    _.remove(this.value, (val: any) => {
      return val.name == loc.name && val.location == loc.location;
    });
    this.setValue(this.value);
  }


}

/**
 * Related File Upload Component
 */
@Component({
  selector: 'related-fileupload-selector',
  templateUrl: './field-related-fileupload.html'
})
export class RelatedFileUploadComponent extends SimpleComponent {
  field: RelatedFileUploadField;
  uppy: any = null;
  oid: any = null;
  editingNotes: any = {notes: '', index: -1};

  public ngOnInit() {
    let oid = this.field.fieldMap._rootComp.oid;
    if (this.field.editMode) {
      if (_.isNull(oid) || _.isUndefined(oid) || _.isEmpty(oid)) {
        // wait for the OID to be set when record is created
        if (!this.field.fieldMap._rootComp.getSubscription('recordCreated')) {
          console.log(`Subscribing to record creation..... ${this.field.name}`);
          this.field.fieldMap._rootComp.subscribe('recordCreated', this.field.name, this.eventRecordCreate.bind(this));
          this.initUppy(oid);
        }
      }
      this.initUppy(oid);
    }
  }

  public ngAfterViewInit() {
    if (this.field.editMode) {
      jQuery(`.uppy-Dashboard-input`).attr('aria-label', this.field.label);
    }
  }

  public getDatalocations() {
    return this.field.value;
  }

  public eventRecordCreate(createdInfo) {
    console.log(`Created record triggered: `);
    console.log(createdInfo);
    this.field.fieldMap[this.field.name].instance.initUppy(createdInfo.oid);
  }

  public tempClearPending() {
    // temporarily clearing pending values
    const fieldVal = _.cloneDeep(this.field.fieldMap._rootComp.form.value[this.field.name]);
    this.field.clearPendingAtt(fieldVal);
    this.field.fieldMap._rootComp.form.controls[this.field.name].setValue(fieldVal, {emitEvent: true});
  }

  public applyPendingChanges(savedInfo) {
    if (savedInfo.success) {
      const finalVal = this.field.fieldMap._rootComp.form.controls[this.field.name].value;
      this.field.fieldMap[this.field.name].field.value = finalVal;
    } else {
      // reverse the value
      console.log(`Resetting....`);
      this.field.fieldMap._rootComp.form.controls[this.field.name].setValue(this.field.fieldMap[this.field.name].field.value);
    }
  }


  public initUppy(oid: string) {
    this.field.fieldMap[this.field.name].instance.oid = oid;
    if (this.uppy) {
      console.log(`Uppy already created... setting oid to: ${oid}`);
      this.field.fieldMap[this.field.name].instance.uppy.getPlugin('Tus').opts.endpoint = `${this.field.recordsService.getBrandingAndPortalUrl}/record/${oid}/attach`;
      return;
    }
    const appConfig = this.field.recordsService.getConfig();
    const uppyConfig = {
      debug: true,
      autoProceed: false,
      restrictions: this.field.restrictions
    };
    const uppyDashboardNote = this.field.uppyDashboardNote;
    console.debug(`Using Uppy config:`);
    console.debug(JSON.stringify(uppyConfig));

    const tusConfig = {
      endpoint: `${this.field.recordsService.getBrandingAndPortalUrl}/record/${oid}/attach`,
      headers: {
        'X-CSRF-Token': appConfig.csrfToken
      }
    };
    console.debug(`Using TUS config:::`);
    console.debug(JSON.stringify(tusConfig));
    this.uppy = Uppy.Core(uppyConfig);
    this.uppy.use(Uppy.Dashboard, {
      // trigger: '.UppyModalOpenerBtn',
      inline: false,
      hideProgressAfterFinish: true,
      note: uppyDashboardNote,
      metaFields: [
        {id: 'notes', name: 'Notes', placeholder: 'Notes about this file.'}
      ]
    })
      .use(Uppy.Tus, tusConfig)
      .run();
    console.log(this.uppy);
    let fieldVal: any = null;
    // attach event handers...
    this.uppy.on('upload-success', (file, resp, uploadURL) => {
      console.debug('File info:');
      console.debug(file);
      console.debug('Response:');
      console.debug(resp);
      console.debug(`Upload URL:${uploadURL}`);
      // add to form control on each upload...
      const urlParts = uploadURL.split('/');
      const fileId = urlParts[urlParts.length - 1];
      const choppedUrl = urlParts.slice(6, urlParts.length).join('/');
      const newLoc = {
        type: 'attachment',
        pending: true,
        location: choppedUrl,
        notes: file.meta.notes,
        mimeType: file.type,
        name: file.meta.name,
        fileId: fileId,
        uploadUrl: uploadURL
      };
      console.log(`Adding new location:`);
      console.log(newLoc);
      this.field.appendLocation(newLoc);
    });
    // clearing all pending attachments...
    this.field.fieldMap._rootComp.subscribe('onBeforeSave', this.field.name, (savedInfo: any) => {
      console.log(`Before saving record triggered.. `);
      this.field.fieldMap[this.field.name].instance.tempClearPending();
    });

    // attach event handling for saving the record
    this.field.fieldMap._rootComp.subscribe('recordSaved', this.field.name, (savedInfo: any) => {
      console.log(`Saved record triggered.. `);
      this.field.fieldMap[this.field.name].instance.applyPendingChanges(savedInfo);
    });
  }

  public isAttachmentsDisabled() {
    if (_.isEmpty(this.oid)) {
      this.field.attachmentText = this.field.attachmentTextDisabled;
      return true;
    } else {
      this.field.attachmentText='Add attachment(s)';
      return false;
    }
  }

  public getAbsUrl(location: string) {
    if (!_.startsWith(location, 'record')) {
      location = `record/${location}`;
    }
    return `${this.field.recordsService.getBrandingAndPortalUrl}/${location}`
  }

  public openModal() {
    this.uppy && this.uppy.getPlugin('Dashboard') && this.uppy.getPlugin('Dashboard').openModal();
  }

}
