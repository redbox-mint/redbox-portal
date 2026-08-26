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
import { mergeMap as flatMap, take, tap, map, catchError } from 'rxjs/operators';
import { Services as services } from '../CoreService';
import { BrandingModel } from '../model/storage/BrandingModel';
import { UserModel } from '../model/storage/UserModel';
import { FormAttributes } from '../waterline-models/Form';
import { createSchema } from 'genson-js';
import * as path from 'path';
import { VocabInlineFormConfigVisitor } from '../visitor/vocab-inline.visitor';
import {
  AvailableFormComponentDefinitionOutlines,
  FormConfigFrame,
  FormConfigOutline,
  FormModesConfig,
  ReusableFormDefinitions,
  ValidationOperationDiscovery,
  compareRecordValidationIdentifiers,
  RECORD_VALIDATION_REFERENCE_PATTERN,
  sanitizeValidationOperationDiscovery,
} from '@researchdatabox/sails-ng-common';
import { ClientFormConfigVisitor } from '../visitor/client.visitor';
import { ConstructFormConfigVisitor } from '../visitor/construct.visitor';
import { ContextVariablesFormConfigVisitor } from '../visitor/context-variables.visitor';
import { RelatedObjectDataInlineFormConfigVisitor } from '../visitor/related-object-data-inline.visitor';
import type { RecordsService } from '../RecordsService';
import type { RecordValidationCandidate, RecordValidationOperationDiscoveryRequest } from './RecordValidationService';
import type { RecordContractContext, RecordContractFormBuildResult } from '../record-contract/record-contract-context';

type WorkflowStepLike = {
  id: string;
  config: { form: string };
  starting?: boolean;
};

type RecordLike = {
  redboxOid?: string;
  metaMetadata?: { brandId?: string; form?: string; type?: string };
  metadata?: Record<string, unknown>;
  workflow?: { stage?: string; stageLabel?: string };
  authorization?: {
    edit?: string[];
    view?: string[];
    editRoles?: string[];
    viewRoles?: string[];
    editPending?: string[];
    viewPending?: string[];
  };
};

type FormFieldLike = {
  definition?: { fields?: FormFieldLike[] };
  fields?: FormFieldLike[];
  needsEditAccess?: boolean;
  [key: string]: unknown;
};

type FormComponentNodeLike = {
  name?: string;
  component?: {
    config?: {
      content?: unknown;
      componentDefinitions?: unknown[];
    };
  };
};
export interface FormRecordAccessContext {
  readonly user: FormRecordAccessUser;
  readonly brand: BrandingModel;
}

/** Populated role facts available on an authenticated request user. */
export interface FormRecordAccessRole {
  readonly id: string;
  readonly name: string;
}

/** Required Waterline user facts used by record and form access checks. */
export interface FormRecordAccessUser extends Record<string, unknown> {
  readonly id: string;
  readonly username: string;
  readonly type: string;
  readonly name: string;
  readonly email: string;
  readonly roles: FormRecordAccessRole[];
}

export interface ValidationOperationDiscoveryOptions {
  readonly brand: BrandingModel;
  readonly form: FormAttributes;
  readonly recordType?: string;
  readonly record?: RecordLike | null;
  readonly user?: UserModel | Record<string, unknown> | null;
  readonly editable: boolean;
  readonly targetStep?: string;
}

/** Detached configured-form input for candidate-independent record-contract startup compilation. */
export interface ConfiguredRecordContractFormCandidate {
  readonly name: string;
  readonly form: unknown;
  readonly reusableFormDefinitions: unknown;
}

export type PublicFormAttributes = FormAttributes & {
  validationOperations?: ValidationOperationDiscovery[];
};

type RecordValidationDiscoveryService = {
  discoverOperations(request: RecordValidationOperationDiscoveryRequest): Promise<ValidationOperationDiscovery[]>;
};

export namespace Services {
  /**
   * Forms related functions...
   *
   * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
   *
   */
  export class Forms extends services.Core.Service {
    private readonly generatedViewOnlyMetadataComponentName = 'generated_view_only_metadata_display';

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
      'buildContractFormConfig',
      'listConfiguredRecordContractForms',
      'discoverValidationOperations',
      'toPublicForm',
    ];

