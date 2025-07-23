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
import { BrandingModel, FormModel, Services as services } from '@researchdatabox/redbox-core-types';
import {
  Sails,
  Model
} from "sails";
import { createSchema } from 'genson-js';
import {
  BaseFormFieldComponentDefinition,
  BaseFormFieldLayoutDefinition,
  FormComponentDefinition,
  FormConfig, FormConstraintConfig, FormModesConfig
} from "@researchdatabox/sails-ng-common";

declare var sails: Sails;
declare var Form: Model;
declare var RecordType: Model;
declare var WorkflowStep: Model;
declare var RecordsService;

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
      'getFormByStartingWorkflowStep'
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
        // TODO: assess the form config to see what should change
        const formConfig = sails.config.form.forms[formName];
        const formObj = {
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
          debugValue: formConfig.debugValue,
          domElementType: formConfig.domElementType,
          defaultComponentConfig: formConfig.defaultComponentConfig,
          validatorDefinitions: formConfig.validatorDefinitions,
          validators: formConfig.validators,
          componentDefinitions: formConfig.componentDefinitions,
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

    public async getForm(branding: BrandingModel, formParam: string, editMode: boolean, recordType: string, currentRec: any) {

      // allow client to set the form name to use
      const formName = _.isUndefined(formParam) || _.isEmpty(formParam) ? currentRec.metaMetadata.form : formParam;

      if(formName == 'generated-view-only') {
        return await this.generateFormFromSchema(branding, recordType, currentRec);
      } else {

        return await this.getFormByName(formName, editMode).toPromise();
      }
    }

    public getFormByStartingWorkflowStep(branding: BrandingModel, recordType: string, editMode: boolean): Observable<FormModel> {

      let starting = true;

      return super.getObservable(RecordType.findOne({
        key: branding.id + "_" + recordType
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
        skipValidationOnSave: false,
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

    // TODO: some combination of Visitor, Iterator, Composite patterns for generating form config for the client.
    //  https://refactoring.guru/design-patterns/composite
    //  https://refactoring.guru/design-patterns/iterator
    //  https://refactoring.guru/design-patterns/visitor

    /**
     * Convert a server-side form config to a client-side form config.
     * @param item The source item.
     * @param context The context for the current environment and building the client-side form config.
     */
    public buildClientFormConfig(item: FormConfig, context?: ClientFormContext): Record<string, unknown> {
      // set defaults for the context
      context = {
        current: {
          mode: context?.current?.mode ?? 'view',
          user: {
            roles: context?.current?.user?.roles ?? [],
          },
        },
        build: context?.build ?? [],
      };
      sails.log.verbose({
        msg:`FormsService - buildClientFormConfig`,
        context:context
      });
      // create the client form config
      return {
        ...item,
        componentDefinitions: item.componentDefinitions
            .map(i => this.buildClientFormComponentDefinition(i, context))
            .filter(i => i !== null),
      };
    }

    /**
     * Build a client-side form component definition.
     * @param item The source item.
     * @param context The context for the current environment and building the client-side form config.
     */
    public buildClientFormComponentDefinition(item: FormComponentDefinition, context: ClientFormContext): Record<string, unknown> {
      // TODO: apply constraints and remove the constraints property
      // add the item constraints to the context build
      if (item?.constraints) {
        context.build.push({
          authorization: item.constraints.authorization,
          allowModes: item.constraints.allowModes,
        });
      }

      if (!this.checkClientFormComponentDefinitionAuthorization(context)) {
        return null;
      }
      if (!this.checkClientFormComponentDefinitionMode(context)) {
        return null;
      }

      // create the client form config
      const result = {
        ...item,
        component: this.buildClientFormFieldComponentDefinition(item.component, context),
        layout: this.buildClientFormFieldLayoutDefinition(item.layout, context),
      };
      // remove the constraints property
      delete result.constraints;
      return result;
    }

    /**
     * Build a client-side form field component definition.
     * @param item The source item.
     * @param context The context for the current environment and building the client-side form config.
     */
    public buildClientFormFieldComponentDefinition(item: BaseFormFieldComponentDefinition, context: ClientFormContext): Record<string, unknown> {
      // TODO: apply the current form mode from the context
      // create the client form config
      return {
        ...item,

      };
    }

    /**
     * Build a client-side form field layout definition.
     * @param item The source item.
     * @param context The context for the current environment and building the client-side form config.
     */
    public buildClientFormFieldLayoutDefinition(item: BaseFormFieldLayoutDefinition, context: ClientFormContext): Record<string, unknown> {
      // TODO: apply the current form mode from the context
      // create the client form config
      return {
        ...item,

      };
    }

    private checkClientFormComponentDefinitionAuthorization(context: ClientFormContext): boolean {
      // Get the current user's roles, default to no roles.
      const currentUserRoles = context?.current?.user?.roles ?? [];

      const requiredRoles = context?.build?.map(b => b?.authorization?.allowRoles);

      // The current user must have at least one of the roles required by each component.
      const isAllowed = requiredRoles?.every(i => {
        const isArray = Array.isArray(i);
        const hasElements = i?.length > 0;
        const hasAtLeastOneUserRole = hasElements && currentUserRoles.some(c => i.includes(c));
        return (isArray && hasElements && hasAtLeastOneUserRole) || !isArray || !hasElements;
      });

      if (!isAllowed) {
        sails.log.verbose({
          msg: `FormsService - checkClientFormComponentDefinitionAuthorization - denied`,
          currentUserRoles:currentUserRoles,
          requiredRoles: requiredRoles
        });
      }

      return isAllowed;
    }

    private checkClientFormComponentDefinitionMode(context: ClientFormContext): boolean {
      // Get the current context mode, default to no mode.
      const currentContextMode = context?.current?.mode ?? null;

      const requiredModes = context?.build?.map(b => b?.allowModes);

      // The current user must have at least one of the roles required by each component.
      const isAllowed = requiredModes?.every(i => {
        const isArray = Array.isArray(i);
        const hasElements = i?.length > 0;
        const hasAtLeastOneUserRole = hasElements && i.includes(currentContextMode);
        return (isArray && hasElements && hasAtLeastOneUserRole) || !isArray || !hasElements;
      });

      if (!isAllowed) {
        sails.log.verbose({
          msg: `FormsService - checkClientFormComponentDefinitionMode - denied`,
          currentContextMode:currentContextMode,
          requiredModes: requiredModes
        });
      }

      return isAllowed;
    }
  }
}
module.exports = new Services.Forms().exports();

export interface ClientFormContext {
  current: {
    mode: FormModesConfig;
    user?: {
      roles: string[];
    };
  };
  build: FormConstraintConfig[]
}


