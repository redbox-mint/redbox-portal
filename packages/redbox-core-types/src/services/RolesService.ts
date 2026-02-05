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
import { mergeMap as flatMap, last, first } from 'rxjs/operators';
import { Services as services } from '../CoreService';
import { BrandingModel } from '../model/storage/BrandingModel';
import { RoleModel } from '../model/storage/RoleModel';
 


export module Services {
  interface AuthRoleConfig {
    name: string;
    [key: string]: unknown;
  }

  interface AuthBrandConfig {
    aaf?: { defaultRole?: string };
    defaultRole?: string;
  }

  /**
   * Roles services
   *
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Roles extends services.Core.Service {

    protected override _exportedMethods: string[] = [
      'bootstrap',
      'getRole',
      'getAdmin',
      'getRoleIds',
      'getRolesWithBrand',
      'getAdminFromRoles',
      'getRoleWithName',
      'getRoleByName',
      'getDefAuthenticatedRole',
      'getDefUnathenticatedRole',
      'getNestedRoles',
      'createRoleWithBrand'
    ];

    public getRoleWithName = (roles: RoleModel[], roleName: string): RoleModel | undefined => {
      return _.find(roles, (o: RoleModel) => { return o.name == roleName });
    }

    public getRole = (brand: BrandingModel, roleName: string): RoleModel | undefined => {
      return this.getRoleWithName(brand.roles, roleName);
    }

    public getRoleByName = (brand: BrandingModel, roleName: string): RoleModel | undefined => {
      return this.getRoleWithName(brand.roles, this.getConfigRole(roleName).name);
    }

    public getAdmin = (brand: BrandingModel): RoleModel | undefined => {
      return this.getRole(brand, this.getConfigRole('Admin').name);
    }

    public getAdminFromRoles = (roles: RoleModel[]): RoleModel | undefined => {
      return this.getRoleWithName(roles, this.getConfigRole('Admin').name);
    }

    public getDefAuthenticatedRole = (brand: BrandingModel): RoleModel | undefined => {
      const authConfig = (ConfigService.getBrand(brand.name, 'auth') as AuthBrandConfig) ?? {};
      const defaultRole = authConfig.aaf?.defaultRole ?? 'Researcher';
      sails.log.verbose(this.getRoleWithName(brand.roles, this.getConfigRole(defaultRole).name));
      return this.getRoleWithName(brand.roles, this.getConfigRole(defaultRole).name);
    }

    public getNestedRoles = (role: string, brandRoles: RoleModel[]): Array<RoleModel | undefined> => {
      const hierarchy = ["Admin", "Maintainer", "Researcher", "Guest"];
      const roleIndex = hierarchy.indexOf(role);
      if (roleIndex === -1) {
        return [];
      }
      return hierarchy.slice(roleIndex).map((roleName: string) => this.getRoleWithName(brandRoles, roleName));
    }

    public getDefUnathenticatedRole = (brand: BrandingModel): RoleModel | undefined => {
      const authConfig = (ConfigService.getBrand(brand.name, 'auth') as AuthBrandConfig) ?? {};
      const defaultRole = authConfig.defaultRole ?? 'Guest';
      return this.getRoleWithName(brand.roles, this.getConfigRole(defaultRole).name);
    }

    public getRolesWithBrand = (brand: BrandingModel): Observable<RoleModel[]> => {
      return super.getObservable(Role.find({ branding: brand.id }).populate('users'));
    }

    public getRoleIds = (fromRoles: RoleModel[], roleNames: string[]) => {
      sails.log.verbose("Getting id of role names...");
      return _.map(_.filter(fromRoles, (role: RoleModel) => { return _.includes(roleNames, role.name) }), 'id');
    }

    public async createRoleWithBrand(brand: BrandingModel, roleName: string) {
      let roleConfig =
      {
        name: roleName,
        branding: brand.id
      };
      sails.log.verbose('createRoleWithBrand - brand.id ' + brand.id);
      const rolesResp: { roles: RoleModel[] } = { roles: [] };
      let rolesRespPromise = await firstValueFrom(this.getRolesWithBrand(brand).pipe(flatMap((roles: RoleModel[]) => {
        _.map(roles, (role: RoleModel) => {
          rolesResp.roles.push(role);
        });
        return of(rolesResp);
      }), first()));

      sails.log.verbose(rolesRespPromise);
      let roleToCreate = _.find(rolesRespPromise.roles, ['name', roleName]);
      if (_.isUndefined(roleToCreate)) {
        sails.log.verbose('createRoleWithBrand - roleConfig ' + JSON.stringify(roleConfig));
        let newRole = await Role.create(roleConfig);
        sails.log.verbose("createRoleWithBrand - adding role to brand " + newRole.id);
        const q = BrandingConfig.addToCollection(brand.id, 'roles').members([newRole.id]);
  return await firstValueFrom(super.getObservable(q, 'exec', 'simplecb'));
      } else {
        sails.log.verbose('createRoleWithBrand - role ' + roleName + ' exists');
        return of(brand);
      }
    }

    public bootstrap = (defBrand: BrandingModel) => {
      const adminRole = this.getAdmin(defBrand);
      if (adminRole == null) {
        sails.log.verbose("Creating default admin, and other roles...");
        return from(this.getConfigRoles())
                         .pipe(flatMap((roleConfig: AuthRoleConfig) => {
                           return super.getObservable(Role.create(roleConfig))
                                       .pipe(flatMap((newRole: RoleModel) => {
                                         sails.log.verbose("Adding role to brand:" + newRole.id);
                                         let brand:BrandingModel = sails.services.brandingservice.getDefault();
                                         // START Sails 1.0 upgrade
                                         // brand.roles.add(newRole.id);
                                         const q = BrandingConfig.addToCollection(brand.id, 'roles').members([newRole.id]);
                                         // return super.getObservable(brand, 'save', 'simplecb');
                                         return super.getObservable(q, 'exec', 'simplecb');
                                         // END Sails 1.0 upgrade
                                       }));
                         }),
                         last(),
                         flatMap((brand: BrandingModel) => {
                           return sails.services.brandingservice.loadAvailableBrands();
                         }));
      } else {
        sails.log.verbose("Admin role exists.");
        return of(defBrand);
      }
    }

    protected getConfigRole = (roleName: string): AuthRoleConfig => {
      const rolesConfig = sails.config.auth.roles as AuthRoleConfig[];
      return (_.find(rolesConfig, (o: AuthRoleConfig) => { return o.name == roleName }) ?? { name: roleName }) as AuthRoleConfig;
    }

    protected getConfigRoles = (roleProp: string | null = null, customObj: Record<string, unknown> | null = null): any[] => {
      const rolesConfig = sails.config.auth.roles as AuthRoleConfig[];
      let retVal: any[] = rolesConfig;
      if (roleProp) {
        retVal = []
        _.map(rolesConfig, (o: AuthRoleConfig) => {
          const newObj: Record<string, unknown> = {};
          newObj[roleProp] = o;
          if (customObj) {
            newObj['custom'] = customObj;
          }
          retVal.push(newObj);
        });
      }
      sails.log.verbose(retVal);
      return retVal;
    }
  }
}

declare global {
  let RolesService: Services.Roles;
}
