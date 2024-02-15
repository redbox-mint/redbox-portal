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
import { Input, Component, OnInit, Inject, Injector} from '@angular/core';
import { SimpleComponent } from './field-simple.component';
import { FieldBase } from './field-base';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import * as _ from "lodash";
import { RecordsService } from './records.service';
import * as Uppy from 'uppy';

declare var jQuery: any;
/**
 * Contributor Model
 *
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
export class PublishDataLocationSelectorField extends FieldBase<any> {

  showHeader: boolean;
  validators: any;
  enabledValidators: boolean;
  value: any[];
  accessDeniedObjects: object[];
  failedObjects: object[];
  recordsService: RecordsService;
  columns: object[];
  newLocation:any = {type:"url", location:"",notes:""};
  dataTypes:object[] = [{
    'label': 'URL',
    'value': 'url',
  },
  {
    'label': 'Physical location',
    'value': 'physical',
  },
  {
    'label': 'File path',
    'value': 'file',
  },
  {
    'label': 'Attachment',
    'value': 'attachment'
  }
];

  dataTypeLookup:any = {
    'url':"URL",
    'physical':"Physical location",
    'attachment':"Attachment",
    'file':"File path"
  }

  editNotesButtonText: string;
  editNotesTitle: string;
  cancelEditNotesButtonText: string;
  applyEditNotesButtonText: string;
  editNotesCssClasses: any;
  typeHeader: string;
  locationHeader: string;
  notesHeader: string;
  /* BEGIN UTS IMPORT */
  iscHeader: string;
  iscEnabled: boolean;
  notesEnabled: boolean;
  noLocationSelected: boolean;
  noLocationSelectedText: string;
  noLocationSelectedHelp: string;
  publicCheck: string;
  selectionCriteria: any;
  /* END UTS IMPORT  */

  constructor(options: any, injector: any) {
    super(options, injector);
    this.accessDeniedObjects = [];

    this.columns = options['columns'] || [];

    this.editNotesButtonText = this.getTranslated(options['editNotesButtonText'], 'Edit');
    this.editNotesTitle = this.getTranslated(options['editNotesTitle'], 'Edit Notes');
    this.cancelEditNotesButtonText = this.getTranslated(options['cancelEditNotesButtonText'], 'Cancel');
    this.applyEditNotesButtonText = this.getTranslated(options['applyEditNotesButtonText'], 'Apply');
    this.editNotesCssClasses = options['editNotesCssClasses'] || 'form-control';
    this.typeHeader =  this.getTranslated(options['typeHeader'], 'Type');
    this.locationHeader =  this.getTranslated(options['locationHeader'], 'Location');
    this.notesHeader =  this.getTranslated(options['notesHeader'], 'Notes');
    
    if(!_.isEmpty(options['dataTypeLookup'])) {
      this.dataTypeLookup = options['dataTypeLookup'];
      console.log(this.dataTypeLookup);
    }
    if(!_.isEmpty(options['dataTypes'])) {
      this.dataTypes = options['dataTypes'];
      console.log(this.dataTypes);
    }

    /* BEGIN UTS IMPORT */
    this.iscEnabled = !_.isUndefined(options['iscEnabled']) ? options['iscEnabled'] : false;
    this.notesEnabled = !_.isUndefined(options['notesEnabled']) ? options['notesEnabled'] : true;
    this.iscHeader = !_.isUndefined(options['iscHeader']) ? this.getTranslated(options['iscHeader'], options['iscHeader']) : 'Information Security Classification';
    this.noLocationSelectedText = !_.isUndefined(options['noLocationSelectedText']) ? this.getTranslated(options['noLocationSelectedText'], options['noLocationSelectedText']) : 'Publish Metadata Only';
    this.noLocationSelectedHelp = !_.isUndefined(options['noLocationSelectedHelp']) ? this.getTranslated(options['noLocationSelectedHelp'], options['noLocationSelectedHelp']) : 'Publicise only metadata (or description)';
    this.publicCheck = !_.isUndefined(options['publicCheck']) ? this.getTranslated(options['publicCheck'], options['publicCheck']) : 'public';
    this.selectionCriteria = !_.isUndefined(options['selectionCriteria']) ? this.getTranslated(options['selectionCriteria'], options['selectionCriteria']) : [{isc:'public', type:'attachment'}];
    /* END UTS IMPORT */

    this.value = options['value'] || this.setEmptyValue();
    this.recordsService = this.getFromInjector(RecordsService);
  }

  setValue(value:any, emitEvent:boolean = true) {
    this.formModel.setValue(value, {emitEvent: emitEvent, emitModelToViewChange:true });
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
    this.newLocation = {type:"url", location:"",notes:""};
  }

  appendLocation(newLoc:any) {
    this.value.push(newLoc);
    this.setValue(this.value, true);
  }

  clearPendingAtt(value) {
    _.each(value, (val:any) => {
      if (val.type == 'attachment') {
       _.unset(val, 'pending');
      }
    });
  }

  public populateDataLocation(oid, config: any) {
      console.log(oid);
      this.recordsService.getRecordMeta(oid).then(record => {
        this.value = record.dataLocations;
      });
 }

  removeLocation(loc: any) {
    _.remove(this.value, (val:any) => {
      return val.type == loc.type && val.name == loc.name && val.location == loc.location;
    });
    this.setValue(this.value);
  }
  /* BEGIN UTS IMPORT */
  public selectAllPublic() {
    this.applySelectionCriteria(true);
    this.checkIfLocationsSelected();
  }

  public applySelectionCriteria(checked) {
    _.each(this.value, dL => {
      _.each(this.selectionCriteria, sC => {
        const isSelected = _.filter(sC, (val, key) => dL[key] && dL[key] === val);
        if(isSelected.length === Object.keys(sC).length) {
          dL.selected = checked;
        }
      });
    });
  };

  public canBeSelected(dL) {
    let canBeSelected = false;
    _.each(this.selectionCriteria, sC => {
      const isSelected = _.filter(sC, (val, key) => dL[key] && dL[key] === val);
      if(isSelected.length === Object.keys(sC).length) {
        canBeSelected = true;
      }
    });

    return canBeSelected && this.editMode ? null : '';
  }

  public checkIfLocationsSelected() {
    const locationSelected = _.find(this.value, (dataLocation:any) => {
      return dataLocation.selected
    });
    if(locationSelected) {
      this.noLocationSelected = false;
    } else {
      this.noLocationSelected = true;
    }
  }
  /* END UTS IMPORT */
}
/**
* Component to display information from related objects within ReDBox
*
*
*
*
*/
@Component({
  selector: 'publish-data-location-selector',
  templateUrl: './field-publishdatalocationselector.html'
})
export class PublishDataLocationSelectorComponent extends SimpleComponent {
  field: PublishDataLocationSelectorField;
  editingNotes: any = {notes: '', index:-1};

  public ngOnInit() {
    /* BEGIN UTS IMPORT */
    this.field.checkIfLocationsSelected();
    /* END UTS IMPORT */
  }

  public selectAllLocations(checked){
    if(this.field.iscEnabled) {
      this.field.applySelectionCriteria(checked);
    } else {
      _.each(this.field.value, (dataLocation:any) => {
        dataLocation.selected = checked;
      });
    }
    this.field.checkIfLocationsSelected();
  }

  public getDatalocations() {
    return this.field.value;
  }

  public getAbsUrl(location:string) {
    if (!_.startsWith(location, 'record')) {
      location = `record/${location}`;
    }
    return `${this.field.recordsService.getBrandingAndPortalUrl}/${location}`
  }

  public editNotes(dataLocation, i) {
    this.editingNotes = {notes: dataLocation.notes, index:i};
    jQuery(`#${this.field.name}_editnotes`).modal('show');
  }

  public hideEditNotes() {
    jQuery(`#${this.field.name}_editnotes`).modal('hide');
  }

  public saveNotes() {
    jQuery(`#${this.field.name}_editnotes`).modal('hide');
    this.field.value[this.editingNotes.index].notes = this.editingNotes.notes;
  }
}
