// This file is generated from internal/sails-ts/api/services/RolesService.ts. Do not edit directly.
import { Observable, of, from, firstValueFrom } from 'rxjs';
import { mergeMap as flatMap, last, first } from 'rxjs/operators';
import {BrandingModel, Services as services} from '../../index';
import {Sails, Model} from "sails";

export interface RolesService {
  bootstrap(...args: any[]): any;
  getRole(...args: any[]): any;
  getAdmin(...args: any[]): any;
  getRoleIds(...args: any[]): any;
  getRolesWithBrand(...args: any[]): any;
  getAdminFromRoles(...args: any[]): any;
  getRoleWithName(...args: any[]): any;
  getRoleByName(...args: any[]): any;
  getDefAuthenticatedRole(...args: any[]): any;
  getDefUnathenticatedRole(...args: any[]): any;
  getNestedRoles(...args: any[]): any;
  createRoleWithBrand(brand: any, roleName: any): any;
}
