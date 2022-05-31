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

import { Observable } from 'rxjs/Rx';
import {Services as services}   from '@researchdatabox/redbox-core-types';
import {Sails, Model} from "sails";

declare var sails: Sails;
declare var Role, BrandingConfig: Model;
declare var ConfigService;
declare var _;


export module Services {
  /**
   * Roles services
   *
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Roles extends services.Core.Service {

    protected _exportedMethods: any = [
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

    public getRoleWithName = (roles, roleName) :any => {
      return _.find(roles, (o) => {return o.name == roleName});
    }

    public getRole = (brand, roleName) :any => {
      return this.getRoleWithName(brand.roles, roleName);
    }

    public getRoleByName = (brand, roleName) :any => {
      return this.getRoleWithName(brand.roles, this.getConfigRole(roleName).name);
    }

    public getAdmin = (brand) :any => {
      return this.getRole(brand, this.getConfigRole('Admin').name);
    }

    public getAdminFromRoles = (roles) :any => {
      return this.getRoleWithName(roles, this.getConfigRole('Admin').name);
    }

    public getDefAuthenticatedRole = (brand:any) :any => {
      sails.log.verbose(this.getRoleWithName(brand.roles, this.getConfigRole(ConfigService.getBrand(brand.name, 'auth').aaf.defaultRole).name));
      return this.getRoleWithName(brand.roles, this.getConfigRole(ConfigService.getBrand(brand.name, 'auth').aaf.defaultRole).name);
    }

    public getNestedRoles = (role, brandRoles) => {
      var roles = [];
      switch (role) {
        case "Admin":
          roles.push(this.getRoleWithName(brandRoles, 'Admin'));
        case "Maintainer":
          roles.push(this.getRoleWithName(brandRoles, 'Maintainer'));
        case "Researcher":
          roles.push(this.getRoleWithName(brandRoles, 'Researcher'));
        case "Guest":
          roles.push(this.getRoleWithName(brandRoles, 'Guest'));
          break;
      }
      return roles;
    }

    public getDefUnathenticatedRole = (brand: any) :any => {
      return this.getRoleWithName(brand.roles, this.getConfigRole(ConfigService.getBrand(brand.name, 'auth').defaultRole).name);
    }

    public getRolesWithBrand = (brand) :Observable<any> => {
      return super.getObservable(Role.find({branding:brand.id}).populate('users'));
    }

    public getRoleIds = (fromRoles, roleNames) => {
      sails.log.verbose("Getting id of role names...");
      return _.map(_.filter(fromRoles, (role)=> {return _.includes(roleNames, role.name)}), 'id');
    }

    public async createRoleWithBrand(brand, roleName) {
      let roleConfig = 
      {
        name: roleName,
        branding: brand.id
      };
      sails.log.verbose('createRoleWithBrand - brand.id '+brand.id);
      let rolesResp:any = {};
      let rolesRespPromise = await this.getRolesWithBrand(brand).flatMap(roles => {
        _.map(roles, (role) => {
          if (_.isEmpty(rolesResp.roles)) {
            rolesResp.roles = [];
          }
          rolesResp.roles.push(role);
        });
        return Observable.of(rolesResp);
      }).first().toPromise();
    
      sails.log.verbose(rolesRespPromise);
      let roleToCreate = _.find(rolesRespPromise.roles, ['name',roleName]);
      if(_.isUndefined(roleToCreate)) {
        sails.log.verbose('createRoleWithBrand - roleConfig '+JSON.stringify(roleConfig));
        let newRole = await Role.create(roleConfig);
        sails.log.verbose("createRoleWithBrand - adding role to brand " + newRole.id);
        const q = BrandingConfig.addToCollection(brand.id, 'roles').members([newRole.id]);
        return await super.getObservable(q, 'exec', 'simplecb').toPromise();
      } else {
        sails.log.verbose('createRoleWithBrand - role ' +roleName + ' exists');
        return Observable.of(brand);
      }
    }

    public bootstrap = (defBrand) => {
      var adminRole = this.getAdmin(defBrand);
      if (adminRole == null) {
        sails.log.verbose("Creating default admin, and other roles...");
        return Observable.from(this.getConfigRoles())
                         .flatMap(roleConfig => {
                           return super.getObservable(Role.create(roleConfig))
                                       .flatMap(newRole => {
                                         sails.log.verbose("Adding role to brand:" + newRole.id);
                                         var brand = sails.services.brandingservice.getDefault();
                                         // START Sails 1.0 upgrade
                                         // brand.roles.add(newRole.id);
                                         const q = BrandingConfig.addToCollection(brand.id, 'roles').members([newRole.id]);
                                         // return super.getObservable(brand, 'save', 'simplecb');
                                         return super.getObservable(q, 'exec', 'simplecb');
                                         // END Sails 1.0 upgrade
                                       });
                         })
                         .last()
                         .flatMap(brand => {
                           return sails.services.brandingservice.loadAvailableBrands();
                         });
      } else {
        sails.log.verbose("Admin role exists.");
        return Observable.of(defBrand);
      }
    }

    protected getConfigRole = (roleName) => {
      return _.find(sails.config.auth.roles, (o) => {return o.name == roleName});
    }

    protected getConfigRoles = (roleProp=null, customObj=null) => {
      var retVal = sails.config.auth.roles;
      if (roleProp) {
        retVal = []
        _.map(sails.config.auth.roles, (o) => {
          var newObj = {};
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

module.exports = new Services.Roles().exports();
