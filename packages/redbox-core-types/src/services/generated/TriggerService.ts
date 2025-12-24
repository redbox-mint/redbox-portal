// This file is generated from internal/sails-ts/api/services/TriggerService.ts. Do not edit directly.
import { Observable, of, from } from 'rxjs';
import { concatMap, last } from 'rxjs/operators';
import {
  RBValidationError,
  BrandingModel,
  Services as services,
  PopulateExportedMethods } from '../../index';
import { Sails, Model } from "sails";
import numeral from 'numeral';

export interface TriggerService {
  transitionWorkflow(oid: any, record: any, options: any): any;
  runHooksSync(oid: any, record: any, options: any, user: any): any;
  applyFieldLevelPermissions(oid: any, record: any, options: any, user: any): any;
  validateFieldUsingRegex(oid: any, record: any, options: any): any;
  validateFieldsUsingTemplate(oid: any, record: any, options: any): any;
  validateFieldMapUsingRegex(oid: any, record: any, options: any): any;
  runTemplatesOnRelatedRecord(relatedOid: any, relatedRecord: any, options: any, user: any): any;
}
