// This file is generated from internal/sails-ts/api/services/FormsService.ts. Do not edit directly.
import { Observable, of, firstValueFrom } from 'rxjs';
import { mergeMap as flatMap, last, filter } from 'rxjs/operators';
import {BrandingModel, FormModel, Services as services} from '../../index';
import {Model, Sails} from "sails";
import {createSchema} from 'genson-js';
import {
    ClientFormConfigVisitor,
    ConstructFormConfigVisitor,
    FormConfigFrame,
    FormModesConfig, ReusableFormDefinitions
} from "@researchdatabox/sails-ng-common";

export interface FormsService {
  bootstrap(workflowStep: any): Promise<any>;
  getForm(branding: BrandingModel, formParam: string, editMode: boolean, recordType: string, currentRec: any): any;
  flattenFields(fields: any, fieldArr: any): void;
  getFormByName(...args: any[]): any;
  filterFieldsHasEditAccess(fields: any, hasEditAccess: any): void;
  listForms(...args: any[]): any;
  inferSchemaFromMetadata(record: any): any;
  generateFormFromSchema(branding: BrandingModel, recordType: string, record: any): any;
  getFormByStartingWorkflowStep(branding: BrandingModel, recordType: string, editMode: boolean): Observable<FormModel>;
  buildClientFormConfig(item: FormConfigFrame, formMode?: FormModesConfig, userRoles?: string[], recordData?: Record<string, unknown> | null, reusableFormDefs?: ReusableFormDefinitions): FormConfigFrame;
}
