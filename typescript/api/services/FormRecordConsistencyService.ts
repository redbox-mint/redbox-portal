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
import {FormComponentDefinition, FormConfig, FormValidatorSummaryErrors} from "@researchdatabox/sails-ng-common";
import {Sails} from "sails";
import {default as moment} from 'moment';
import {ClientFormContext} from "../additional/ClientFormContext";


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
            permittedChanges: Record<string, unknown>,
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
            if (!('properties' in permittedChangesObj)) {
                throw new Error(`Permitted changes must have an object, a 'properties' property, at the top level ${JSON.stringify(permittedChanges)}`)
            }
            const permittedChangesProps = permittedChangesObj['properties'] as object;


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
                const originalValueType = this.guessType(originalValue);

                // pre-calculate aspects of the changed item
                const isKeyInChanged = key in changed;
                const changedValue = isKeyInChanged ? changed[key] : undefined;
                const changedValueType = this.guessType(changedValue);

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
                    // For an array, the merge logic is to replace the original array with the changed array
                    // TODO: Consider how to replace each element in the array instead of the whole array.
                    //       Replacing the whole array prevents use of constraints in components in the array elements.
                    const newPermittedChanges = permittedChangesValue['elements'] as Record<string, unknown>;
                    result[key] = changedValue.map((changedElement: object, index: number) => {
                        // Evaluate the element in the array.
                        // TODO: Should the 'original' element be an instance of the elementTemplate with default values?
                        const originalElement = {};
                        const newPath = [...currentPath, key, index];
                        const keyChanges = relevantChanges?.filter(i => this.arrayStartsWithArray(newPath, i?.path));
                        return this.mergeRecordMetadataPermitted(originalElement, changedElement, newPermittedChanges, keyChanges, newPath);
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
         */
        public buildDataModelDefaultForFormConfig(item: FormConfig): Record<string, unknown> {
            // each component definition is a property,
            // where the key is the name and the value is the model value
            // TODO: provide defaults from ancestors to descendants, so the descendants can either use their default or an ancestors default
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
         * @param defaultValue The default value if there is an ancestor component.
         */
        public buildDataModelDefaultForFormComponentDefinition(item: FormComponentDefinition, defaultValue?: Record<string, unknown>): Record<string, unknown> {
            const result = {};
            const itemName = item?.name;
            const itemDefaultValue = _.get(this.buildDataModelDefaultValue(defaultValue, item), itemName, undefined);
            const componentDefinitions = item?.component?.config?.['componentDefinitions'];
            const elementTemplate = item?.component?.config?.['elementTemplate'];
            // TODO: const tabs

            if (elementTemplate !== undefined) {
                // for each element in the default value array, build the component from any ancestor defaultValues
                // the default in the elementTemplate is the default for _new_ items, the template default doesn't create any array elements
                // build the array of components from any ancestor defaultValues
                const componentName = elementTemplate?.name;
                result[itemName] = (itemDefaultValue ?? []).map(arrayElementDefaultValue => {
                    sails.log.verbose(`buildDataModelDefaultForFormComponentDefinition - elementTemplate component ${componentName} - arrayElementDefaultValue ${JSON.stringify(arrayElementDefaultValue)} - defaultValue ${JSON.stringify(defaultValue)}`);
                    return this.buildDataModelDefaultForFormComponentDefinition(elementTemplate, arrayElementDefaultValue);
                });

            } else if (componentDefinitions !== undefined) {
                // apply the default value to each element in a component definition
                result[itemName] = {};
                for (const componentDefinition of (componentDefinitions ?? [])) {
                    const componentName = componentDefinition?.name;
                    sails.log.verbose(`buildDataModelDefaultForFormComponentDefinition - componentDefinitions component ${componentName} - itemDefaultValue ${JSON.stringify(itemDefaultValue)} - defaultValue ${JSON.stringify(defaultValue)}`);
                    const def = this.buildDataModelDefaultForFormComponentDefinition(componentDefinition, itemDefaultValue);
                    for (const [key, value] of Object.entries(def ?? {})) {
                        result[itemName][key] = value;
                    }
                }

            } else {
                result[itemName] = itemDefaultValue !== undefined
                    ? itemDefaultValue
                    : _.get(defaultValue, itemName, undefined);
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
            // Ref: https://jsontypedef.com/docs/jtd-in-5-minutes/
            // Ref: https://ajv.js.org/json-type-definition.html
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
            // TODO: Use the record and form config and/or changes between the record and form config
            //  to build a new form config that displays only the changes.
            return {};
        }

        /**
         * Validate a record's structure using the form config associated with the recordtype.
         *
         * @param record The record data, including the record type.
         */
        public async validateRecordSchema(record: BasicRedboxRecord): Promise<FormRecordConsistencyChange[]> {
            // TODO: Validate that the record structure matches the form config.
            return [];
        }

        /**
         * Validate a record's data model values using the validators specified in the form config.
         *
         * @param record The record data, including the record type.
         */
        public async validateRecordValues(record: BasicRedboxRecord): Promise<FormValidatorSummaryErrors[]> {
            // TODO: Validate that the record values match the form config.
            return [];
        }

        private buildDataModelDefaultValue(current: Record<string, unknown>, item: FormComponentDefinition) {
            const itemName = item?.name;
            const itemDefaultValue = item?.model?.config?.defaultValue;
            return _.mergeWith(
                {},
                current ?? {},
                {[itemName]: itemDefaultValue},
                (objValue, srcValue, key, object, source, stack) => {
                    // merge approach for arrays is to choose the source array,
                    // or the one that is an array if the other isn't
                    if (Array.isArray(objValue) && Array.isArray(srcValue)) {
                        return srcValue;
                    } else if (Array.isArray(objValue) && !Array.isArray(srcValue)) {
                        return objValue;
                    } else if (!Array.isArray(objValue) && Array.isArray(srcValue)) {
                        return srcValue;
                    }
                    // undefined = use the default merge approach
                    return undefined;
                }
            );
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

            // check for date
            const momentFormats = [
                'YYYY-MM-DDTHH:mm:ss.SSSZ', // ISO8601
                'YYYY-MM-DDTHH:mm:ssZ', // RFC3339
            ];
            try {
                const strict = true;
                const result = moment(value?.toString(), momentFormats, strict);
                sails.log.verbose(`guessType date input '${value}' output '${result}' typeof '${typeof result}' moment.isValid '${result.isValid()}'`);
                if (result && result.isValid()) {
                    return "timestamp";
                }
            } catch (err) {
                sails.log.verbose(`guessType parse error with value '${value}' formats ${JSON.stringify(momentFormats)}: ${err}`);
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
            return base?.every((value, index) => check?.length > index && check?.[index] == value);
        }
    }
}
module.exports = new Services.FormRecordConsistency().exports();
