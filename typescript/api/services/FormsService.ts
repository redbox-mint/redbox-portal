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

import { Observable } from 'rxjs/Rx';
import services = require('../core/CoreService.js');
import { Sails, Model } from "sails";

declare var sails: Sails;
declare var Form: Model;
declare var RecordType: Model;
declare var WorkflowStep: Model;
declare var _this;

export module Services {
  /**
   * Forms related functions...
   *
   * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
   *
   */
  export class Forms extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      'getForm',
      'flattenFields',
      'getFormByName'
    ];

    public bootstrap = (workflowStep): Observable<any> => {
      let startQ = Form.find({ workflowStep: workflowStep.id })
      if (sails.config.appmode.bootstrapAlways) {
        sails.log.verbose(`Destroying existing form definitions: ${workflowStep.config.form}`);
        startQ = Form.destroy({ name: workflowStep.config.form })
      }
      let formDefs = [];
      return super.getObservable(startQ)
      .flatMap(form => {
        sails.log.verbose("Found : ");
        sails.log.verbose(form);
        if (!form || form.length == 0) {
          sails.log.verbose("Bootstrapping form definitions..");
          // only bootstrap the form for this workflow step
          _.forOwn(sails.config.form.forms, (formDef, formName) => {
            if (formName == workflowStep.config.form){
              formDefs.push(formName);
            }
          });
          formDefs = _.uniq(formDefs)
          sails.log.verbose(JSON.stringify(formDefs));
          return Observable.from(formDefs);
        } else {
          sails.log.verbose("Not Bootstrapping form definitions... ");
          return Observable.of(null);
        }
      })
      .flatMap(formName => {
        // check now if the form already exists, if it does, ignore...
        return this.getObservable(Form.find({name: formName})).flatMap(existingFormDef => {
          return Observable.of({formName: formName, existingFormDef: existingFormDef});
        });
      })
      .flatMap(existCheck => {
        sails.log.verbose(`Existing form check: ${existCheck.formName}`);
        sails.log.verbose(JSON.stringify(existCheck));
        if (_.isUndefined(existCheck.existingFormDef) || _.isEmpty(existCheck.existingFormDef)) {
          return Observable.of(existCheck.formName);
        } else {
          sails.log.verbose(`Existing form definition for form name: ${existCheck.existingFormDef.name}, ignoring bootstrap.`);
          return Observable.of(null);
        }
      })
      .flatMap(formName => {
        sails.log.verbose("FormName is:");
        sails.log.verbose(formName);
        let observable = Observable.of(null);
        if (!_.isNull(formName)) {
          sails.log.verbose(`Preparing to create form...`);
          const formObj = {
            name: formName,
            fields: sails.config.form.forms[formName].fields,
            workflowStep: workflowStep.id,
            type: sails.config.form.forms[formName].type,
            messages: sails.config.form.forms[formName].messages,
            viewCssClasses: sails.config.form.forms[formName].viewCssClasses,
            editCssClasses: sails.config.form.forms[formName].editCssClasses,
            skipValidationOnSave: sails.config.form.forms[formName].skipValidationOnSave,
            attachmentFields: sails.config.form.forms[formName].attachmentFields,
            customAngularApp: sails.config.form.forms[formName].customAngularApp || null
          };

          var q = Form.create(formObj);
          observable = Observable.bindCallback(q["exec"].bind(q))();
          // var obs = Observable.bindCallback(q["exec"].bind(q))();
        }
        return observable;
      })
      .flatMap(result => {
        if (result) {
          sails.log.verbose("Created form record: ");
          sails.log.verbose(result);
          return Observable.from(result);
        }
        return Observable.of(result);
      }).flatMap(result => {
        if (result) {
          sails.log.verbose(`Updating workflowstep ${result.workflowStep} to: ${result.id}`);
          // update the workflow step...
          const q = WorkflowStep.update({id: result.workflowStep}).set({form: result.id});
          return Observable.bindCallback(q["exec"].bind(q))();
        }
        return Observable.of(null);
      });

    }

    public getFormByName = (formName, editMode): Observable<any> => {
      return super.getObservable(Form.findOne({ name: formName })).flatMap(form => {
        if (form) {
          this.setFormEditMode(form.fields, editMode);
          return Observable.of(form);
        }
        return Observable.of(null);
      });
    }

    public getForm = (branding, recordType, editMode, starting: boolean): Observable<any> => {

      return super.getObservable(RecordType.findOne({ key: branding + "_" + recordType }))
        .flatMap(recordType => {

          return super.getObservable(WorkflowStep.findOne({ recordType: recordType.id, starting: starting  }));
        }).flatMap(workflowStep => {

          if (workflowStep.starting == true) {

            return super.getObservable(Form.findOne({ name: workflowStep.config.form }));
          }

          return Observable.of(null);
        }).flatMap(form => {

          if (form) {
            this.setFormEditMode(form.fields, editMode);
            return Observable.of(form);
          }
          return Observable.of(null);
        }).filter(result => result !== null).last();
    }

    protected setFormEditMode(fields, editMode) {
      _.remove(fields, field => {
        if (editMode) {
          return field.viewOnly == true;
        } else {
          return field.editOnly == true;
        }
      });
      _.forEach(fields, field => {
        field.definition.editMode = editMode;
        if (!_.isEmpty(field.definition.fields)) {
          this.setFormEditMode(field.definition.fields, editMode);
        }
      });
    }

    public flattenFields(fields, fieldArr) {
      _.map(fields, (f) => {
        fieldArr.push(f);
        if (f.fields) {
          this.flattenFields(f.fields, fieldArr);
        }
      });
    }
  }
}
module.exports = new Services.Forms().exports();
