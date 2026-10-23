// Copyright (c) 2025 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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

import { FormProjection } from '../forms/FormProjection';
import { Services as services } from '../CoreService';
import { PopulateExportedMethods } from '../decorator/PopulateExportedMethods.decorator';
import {
    FormValidatorSummaryErrors,
    FormConfigFrame, TemplateCompileInput, FormModesConfig,
    ReusableFormDefinitions,
    RecordValueChange, RecordValuePath
} from "@researchdatabox/sails-ng-common";
import {firstValueFrom} from "rxjs";
import { ValidatorFormConfigVisitor } from "../visitor/validator.visitor";
import { TemplateFormConfigVisitor } from "../visitor/template.visitor";
import { ConstructFormConfigVisitor } from "../visitor/construct.visitor";
import { ClientFormConfigVisitor } from '../visitor/client.visitor';
import { VocabInlineFormConfigVisitor } from '../visitor/vocab-inline.visitor';
import { ContextVariablesFormConfigVisitor } from '../visitor/context-variables.visitor';

export namespace Services {

    export type BasicRedboxRecord = {
        redboxOid: string,
        metaMetadata?: Record<string, unknown>,
        metadata: Record<string, unknown>,
    } & Record<string, unknown>;

    /**
     * The path from the root of the item to the key in the original, which has a change.
     * Object property keys are strings, array indicies are integers.
     */
    export type FormRecordConsistencyChangePath = RecordValuePath;

    /**
     * The properties of one change.
     */
    export type FormRecordConsistencyChange = RecordValueChange;

    /**
     * A service for verifying that form config and one or two associated Records are consistent.
     *
     * This service does 4 main things:
     * - compares a record to a form config json schema and returns changes
     * - merges a stored record to a record sent from a client, and creates a consistent record based on the current user's access
     * - compares two full records and returns changes
     * - generate a form config showing only the changes, from a record and the changes to the record
     *
     * These functions are in the same service because they are conceptually similar
     * and the functionality to implement them overlaps.
     */
    @PopulateExportedMethods
    export class FormRecordConsistency extends services.Core.Service {
        /**
         * Update a stored record by merging the stored record and the new record,
         * using knowledge of the current user's access to the record properties.
         *
         * The existing original record will be retrieved from storage.
         * The existing original record won't be changed.
         *
         * @param changed The new record.
         * @param formMode The form mode.
         * @param reusableFormDefs The reusable form definitions.
         * @return The merged record.
         */
        public async mergeRecord(
            changed: BasicRedboxRecord, formMode: FormModesConfig, reusableFormDefs?: ReusableFormDefinitions
        ): Promise<BasicRedboxRecord> {
            // get the original record
            const original = await RecordsService.getMeta(changed.redboxOid);

            // get the original record's form config
            const formName = changed?.metaMetadata?.['form'];
            const defaultBrandId = String(BrandingService.getDefault()?.id ?? '');
            const brandId = String(changed?.metaMetadata?.['brandId'] ?? defaultBrandId);
            const isEditMode = formMode === "edit";
            const formRecord = await firstValueFrom(FormsService.getFormByName(String(formName ?? ""), isEditMode, brandId));
            const formConfig = formRecord?.configuration;
            if (!formConfig) {
                throw new Error(`Form configuration not found for form: ${formName}`);
            }

            // build the client form config
            const userRoles: string[] | undefined = undefined;
            const recordMetadata = original?.metadata;
            const clientFormConfig = await FormsService.buildClientFormConfig(formConfig, formMode, userRoles, recordMetadata, reusableFormDefs);

            // merge the original and changed records using the client form config to know which changes to include
            return await this.mergeRecordClientFormConfig(original as unknown as BasicRedboxRecord, changed, clientFormConfig, formMode, reusableFormDefs);
        }

        /**
         * Merge the existing original and changed records using the clientFormConfig.
         * No changes are made to the records. The return value is a new instance.
         *
         * Note that arrays are merged by either of these approaches:
         *   - the user has full access to the array, the new array will be the full array, so replace any existing array
         *   - the user has no access to the array, so leave the existing array
         *
         * The implication of the array merging approach is that arrays cannot contain components that have constraints,
         * as it is not possible to determine which array element an existing component's value should be part of, as the array elements may have been moved.
         *
         * @param original The existing original record.
         * @param changed The new record.
         * @param clientFormConfig The client form config, the fields the current user can't access are already filtered out.
         * @param formMode The form mode.
         * @param reusableFormDefs The reusable form definitions.
         * @return The merged record.
         */
        public mergeRecordClientFormConfig(...args: Parameters<FormProjection['mergeRecordClientFormConfig']>) {
            // Keep the comparison receiver so hook overrides of nested projection methods still apply.
            return Reflect.apply(FormProjection.prototype.mergeRecordClientFormConfig, this, args) as ReturnType<FormProjection['mergeRecordClientFormConfig']>;
        }

