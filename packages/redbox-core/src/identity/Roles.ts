import type { IdentityRepositories } from '../persistence/identity/IdentityRepositories';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import _ from 'lodash';
import { defer } from 'rxjs';
// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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

import { Observable, of, from, firstValueFrom } from 'rxjs';
import { mergeMap as flatMap, last, map } from 'rxjs/operators';

import { BrandingModel } from '../model/storage/BrandingModel';
import { RoleModel } from '../model/storage/RoleModel';

export namespace Services {
  interface AuthRoleConfig {
    name: string;
    [key: string]: unknown;
  }

  interface AuthBrandConfig {
    aaf?: { defaultRole?: string };
    defaultRole?: string;
  }

  type ConfigRoleResult = AuthRoleConfig | Record<string, AuthRoleConfig | Record<string, unknown>>;

  /**
   * Roles services
   *
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Roles {
    public constructor(
      private readonly input: {
        repository: IdentityRepositories;
        log: ILogger;
        auth(brand: string): AuthBrandConfig;
        roles(): AuthRoleConfig[];
        defaultBrand(): BrandingModel;
        refreshBrand(id: string): Promise<unknown>;
        loadBrands(): Observable<BrandingModel>;
      }
    ) {}
    private observe<T>(operation: () => Promise<unknown>, _method?: string, _type?: string): Observable<T> {
      let pending: Promise<T> | undefined;
      return defer(() => (pending ??= Promise.resolve().then(operation) as Promise<T>));
    }

    public getRoleWithName = (roles: RoleModel[], roleName: string): RoleModel | undefined => {
      return _.find(roles, (o: RoleModel) => {
        return o.name == roleName;
      });
    };

    public getRole = (brand: BrandingModel, roleName: string): RoleModel | undefined => {
      return this.getRoleWithName(brand.roles, roleName);
    };

    public getRoleByName = (brand: BrandingModel, roleName: string): RoleModel | undefined => {
      return this.getRoleWithName(brand.roles, this.getConfigRole(roleName).name);
    };

    public getAdmin = (brand: BrandingModel): RoleModel | undefined => {
      return this.getRole(brand, this.getConfigRole('Admin').name);
    };

    public getAdminFromBrand = (brand: BrandingModel): RoleModel | undefined => {
      return this.getAdmin(brand);
    };

    public getAdminFromRoles = (roles: RoleModel[]): RoleModel | undefined => {
      return this.getRoleWithName(roles, this.getConfigRole('Admin').name);
    };

    public getDefAuthenticatedRole = (brand: BrandingModel): RoleModel | undefined => {
      const authConfig = (this.input.auth(brand.name) as AuthBrandConfig) ?? {};
      const defaultRole = authConfig.aaf?.defaultRole ?? 'Researcher';
      this.input.log.verbose(this.getRoleWithName(brand.roles, this.getConfigRole(defaultRole).name));
      return this.getRoleWithName(brand.roles, this.getConfigRole(defaultRole).name);
    };

    public getNestedRoles = (role: string, brandRoles: RoleModel[]): Array<RoleModel | undefined> => {
      const hierarchy = ['Admin', 'Maintainer', 'Researcher', 'Guest'];
      const roleIndex = hierarchy.indexOf(role);
      if (roleIndex === -1) {
        return [];
      }
      return hierarchy.slice(roleIndex).map((roleName: string) => this.getRoleWithName(brandRoles, roleName));
    };

    public getDefUnathenticatedRole = (brand: BrandingModel): RoleModel | undefined => {
      const authConfig = (this.input.auth(brand.name) as AuthBrandConfig) ?? {};
      const defaultRole = authConfig.defaultRole ?? 'Guest';
      return this.getRoleWithName(brand.roles, this.getConfigRole(defaultRole).name);
    };

    public getRolesWithBrand = (brand: BrandingModel): Observable<RoleModel[]> => {
      return this.observe<RoleModel[]>(() =>
        this.input.repository.list('role', { branding: brand.id }, { populate: ['users'] })
      );
    };

    public getRoleIds = (fromRoles: RoleModel[], roleNames: string[]) => {
      this.input.log.verbose('Getting id of role names...');
      return _.map(
        _.filter(fromRoles, (role: RoleModel) => {
          return _.includes(roleNames, role.name);
        }),
        'id'
      );
    };

    public async createRoleWithBrand(brand: BrandingModel, roleName: string) {
      const roleConfig = {
        name: roleName,
        branding: brand.id,
      };
      this.input.log.verbose('createRoleWithBrand - brand.id ' + brand.id);
      const rolesRespPromise = await firstValueFrom(
        this.getRolesWithBrand(brand).pipe(map(roles => ({ roles: _.map(roles) })))
      );

      this.input.log.verbose(rolesRespPromise);
      const roleToCreate = _.find(rolesRespPromise.roles, ['name', roleName]);
      if (_.isUndefined(roleToCreate)) {
        this.input.log.verbose('createRoleWithBrand - roleConfig ' + JSON.stringify(roleConfig));
        const newRole = await this.input.repository.create('role', roleConfig);
        this.input.log.verbose('createRoleWithBrand - adding role to brand ' + newRole.id);
        const q = () => this.input.repository.assignBrandRoles(brand.id, [newRole.id]);
        const result = await firstValueFrom(this.observe<BrandingModel>(q, 'exec', 'simplecb'));
        // Subsequent user mutations resolve role names from the cached brand.
        // Publish the new role there before acknowledging its creation.
        await this.input.refreshBrand(brand.id);
        return result;
      } else {
        this.input.log.verbose('createRoleWithBrand - role ' + roleName + ' exists');
        return of(brand);
      }
    }

    public bootstrap = (defBrand: BrandingModel) => {
      const adminRole = this.getAdmin(defBrand);
      if (adminRole == null) {
        this.input.log.verbose('Creating default admin, and other roles...');
        return from(this.getConfigRoles()).pipe(
          flatMap((roleConfig: AuthRoleConfig) => {
            return this.observe<RoleModel>(() => this.input.repository.create('role', roleConfig)).pipe(
              flatMap((newRole: RoleModel) => {
                this.input.log.verbose('Adding role to brand:' + newRole.id);
                const brand: BrandingModel = this.input.defaultBrand() as unknown as BrandingModel;
                // START Sails 1.0 upgrade
                // brand.roles.add(newRole.id);
                const q = () => this.input.repository.assignBrandRoles(brand.id, [newRole.id]);
                // return this.observe(brand, 'save', 'simplecb');
                return this.observe<BrandingModel>(q, 'exec', 'simplecb');
                // END Sails 1.0 upgrade
              })
            );
          }),
          last(),
          flatMap((_brand: BrandingModel) => {
            return this.input.loadBrands() as unknown as Observable<BrandingModel>;
          })
        );
      } else {
        this.input.log.verbose('Admin role exists.');
        return of(defBrand);
      }
    };

    protected getConfigRole = (roleName: string): AuthRoleConfig => {
      const rolesConfig = this.input.roles() as AuthRoleConfig[];
      return (_.find(rolesConfig, (o: AuthRoleConfig) => {
        return o.name == roleName;
      }) ?? { name: roleName }) as AuthRoleConfig;
    };

    protected getConfigRoles(): AuthRoleConfig[];
    protected getConfigRoles(
      roleProp: string,
      customObj?: Record<string, unknown> | null
    ): Array<Record<string, AuthRoleConfig | Record<string, unknown>>>;
    protected getConfigRoles(
      roleProp: string | null = null,
      customObj: Record<string, unknown> | null = null
    ): ConfigRoleResult[] {
      const rolesConfig = this.input.roles() as AuthRoleConfig[];
      let retVal: ConfigRoleResult[] = rolesConfig;
      if (roleProp) {
        retVal = [];
        _.map(rolesConfig, (o: AuthRoleConfig) => {
          const newObj: Record<string, AuthRoleConfig | Record<string, unknown>> = {};
          newObj[roleProp] = o;
          if (customObj) {
            newObj['custom'] = customObj;
          }
          retVal.push(newObj);
        });
      }
      this.input.log.verbose(retVal);
      return retVal;
    }
  }
}
