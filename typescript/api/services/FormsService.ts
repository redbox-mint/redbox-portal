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

import {
  Observable
} from 'rxjs/Rx';
import { FormModel, Services as services } from '@researchdatabox/redbox-core-types';
import {
  Sails,
  Model
} from "sails";
import { createSchema } from 'genson-js';

declare var sails: Sails;
declare var Form: Model;
declare var RecordType: Model;
declare var WorkflowStep: Model;

declare var _;

export module Services {
  /**
   * Forms related functions...
   *
   * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
   *
   */
  export class Forms extends services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      'getForm',
      'flattenFields',
      'getFormByName',
      'filterFieldsHasEditAccess',
      'listForms',
      'inferSchemaFromMetadata',
      'generateFormFromSchema'
    ];

    public async bootstrap(workflowStep): Promise<any> {
      let form = await Form.find({
        workflowStep: workflowStep.id
      })
      if (sails.config.appmode.bootstrapAlways) {
        sails.log.verbose(`Destroying existing form definitions: ${workflowStep.config.form}`);
        await Form.destroyOne({
          name: workflowStep.config.form
        })
        form = null;
      }
      let formDefs = [];
      let formName = null;
      sails.log.verbose("Found : ");
      sails.log.verbose(form);
      if (!form || form.length == 0) {
        sails.log.verbose("Bootstrapping form definitions..");
        // only bootstrap the form for this workflow step
        _.forOwn(sails.config.form.forms, (formDef, formName) => {
          if (formName == workflowStep.config.form) {
            formDefs.push(formName);
          }
        });
        formDefs = _.uniq(formDefs)
        sails.log.verbose(JSON.stringify(formDefs));
        if(_.isArray(formDefs)) {
          formDefs = formDefs[0]
        }
        formName = formDefs;
      } else {
        sails.log.verbose("Not Bootstrapping form definitions... ");

      }
      // check now if the form already exists, if it does, ignore...
      const existingFormDef = await Form.find({
        name: formName
      })
      let existCheck = {
        formName: formName,
        existingFormDef: existingFormDef
      };

      sails.log.verbose(`Existing form check: ${existCheck.formName}`);
      sails.log.verbose(JSON.stringify(existCheck));
      formName = null;
      if (_.isUndefined(existCheck.existingFormDef) || _.isEmpty(existCheck.existingFormDef)) {
        formName = existCheck.formName
      } else {
        sails.log.verbose(`Existing form definition for form name: ${existCheck.existingFormDef.name}, ignoring bootstrap.`);
      }


      sails.log.verbose("FormName is:");
      sails.log.verbose(formName);
      let result = null;
      if (!_.isNull(formName)) {
        sails.log.verbose(`Preparing to create form...`);
        const formObj = {
          name: formName,
          fields: sails.config.form.forms[formName].fields,
          workflowStep: workflowStep.id,
          type: sails.config.form.forms[formName].type,
          messages: sails.config.form.forms[formName].messages,
          viewCssClasses: sails.config.form.forms[formName].viewCssClasses,
          requiredFieldIndicator: sails.config.form.forms[formName].requiredFieldIndicator,
          editCssClasses: sails.config.form.forms[formName].editCssClasses,
          skipValidationOnSave: sails.config.form.forms[formName].skipValidationOnSave,
          attachmentFields: sails.config.form.forms[formName].attachmentFields,
          customAngularApp: sails.config.form.forms[formName].customAngularApp || null
        };

        result = await Form.create(formObj);
        sails.log.verbose("Created form record: ");
        sails.log.verbose(result);
      }

      if (result) {
        sails.log.verbose(`Updating workflowstep ${result.workflowStep} to: ${result.id}`);
        // update the workflow step...
        return await WorkflowStep.update({
          id: result.workflowStep
        }).set({
          form: result.id
        });
      }

      return null;
    }

    public listForms = (): Observable<FormModel[]> => {
      return super.getObservable(Form.find({}));
    }


    public getFormByName = (formName, editMode): Observable<FormModel> => {
      return super.getObservable(Form.findOne({
        name: formName
      })).flatMap(form => {
        if (form) {
          this.setFormEditMode(form.fields, editMode);
          return Observable.of(form);
        }
        return Observable.of(null);
      });
    }

    public getForm = (branding, recordType, editMode, starting: boolean): Observable<FormModel> => {

      return super.getObservable(RecordType.findOne({
        key: branding + "_" + recordType
      }))
        .flatMap(recordType => {

          return super.getObservable(WorkflowStep.findOne({
            recordType: recordType.id,
            starting: starting
          }));
        }).flatMap(workflowStep => {

          if (workflowStep.starting == true) {

            return super.getObservable(Form.findOne({
              name: workflowStep.config.form
            }));
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

    public inferSchemaFromMetadata(record: any): any {
      const schema = createSchema(record.metadata);
      // sails.log.verbose(schema);
      return schema;
    }

    public generateFormFromSchema(record: any): FormModel {

      let form: FormModel;

      let schema = this.inferSchemaFromMetadata(record);

      let fieldKeys = _.keys(schema.properties);

      let buttonsList = [
        {
          class: "AnchorOrButton",
          viewOnly: true,
          definition: {
            label: '@dmp-edit-record-link',
            value: '/@branding/@portal/record/edit/@oid',
            cssClasses: 'btn btn-large btn-info',
            showPencil: true,
            controlType: 'anchor'
          },
          variableSubstitutionFields: ['value']
        },
        {
          class: "AnchorOrButton",
          roles: ['Admin', 'Librarians'],
          viewOnly: true,
          definition: {
            label: '@view-record-audit-link',
            value: '/@branding/@portal/record/viewAudit/@oid',
            cssClasses: 'btn btn-large btn-info margin-15',
            controlType: 'anchor'
          },
          variableSubstitutionFields: ['value']
        }
      ];

      let textFieldTemplate = {
        class: 'TextField',
        viewOnly: true,
        definition: {
          name: '',
          label: '',
          help: '',
          type: 'text'
        }
      };

      let objectFieldHeadingTemplate = {
        class: 'Container',
        compClass: 'TextBlockComponent',
        definition: {
          value: '',
          type: 'h3'
        }
      };

      let fieldList = [
        {
          class: 'Container',
          compClass: 'TextBlockComponent',
          viewOnly: true,
          definition: {
            name: 'title',
            type: 'h1'
          }
        },
        {
          class: 'Container',
          compClass: 'GenericGroupComponent',
          definition: {
            cssClasses: "form-inline",
            fields: buttonsList
          }
        }

        // {
        //   class: 'TextArea',
        //   viewOnly: true,
        //   definition: {
        //     name: 'description',
        //     label: '@dmpt-description'
        //   }
        // },


        // {
        //   class: "Container",
        //   definition: {
        //     id: "project",
        //     label: "project-tab",
        //     fields: [
        //     ]
        //   }
        // }


        // {
        //   class: "TabOrAccordionContainer",
        //   compClass: "TabOrAccordionContainerComponent",
        //   definition: {
        //     id: "mainTab",
        //     accContainerClass: "view-accordion",
        //     expandAccordionsOnOpen: true,
        //     fields: [
        //     ]
        //   }
        // }
      ];

      for(let fieldKey of fieldKeys) {
        if(schema.properties[fieldKey].type == 'string') {
          let textField = _.cloneDeep(textFieldTemplate);
          _.set(textField.definition,'name',fieldKey);
          _.set(textField.definition,'label',fieldKey);
          fieldList.push(textField);
        } else if(schema.properties[fieldKey].type == 'object') {
          
          let objectFieldHeading =  _.cloneDeep(objectFieldHeadingTemplate);
          _.set(objectFieldHeading.definition, 'value', fieldKey);
          fieldList.push(objectFieldHeading);
          
          let objectFieldKeys = _.keys(schema.properties[fieldKey].properties);
          for(let objectFieldKey of objectFieldKeys) {
            if(schema.properties[fieldKey].properties[objectFieldKey].type == 'string') {
              let textField = _.cloneDeep(textFieldTemplate);
              _.set(textField.definition,'name',objectFieldKey);
              _.set(textField.definition,'label',objectFieldKey);
              fieldList.push(textField);
            }
          }
        }
      }

      let formObject = {
        name: 'generated-view-only',
        type: record.metaMetadata.type,
        skipValidationOnSave: false,
        editCssClasses: 'row col-md-12',
        viewCssClasses: 'row col-md-offset-1 col-md-10',
        messages: {},
        attachmentFields: [],
        fields: fieldList
      };

      form = formObject as any;

      return form;
    }

    protected setFormEditMode(fields, editMode): void{
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

    public filterFieldsHasEditAccess(fields, hasEditAccess):void {
      _.remove(fields, field => {
        return field.needsEditAccess && hasEditAccess != true;
      });
      _.forEach(fields, field => {
        if (!_.isEmpty(field.definition.fields)) {
          this.filterFieldsHasEditAccess(field.definition.fields, hasEditAccess);
        }
      });
    }

    public flattenFields(fields, fieldArr):void {
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