    public async bootstrap(workflowStep: WorkflowStepLike, brandingId: string): Promise<unknown> {
      this.logger.verbose(
        `Bootstrapping form for workflow step: ${workflowStep.id} with form config: ${workflowStep.config.form}`
      );
      let form = await Form.find({
        name: workflowStep.config.form,
        branding: brandingId,
      });
      if (sails.config.appmode.bootstrapAlways) {
        this.logger.verbose(`Destroying existing form definitions: ${workflowStep.config.form}`);
        await Form.destroyOne({
          name: workflowStep.config.form,
          branding: brandingId,
        });
        form = null;
      }
      let formDefs: string[] = [];
      let formName: string | null = null;
      const formRegistry = this.getFormConfigRegistry();
      this.logger.verbose('Form registry: ');
      this.logger.verbose(JSON.stringify(formRegistry));
      this.logger.verbose('Found : ');
      this.logger.verbose(form);
      if (!form || (Array.isArray(form) && form.length == 0)) {
        this.logger.verbose('Bootstrapping form definitions..');
        // only bootstrap the form for this workflow step
        _.forOwn(formRegistry, (_formDef: unknown, formName: string) => {
          if (formName == workflowStep.config.form) {
            formDefs.push(formName);
          }
        });
        formDefs = _.uniq(formDefs);
        this.logger.verbose(JSON.stringify(formDefs));
        const firstFormDef = _.isArray(formDefs) ? formDefs[0] : null;
        formName = firstFormDef ?? null;
      } else {
        this.logger.verbose('Not Bootstrapping form definitions... ');
      }
      // check now if the form already exists, if it does, ignore...
      const existingFormDef = (await Form.find({
        name: formName,
        branding: brandingId,
      })) as unknown as FormAttributes[];
      const existCheck: { formName: string | null; existingFormDef: FormAttributes[] } = {
        formName: formName,
        existingFormDef: existingFormDef,
      };

      this.logger.verbose(`Existing form check: ${existCheck.formName}`);
      this.logger.verbose(JSON.stringify(existCheck));
      formName = null;
      if (_.isUndefined(existCheck.existingFormDef) || _.isEmpty(existCheck.existingFormDef)) {
        formName = existCheck.formName;
      } else {
        this.logger.verbose(
          `Existing form definition for form name: ${existCheck.existingFormDef[0]?.name}, ignoring bootstrap.`
        );
      }

      this.logger.verbose('FormName is:');
      this.logger.verbose(formName);
      let result = null;
      if (formName) {
        this.logger.verbose(`Preparing to create form...`);
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
          validationOperations: formConfigRaw.validationOperations as FormConfigFrame['validationOperations'],
          behaviours: formConfigRaw.behaviours as FormConfigFrame['behaviours'],
          defaultLayoutComponent: formConfigRaw.defaultLayoutComponent as FormConfigFrame['defaultLayoutComponent'],
          componentDefinitions: formConfigRaw.componentDefinitions as FormConfigFrame['componentDefinitions'],
          debugValue: formConfigRaw.debugValue as FormConfigFrame['debugValue'],
          attachmentFields: (formConfigRaw.attachmentFields ?? []) as FormConfigFrame['attachmentFields'],
          serverSyncOnSave: formConfigRaw.serverSyncOnSave as FormConfigFrame['serverSyncOnSave'],

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

        result = (await Form.create(formObj)) as unknown as FormAttributes;
        this.logger.verbose('Created form record: ');
        this.logger.verbose(result);
      }

      if (result) {
        this.logger.verbose(`Updating workflowstep ${workflowStep.id} to form: ${result.id}`);
        // update the workflow step to reference the form
        return await WorkflowStep.update({
          id: workflowStep.id,
        }).set({
          form: result.id,
        });
      }

      return null;
    }

