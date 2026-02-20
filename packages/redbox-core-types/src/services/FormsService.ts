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
import { Services as services } from '../CoreService';
import { BrandingModel } from '../model/storage/BrandingModel';
import { FormAttributes } from '../waterline-models/Form';
import { createSchema } from 'genson-js';
import * as path from 'path';
import { VocabInlineFormConfigVisitor } from '../visitor/vocab-inline.visitor';
import {
  FormConfigFrame, FormConfigOutline,
  FormModesConfig, ReusableFormDefinitions,
} from "@researchdatabox/sails-ng-common";
import { ClientFormConfigVisitor } from '../visitor/client.visitor';
import { ConstructFormConfigVisitor } from '../visitor/construct.visitor';

type WorkflowStepLike = {
  id: string;
  config: { form: string };
  starting?: boolean;
};

type RecordLike = {
  metaMetadata?: { form?: string; type?: string };
  metadata?: Record<string, unknown>;
};

type FormFieldLike = {
  definition?: { fields?: FormFieldLike[] };
  fields?: FormFieldLike[];
  needsEditAccess?: boolean;
  [key: string]: unknown;
};

export namespace Services {
  /**
   * Forms related functions...
   *
   * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
   *
   */
  export class Forms extends services.Core.Service {

    protected override _exportedMethods: string[] = [
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

    public async bootstrap(workflowStep: WorkflowStepLike, brandingId: string): Promise<unknown> {
      sails.log.verbose(`Bootstrapping form for workflow step: ${workflowStep.id} with form config: ${workflowStep.config.form}`);
      let form = await Form.find({
        name: workflowStep.config.form,
        branding: brandingId
      })
      if (sails.config.appmode.bootstrapAlways) {
        this.logger.verbose(`Destroying existing form definitions: ${workflowStep.config.form}`);
        await Form.destroyOne({
          name: workflowStep.config.form,
          branding: brandingId
        })
        form = null;
      }
      let formDefs: string[] = [];
      let formName: string | null = null;
      const formRegistry = this.getFormConfigRegistry();
      sails.log.verbose("Form registry: ");
      sails.log.verbose(JSON.stringify(formRegistry));
      this.logger.verbose("Found : ");
      this.logger.verbose(form);
      if (!form || (Array.isArray(form) && form.length == 0)) {
        this.logger.verbose("Bootstrapping form definitions..");
        // only bootstrap the form for this workflow step
        _.forOwn(formRegistry, (_formDef: unknown, formName: string) => {
          if (formName == workflowStep.config.form) {
            formDefs.push(formName);
          }
        });
        formDefs = _.uniq(formDefs)
        this.logger.verbose(JSON.stringify(formDefs));
        const firstFormDef = _.isArray(formDefs) ? formDefs[0] : null;
        formName = firstFormDef ?? null;
      } else {
        this.logger.verbose("Not Bootstrapping form definitions... ");

      }
      // check now if the form already exists, if it does, ignore...
      const existingFormDef = await Form.find({
        name: formName,
        branding: brandingId
      }) as unknown as FormAttributes[];
      const existCheck: { formName: string | null; existingFormDef: FormAttributes[] } = {
        formName: formName,
        existingFormDef: existingFormDef
      };

      this.logger.verbose(`Existing form check: ${existCheck.formName}`);
      this.logger.verbose(JSON.stringify(existCheck));
      formName = null;
      if (_.isUndefined(existCheck.existingFormDef) || _.isEmpty(existCheck.existingFormDef)) {
        formName = existCheck.formName
      } else {
        this.logger.verbose(`Existing form definition for form name: ${existCheck.existingFormDef[0]?.name}, ignoring bootstrap.`);
      }


      this.logger.verbose("FormName is:");
      this.logger.verbose(formName);
      let result = null;
      if (formName) {
        sails.log.verbose(`Preparing to create form...`);
        // TODO: assess the form config to see what should change
        const formConfigRaw = formRegistry[formName] as Record<string, unknown> | undefined;
        if (!formConfigRaw) {
          this.logger.warn(`No form config found for ${formName}, skipping bootstrap.`);
          return null;
        }

        // TODO: Make the typing stronger here by removing the Record type here 
        // once we remove the legacy forms config
        const formConfig: FormConfigFrame = {
          name: formName,
          type: typeof formConfigRaw.type === 'string' ? formConfigRaw.type : '',
          viewCssClasses: formConfigRaw.viewCssClasses as FormConfigFrame['viewCssClasses'],
          editCssClasses: formConfigRaw.editCssClasses as FormConfigFrame['editCssClasses'],
          domElementType: formConfigRaw.domElementType as FormConfigFrame['domElementType'],
          domId: formConfigRaw.domId as FormConfigFrame['domId'],
          defaultComponentConfig: formConfigRaw.defaultComponentConfig as FormConfigFrame['defaultComponentConfig'],
          enabledValidationGroups: formConfigRaw.enabledValidationGroups as FormConfigFrame['enabledValidationGroups'],
          validators: formConfigRaw.validators as FormConfigFrame['validators'],
          validationGroups: formConfigRaw.validationGroups as FormConfigFrame['validationGroups'],
          defaultLayoutComponent: formConfigRaw.defaultLayoutComponent as FormConfigFrame['defaultLayoutComponent'],
          componentDefinitions: formConfigRaw.componentDefinitions as FormConfigFrame['componentDefinitions'],
          debugValue: formConfigRaw.debugValue as FormConfigFrame['debugValue'],
          attachmentFields: (formConfigRaw.attachmentFields ?? []) as FormConfigFrame['attachmentFields'],

          // Deprecated legacy properties (now removed):
          // fields → replaced by componentDefinitions
          // requiredFieldIndicator → removed
          // skipValidationOnSave → removed
          // customAngularApp → removed
        };

        const formObj = {
          name: formName,
          branding: brandingId,
          configuration: formConfig,
        };

        result = await Form.create(formObj) as unknown as FormAttributes;
        this.logger.verbose("Created form record: ");
        this.logger.verbose(result);
      }

      if (result) {
        this.logger.verbose(`Updating workflowstep ${workflowStep.id} to form: ${result.id}`);
        // update the workflow step to reference the form
        return await WorkflowStep.update({
          id: workflowStep.id
        }).set({
          form: result.id
        });
      }

      return null;
    }

    private getFormConfigRegistry(): Record<string, unknown> {
      const appPath = _.get(sails, 'config.appPath', process.cwd());
      try {
        sails.log.verbose(`Attempting to load form config registry from file system at path: ${appPath}/api/form-config`);
        const registryModule = require(path.join(appPath, 'api', 'form-config')) as { forms?: Record<string, unknown> };
        return registryModule?.forms ?? {};
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Unable to load form-config registry: ${message}`);
        return {};
      }
    }

    public listForms = (brandingId?: string): Observable<FormAttributes[]> => {
      const query: Record<string, unknown> = {};
      if (brandingId) {
        query.branding = brandingId;
      }
      return super.getObservable<FormAttributes[]>(Form.find(query));
    }


    public getFormByName = (formName: string, editMode: boolean, brandingId?: string): Observable<FormAttributes | null> => {
      const query: Record<string, unknown> = { name: formName };
      if (brandingId) {
        query.branding = brandingId;
      }
      return super.getObservable<FormAttributes | null>(Form.findOne(query)).pipe(flatMap(form => {
        if (form) {
          // TODO: setFormEditMode is currently a no-op; legacy 'fields' property has been
          // replaced by componentDefinitions in FormConfigFrame
          return of(form);
        }
        return of(null);
      }));
    }

    public async getForm(branding: BrandingModel, formParam: string, editMode: boolean, recordType: string, currentRec: RecordLike): Promise<FormAttributes | null> {

      // allow client to set the form name to use
      const formName = _.isUndefined(formParam) || _.isEmpty(formParam) ? currentRec.metaMetadata?.form : formParam;

      if (formName == 'generated-view-only') {
        const generatedConfig = await this.generateFormFromSchema(branding, recordType, currentRec);
        // Wrap the generated FormConfigFrame into a FormAttributes structure
        const defaultBrandingId = String(BrandingService.getDefault()?.id ?? '');
        return {
          id: '',
          name: 'generated-view-only',
          branding: String(branding?.id ?? defaultBrandingId),
          configuration: generatedConfig as FormConfigFrame,
        };
      } else {

        if (!formName) {
          return null;
        }
        const defaultBrandingId = String(BrandingService.getDefault()?.id ?? '');
        const brandingId = String(branding?.id ?? defaultBrandingId);
        return await firstValueFrom(this.getFormByName(formName, editMode, brandingId || undefined));
      }
    }

    public getFormByStartingWorkflowStep(branding: BrandingModel, recordType: string, editMode: boolean): Observable<FormAttributes> {

      const starting = true;

      return super.getObservable<Record<string, unknown> | null>(RecordType.findOne({
        key: branding.id + "_" + recordType
      })).pipe(
        flatMap(recordType => {
          const recordTypeId = String((recordType as Record<string, unknown>)?.id ?? '');
          return super.getObservable<WorkflowStepLike | null>(WorkflowStep.findOne({
            recordType: recordTypeId,
            starting: starting
          }));
        }),
        flatMap(workflowStep => {
          if (workflowStep?.starting == true) {
            return super.getObservable<FormAttributes | null>(Form.findOne({
              name: workflowStep.config.form,
              branding: branding.id
            }));
          }
          return of(null);
        }),
        flatMap(form => {
          if (form) {
            // TODO: setFormEditMode is currently a no-op; legacy 'fields' property has been
            // replaced by componentDefinitions in FormConfigFrame
            return of(form);
          }
          return of(null);
        }),
        filter(result => result !== null),
        last()
      );
    }

    public inferSchemaFromMetadata(record: RecordLike): Record<string, unknown> {
      const schema = createSchema(record.metadata ?? {});
      return schema;
    }

    public async generateFormFromSchema(branding: BrandingModel, recordType: string, record: RecordLike): Promise<FormConfigFrame | Record<string, unknown>> {

      if (recordType == '') {
        recordType = _.get(record, 'metaMetadata.type', '');
        if (recordType == '') {
          return {};
        }
      }

      let form: FormConfigFrame;

      const schema = this.inferSchemaFromMetadata(record) as { properties?: Record<string, unknown> };

      const fieldKeys = _.keys(schema.properties ?? {});

      const buttonsList = [
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
            redirectLocation: '/@branding/@portal/dashboard/' + recordType,
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

      const textFieldTemplate = {
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

      const groupComponentTemplate = {
        class: 'Container',
        compClass: 'GenericGroupComponent',
        definition: {
          name: '',
          cssClasses: 'form-inline',
          fields: []
        }
      };

      const groupTextFieldTemplate = {
        class: 'TextField',
        definition: {
          name: '',
          label: '',
          type: 'text',
          groupName: '',
          groupClasses: 'width-30',
          cssClasses: "width-80 form-control"
        }
      };

      const repeatableGroupComponentTemplate = {
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

      const objectFieldHeadingTemplate = {
        class: 'Container',
        compClass: 'TextBlockComponent',
        definition: {
          value: '',
          type: 'h3'
        }
      };

      const mainTitleFieldName = 'title';

      const fieldList = [
      ];

      for (const fieldKey of fieldKeys) {

        const schemaProperty = (schema.properties?.[fieldKey] as {
          type?: string;
          items?: { type?: string; properties?: Record<string, { type?: string }> };
          properties?: Record<string, { type?: string }>;
        }) ?? {};

        const schemaType = schemaProperty.type;
        if (schemaType === 'string') {

          const textField = _.cloneDeep(textFieldTemplate);
          _.set(textField.definition, 'name', fieldKey);
          _.set(textField.definition, 'label', fieldKey);
          _.set(textField.definition, 'subscribe.form.onFormLoaded[0].template', '<%= _.trim(field.fieldMap["' + fieldKey + '"].field.value) == "" ? field.translationService.t("@lookup-record-field-empty") : field.fieldMap["' + fieldKey + '"].field.value %>');
          fieldList.push(textField);

        } if (schemaType === 'array') {
          const itemType = schemaProperty.items?.type;
          if (itemType === 'string') {

            const textField = _.cloneDeep(textFieldTemplate);
            _.set(textField.definition, 'name', fieldKey);
            _.set(textField.definition, 'label', fieldKey);
            _.set(textField.definition, 'subscribe.form.onFormLoaded[0].template', '<%= _.isEmpty(_.trim(field.fieldMap["' + fieldKey + '"].field.value)) ? [field.translationService.t("@lookup-record-field-empty")] : field.fieldMap["' + fieldKey + '"].field.value %>');
            fieldList.push(textField);

          } else if (itemType === 'object') {

            const objectFieldKeys = _.keys(schemaProperty.items?.properties ?? {});
            const repeatableGroupField = _.cloneDeep(repeatableGroupComponentTemplate);
            const groupField = _.cloneDeep(groupComponentTemplate);
            const groupFieldList = [];

            for (const objectFieldKey of objectFieldKeys) {
              const innerProperty = schemaProperty.items?.properties?.[objectFieldKey];
              if (innerProperty?.type === 'string') {
                const textField = _.cloneDeep(groupTextFieldTemplate);
                _.set(textField.definition, 'name', objectFieldKey);
                _.set(textField.definition, 'label', objectFieldKey);
                _.set(textField.definition, 'groupName', 'item');
                groupFieldList.push(textField);
              }
            }

            _.set(groupField.definition, 'name', 'item');
            _.set(groupField.definition, 'fields', groupFieldList);
            _.set(repeatableGroupField.definition, 'name', fieldKey);
            _.set(repeatableGroupField.definition, 'label', fieldKey);
            _.set(repeatableGroupField.definition, 'fields', [groupField]);
            fieldList.push(repeatableGroupField);
          }

        } else if (schemaType === 'object') {

          const objectFieldKeys = _.keys(schemaProperty.properties ?? {});
          const groupField = _.cloneDeep(groupComponentTemplate);
          const groupFieldList = [];

          for (const objectFieldKey of objectFieldKeys) {
            const innerProperty = schemaProperty.properties?.[objectFieldKey];
            if (innerProperty?.type === 'string') {
              const textField = _.cloneDeep(groupTextFieldTemplate);
              _.set(textField.definition, 'name', objectFieldKey);
              _.set(textField.definition, 'label', objectFieldKey);
              _.set(textField.definition, 'groupName', fieldKey);
              groupFieldList.push(textField);
            }
          }

          const objectFieldHeading = _.cloneDeep(objectFieldHeadingTemplate);
          _.set(objectFieldHeading.definition, 'value', fieldKey);
          fieldList.push(objectFieldHeading);

          _.set(groupField.definition, 'name', fieldKey);
          _.set(groupField.definition, 'fields', groupFieldList);
          fieldList.push(groupField);
        }
      }

      const formObject = {
        name: 'generated-view-only',
        type: recordType,
        editCssClasses: 'row col-md-12',
        viewCssClasses: 'row col-md-offset-1 col-md-10',
        messages: {},
        attachmentFields: [],
        componentDefinitions: [],
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
                    label: '@lookup-record-details-' + recordType,
                    active: true,
                    fields: fieldList
                  }
                }
              ]
            }
          }]
      };

      form = formObject as FormConfigFrame;

      return form;
    }

    protected setFormEditMode(_fields: FormFieldLike[], _editMode: boolean): void {
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

    public filterFieldsHasEditAccess(fields: FormFieldLike[], hasEditAccess: boolean): void {
      _.remove(fields, (field: FormFieldLike) => {
        return field.needsEditAccess && hasEditAccess != true;
      });
      _.forEach(fields, (field: FormFieldLike) => {
        const nestedFields = field.definition?.fields;
        if (!_.isEmpty(nestedFields)) {
          this.filterFieldsHasEditAccess(nestedFields as FormFieldLike[], hasEditAccess);
        }
      });
    }

    public flattenFields(fields: FormFieldLike[], fieldArr: FormFieldLike[]): void {
      _.map(fields, (f: FormFieldLike) => {
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
    public async buildClientFormConfig(
      item: FormConfigFrame,
      formMode?: FormModesConfig,
      userRoles?: string[],
      recordMetadata?: Record<string, unknown> | null,
      reusableFormDefs?: ReusableFormDefinitions,
      branding?: string
    ): Promise<FormConfigOutline> {
      const constructor = new ConstructFormConfigVisitor(this.logger);
      const constructed = constructor.start({ data: item, reusableFormDefs, formMode, record: recordMetadata });
      const vocabVisitor = new VocabInlineFormConfigVisitor(this.logger);
      await vocabVisitor.resolveVocabs(constructed, branding);
      // create the client form config
      const visitor = new ClientFormConfigVisitor(this.logger);
      const result = visitor.start({ form: constructed, formMode, userRoles });
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

declare global {
  let FormsService: Services.Forms;
}
