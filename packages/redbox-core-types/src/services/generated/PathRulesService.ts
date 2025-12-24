// This file is generated from internal/sails-ts/api/services/PathRulesService.ts. Do not edit directly.
import { Observable, from, of } from 'rxjs';
import { mergeMap as flatMap, last } from 'rxjs/operators';
import {BrandingModel, Services as services} from '../../index';
import {Sails, Model} from "sails";
import { default as UrlPattern } from 'url-pattern';

export interface PathRulesService {
  bootstrap(...args: any[]): any;
  getRulesFromPath(...args: any[]): any;
  canRead(...args: any[]): any;
  canWrite(...args: any[]): any;
}
