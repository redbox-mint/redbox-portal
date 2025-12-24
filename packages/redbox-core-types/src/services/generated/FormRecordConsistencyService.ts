// This file is generated from internal/sails-ts/api/services/FormRecordConsistencyService.ts. Do not edit directly.
import { PopulateExportedMethods, Services as services} from '../../index';
import {
    guessType, FormValidatorSummaryErrors,
    FormConfigFrame, DefaultValueFormConfigVisitor, JsonTypeDefSchemaFormConfigVisitor,
    TemplateFormConfigVisitor, TemplateCompileInput, ConstructFormConfigVisitor, FormModesConfig,
    ValidatorFormConfigVisitor, ReusableFormDefinitions
} from "@researchdatabox/sails-ng-common";
import {Sails} from "sails";
import {firstValueFrom} from "rxjs";

export type BasicRedboxRecord = {
        redboxOid: string,
        metaMetadata?: Record<string, unknown>,
        metadata: Record<string, unknown>,
    } & Record<string, unknown>;
export type FormRecordConsistencyChangePath = (string | number)[];
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

export interface FormRecordConsistencyService {
  mergeRecord(changed: BasicRedboxRecord, formMode: FormModesConfig, reusableFormDefs?: ReusableFormDefinitions): Promise<BasicRedboxRecord>;
  mergeRecordClientFormConfig(original: BasicRedboxRecord, changed: BasicRedboxRecord, clientFormConfig: FormConfigFrame, formMode: FormModesConfig, reusableFormDefs?: ReusableFormDefinitions): BasicRedboxRecord;
  mergeRecordMetadataPermitted(original: object, changed: object, permittedChanges: Record<string, unknown> | unknown, changes: FormRecordConsistencyChange[], currentPath?: FormRecordConsistencyChangePath): Record<string, unknown>;
  buildDataModelDefaultForFormConfig(item: FormConfigFrame, formMode: FormModesConfig, reusableFormDefs?: ReusableFormDefinitions): Record<string, unknown>;
  buildSchemaForFormConfig(item: FormConfigFrame, formMode: FormModesConfig, reusableFormDefs?: ReusableFormDefinitions): Record<string, unknown>;
  compareRecords(original: unknown, changed: unknown, path?: FormRecordConsistencyChangePath): FormRecordConsistencyChange[];
  validateRecordValuesForFormConfig(record: BasicRedboxRecord, enabledValidationGroups?: string[], reusableFormDefs?: ReusableFormDefinitions): Promise<FormValidatorSummaryErrors[]>;
  extractRawTemplates(item: FormConfigFrame, formMode: FormModesConfig, reusableFormDefs?: ReusableFormDefinitions): TemplateCompileInput[];
}
