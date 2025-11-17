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

import { PopulateExportedMethods, Services as services} from '@researchdatabox/redbox-core-types';
import {
    FormComponentDefinition,
    ValidatorsSupport,
    guessType, FormValidatorSummaryErrors, formValidatorsSharedDefinitions, SimpleServerFormValidatorControl,
    FormValidatorDefinition, GroupFormComponentDefinitionFrame,
    FormComponentDefinitionFrame, FormConfigFrame, DefaultValueFormConfigVisitor, JsonTypeDefSchemaFormConfigVisitor,
    TemplateFormConfigVisitor, TemplateCompileInput, ConstructFormConfigVisitor, FormModesConfig
} from "@researchdatabox/sails-ng-common";
import {Sails} from "sails";
import {firstValueFrom} from "rxjs";



declare var sails: Sails;
declare var _;
declare var RecordsService;
declare var FormsService;

export module Services {

    export type BasicRedboxRecord = {
        redboxOid: string,
        metaMetadata?: Record<string, unknown>,
        metadata: Record<string, unknown>,
    } & Record<string, unknown>;

    /**
     * The path from the root of the item to the key in the original, which has a change.
     * Object property keys are strings, array indicies are integers.
     */
    export type FormRecordConsistencyChangePath = (string | number)[];

    /**
     * The properties of one change.
     */
    export interface FormRecordConsistencyChange {
        /**
         * The kind of change:
         * - "add": an object property or array index that was not previously present
         * - "delete": an object property or array index that was previously present has been removed
         * - "change": an object property or array index that already existed has a value that has changed
         */
        kind: "add" | "delete" | "change";

        /**
         * The path from the root of the item to the key in the original.
         */
        path: FormRecordConsistencyChangePath;

        /**
         * The original value of the property or array index before the change.
         */
        original: unknown;

