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

import { Observable, of, firstValueFrom } from 'rxjs';
import { mergeMap as flatMap, last, filter } from 'rxjs/operators';
import {BrandingModel, FormModel, Services as services} from '@researchdatabox/redbox-core-types';
import {Model, Sails} from "sails";
import {createSchema} from 'genson-js';
import {
  ClientFormConfigVisitor,
  ConstructFormConfigVisitor,
  FormConfigFrame, FormConfigOutline,
  FormModesConfig, ReusableFormDefinitions
} from "@researchdatabox/sails-ng-common";

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
      'generateFormFromSchema',
      'getFormByStartingWorkflowStep',
      'buildClientFormConfig',
    ];

    public async bootstrap(workflowStep): Promise<any> {
      let form = await Form.find({
        workflowStep: workflowStep.id
      })
      if (sails.config.appmode.bootstrapAlways) {
        this.logger.verbose(`Destroying existing form definitions: ${workflowStep.config.form}`);
        await Form.destroyOne({
          name: workflowStep.config.form
        })
        form = null;
      }
      let formDefs = [];
      let formName = null;
      this.logger.verbose("Found : ");
      this.logger.verbose(form);
      if (!form || form.length == 0) {
        this.logger.verbose("Bootstrapping form definitions..");
        // only bootstrap the form for this workflow step
        _.forOwn(sails.config.form.forms, (formDef, formName) => {
          if (formName == workflowStep.config.form) {
            formDefs.push(formName);
          }
        });
        formDefs = _.uniq(formDefs)
        this.logger.verbose(JSON.stringify(formDefs));
        if(_.isArray(formDefs)) {
          formDefs = formDefs[0]
        }
        formName = formDefs;
      } else {
        this.logger.verbose("Not Bootstrapping form definitions... ");

      }
      // check now if the form already exists, if it does, ignore...
      const existingFormDef = await Form.find({
        name: formName
      })
      let existCheck = {
        formName: formName,
        existingFormDef: existingFormDef
      };

      this.logger.verbose(`Existing form check: ${existCheck.formName}`);
      this.logger.verbose(JSON.stringify(existCheck));
      formName = null;
      if (_.isUndefined(existCheck.existingFormDef) || _.isEmpty(existCheck.existingFormDef)) {
        formName = existCheck.formName
      } else {
        this.logger.verbose(`Existing form definition for form name: ${existCheck.existingFormDef.name}, ignoring bootstrap.`);
      }


      this.logger.verbose("FormName is:");
      this.logger.verbose(formName);
      let result = null;
      if (!_.isNull(formName)) {
        sails.log.verbose(`Preparing to create form...`);
        // TODO: assess the form config to see what should change
        const formConfig = sails.config.form.forms[formName];
        const formObj: FormModel & FormConfigFrame = {
          name: formName,
          fields: formConfig.fields,
          workflowStep: workflowStep.id,
          type: formConfig.type,
          messages: formConfig.messages,
          viewCssClasses: formConfig.viewCssClasses,
          requiredFieldIndicator: formConfig.requiredFieldIndicator,
          editCssClasses: formConfig.editCssClasses,
          skipValidationOnSave: formConfig.skipValidationOnSave,
          attachmentFields: formConfig.attachmentFields,
          customAngularApp: formConfig.customAngularApp || null,

          // new fields
          domElementType: formConfig.domElementType,
          domId: formConfig.domId,
          defaultComponentConfig: formConfig.defaultComponentConfig,
          enabledValidationGroups: formConfig.enabledValidationGroups,
          validators: formConfig.validators,
          validationGroups: formConfig.validationGroups,
          defaultLayoutComponent: formConfig.defaultLayoutComponent,
          componentDefinitions: formConfig.componentDefinitions,
          debugValue: formConfig.debugValue,
        };

        result = await Form.create(formObj);
        this.logger.verbose("Created form record: ");
        this.logger.verbose(result);
      }

      if (result) {
        this.logger.verbose(`Updating workflowstep ${result.workflowStep} to: ${result.id}`);
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
      })).pipe(flatMap(form => {
        if (form) {
          this.setFormEditMode(form.fields, editMode);
          return of(form);
        }
        return of(null);
      }));
    }

    public async getForm(branding: BrandingModel, formParam: string, editMode: boolean, recordType: string, currentRec: any) {

      // allow client to set the form name to use
      const formName = _.isUndefined(formParam) || _.isEmpty(formParam) ? currentRec.metaMetadata.form : formParam;

      if(formName == 'generated-view-only') {
        return await this.generateFormFromSchema(branding, recordType, currentRec);
      } else {

  return await firstValueFrom(this.getFormByName(formName, editMode));
      }
    }

    public getFormByStartingWorkflowStep(branding: BrandingModel, recordType: string, editMode: boolean): Observable<FormModel> {

      let starting = true;

      return super.getObservable(RecordType.findOne({
        key: branding.id + "_" + recordType
      })).pipe(
        flatMap(recordType => {
          return super.getObservable(WorkflowStep.findOne({
            recordType: recordType.id,
            starting: starting
          }));
        }),
        flatMap(workflowStep => {
          if (workflowStep.starting == true) {
            return super.getObservable(Form.findOne({
              name: workflowStep.config.form
            }));
          }
          return of(null);
        }),
        flatMap(form => {
          if (form) {
            this.setFormEditMode(form.fields, editMode);
            return of(form);
          }
          return of(null);
        }),
        filter(result => result !== null),
        last()
      );
    }

    public inferSchemaFromMetadata(record: any): any {
      const schema = createSchema(record.metadata);
      return schema;
    }

    public async generateFormFromSchema(branding: BrandingModel, recordType: string, record: any) {

      if(recordType == '') {
        recordType = _.get(record,'metaMetadata.type','');
        if(recordType == '') {
          return {};
        }
      }

      let form: FormModel;

      let schema = this.inferSchemaFromMetadata(record);

      let fieldKeys = _.keys(schema.properties);

      let buttonsList = [
        {
          class: 'AnchorOrButton',
          roles: ['Admin', 'Librarians'],
          viewOnly: true,
          definition: {
            label: '@view-record-audit-link',
            value: '/@branding/@portal/record/viewAudit/@oid',
            cssClasses: 'btn btn-large btn-info margin-15',
            controlType: 'anchor'
          },
          variableSubstitutionFields: ['value']
        },
        {
          class: 'SaveButton',
          viewOnly: true,
          roles: ['Admin', 'Librarians'],
          definition: {
            name: 'confirmDelete',
            label: 'Delete this record',
            closeOnSave: true,
            redirectLocation: '/@branding/@portal/dashboard/'+recordType,
            cssClasses: 'btn-danger',
            confirmationMessage: '@dataPublication-confirmDelete',
            confirmationTitle: '@dataPublication-confirmDeleteTitle',
            cancelButtonMessage: '@dataPublication-cancelButtonMessage',
            confirmButtonMessage: '@dataPublication-confirmButtonMessage',
            isDelete: true,
            isSubmissionButton: true
          },
          variableSubstitutionFields: ['redirectLocation']
        }
      ];

      let textFieldTemplate = {
        class: 'TextField',
        viewOnly: true,
        definition: {
          name: '',
          label: '',
          help: '',
          type: 'text',
          subscribe: {
            'form': {
              onFormLoaded: [{
              action: 'utilityService.runTemplate',
              template: '',
              includeFieldInFnCall: true
            }]
          }
        }
        }
      };

      let groupComponentTemplate = {
        class: 'Container',
        compClass: 'GenericGroupComponent',
        definition: {
          name: '',
          cssClasses: 'form-inline',
          fields: []
        }
      };

      let groupTextFieldTemplate = {
        class: 'TextField',
        definition: {
          name: '',
          label: '',
          type: 'text',
          groupName: '',
          groupClasses: 'width-30',
          cssClasses : "width-80 form-control"
        }
      };

      let repeatableGroupComponentTemplate = {
        class: 'RepeatableContainer',
        compClass: 'RepeatableGroupComponent',
        definition: {
          name: '',
          label: '',
          help: '',
          forceClone: ['fields'],
          fields: []
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

      let mainTitleFieldName = 'title';

      let fieldList = [
      ];

      for(let fieldKey of fieldKeys) {

        let schemaProperty = schema.properties[fieldKey];

        if(_.get(schemaProperty,'type','') == 'string') {

          let textField = _.cloneDeep(textFieldTemplate);
          _.set(textField.definition,'name',fieldKey);
          _.set(textField.definition,'label',fieldKey);
          _.set(textField.definition,'subscribe.form.onFormLoaded[0].template','<%= _.trim(field.fieldMap["'+fieldKey+'"].field.value) == "" ? field.translationService.t("@lookup-record-field-empty") : field.fieldMap["'+fieldKey+'"].field.value %>');
          fieldList.push(textField);

        } if(_.get(schemaProperty,'type','') == 'array') {

          if(_.get(schemaProperty,'items.type','') == 'string') {

            let textField = _.cloneDeep(textFieldTemplate);
            _.set(textField.definition,'name',fieldKey);
            _.set(textField.definition,'label',fieldKey);
            _.set(textField.definition,'subscribe.form.onFormLoaded[0].template','<%= _.isEmpty(_.trim(field.fieldMap["'+fieldKey+'"].field.value)) ? [field.translationService.t("@lookup-record-field-empty")] : field.fieldMap["'+fieldKey+'"].field.value %>');
            fieldList.push(textField);

          } else if(_.get(schemaProperty,'items.type','') == 'object') {

            let objectFieldKeys = _.keys(schemaProperty.items.properties);
            let repeatableGroupField = _.cloneDeep(repeatableGroupComponentTemplate);
            let groupField = _.cloneDeep(groupComponentTemplate);
            let groupFieldList = [];

            for(let objectFieldKey of objectFieldKeys) {
              let innerProperty = schemaProperty.items.properties[objectFieldKey];
              if(_.get(innerProperty,'type','') == 'string') {
                let textField = _.cloneDeep(groupTextFieldTemplate);
                _.set(textField.definition,'name',objectFieldKey);
                _.set(textField.definition,'label',objectFieldKey);
                _.set(textField.definition,'groupName','item');
                groupFieldList.push(textField);
              }
            }

            _.set(groupField.definition,'name','item');
            _.set(groupField.definition,'fields',groupFieldList);
            _.set(repeatableGroupField.definition,'name',fieldKey);
            _.set(repeatableGroupField.definition,'label',fieldKey);
            _.set(repeatableGroupField.definition,'fields',[groupField]);
            fieldList.push(repeatableGroupField);
          }

        } else if(_.get(schemaProperty,'type','') == 'object') {

          let objectFieldKeys = _.keys(schemaProperty.properties);
          let groupField = _.cloneDeep(groupComponentTemplate);
          let groupFieldList = [];

          for(let objectFieldKey of objectFieldKeys) {
            let innerProperty = schemaProperty.properties[objectFieldKey];
            if(_.get(innerProperty,'type','') == 'string') {
              let textField = _.cloneDeep(groupTextFieldTemplate);
              _.set(textField.definition,'name',objectFieldKey);
              _.set(textField.definition,'label',objectFieldKey);
              _.set(textField.definition,'groupName',fieldKey);
              groupFieldList.push(textField);
            }
          }

          let objectFieldHeading =  _.cloneDeep(objectFieldHeadingTemplate);
          _.set(objectFieldHeading.definition, 'value', fieldKey);
          fieldList.push(objectFieldHeading);

          _.set(groupField.definition,'name',fieldKey);
          _.set(groupField.definition,'fields',groupFieldList);
          fieldList.push(groupField);
        }
      }

      let formObject = {
        name: 'generated-view-only',
        type: recordType,
        editCssClasses: 'row col-md-12',
        viewCssClasses: 'row col-md-offset-1 col-md-10',
        messages: {},
        attachmentFields: [],
        fields: [
          {
            class: 'Container',
            compClass: 'TextBlockComponent',
            viewOnly: true,
            definition: {
              name: mainTitleFieldName,
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
          },
          {
          class: 'TabOrAccordionContainer',
          compClass: 'TabOrAccordionContainerComponent',
          definition: {
            id: 'mainTab',
            accContainerClass: 'view-accordion',
            expandAccordionsOnOpen: true,
            fields: [
              {
                class: 'Container',
                editOnly: true,
                definition: {
                  id: 'main',
                  label: '@lookup-record-details-'+recordType,
                  active: true,
                  fields: fieldList
                }
              }
            ]
          }
        }]
      };

      form = formObject as any;

      return form;
    }

    protected setFormEditMode(fields, editMode): void{
      // TODO: Form is processed differently now, see buildClientFormConfig
      // _.remove(fields, field => {
      //   if (editMode) {
      //     return field.viewOnly == true;
      //   } else {
      //     return field.editOnly == true;
      //   }
      // });
      // _.forEach(fields, field => {
      //   field.definition.editMode = editMode;
      //   if (!_.isEmpty(field.definition.fields)) {
      //     this.setFormEditMode(field.definition.fields, editMode);
      //   }
      // });
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

    /**
     * Convert a server-side form config to a client-side form config.
     *
     * @param item The source item.
     * @param formMode The form mode.
     * @param userRoles The current user's roles.
     * @param recordMetadata The record metadata.
     * @param reusableFormDefs The reusable form definitions.
     */
    public buildClientFormConfig(
      item: FormConfigFrame,
      formMode?: FormModesConfig,
      userRoles?: string[],
      recordMetadata?: Record<string, unknown> | null,
      reusableFormDefs?: ReusableFormDefinitions
    ): FormConfigOutline {
      const constructor = new ConstructFormConfigVisitor(this.logger);
      const constructed = constructor.start({data: item, reusableFormDefs, formMode, record: recordMetadata});
      // create the client form config
      const visitor = new ClientFormConfigVisitor(this.logger);
      const result = visitor.start({form: constructed, formMode, userRoles});
      if (!result) {
        throw new Error(`The form config is invalid because all form fields were removed, ` +
          `the form config must have at least one field the current user can view: ${JSON.stringify({
            item, formMode, userRoles, recordData: recordMetadata, reusableFormDefs
          })}`);
      }
      return result;
    }
  }
}
module.exports = new Services.Forms().exports();
