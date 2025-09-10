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
    BaseFormFieldComponentDefinition, BaseFormFieldDefinition,
    BaseFormFieldLayoutDefinition,
    BaseFormFieldModelDefinition,
    FormComponentDefinition,
    FormConfig,
    FormConstraintConfig, isFormComponentDefinition, isFormFieldDefinition,
} from "@researchdatabox/sails-ng-common";
import {ClientFormContext} from "../additional/ClientFormContext";

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
        const formObj: FormModel & FormConfig = {
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
          validators: formConfig.validators,
          componentDefinitions: formConfig.componentDefinitions,
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

    /*
     * Methods for building the client form config.
     *
     *
     * Note that returning null means to remove the block from the config.
     * What that means differs between various kinds of config blocks.
     * Specifically null, undefined does *not* mean to remove the block, as some blocks have optional properties.
     *
     * TODO: Can the client form building be extracted to a separate class?
     *  Does it need access to some of the services?
     */

    /**
     * Convert a server-side form config to a client-side form config.
     * This process includes:
     * - removing fields the user does not have permissions to access
     * - converting fields from the server-side config format to the client-side config format
     *
     * @param item The source item.
     * @param context The context for the current environment and building the client-side form config.
     */
    public buildClientFormConfig(item: FormConfig, context?: ClientFormContext): Record<string, unknown> {
      sails.log.verbose(`FormsService - build client form config for name '${item?.name}'`);
      context = context ?? ClientFormContext.createView();

      // create the client form config
      const result = this.buildClientFormObject(item, context);
      if (!result) {
        throw new Error(`The form config is invalid because all form fields were removed, the form config must have at least one field the current user can view.`)
      }
      return result;
    }

    /**
     * Build a client-side form component definition.
     * @param item The source item.
     * @param context The context for the current environment and building the client-side form config.
     */
    public buildClientFormComponentDefinition(item: FormComponentDefinition, context: ClientFormContext): Record<string, unknown> | null {
      sails.log.verbose(`FormsService - build client form component definition with name '${item?.name}'`);
      context = context ? ClientFormContext.from(context) : ClientFormContext.createView();

      // add the item constraints to the context build
      if (item?.name) {
        if (!context?.build){
          context.build = [];
        }
        context?.build?.push({
          name: item?.name,
          constraints: FormConstraintConfig.from(item.constraints)
        });
      }

      // remove this component definition (by returning null) if the constraints are not met
      if (!this.checkClientFormComponentDefinitionAuthorization(context)) {
        sails.log.verbose(`FormsService - returning null because constraint authorization was not met`);
        return null;
      }
      if (!this.checkClientFormComponentDefinitionMode(context)) {
        sails.log.verbose(`FormsService - returning null because constraint form mode was not met`);
        return null;
      }

      // create the client form config
      const result = {...item};

      // remove the constraints property
      delete result.constraints;

      return this.buildClientFormObject(result, context);
    }

    /**
     * Build a client-side form field component definition.
     * @param item The source item.
     * @param context The context for the current environment and building the client-side form config.
     */
    public buildClientFormFieldComponentDefinition(item: BaseFormFieldComponentDefinition, context: ClientFormContext): Record<string, unknown> | null {
      sails.log.verbose(`FormsService - build client form field component definition with class '${item?.['class']}'`);
      context = context ?? ClientFormContext.createView();

      // create the client form config
      if (!this.isFormFieldDefinition(item)) {
        throw new Error(`FormsService - item is not a form field component definition ${JSON.stringify(item)}`);
      }
      return this.buildClientFormObject(item, context);
    }

    /**
     * Build a client-side form field layout definition.
     * @param item The source item.
     * @param context The context for the current environment and building the client-side form config.
     */
    public buildClientFormFieldLayoutDefinition(item: BaseFormFieldLayoutDefinition, context: ClientFormContext): Record<string, unknown> | null {
      sails.log.verbose(`FormsService - build client form field layout definition with class '${item?.['class']}'`);
      context = context ?? ClientFormContext.createView();

      // create the client form config
      if (!this.isFormFieldDefinition(item)) {
        throw new Error(`FormsService - item is not a form field layout definition ${JSON.stringify(item)}`);
      }
      return this.buildClientFormObject(item, context);
    }

    public buildClientFormFieldModelDefinition(item: BaseFormFieldModelDefinition<unknown>, context: ClientFormContext): Record<string, unknown> | null {
      sails.log.verbose(`FormsService - build client form field model definition with class '${item?.['class']}'`);
      context = context ?? ClientFormContext.createView();

      // create the client form config
      if (!this.isFormFieldDefinition(item)) {
          throw new Error(`FormsService - item is not a form field model definition ${JSON.stringify(item)}`);
      }
      if (item?.config?.value !== undefined) {
          throw new Error(`FormsService - 'value' in the base form field model definition config is for the client-side, use defaultValue instead ${JSON.stringify(item)}`);
      }

      const result = structuredClone(item);

      // Populate model.config.value from either model.config.defaultValue or context.current.model.data.
      // Use the context to decide where to obtain any existing data model value.
      // If there is a model id, use the context current model data.
      // If there isn't a model id, use the model.config.defaultValue.
      const hasContextModelId = context?.current?.model?.id?.toString()?.trim()?.length > 0;
      const hasContextModelData = context?.current?.model?.data && _.isPlainObject(context?.current?.model?.data);
      if ((hasContextModelId && !hasContextModelData) || (!hasContextModelId && hasContextModelData)) {
        throw new Error(`FormsService - cannot populate client form data model values due to inconsistent context current model id and data. Either provide both id and data, or neither.`);
      }
      if (hasContextModelId && hasContextModelData) {
        const path = context.pathFromBuildNames();
        const modelValue = _.get(context?.current?.model?.data, path, undefined);
        _.set(result, 'config.value', modelValue);
      } else if (item?.config?.defaultValue !== undefined) {
        const defaultValue = _.get(item, 'config.defaultValue', undefined);
        _.set(result, 'config.value', defaultValue);
        _.unset(result, 'config.defaultValue');
      }

      return this.buildClientFormObject(result, context);
    }

    private buildClientFormObject(item: FormConfig | BaseFormFieldDefinition, context: ClientFormContext): Record<string, unknown> | null {
      const result: Record<string, unknown> = {};

      if (this.isFormFieldDefinition(item) && item.config === null) {
        // if the config was removed, then remove the definition block
        sails.log.verbose(`FormsService - removed form field definition with class '${item?.['class']}'`);
        return null;
      }

      for (const [key, value] of Object.entries(item ?? {})) {
        switch (key) {

          case 'componentDefinitions':
            const intermediate = [];
            const arrayItems = Array.isArray(value) ? value : [];
            for (const arrayItem of arrayItems) {
              const i = this.buildClientFormComponentDefinition(arrayItem, context);
              if (i === null) {
                sails.log.verbose(`FormsService - remove componentDefinitions form component definition with name '${arrayItem?.['name']}'`);
              } else {
                intermediate.push(i);
              }
            }
            result[key] = intermediate;
            if (intermediate.length !== arrayItems.length) {
              sails.log.verbose(`FormsService - remove ${arrayItems.length - intermediate.length} componentDefinitions form component definitions`);
            }
            if (intermediate.length === 0) {
              // if there are no componentDefinitions,
              // then the parent block needs to be removed
              sails.log.verbose(`FormsService - remove all componentDefinitions form component definitions`);
              return null;
            }
            break;

          case 'component':
            result[key] = this.buildClientFormFieldComponentDefinition(value, context);
            if (result[key] === null || result[key]?.['config'] === null) {
              // if a component or component config is set to null,
              // then the component definition needs to be removed
              sails.log.verbose(`FormsService - remove component form field component definition with class '${value?.['class']}'`);
              return null;
            }
            break;

          case 'model':
              const modelItem = value as unknown as BaseFormFieldModelDefinition<unknown>;
              result[key] = this.buildClientFormFieldModelDefinition(modelItem, context);
              break;

          case 'layout':
            result[key] = this.buildClientFormFieldLayoutDefinition(value, context);
            break;

          case 'elementTemplate':
            if (this.isFormComponentDefinition(value)) {
              result[key] = this.buildClientFormComponentDefinition(value, context);
              if (result[key] === null) {
                // if the elementTemplate was removed,
                // then remove the repeatable
                sails.log.verbose(`FormsService - remove elementTemplate form component definition with name '${value?.['name']}'`);
                return null;
              }
            }
            break;

          default:
            if (Array.isArray(value)) {
              // sails.log.verbose(`FormsService - unknown array ${key}: ${JSON.stringify(value)}`);
              result[key] = this.buildClientFormArray(value, context);
            } else if (_.isObject(value)) {
              // sails.log.verbose(`FormsService - unknown object ${key}: ${JSON.stringify(value)}`);
              result[key] = this.buildClientFormObject(value, context);
            } else {
              // sails.log.verbose(`FormsService - unknown value ${key}: ${JSON.stringify(value)}`);
              result[key] = value;
            }
            break;
        }
      }
      return result;
    }

    private buildClientFormArray(item: unknown[], context: ClientFormContext): unknown[] | null {
      return item;
    }

    private checkClientFormComponentDefinitionAuthorization(context: ClientFormContext): boolean {
      // Get the current user's roles, default to no roles.
      const currentUserRoles = context?.current?.user?.roles ?? [];

      const requiredRoles = context?.build
          ?.map(b => b?.constraints?.authorization?.allowRoles)
          ?.filter(i => i !== null) ?? [];

      // The current user must have at least one of the roles required by each component.
      const isAllowed = requiredRoles?.every(i => {
        const isArray = Array.isArray(i);
        const hasElements = i?.length > 0;
        const hasAtLeastOneUserRole = hasElements && currentUserRoles.some(c => i.includes(c));
        return (isArray && hasElements && hasAtLeastOneUserRole) || !isArray || !hasElements;
      });

      if (!isAllowed) {
        sails.log.verbose(`FormsService - access denied for form component definition authorization, current: ${currentUserRoles?.join(', ')}, required: ${requiredRoles?.join(', ')}`);
      }

      return isAllowed;
    }

    private checkClientFormComponentDefinitionMode(context: ClientFormContext): boolean {
      // Get the current context mode, default to no mode.
      const currentContextMode = context?.current?.mode ?? null;

      const requiredModes = context?.build?.map(b => b?.constraints?.allowModes);

      // The current user must have at least one of the roles required by each component.
      const isAllowed = requiredModes?.every(i => {
        const isArray = Array.isArray(i);
        const hasElements = i?.length > 0;
        const hasMode = hasElements && i.includes(currentContextMode);
        return (isArray && hasElements && hasMode) || !isArray || !hasElements;
      });

      if (!isAllowed) {
        sails.log.verbose(`FormsService - access denied for form component definition mode, current: ${currentContextMode}, required: ${requiredModes?.join(', ')}`);
      }

      return isAllowed;
    }

    private isFormFieldDefinition(item: unknown): item is Record<string, unknown> {
      // use typescript narrowing to check the value
      // see: https://www.typescriptlang.org/docs/handbook/2/narrowing.html
      // not using 'BaseFormFieldComponentDefinition' because it is too general -
      // it does not include the class and config
      const i = item as Record<string, unknown>;
      // note that 'config' can be null or object, or not set
      return 'class' in i && typeof i?.class === 'string' &&
          ('config' in i && (typeof i?.config === 'object' || i?.config === null) || i?.config === undefined);
    }

    private isFormComponentDefinition(item: unknown): item is FormComponentDefinition {
      // use typescript narrowing to check the value

      const i = item as FormComponentDefinition;
      // only name and component are required
      return 'name' in i && typeof i?.name === 'string' &&
          'component' in i && this.isFormFieldDefinition(i?.component);
    }
  }
}
module.exports = new Services.Forms().exports();
