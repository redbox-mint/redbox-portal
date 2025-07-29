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
import {FormConfig} from "@researchdatabox/sails-ng-common";
import {Sails} from "sails";

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
         * The path from the root of the item to the key in the original, which has a change.
         * Object property keys are strings, array indicies are integers.
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
     * This service does 3 main things:
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
         * The existing record will be retrieved from storage.
         * The existing record won't be changed.
         *
         * @param record The new record.
         * @param context The context for the new record.
         * @return The merged record.
         */
        public async mergeRecord(record: BasicRedboxRecord, context?: ClientFormContext): Promise<BasicRedboxRecord> {
            let isEditMode: boolean;
            switch (context?.current?.mode) {
                case "view":
                    isEditMode = false;
                    break;
                case "edit":
                    isEditMode = true;
                    break;
                default:
                    isEditMode = false;
                    break;
            }

            const existingRecord = await RecordsService.getMeta(record.redboxOid);

            const formName = record?.metaMetadata?.['form'];
            const formConfig = await FormsService.getFormByName(formName, isEditMode).toPromise();
            const clientFormConfig = FormsService.buildClientFormConfig(formConfig, context);

            return this.mergeRecordProvided(record, existingRecord, clientFormConfig);
        }

        /**
         * Merge the newRecord and existingRecord using the clientFormConfig.
         *
         * @param newRecord The new record.
         * @param existingRecord The existing record.
         * @param clientFormConfig The client form config.
         * @return The merged record.
         */
        public mergeRecordProvided(
            newRecord: BasicRedboxRecord,
            existingRecord: BasicRedboxRecord,
            clientFormConfig: Record<string, unknown>,
        ): BasicRedboxRecord {
            /*
             * Notes:
             * The form config provides access to the constraints settings.
             * The form config is already the client form config,
             * with the fields the current user can't access filtered out.
             *
             * Arrays are merged with one of these assumptions:
             * - the user has full access to the array, the new array will be the full array, so replace any existing array
             * - the user has no access to the array, so leave the existing array
             */

            const changes = this.compareRecords(existingRecord, newRecord);
            let result: BasicRedboxRecord = {redboxOid: "", metadata: {}};

            // apply each change to the result
            for (const change of changes) {
                const outcome = this.mergeRecordProcessing(newRecord, existingRecord, clientFormConfig, [...change.path]);
                if (outcome.redboxOid && outcome.metadata && _.isPlainObject(outcome.metadata)) {
                    result = outcome as BasicRedboxRecord;
                }
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
                const originalEntries: [string | number, unknown][] = isOriginalArray
                    ? original.map((value, index) => [index, value])
                    : Object.entries(original);
                const originalKeys = originalEntries.map(i => i[0]);

                const changedEntries: [string | number, unknown][] = isChangedArray
                    ? changed.map((value, index) => [index, value])
                    : Object.entries(changed);
                const changedKeys = changedEntries.map(i => i[0]);

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
         * Validate a record using the JSON Schema associated with the recordtype.
         *
         * @param record The record data, including the record type.
         */
        public async validateRecordSchema(record: BasicRedboxRecord): Promise<FormRecordConsistencyChange[]> {
            // TODO
            return [];
        }

        private mergeRecordProcessing(newItem: unknown, existingItem: unknown, clientFormConfigSubset: Record<string, unknown>, pathSubset: FormRecordConsistencyChangePath): Record<string, unknown> {
            return {};
        }
    }
}
module.exports = new Services.FormRecordConsistency().exports();
