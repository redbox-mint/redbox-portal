// This file is generated from internal/sails-ts/api/services/UsersService.ts. Do not edit directly.
import { Observable, of, from, throwError, lastValueFrom, firstValueFrom } from 'rxjs';
import { mergeMap as flatMap, map, last } from 'rxjs/operators';
import {
  isObservable
} from 'rxjs';
import {
  BrandingModel,
  RoleModel,
  SearchService,
  UserAttributes,
  UserModel,
  Services as services
} from '../../index';
import {
  Sails,
  Model
} from "sails";
import * as crypto from 'crypto';

export interface UsersService {
  bootstrap(...args: any[]): any;
  updateUserRoles(...args: any[]): any;
  updateUserDetails(...args: any[]): any;
  getUserWithId(...args: any[]): any;
  getUserWithUsername(...args: any[]): any;
  addLocalUser(...args: any[]): any;
  setUserKey(...args: any[]): any;
  hasRole(user: any, targetRole: any): RoleModel;
  findUsersWithName(name: string, brandId: string, source?: any): any;
  findUsersWithEmail(email: string, brandId: string, source: any): any;
  findUsersWithQuery(query: any, brandId: string, source?: any): Observable<UserModel[]>;
  findAndAssignAccessToRecords(pendingValue: any, userid: any): void;
  getUsers(...args: any[]): any;
  getUsersForBrand(...args: any[]): any;
  addUserAuditEvent(...args: any[]): any;
  checkAuthorizedEmail(email: string, branding: string, authType: string): boolean;
}
