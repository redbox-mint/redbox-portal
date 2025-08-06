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

import {PopulateExportedMethods, Services as services} from '@researchdatabox/redbox-core-types';
import {ClientFormContext} from "./FormsService";
import {FormComponentDefinition, FormConfig, FormValidatorSummaryErrors} from "@researchdatabox/sails-ng-common";
import {Sails} from "sails";
import {default as moment} from 'moment';

declare var sails: Sails;
declare var _;
declare var RecordsService;
declare var FormsService;

export module Services {

    export type BasicRedboxRecord = {
        redboxOid: string,
        metaMetadata?: { [key: string]: unknown },
        metadata: { [key: string]: unknown },
        [key: string]: unknown
    };

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
        /**
         * Update a stored record by merging the stored record and the new record,
         * using knowledge of the current user's access to the record properties.
         *
         * The existing original record will be retrieved from storage.
         * The existing original record won't be changed.
         *
         * @param changed The new record.
         * @param context The context for the new record.
         * @return The merged record.
         */
        public async mergeRecord(changed: BasicRedboxRecord, context?: ClientFormContext): Promise<BasicRedboxRecord> {
            // get the original record
            const original = await RecordsService.getMeta(changed.redboxOid);

            // get the original record's form config
            const formName = changed?.metaMetadata?.['form'];
            const isEditMode = context?.current?.mode === "view" ? false : context?.current?.mode === "edit";
            const formConfig = await FormsService.getFormByName(formName, isEditMode).toPromise();

            // build the client form config
            const clientFormConfig = FormsService.buildClientFormConfig(formConfig, context);

            // merge the original and changed records using the client form config to know which changes to include
            return this.mergeRecordClientFormConfig(original, changed, clientFormConfig);
        }