        /**
         * The new value of the property or array index after the change.
         */
        changed: unknown;
    }

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
        private validatorSupport = new ValidatorsSupport();
        /**
         * Update a stored record by merging the stored record and the new record,
         * using knowledge of the current user's access to the record properties.
         *
         * The existing original record will be retrieved from storage.
         * The existing original record won't be changed.
         *
         * @param changed The new record.
         * @param formMode The form mode.
         * @return The merged record.
         */
        public async mergeRecord(changed: BasicRedboxRecord, formMode: FormModesConfig): Promise<BasicRedboxRecord> {
            // get the original record
            const original = await RecordsService.getMeta(changed.redboxOid);

            // get the original record's form config
            const formName = changed?.metaMetadata?.['form'];
            const isEditMode = formMode === "edit";
            const formConfig = await FormsService.getFormByName(formName, isEditMode).toPromise();

            // build the client form config
            const clientFormConfig = FormsService.buildClientFormConfig(formConfig, formMode);

            // merge the original and changed records using the client form config to know which changes to include
            return this.mergeRecordClientFormConfig(original, changed, clientFormConfig, formMode);
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
         * @return The merged record.
         */
        public mergeRecordClientFormConfig(
            original: BasicRedboxRecord,
            changed: BasicRedboxRecord,
            clientFormConfig: FormConfigFrame,
            formMode: FormModesConfig,
        ): BasicRedboxRecord {
            const permittedChanges = this.buildSchemaForFormConfig(clientFormConfig, formMode);
            const originalMetadata = original?.metadata ?? {};
            const changedMetadata = changed?.metadata ?? {};
            const changes = this.compareRecords(original, changed);
            return {
                ...original,
                redboxOid: original?.redboxOid ?? "",
                metadata: this.mergeRecordMetadataPermitted(originalMetadata, changedMetadata, permittedChanges, changes),
            }
        }

        /**
         * Merge the original and changed records, using the client form config to know which changes to include.
         * @param original The existing original record.
         * @param changed The new record.
         * @param permittedChanges The schema describing which properties are available to be modified.
         * @param changes The differences between the original and the changed items.
         * @param currentPath The path to the current point in the structure.
         */
        public mergeRecordMetadataPermitted(
            original: object,
            changed: object,
            permittedChanges: Record<string, unknown> | unknown,
            changes: FormRecordConsistencyChange[],
            currentPath?: FormRecordConsistencyChangePath
        ): Record<string, unknown> {
            // ensure there is a current path
            currentPath = currentPath ?? [];

            // filter the changes to only those relevant to the current path
            const relevantChanges = changes?.filter(i => {
                return !currentPath || this.arrayStartsWithArray(currentPath, i?.path);
            });

            // check all keys in either the original or changes objects
            const {keys: originalKeys} = this.toKeysEntries(original);
            const {keys: changedKeys} = this.toKeysEntries(changed);
            const allKeys = new Set(originalKeys);
            changedKeys.forEach(i => allKeys.add(i));

            // permittedChanged is in JSON Type Def format
            // permitted changes is always for an object (i.e. has property 'properties')
            const permittedChangesObj = permittedChanges as object;
            // if (!('properties' in permittedChangesObj)) {
            //     throw new Error(`Permitted changes must have an object, a 'properties' property, at the top level ${JSON.stringify(permittedChanges)}`)
            // }
            const permittedChangesProps = 'properties' in permittedChangesObj ? permittedChangesObj['properties'] as object : permittedChangesObj;


            // create a new record instance
            const result = {
                // for debugging:
                // _meta: {keys:Array.from(allKeys),currentPath:currentPath},
            };

            // for each key, evaluate the value
            for (const key of allKeys) {
                // pre-calculate aspects of the original item
                const isKeyInOriginal = key in original;
                const originalValue = isKeyInOriginal ? original[key] : undefined;
                const originalValueType = guessType(originalValue);

                // pre-calculate aspects of the changed item
                const isKeyInChanged = key in changed;
                const changedValue = isKeyInChanged ? changed[key] : undefined;
                const changedValueType = guessType(changedValue);

                // pre-calculate aspects of the permitted changes
                const isKeyInPermittedChange = key in permittedChangesProps;
                const permittedChangesValue = permittedChangesProps?.[key];
                const isPermittedChangeObject = isKeyInPermittedChange && 'properties' in permittedChangesValue;
                const isPermittedChangeArray = isKeyInPermittedChange && 'elements' in permittedChangesValue;
                const isPermittedChangeType = isKeyInPermittedChange && 'type' in permittedChangesValue;
                const isPermittedChangeEmpty = isKeyInPermittedChange && Object.keys(permittedChangesValue).length === 0;

                // ensure the permitted changes item is valid
                const isPermittedChangeMatches = {
                    isPermittedChangeObject: isPermittedChangeObject,
                    isPermittedChangeArray: isPermittedChangeArray,
                    isPermittedChangeType: isPermittedChangeType,
                    isPermittedChangeEmpty: isPermittedChangeEmpty,
                };
                if (isKeyInPermittedChange && Object.values(isPermittedChangeMatches).filter(i => i === true).length !== 1) {
                    throw new Error(`Invalid permittedChanges object, all definitions must have a property that is one of 'properties', 'elements', 'type', (none): ${JSON.stringify(isPermittedChangeMatches)} - ${JSON.stringify(permittedChangesValue)}`);
                }

                // evaluate the combinations of original and changed values
                if (
                    isPermittedChangeArray
                    && isKeyInOriginal
                    && isKeyInChanged
                    && originalValueType === "array"
                    && changedValueType === "array"
                ) {
                    // The change is permitted and an array, original and changed have the key and both are arrays.
                    // For an array, the merge logic is to replace the original array with the changed array.
                    // The whole array is replaced because there is no current way to distinguish what from the original should be kept.
                    // TODO: Consider how to replace each element in the array instead of the whole array.
                    //       Replacing the whole array prevents use of constraints in components in the array elements.
                    const newPermittedChanges = permittedChangesValue['elements'] as Record<string, unknown>;
                    result[key] = changedValue.map((changedElement: unknown, index: number) => {
                        // Evaluate the element in the array.
                        const guessedType = guessType(changedElement);
                        if (guessedType === "object") {
                            // For an object, evaluate it as a component value.
                            // NOTE: The 'original' element does not include elementTemplate default values,
                            //       because that default is for new entries, not existing entries.
                            const originalElement = {};
                            const newPath = [...currentPath, key, index];
                            const keyChanges = relevantChanges?.filter(i => this.arrayStartsWithArray(newPath, i?.path));
                            sails.log.verbose(`mergeRecordMetadataPermitted - array`, {
                                originalElement: originalElement,
                                changedElement: changedElement,
                                newPermittedChanges: newPermittedChanges,
                                keyChanges: keyChanges,
                                newPath: newPath,
                            });
                            return this.mergeRecordMetadataPermitted(originalElement, changedElement as object, newPermittedChanges, keyChanges, newPath);
                        } else {
                            // For anything that's not an object, there's nothing else to do, return it.
                            return changedElement;
                        }
                    });

                } else if (
                    isPermittedChangeObject
                    && isKeyInOriginal
                    && isKeyInChanged
                    && originalValueType === "object"
                    && changedValueType === "object"
                ) {
                    // The change is permitted and an object, original and changed have the key and both are objects.
                    // Evaluate the properties of the object.
                    const newPermittedChanges = permittedChangesValue as Record<string, unknown>;
                    const newPath = [...currentPath, key];
                    const keyChanges = relevantChanges?.filter(i => this.arrayStartsWithArray(newPath, i?.path));
                    result[key] = this.mergeRecordMetadataPermitted(originalValue, changedValue, newPermittedChanges, keyChanges, newPath);

                } else if (isKeyInPermittedChange && isKeyInChanged) {
                    // The change is permitted and the key is in the changed.
                    // Replace the original value with the changed value.
                    result[key] = changedValue;

                } else if (isKeyInOriginal && originalValue !== undefined) {
                    // The key is in the original, so keep the key & value.
                    // Keep the original value.
                    result[key] = originalValue;
                }
            }

            /*
            sails.log.verbose(`mergeRecordPermitted currentPath ${currentPath}: ${JSON.stringify({
                original: original,
                changed: changed,
                permittedChanges: permittedChanges,
                changes: changes,
                result: result,
            })}`);
             */

            return result;
        }

        /**
         * Convert the form config into the matching data model with defaults.
         * @param item The top-level form config.
         * @param formMode The form mode.
         */
        public buildDataModelDefaultForFormConfig(item: FormConfigFrame, formMode: FormModesConfig): Record<string, unknown> {
            const constructor = new ConstructFormConfigVisitor(this.logger);
            const constructed = constructor.start(item, formMode);

            const visitor = new DefaultValueFormConfigVisitor(this.logger);
            return visitor.start(constructed);
        }

        /**
         * Convert a form config into a schema describing the data model it creates.
         * @param item The form config.
         * @param formMode The form mode.
         */
        public buildSchemaForFormConfig(item: FormConfigFrame, formMode: FormModesConfig): Record<string, unknown> {
            const constructor = new ConstructFormConfigVisitor(this.logger);
            const constructed = constructor.start(item, formMode);

            const visitor = new JsonTypeDefSchemaFormConfigVisitor(this.logger);
            return visitor.start(constructed);
        }

        /**
         * Compare two data items.
         * @param original The first item, used as the 'original' for the comparison.
         * @param changed The second item, used as the 'changes' for the comparison.
         * @param path The current path of the original.
         */
        public compareRecords(
            original: unknown,
            changed: unknown,
            path?: FormRecordConsistencyChangePath
        ): FormRecordConsistencyChange[] {
            path = path ?? [];
            const result: FormRecordConsistencyChange[] = [];
            const isOriginalArray = Array.isArray(original);
            const isChangedArray = Array.isArray(changed);
            const isOriginalObject = _.isPlainObject(original);
            const isChangedObject = _.isPlainObject(changed);
            if ((isOriginalArray && isChangedArray) || (isOriginalObject && isChangedObject)) {
                const {entries: originalEntries, keys: originalKeys} = this.toKeysEntries(original);
                const {entries: changedEntries, keys: changedKeys} = this.toKeysEntries(changed);

                // delete
                for (const [key, value] of originalEntries) {
                    const newPath = [...path, key];
                    const isKeyInChanged = changedKeys.includes(key);
                    const changedValue = isKeyInChanged ? changed[key] : undefined;

                    if (!isKeyInChanged) {
                        // delete key & value
                        result.push({
                            kind: "delete",
                            path: newPath,
                            original: value,
                            changed: changedValue
                        });
                    } else if (isKeyInChanged && changedValue !== value) {
                        // change value in original
                        this.compareRecords(value, changedValue, newPath)
                            .forEach(i => result.push(i));
                    }
                }

                // add
                for (const [key, value] of changedEntries) {
                    const newPath = [...path, key];
                    const isKeyInOriginal = originalKeys.includes(key);
                    const originalValue = isKeyInOriginal ? original[key] : undefined;
                    if (!isKeyInOriginal) {
                        // add key & value
                        result.push({
                            kind: "add",
                            path: newPath,
                            original: originalValue,
                            changed: value
                        });
                    }
                }
            } else if (original !== changed) {
                result.push({
                    kind: "change",
                    path: path,
                    original: original,
                    changed: changed
                });
            }

            return result;
        }

        /**
         * Use the changes to an original record to create a form config to display the changes.
         *
         * Form config is only for 'view' mode.
         *
         * @param original The original record data.
         * @param changes The changes to the original record data.
         */
        public async buildFormConfigForChanges(
            original: { redboxOid: string, [key: string]: unknown },
            changes: FormRecordConsistencyChange[],
        ): Promise<FormConfigFrame> {
            // TODO: Use the record and form config and/or changes between the record and form config
            //  to build a new form config that displays only the changes.
            //return {};
            throw new Error("Not implemented");
        }

        /**
         * Validate a record's structure matches the form config associated with the recordtype.
         *
         * @param record The record data, including the record type.
         * @param context The context for the user providing the record.
         */
        public async validateRecordSchema(record: BasicRedboxRecord): Promise<FormRecordConsistencyChange[]> {
            /*
            // get the record's form name
            const formName = record?.metaMetadata?.['form'];
            // the validation will be done on all values present in the data model, so use the form config with all fields included
            const isEditMode = true;
            // get the record's form config
            const formConfig = await firstValueFrom(FormsService.getFormByName(formName, isEditMode));
            // get the schema from the form config
            const schema = this.buildSchemaForFormConfig(formConfig);
            // TODO: Match the schema to the record and return any differences.
            return [];
            */
            throw new Error("Not implemented");
        }

        /**
         * Validate a record's data model values using the validators specified in the form config.
         *
         * @param record The record data, including the record type.
         */
        public async validateRecordValuesForFormConfig(record: BasicRedboxRecord): Promise<FormValidatorSummaryErrors[]> {
            // get the record's form name
            const formName = record?.metaMetadata?.['form'];
            // the validation will be done on all values present in the data model, so use the form config with all fields included
            const isEditMode = true;
            // get the record's form config
            const formConfig = await firstValueFrom(FormsService.getFormByName(formName, isEditMode)) as FormConfigFrame;
            // the validator definitions are in the sails-ng-common package
            const validatorDefinitions = formValidatorsSharedDefinitions;
            const validatorDefs = this.validatorSupport.createValidatorDefinitionMapping(validatorDefinitions);
            // provide the form config as a top-level group component
            const formConfigAsFormCompDef: GroupFormComponentDefinitionFrame = {
                name: formConfig?.name,
                model: {class: "GroupModel", config: {validators: formConfig?.validators ?? []}},
                component: {
                    class: 'GroupComponent',
                    config: {componentDefinitions: formConfig?.componentDefinitions}
                }
            }
            // validate the record against the form components
            return this.validateRecordValueForComponentDefinition(record.metadata, formConfigAsFormCompDef, validatorDefs);
        }

        /**
         * Validate a record value using the validators specified in the matching form component definition.
         * @param record The record metadata.
         * @param item The form component definition.
         * @param validatorDefinitions The form validator definition mapping.
         * @param parents The names of the parent controls.
         */
        public async validateRecordValueForComponentDefinition(
            record: unknown,
            item: FormComponentDefinitionFrame,
            validatorDefinitions: Map<string, FormValidatorDefinition>,
            parents?: string[],
        ): Promise<FormValidatorSummaryErrors[]> {
            const validatorSupport = new ValidatorsSupport();
            const result: FormValidatorSummaryErrors[] = [];
            const itemName = item?.name;
            const componentClass = item?.component?.class;
            const componentDefinitions = (item?.component?.config?.['componentDefinitions'] ?? []) as FormComponentDefinition[];
            const elementTemplate = (item?.component?.config?.['elementTemplate'] ?? {}) as FormComponentDefinition;
            const validators = item?.model?.config?.['validators'] ?? [];
            parents = parents ?? [];

            sails.log.verbose(`Validating key '${itemName}' with value '${JSON.stringify(record)}' and component class '${componentClass}'.`);

            // Validate any subcomponents
            for (const componentDefinition of componentDefinitions) {
                const itemErrors = (await this.validateRecordValueForComponentDefinition(
                        record?.[componentDefinition.name],
                        componentDefinition,
                        validatorDefinitions,
                        [...parents, itemName],
                    )
                ) ?? [];
                itemErrors.forEach(i => result.push(i));
            }

            // Validate any array elements
            if (elementTemplate && Array.isArray(record)) {
                for (const element of record) {
                    // The element value is the value of the property that starts with the itemName.
                    const elementKey = Object.keys(element).find(i => i.startsWith(itemName));
                    const itemErrors = (await this.validateRecordValueForComponentDefinition(
                            element?.[elementKey],
                            elementTemplate,
                            validatorDefinitions,
                            [...parents, itemName],
                            )
                    ) ?? [];
                    itemErrors.forEach(i => result.push(i));
                }
            }

            // run the validators
            if (Array.isArray(validators) && validators.length > 0) {
                const formValidatorFns = validatorSupport.createFormValidatorInstancesFromMapping(validatorDefinitions, validators);
                const recordFormControl = this.createFormControlFromRecordValue(record);
                const summaryErrors: FormValidatorSummaryErrors = {
                    id: itemName,
                    message: item?.layout?.config?.label || null,
                    errors: [],
                    parents: parents,
                }
                for (const formValidatorFn of formValidatorFns) {
                    const funcResult = formValidatorFn(recordFormControl);
                    Object.entries(funcResult ?? {})
                        .forEach(([key, item]) => {
                            summaryErrors.errors.push({
                                name: key,
                                message: item.message ?? null,
                                params: {...item.params},
                            })
                        });
                }
                if (summaryErrors.errors.length > 0) {
                    result.push(summaryErrors)
                }
            }

            return result;
        }

        public buildCompiledTemplates(item: FormConfigFrame, formMode: FormModesConfig): TemplateCompileInput[] {
            const constructor = new ConstructFormConfigVisitor(this.logger);
            const constructed = constructor.start(item, formMode);

            const visitor = new TemplateFormConfigVisitor(this.logger);
            return visitor.start(constructed);
        }

        /**
         * Extract the keys and entries from an object or array.
         * @param item Extract keys and values from this item.
         * @private
         */
        private toKeysEntries(item: unknown): {
            entries: [string | number, unknown][],
            keys: (string | number)[]
        } | undefined {
            const guessedType = guessType(item);
            if (guessedType === "object") {
                const entries = Object.entries(item as Record<string, unknown>);
                return {entries: entries, keys: entries.map(i => i[0])};
            } else if (guessedType === "array") {
                const entries: [string | number, unknown][] = (item as Array<unknown>).map((value, index) => [index, value]);
                return {entries: entries, keys: entries.map(i => i[0])};
            } else {
                return {entries: [], keys: []};
            }
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

        private createFormControlFromRecordValue(recordValue: unknown) {
            const guessedType = guessType(recordValue);
            if (guessedType === "object") {
                return new SimpleServerFormValidatorControl(
                    Object.fromEntries(
                        Object.entries(recordValue as Record<string, unknown>)
                            .map(([key, value]) => [key, this.createFormControlFromRecordValue(value)])
                    )
                );
            } else if (guessedType === "array") {
                return (recordValue as Array<unknown>).map(i => this.createFormControlFromRecordValue(i));
            } else {
                return new SimpleServerFormValidatorControl(recordValue);
            }
        }
    }
}
module.exports = new Services.FormRecordConsistency().exports();