        /**
         * Project authoritative metadata to the fields in an already filtered client form.
         * This intentionally uses an empty original so server-only metadata is not retained.
         */
        public projectMetadataClientFormConfig(...args: Parameters<FormProjection['projectMetadataClientFormConfig']>) {
            return Reflect.apply(FormProjection.prototype.projectMetadataClientFormConfig, this, args) as ReturnType<FormProjection['projectMetadataClientFormConfig']>;
        }

        /**
         * Merge the original and changed records, using the client form config to know which changes to include.
         * @param original The existing original record.
         * @param changed The new record.
         * @param permittedChanges The schema describing which properties are available to be modified.
         * @param changes The differences between the original and the changed items.
         * @param currentPath The path to the current point in the structure.
         */
        public mergeRecordMetadataPermitted(...args: Parameters<FormProjection['mergeRecordMetadataPermitted']>) {
            return Reflect.apply(FormProjection.prototype.mergeRecordMetadataPermitted, this, args) as ReturnType<FormProjection['mergeRecordMetadataPermitted']>;
        }

        /**
         * Convert the form config into the matching data model with defaults.
         * @param item The top-level form config.
         * @param formMode The form mode.
         * @param reusableFormDefs The reusable form definitions.
         */
        public buildDataModelDefaultForFormConfig(...args: Parameters<FormProjection['buildDataModelDefaultForFormConfig']>) {
            return Reflect.apply(FormProjection.prototype.buildDataModelDefaultForFormConfig, this, args) as ReturnType<FormProjection['buildDataModelDefaultForFormConfig']>;
        }

        /**
         * Convert a form config into a schema describing the data model it creates.
         * @param item The form config.
         * @param formMode The form mode.
         * @param reusableFormDefs The reusable form definitions.
         */
        public buildSchemaForFormConfig(...args: Parameters<FormProjection['buildSchemaForFormConfig']>) {
            return Reflect.apply(FormProjection.prototype.buildSchemaForFormConfig, this, args) as ReturnType<FormProjection['buildSchemaForFormConfig']>;
        }

        /**
         * Compare two data items.
         * @param original The first item, used as the 'original' for the comparison.
         * @param changed The second item, used as the 'changes' for the comparison.
         * @param path The current path of the original.
         */
        public compareRecords(...args: Parameters<FormProjection['compareRecords']>) {
            return Reflect.apply(FormProjection.prototype.compareRecords, this, args) as ReturnType<FormProjection['compareRecords']>;
        }

        // TODO: implement this
        // /**
        //  * Use the changes to an original record to create a form config to display the changes.
        //  *
        //  * Form config is only for 'view' mode.
        //  *
        //  * @param original The original record data.
        //  * @param changes The changes to the original record data.
        //  */
        // public async buildFormConfigForChanges(
        //     original: { redboxOid: string, [key: string]: unknown },
        //     changes: FormRecordConsistencyChange[],
        // ): Promise<FormConfigFrame> {
        //     // TODO: Use the record and form config and/or changes between the record and form config
        //     //  to build a new form config that displays only the changes.
        //     //return {};
        //     throw new Error("Not implemented");
        // }

        // TODO: implement this
        // /**
        //  * Validate a record's structure matches the form config associated with the recordtype.
        //  *
        //  * @param record The record data, including the record type.
        //  * @param context The context for the user providing the record.
        //  */
        // public async validateRecordSchema(record: BasicRedboxRecord): Promise<FormRecordConsistencyChange[]> {
        //     /*
        //     // get the record's form name
        //     const formName = record?.metaMetadata?.['form'];
        //     // the validation will be done on all values present in the data model, so use the form config with all fields included
        //     const isEditMode = true;
        //     // get the record's form config
        //     const formConfig = await firstValueFrom(FormsService.getFormByName(formName, isEditMode));
        //     // get the schema from the form config
        //     const schema = this.buildSchemaForFormConfig(formConfig);
        //     // TODO: Match the schema to the record and return any differences.
        //     return [];
        //     */
        //     throw new Error("Not implemented");
        // }

