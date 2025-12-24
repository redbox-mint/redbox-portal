// This file is generated from internal/sails-ts/api/services/WorkspaceTypesService.ts. Do not edit directly.
import { zip, of } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import { Services as services } from '../../index';
import { Sails, Model } from "sails";

export interface WorkspaceTypesService {
  bootstrap(...args: any[]): any;
  create(brand: any, workspaceType: any): any;
  get(brand: any): any;
  getOne(brand: any, name: any): any;
}