    private getFormConfigRegistry(): Record<string, unknown> {
      const appPath = _.get(sails, 'config.appPath', process.cwd());
      try {
        this.logger.verbose(
          `Attempting to load form config registry from file system at path: ${appPath}/api/form-config`
        );
        const registryModule = require(path.join(appPath, 'api', 'form-config')) as { forms?: Record<string, unknown> };
        return registryModule?.forms ?? {};
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Unable to load form-config registry: ${message}`);
        return {};
      }
    }

    /**
     * Snapshot every registered form without selecting a record, actor, workflow,
     * or operation. RecordSchemaService owns validation and compilation of these
     * detached candidates during its awaited startup phase.
     */
    public listConfiguredRecordContractForms(): readonly ConfiguredRecordContractFormCandidate[] {
      const reusableFormDefinitions = _.cloneDeep(sails.config.reusableFormDefinitions ?? {});
      return Object.entries(this.getFormConfigRegistry())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, form]) =>
          Object.freeze({
            name,
            form: _.cloneDeep(form),
            reusableFormDefinitions: _.cloneDeep(reusableFormDefinitions),
          })
        );
    }

    public listForms = (brandingId?: string): Observable<FormAttributes[]> => {
      const query: Record<string, unknown> = {};
      if (brandingId) {
        query.branding = brandingId;
      }
      return super.getObservable<FormAttributes[]>(Form.find(query));
    };

    public getFormByName = (
      formName: string,
      editMode: boolean,
      brandingId?: string
    ): Observable<FormAttributes | null> => {
      const query: Record<string, unknown> = { name: formName };
      const resolvedBrandingId = brandingId?.trim() || BrandingService.getDefault()?.id?.toString().trim() || '';
      if (resolvedBrandingId) {
        query.branding = resolvedBrandingId;
      }
      return super.getObservable<FormAttributes | null>(Form.findOne(query)).pipe(
        flatMap(form => {
          if (form) {
            return of(form);
          }
          return of(null);
        })
      );
    };

    public async getForm(
      branding: BrandingModel,
      formParam: string,
      editMode: boolean,
      recordType: string,
      currentRec: RecordLike
    ): Promise<FormAttributes | null> {
      // allow client to set the form name to use
      const formName = _.isUndefined(formParam) || _.isEmpty(formParam) ? currentRec.metaMetadata?.form : formParam;

      if (!formName) {
        return null;
      }
      const defaultBrandingId = String(BrandingService.getDefault()?.id ?? '');
      const brandingId = String(branding?.id ?? defaultBrandingId);
      const form = await firstValueFrom(this.getFormByName(formName, editMode, brandingId || undefined));
      if (!form?.configuration) {
        return form;
      }

      const resolvedRecordType = String(recordType || currentRec.metaMetadata?.type || '').trim();
      const currentFormType = String(form.configuration.type ?? '').trim();
      if (currentFormType || !resolvedRecordType) {
        return form;
      }

      return {
        ...form,
        configuration: {
          ...form.configuration,
          type: resolvedRecordType,
        },
      } as FormAttributes;
    }

    /**
     * Remove the server-owned operation policy and add only caller-filtered
     * discovery metadata. Nested form configuration is otherwise preserved for
     * compatibility with existing form clients.
     */
    public toPublicForm(
      form: FormAttributes,
      validationOperations?: readonly ValidationOperationDiscovery[]
    ): PublicFormAttributes {
      const configuration = form.configuration;
      const { validationOperations: _internalOperations, ...publicConfiguration } = configuration ?? {};
      const safeOperations = validationOperations
        ?.map(operation => sanitizeValidationOperationDiscovery(operation))
        .filter((operation): operation is ValidationOperationDiscovery => operation !== undefined);
      return {
        ...form,
        ...(configuration ? { configuration: publicConfiguration as FormConfigFrame } : {}),
        ...(safeOperations
          ? {
              validationOperations: safeOperations,
            }
          : {}),
      };
    }

    /**
     * Discover operations using the same form/type/stage policy resolver as a
     * save, after applying existing record-edit and workflow-transition access.
     * Missing services, actor data, or context fail safely to no operations.
     */
    public async discoverValidationOperations(
      options: ValidationOperationDiscoveryOptions
    ): Promise<ValidationOperationDiscovery[]> {
      if (!options.editable) return [];
      const user = (options.user ?? {}) as Record<string, unknown>;
      const username = String(user.username ?? '').trim();
      if (!username) return [];

      try {
        const recordsService = sails.services.recordsservice as unknown as RecordsService;
        const validationService = sails.services.recordvalidationservice as unknown as RecordValidationDiscoveryService;
        if (
          !recordsService ||
          typeof recordsService.hasEditAccess !== 'function' ||
          typeof recordsService.hasTransitionRoleAuthorization !== 'function' ||
          !validationService ||
          typeof validationService.discoverOperations !== 'function'
        ) {
          return [];
        }

        const actorRoles = Array.isArray(user.roles) ? user.roles : [];
        const normalizedActorRoles = [
          ...new Set(
            actorRoles
              .map(role =>
                typeof role === 'string' ? role.trim() : String((role as Record<string, unknown>)?.name ?? '').trim()
              )
              .filter(Boolean)
          ),
        ].sort(compareRecordValidationIdentifiers);
        const record = options.record ?? null;
        const canEdit = record
          ? recordsService.hasEditAccess(options.brand, user, actorRoles as Record<string, unknown>[], record)
          : true;
        if (!canEdit) return [];

        const recordTypeName = String(
          record?.metaMetadata?.type ?? options.recordType ?? options.form.configuration?.type ?? ''
        ).trim();
        const brandId = String(record?.metaMetadata?.brandId ?? options.brand?.id ?? '').trim();
        const formName = String(record?.metaMetadata?.form ?? options.form.name ?? '').trim();
        if (!recordTypeName || !brandId || !formName) return [];
        if (record && String(options.form.name ?? '').trim() !== formName) return [];
        if (!record) {
          const configuredFormType = String(options.form.configuration?.type ?? '').trim();
          if (configuredFormType && configuredFormType !== recordTypeName) return [];
        }
        const recordType = await firstValueFrom(RecordTypesService.get(options.brand, recordTypeName));
        if (!recordType) return [];
        const workflowSteps = await firstValueFrom(WorkflowStepsService.getAllForRecordType(recordType));
        if (!record) {
          const requestedContextStep = options.targetStep
            ? (workflowSteps ?? []).find(step => String(step?.name ?? '').trim() === options.targetStep?.trim())
            : (workflowSteps ?? []).find(step => step?.starting === true);
          const contextConfig = requestedContextStep?.config;
          const contextFormName = String(
            contextConfig && typeof contextConfig === 'object' && !Array.isArray(contextConfig)
              ? ((contextConfig as Record<string, unknown>).form ?? '')
              : ''
          ).trim();
          if (!contextFormName || contextFormName !== formName) return [];
        }
        const authorizedTargetSteps = (workflowSteps ?? [])
          .filter(step => recordsService.hasTransitionRoleAuthorization(step, user))
          .map(step => String(step?.name ?? '').trim())
          .filter(step => RECORD_VALIDATION_REFERENCE_PATTERN.test(step))
          .sort(compareRecordValidationIdentifiers);
        const targetStep = options.targetStep?.trim();
        if (targetStep && !authorizedTargetSteps.includes(targetStep)) return [];

        const candidate: RecordValidationCandidate = {
          ...(record?.redboxOid ? { redboxOid: String(record.redboxOid) } : {}),
          metadata: record?.metadata ?? {},
          metaMetadata: {
            ...(record?.metaMetadata ?? {}),
            brandId,
            type: recordTypeName,
            form: formName,
          },
          ...(record?.workflow ? { workflow: record.workflow } : {}),
        };
        const operations = await validationService.discoverOperations({
          candidate,
          writeKind: targetStep ? (record ? 'transition' : 'create') : record ? 'update' : 'create',
          ...(targetStep ? { targetStep } : {}),
          actor: { authenticated: true, roles: normalizedActorRoles },
          canEdit: true,
          authorizedTargetSteps,
        });
        const transportTargets = new Set(targetStep ? [targetStep] : authorizedTargetSteps);
        const merged = new Map<string, ValidationOperationDiscovery>();
        for (const operation of operations) {
          const safeOperation = sanitizeValidationOperationDiscovery(operation, transportTargets);
          if (safeOperation) merged.set(safeOperation.name, safeOperation);
        }
        return [...merged.values()].sort((left, right) => compareRecordValidationIdentifiers(left.name, right.name));
      } catch (error: unknown) {
        const errorType = error instanceof Error ? error.name : typeof error;
        const recordType = String(options.record?.metaMetadata?.type ?? options.recordType ?? '').trim();
        const formName = String(options.record?.metaMetadata?.form ?? options.form.name ?? '').trim();
        this.logger.warn(
          `Validation operation discovery was safely omitted` +
            ` (recordType=${RECORD_VALIDATION_REFERENCE_PATTERN.test(recordType) ? recordType : 'unavailable'},` +
            ` form=${RECORD_VALIDATION_REFERENCE_PATTERN.test(formName) ? formName : 'unavailable'},` +
            ` errorType=${errorType}).`
        );
        return [];
      }
    }

    public getFormByStartingWorkflowStep(
      branding: BrandingModel,
      recordType: string,
      _editMode: boolean
    ): Observable<FormAttributes> {
      const starting = true;

      return super
        .getObservable<Record<string, unknown> | null>(
          RecordType.findOne({
            key: branding.id + '_' + recordType,
          })
        )
        .pipe(
          flatMap(recordTypeRecord => {
            const recordTypeId = String((recordTypeRecord as Record<string, unknown>)?.id ?? '');
            return super.getObservable<WorkflowStepLike | null>(
              WorkflowStep.findOne({
                recordType: recordTypeId,
                starting: starting,
              })
            );
          }),
          flatMap(workflowStep => {
            if (workflowStep?.starting == true) {
              return super.getObservable<FormAttributes | null>(
                Form.findOne({
                  name: workflowStep.config.form,
                  branding: branding.id,
                })
              );
            }
            return of(null);
          }),
          flatMap(form => {
            if (form) {
              return of(form);
            }
            return of(null);
          }),
          take(1),
          tap(form => {
            if (!form) {
              this.logger.warn(
                `No starting form found for branding '${String(branding?.id ?? '')}', recordType '${recordType}'`
              );
            }
          }),
          map(form => form as unknown as FormAttributes),
          catchError((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(
              `Error loading starting workflow form for branding '${String(branding?.id ?? '')}', recordType '${recordType}': ${message}`
            );
            return of(null as unknown as FormAttributes);
          })
        );
    }

    public inferSchemaFromMetadata(record: RecordLike): Record<string, unknown> {
      const schema = createSchema(record.metadata ?? {});
      return schema;
    }

    public async generateFormFromSchema(
      branding: BrandingModel,
      recordType: string,
      record: RecordLike
    ): Promise<FormConfigFrame | Record<string, unknown>> {
      if (recordType == '') {
        recordType = String(_.get(record, 'metaMetadata.type', ''));
        if (recordType == '') {
          return {};
        }
      }

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
            controlType: 'anchor',
          },
          variableSubstitutionFields: ['value'],
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
            isSubmissionButton: true,
          },
          variableSubstitutionFields: ['redirectLocation'],
        },
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
            form: {
              onFormLoaded: [
                {
                  action: 'utilityService.runTemplate',
                  template: '',
                  includeFieldInFnCall: true,
                },
              ],
            },
          },
        },
      };

      const groupComponentTemplate = {
        class: 'Container',
        compClass: 'GenericGroupComponent',
        definition: {
          name: '',
          cssClasses: 'form-inline',
          fields: [],
        },
      };

      const groupTextFieldTemplate = {
        class: 'TextField',
        definition: {
          name: '',
          label: '',
          type: 'text',
          groupName: '',
          groupClasses: 'width-30',
          cssClasses: 'width-80 form-control',
        },
      };

      const repeatableGroupComponentTemplate = {
        class: 'RepeatableContainer',
        compClass: 'RepeatableGroupComponent',
        definition: {
          name: '',
          label: '',
          help: '',
          forceClone: ['fields'],
          fields: [],
        },
      };

      const objectFieldHeadingTemplate = {
        class: 'Container',
        compClass: 'TextBlockComponent',
        definition: {
          value: '',
          type: 'h3',
        },
      };

      const mainTitleFieldName = 'title';

      const fieldList = [];

      for (const fieldKey of fieldKeys) {
        const schemaProperty =
          (schema.properties?.[fieldKey] as {
            type?: string;
            items?: { type?: string; properties?: Record<string, { type?: string }> };
            properties?: Record<string, { type?: string }>;
          }) ?? {};

        const schemaType = schemaProperty.type;
        if (schemaType === 'string') {
          const textField = _.cloneDeep(textFieldTemplate);
          _.set(textField.definition, 'name', fieldKey);
          _.set(textField.definition, 'label', fieldKey);
          _.set(
            textField.definition,
            'subscribe.form.onFormLoaded[0].template',
            '<%= _.trim(field.fieldMap["' +
              fieldKey +
              '"].field.value) == "" ? field.translationService.t("@lookup-record-field-empty") : field.fieldMap["' +
              fieldKey +
              '"].field.value %>'
          );
          fieldList.push(textField);
        }
        if (schemaType === 'array') {
          const itemType = schemaProperty.items?.type;
          if (itemType === 'string') {
            const textField = _.cloneDeep(textFieldTemplate);
            _.set(textField.definition, 'name', fieldKey);
            _.set(textField.definition, 'label', fieldKey);
            _.set(
              textField.definition,
              'subscribe.form.onFormLoaded[0].template',
              '<%= _.isEmpty(_.trim(field.fieldMap["' +
                fieldKey +
                '"].field.value)) ? [field.translationService.t("@lookup-record-field-empty")] : field.fieldMap["' +
                fieldKey +
                '"].field.value %>'
            );
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
              type: 'h1',
            },
          },
          {
            class: 'Container',
            compClass: 'GenericGroupComponent',
            definition: {
              cssClasses: 'form-inline',
              fields: buttonsList,
            },
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
                    fields: fieldList,
                  },
                },
              ],
            },
          },
        ],
      };

      const form: FormConfigFrame = formObject as FormConfigFrame;

      return form;
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
     * Build the translation lookup used to resolve form config default values.
     *
     * Returns undefined when the translation service is not available, so the form
     * config values are left as they are rather than failing to build the form.
     *
     * @param branding The branding name.
     */
    private buildFormConfigTranslator(branding?: string): ((key: string) => string) | undefined {
      if (typeof TranslationService === 'undefined' || typeof TranslationService?.t !== 'function') {
        return undefined;
      }
      const brandingName = branding || 'default';
      return (key: string): string => {
        try {
          return String(TranslationService.t(key, undefined, 'en', brandingName) ?? key);
        } catch (error) {
          this.logger.warn(`Failed to translate form config value '${key}': ${(error as Error)?.message}`);
          return key;
        }
      };
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
      branding?: string,
      contextVariablesMap?: Record<string, unknown>,
      recordAccessContext?: FormRecordAccessContext
    ): Promise<FormConfigOutline> {
      const constructor = new ConstructFormConfigVisitor(this.logger);
      const constructed = await constructor.start({
        data: item,
        reusableFormDefs,
        formMode,
        record: recordMetadata,
        translate: this.buildFormConfigTranslator(branding),
      });
      const vocabVisitor = new VocabInlineFormConfigVisitor(this.logger);
      await vocabVisitor.resolveVocabs(constructed, branding, {
        includeHistoricalValues: recordMetadata !== null && recordMetadata !== undefined,
      });
      const contextVariablesVisitor = new ContextVariablesFormConfigVisitor(this.logger);
      await contextVariablesVisitor.applyContextVariables(constructed, contextVariablesMap);
      if (recordMetadata && recordAccessContext) {
        const recordsService = sails.services.recordsservice as unknown as RecordsService;
        const relatedVisitor = new RelatedObjectDataInlineFormConfigVisitor(this.logger, recordsService);
        await relatedVisitor.resolve(constructed, recordMetadata, recordAccessContext);
      }
      // create the client form config
      const visitor = new ClientFormConfigVisitor(this.logger);
      const result = await visitor.start({ form: constructed, formMode, userRoles, reusableFormDefs });
      if (!result) {
        throw new Error(
          `The form config is invalid because all form fields were removed, ` +
            `the form config must have at least one field the current user can view: ${JSON.stringify({
              item,
              formMode,
              userRoles,
              recordData: recordMetadata,
              reusableFormDefs,
            })}`
        );
      }

      const componentDefinitions = result.componentDefinitions as unknown[] | undefined;
      if (componentDefinitions?.length) {
        const metadataComponent = this.findComponentDefinitionByName(
          componentDefinitions,
          this.generatedViewOnlyMetadataComponentName
        );
        if (metadataComponent?.component?.config) {
          metadataComponent.component.config.content = _.cloneDeep(recordMetadata ?? {});
        }
      }

      return result;
    }

    /**
     * Build the effective form used to compile a record contract.
     *
     * Create contracts deliberately use the form defaults rather than a synthetic
     * record candidate. This keeps candidate-dependent form branches available to
     * the contract compiler. Update contracts use the authoritative existing record.
     */
    public async buildContractFormConfig(
      context: RecordContractContext,
      recordAccessContext?: FormRecordAccessContext
    ): Promise<RecordContractFormBuildResult> {
      const { resolution } = context;
      const sourceForm: FormConfigFrame = _.cloneDeep({
        ...resolution.sourceForm,
        componentDefinitions: [...resolution.sourceForm.componentDefinitions],
      });
      const reusableFormDefinitions: ReusableFormDefinitions = {};
      for (const [name, definitions] of Object.entries(resolution.reusableFormDefinitions)) {
        reusableFormDefinitions[name] = _.cloneDeep([...definitions]);
      }
      const recordMetadata =
        context.publicContext.kind === 'update' ? _.cloneDeep(context.resolution.existingRecord) : null;

      const effectiveForm = await this.buildClientFormConfig(
        sourceForm,
        resolution.formMode,
        [...resolution.actor.roles],
        recordMetadata,
        reusableFormDefinitions,
        context.publicContext.brand,
        _.cloneDeep(resolution.contextVariables),
        recordAccessContext
      );
      effectiveForm.componentDefinitions = this.removeNonSubmittableContractComponents(
        effectiveForm.componentDefinitions ?? []
      );

      if (effectiveForm.componentDefinitions.length === 0) {
        return { ok: false, reason: 'empty-effective-form' };
      }

      return { ok: true, effectiveForm };
    }

    /** Remove display-only leaves and structural containers with no submittable descendants. */
    private removeNonSubmittableContractComponents(
      componentDefinitions: AvailableFormComponentDefinitionOutlines[]
    ): AvailableFormComponentDefinitionOutlines[] {
      return componentDefinitions.filter(componentDefinition =>
        this.pruneAndShouldRetainContractComponent(componentDefinition)
      );
    }

    private pruneAndShouldRetainContractComponent(
      componentDefinition: AvailableFormComponentDefinitionOutlines
    ): boolean {
      switch (componentDefinition.component.class) {
        case 'AccordionComponent': {
          const config = componentDefinition.component.config;
          if (!config) {
            return false;
          }
          config.panels = config.panels.filter(panel => this.pruneAndShouldRetainContractComponent(panel));
          return config.panels.length > 0;
        }
        case 'AccordionPanelComponent':
        case 'GroupComponent':
        case 'ReusableComponent':
        case 'TabContentComponent': {
          const config = componentDefinition.component.config;
          if (!config) {
            return false;
          }
          config.componentDefinitions = this.removeNonSubmittableContractComponents(config.componentDefinitions);
          return config.componentDefinitions.length > 0;
        }
        case 'PublishDataLocationSelectorComponent': {
          const config = componentDefinition.component.config;
          if (config?.headerActions) {
            config.headerActions = this.removeNonSubmittableContractComponents(config.headerActions);
          }
          return componentDefinition.model !== undefined;
        }
        case 'QuestionTreeComponent': {
          const config = componentDefinition.component.config;
          if (config) {
            config.componentDefinitions = this.removeNonSubmittableContractComponents(config.componentDefinitions);
          }
          return componentDefinition.model !== undefined;
        }
        case 'RepeatableComponent': {
          const config = componentDefinition.component.config;
          if (!config?.elementTemplate || !this.pruneAndShouldRetainContractComponent(config.elementTemplate)) {
            return false;
          }
          return componentDefinition.model !== undefined;
        }
        case 'TabComponent': {
          const config = componentDefinition.component.config;
          if (!config) {
            return false;
          }
          config.tabs = config.tabs.filter(tab => this.pruneAndShouldRetainContractComponent(tab));
          return config.tabs.length > 0;
        }
        default:
          return componentDefinition.model !== undefined;
      }
    }

    private findComponentDefinitionByName(
      componentDefinitions: unknown[],
      targetName: string
    ): FormComponentNodeLike | undefined {
      for (const componentDefinition of componentDefinitions) {
        const typedDefinition = componentDefinition as FormComponentNodeLike;
        if (typedDefinition?.name === targetName) {
          return typedDefinition;
        }

        const nestedDefinitions = typedDefinition?.component?.config?.componentDefinitions;
        if (nestedDefinitions?.length) {
          const nestedMatch = this.findComponentDefinitionByName(nestedDefinitions, targetName);
          if (nestedMatch) {
            return nestedMatch;
          }
        }
      }

      return undefined;
    }
  }
}

declare global {
  let FormsService: Services.Forms;
}