        /**
         * Validate a record's data model values using the validators specified in the form config.
         *
         * @param record The record data, including the record type.
         * @param enabledValidationGroups The validation groups to enable.
         * @param reusableFormDefs The reusable form definitions.
         */
        public async validateRecordValuesForFormConfig(
            record: BasicRedboxRecord,
            enabledValidationGroups?: string[],
            reusableFormDefs?: ReusableFormDefinitions
        ): Promise<FormValidatorSummaryErrors[]> {
            // get the record's form name
            const formName = record?.metaMetadata?.['form'];

            // the validation will be done on all values present in the data model,
            // so use the form config with all fields included
            const formMode = "edit";
            const isEditMode = formMode === "edit";

            const defaultBrandId = String(BrandingService.getDefault()?.id ?? '');
            const brandId = String(record?.metaMetadata?.['brandId'] ?? defaultBrandId);
            // get the record's form config
            const formRecord = await firstValueFrom(FormsService.getFormByName(String(formName ?? ""), isEditMode, brandId));
            const formConfig = formRecord?.configuration;
            if (!formConfig) {
                throw new Error(`Form configuration not found for form: ${formName}`);
            }

            // Get the validator definitions from the sails config, so the definitions can be overwritten.
            const validatorDefinitions = sails.config.validators.definitions;

            const constructor = new ConstructFormConfigVisitor(this.logger);
            const constructed = await constructor.start({
              data: formConfig,
              formMode,
              reusableFormDefs,
              record: record?.metadata ?? {}
            });

            const visitor = new ValidatorFormConfigVisitor(this.logger);
            return visitor.start({
              form: constructed,
              enabledValidationGroups: enabledValidationGroups ?? ["all"],
              validatorDefinitions,
            });
        }

        /**
         * Remove hydrated client-side model values before re-running construct/schema visitors.
         * Client form config includes runtime `model.config.value`, but construct only accepts
         * author-time defaults in `model.config.defaultValue`.
         */
        private stripModelValuesFromFormConfig(...args: Parameters<FormProjection['stripModelValuesFromFormConfig']>) {
            return Reflect.apply(FormProjection.prototype.stripModelValuesFromFormConfig, this, args) as ReturnType<FormProjection['stripModelValuesFromFormConfig']>;
        }

        /**
         * Extract the templates that need to be compiled from the form config.
         * This method extracts the raw uncompiled templates.
         * The templates are compiled by the TemplateService.buildClientMapping.
         * @param item The form config.
         * @param formMode The form mode.
         * @param userRoles The current user's roles.
         * @param recordMetadata The record metadata.
         * @param reusableFormDefs The reusable form definitions.
         */
        public async extractRawTemplates(
          item: FormConfigFrame,
          formMode: FormModesConfig,
          userRoles?: string[],
          recordMetadata?: Record<string, unknown> | null,
          reusableFormDefs?: ReusableFormDefinitions
        ): Promise<TemplateCompileInput[]> {
          const constructor = new ConstructFormConfigVisitor(this.logger);
          const constructedForm = await constructor.start({ data: item, reusableFormDefs, formMode, record: recordMetadata });
          const vocabVisitor = new VocabInlineFormConfigVisitor(this.logger);
          await vocabVisitor.resolveVocabs(constructedForm, undefined, {
            includeHistoricalValues: recordMetadata !== null && recordMetadata !== undefined
          });
          const contextVariablesVisitor = new ContextVariablesFormConfigVisitor(this.logger);
          await contextVariablesVisitor.applyContextVariables(constructedForm);
          const rawBehaviours = _.cloneDeep(constructedForm.behaviours);

          const clientVisitor = new ClientFormConfigVisitor(this.logger);
          const clientForm = await clientVisitor.start({
            form: constructedForm,
            formMode,
            userRoles,
            reusableFormDefs,
          });

          const form = clientForm;
          form.behaviours = rawBehaviours;

          const visitor = new TemplateFormConfigVisitor(this.logger);
          return await visitor.start({form});
        }

        /**
         * Extract the keys and entries from an object or array.
         * @param item Extract keys and values from this item.
         * @private
         */
        private toKeysEntries(...args: Parameters<FormProjection['toKeysEntries']>) {
            return Reflect.apply(FormProjection.prototype.toKeysEntries, this, args) as ReturnType<FormProjection['toKeysEntries']>;
        }

        /**
         * Check whether a 'check' array starts with a 'base' array.
         * @param base The shorter array.
         * @param check The longer array.
         * @private
         */
        private arrayStartsWithArray(base: unknown[], check: unknown[]) {
            return base?.every((value, index) => check?.length > index && check?.[index] == value);
        }
    }
}

declare global {
    let FormRecordConsistencyService: Services.FormRecordConsistency;
}