        /**
         * Merge the existing original and changed records using the clientFormConfig.
         * No changes are made to the records. The return value is new instance.
         *
         * Notes on the merge process:
         * - Arrays are merged with one of these assumptions:
         *   - the user has full access to the array, the new array will be the full array, so replace any existing array
         *   - the user has no access to the array, so leave the existing array
         *
         * @param original The existing original record.
         * @param changed The new record.
         * @param clientFormConfig The client form config, with the fields the current user can't access filtered out.
         * @return The merged record.
         */
        public mergeRecordClientFormConfig(
            original: BasicRedboxRecord,
            changed: BasicRedboxRecord,
            clientFormConfig: Record<string, unknown>,
        ): BasicRedboxRecord {
            const permittedChanges = this.buildSchemaForFormConfig(clientFormConfig);
            const originalMetadata = original?.metadata ?? {};
            const changedMetadata = changed?.metadata ?? {};
            const changes = this.compareRecords(original, changed);
            return {
                ...original,
                redboxOid: original?.redboxOid ?? "",
                metadata: this.mergeRecordPermitted(originalMetadata, changedMetadata, permittedChanges, changes),
                permittedChanges: permittedChanges,
                changes: changes,
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
        public mergeRecordPermitted(original: object, changed: object, permittedChanges: Record<string, unknown>, changes: FormRecordConsistencyChange[], currentPath?: FormRecordConsistencyChangePath): Record<string, unknown> {
            if (!currentPath) {
                currentPath = [];
            }
            const relevantChanges = changes?.filter(i => !currentPath || this.arrayStartsWithArray(currentPath, i?.path));

            // permittedDataModel is an object, with properties that are objects, arrays, or simple values

            // the goal is to begin with all the original properties,
            // and recursively merge the changed records,
            // using changes to not have to look at every property on both original and changed.
            // The permittedDataModel indicates which properties can be modified by the changed record.

            const {keys: originalKeys} = this.toKeysEntries(original);
            const {keys: changedKeys} = this.toKeysEntries(changed);
            const allKeys = new Set(originalKeys);
            changedKeys.forEach(i => allKeys.add(i));

            const result = {};

            for (const key of allKeys) {
                const isOriginalKey = key in original;
                const isChangedKey = key in changed;
                const originalValue = isOriginalKey ? original[key] : undefined;
                const changedValue = isChangedKey ? changed[key] : undefined;
                const isOriginalValueArray = _.isArray(originalValue);
                const isOriginalValueObject = _.isPlainObject(originalValue);
                const isChangedValueArray = _.isArray(changedValue);
                const isChangedValueObject = _.isPlainObject(changedValue);

                // TODO: fix detecting whether the current key is an object or array or something else
                // permittedChanged is in JSON Type Def format
                const isPermittedChangeObject = key in ((permittedChanges?.['properties'] as object) ?? {});
                const isPermittedChangeArray = 'elements' in permittedChanges;
                const keyChanges = relevantChanges?.filter(i => this.arrayStartsWithArray([...currentPath, key], i?.path));

                sails.log.verbose(`mergeRecordPermitted key ${key} currentPath ${currentPath}: ${JSON.stringify({
                    original: original,
                    changed: changed,
                    permittedChanges: permittedChanges,
                    changes: changes,
                    isOriginalKey: isOriginalKey,
                    isChangedKey: isChangedKey,
                    originalValue: originalValue,
                    changedValue: changedValue,
                    isOriginalValueArray: isOriginalValueArray,
                    isOriginalValueObject: isOriginalValueObject,
                    isChangedValueArray: isChangedValueArray,
                    isChangedValueObject: isChangedValueObject,
                    isPermittedChangeObject: isPermittedChangeObject,
                    isPermittedChangeArray: isPermittedChangeArray,
                    keyChanges: keyChanges,
                })}`);

                if (isPermittedChangeArray && isOriginalKey && isChangedKey && isOriginalValueArray && isChangedValueArray) {
                    // Option: all of: change is permitted, original and changed have the key, original and changed are arrays.
                    // For an array, the merge logic is to compare the same index in the original and the changed arrays.
                    result[key] = changedValue.map((changedElement: object, index: number) => {
                        // Get the original value in the same index as the changed index.
                        const originalElement = originalValue[index];
                        // Evaluate the element in the array.
                        const keyChanges = relevantChanges?.filter(i => this.arrayStartsWithArray([...currentPath, key, index], i?.path));
                        return this.mergeRecordPermitted(originalElement, changedElement, permittedChanges['elements'] as Record<string, unknown>, keyChanges);
                    });
                } else if (isPermittedChangeObject && isOriginalKey && isChangedKey && isOriginalValueObject && isChangedValueObject) {
                    // Option:  all of: change is permitted, original and changed have the key, original and changed are objects.
                    // Evaluate the values.

                    result[key] = this.mergeRecordPermitted(originalValue, changedValue, permittedChanges[key] as Record<string, unknown>, keyChanges);
                } else if (isPermittedChangeArray && isOriginalKey && isChangedKey && (isOriginalValueArray && !isChangedValueArray)) {
                    // Option: all of: change is permitted, original and changed have the key, original is array and changed is object.
                    // Replace the original value with the changed value.
                    result[key] = changedValue;
                } else if (isPermittedChangeObject && isOriginalKey && isChangedKey && (isOriginalValueObject && !isChangedValueObject)) {
                    // Option: all of: change is permitted, original and changed have the key, original is object and changed is array.
                    // Replace the original value with the changed value.
                    result[key] = changedValue;
                } else if (isPermittedChangeObject && !isOriginalKey && isChangedKey) {
                    // Option: all of: change is permitted, key not in original is in changed
                    // Set value from changed
                    result[key] = changedValue;

                } else {
                    // Option: any other condition
                    // Keep the original value.
                    result[key] = originalValue;
                }
            }
            sails.log.verbose(`mergeRecordPermitted currentPath ${currentPath}: ${JSON.stringify({
                original: original,
                changed: changed,
                permittedChanges: permittedChanges,
                changes: changes,
                result: result,
            })}`);
            return result;
        }

        /**
         * Convert the form config into the matching data model with defaults.
         * @param item The top-level form config.
         */
        public buildDataModelDefaultForFormConfig(item: FormConfig): Record<string, unknown> {
            // each component definition is a property,
            // where the key is the name and the value is the model value
            const result = {};
            for (const componentDefinition of item?.componentDefinitions) {
                const def = this.buildDataModelDefaultForFormComponentDefinition(componentDefinition);
                for (const [key, value] of Object.entries(def ?? {})) {
                    result[key] = value;
                }
            }
            return result;
        }

        /**
         * Convert a form component definition into the matching data model with defaults.
         * @param item One form config component definition.
         */
        public buildDataModelDefaultForFormComponentDefinition(item: FormComponentDefinition): Record<string, unknown> {
            const result = {};
            if (item?.component?.config?.['elementTemplate'] !== undefined) {
                result[item?.name] = [this.buildDataModelDefaultForFormComponentDefinition(item?.component?.config?.['elementTemplate'] ?? {})];
            } else if (item?.component?.config?.['componentDefinitions'] !== undefined) {
                result[item?.name] = {};
                for (const componentDefinition of item?.component?.config?.['componentDefinitions'] ?? []) {
                    const def = this.buildDataModelDefaultForFormComponentDefinition(componentDefinition);
                    for (const [key, value] of Object.entries(def ?? {})) {
                        result[item?.name][key] = value;
                    }
                }
            } else if (item?.model?.config?.value !== undefined) {
                result[item?.name] = item?.model?.config?.value;
            } else if (item?.model?.config?.defaultValue !== undefined) {
                result[item?.name] = item?.model?.config?.defaultValue;
            } else {
                result[item?.name] = undefined;
            }
            return result;
        }

        /**
         * Convert a form config into a schema describing the data model it creates.
         * @param item The form config.
         */
        public buildSchemaForFormConfig(item: FormConfig): Record<string, unknown> {
            const formCompDef: FormComponentDefinition = {
                name: item?.name,
                model: {class: "GroupFieldModel", config: {}},
                component: {class: 'GroupFieldComponent', config: {componentDefinitions: item?.componentDefinitions}}
            }
            const def = this.buildSchemaForFormComponentDefinition(formCompDef);
            // remove the FormConfig level
            return def.properties[item?.name];
        }

        /**
         * Convert a form component definition into a schema describing the data model it creates.
         * @param item The form component definition.
         */
        public buildSchemaForFormComponentDefinition(item: FormComponentDefinition): Record<string, unknown> {
            // Using JSON Type Definition schema
            // Refs: https://jsontypedef.com/docs/jtd-in-5-minutes/  https://ajv.js.org/json-type-definition.html
            const result = {properties: {}};
            if (item?.component?.class === "RepeatableComponent" && item?.component?.config?.['elementTemplate'] !== undefined) {
                // array elements: https://jsontypedef.com/docs/jtd-in-5-minutes/#elements-schemas
                result.properties[item?.name] = {
                    elements: this.buildSchemaForFormComponentDefinition(item?.component?.config?.['elementTemplate'])
                };
            } else if (item?.component?.class === "GroupFieldComponent" && item?.component?.config?.['componentDefinitions'] !== undefined) {
                // object properties: https://jsontypedef.com/docs/jtd-in-5-minutes/#properties-schemas
                result.properties[item?.name] = {properties: {}};
                for (const componentDefinition of item?.component?.config?.['componentDefinitions'] ?? []) {
                    const def = this.buildSchemaForFormComponentDefinition(componentDefinition);
                    result.properties[item?.name]['properties'] = {
                        ...result.properties[item?.name]['properties'],
                        ...def.properties as object,
                    };
                }
            } else if (item?.model?.config?.value !== undefined) {
                // type: https://jsontypedef.com/docs/jtd-in-5-minutes/#type-schemas
                result.properties[item?.name] = {type: this.guessType(item?.model?.config?.value)};
            } else if (item?.model?.config?.defaultValue !== undefined) {
                // type: https://jsontypedef.com/docs/jtd-in-5-minutes/#type-schemas
                result.properties[item?.name] = {type: this.guessType(item?.model?.config?.defaultValue)};
            } else {
                // empty: https://jsontypedef.com/docs/jtd-in-5-minutes/#empty-schemas
                result.properties[item?.name] = {};
            }
            return result;
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
        ): Promise<FormConfig> {
            // TODO
            return {};
        }

        /**
         * Validate a record's structure using the form config associated with the recordtype.
         *
         * @param record The record data, including the record type.
         */
        public async validateRecordSchema(record: BasicRedboxRecord): Promise<FormRecordConsistencyChange[]> {
            // TODO
            return [];
        }

        /**
         * Validate a record's data model values using the validators specified in the form config.
         *
         * @param record The record data, including the record type.
         */
        public async validateRecordValues(record: BasicRedboxRecord): Promise<FormValidatorSummaryErrors[]> {
            // TODO
            return [];
        }

        private guessType(value: unknown): "array" | "object" | "boolean" | "string" | "timestamp" | "number" | "null" | "unknown" {
            if (value === null) {
                return "null";
            }
            if (_.isBoolean(value)) {
                return "boolean";
            }
            if (Number.isFinite(value)) {
                return "number";
            }
            if (_.isArray(value)) {
                return "array";
            }
            try {
                const momentFormats = [
                    'YYYY-MM-DDTHH:mm:ss.SSSZ', // ISO8601
                    'YYYY-MM-DDTHH:mm:ssZ', // RFC3339
                ];
                const result = moment(value?.toString(), momentFormats, true);
                sails.log.verbose(`guessType value '${value}' Date '${result}' typeof '${typeof result}' isValid '${result.isValid()}'`);
                if (result && result.isValid()) {
                    return "timestamp";
                }
            } catch (err) {
                sails.log.verbose(`guessType parse error with value '${value}' error ${err}`);
            }
            if (_.isString(value)) {
                return "string";
            }
            if (_.isPlainObject(value)) {
                return "object";
            }
            return "unknown";
        }

        private toKeysEntries(item: unknown): {
            entries: [string | number, unknown][],
            keys: (string | number)[]
        } | undefined {
            if (Array.isArray(item)) {
                const entries: [string | number, unknown][] = item.map((value, index) => [index, value]);
                return {entries: entries, keys: entries.map(i => i[0])};
            } else if (_.isPlainObject(item)) {
                const entries = Object.entries(item);
                return {entries: entries, keys: entries.map(i => i[0])};
            } else {
                return undefined;
            }
        }

        private arrayStartsWithArray(base: unknown[], check: unknown[]) {
            return base?.every((value, index) => check?.length >= 0 && check?.[index] == value);
        }
    }
}
module.exports = new Services.FormRecordConsistency().exports();
