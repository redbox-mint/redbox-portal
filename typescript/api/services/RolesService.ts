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
import services = require('../core/CoreService.js');
import {Sails, Model} from "sails";

declare var sails: Sails;
declare var Role, BrandingConfig: Model;
declare var ConfigService;


export module Services {
  /**
   * Roles services
   *
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Roles extends services.Services.Core.Service {

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
      'getNestedRoles'
    ];

    public getRoleWithName = (roles, roleName) :Role => {
      return _.find(roles, (o) => {return o.name == roleName});
    }

    public getRole = (brand, roleName) :Role => {
      return this.getRoleWithName(brand.roles, roleName);
    }

    public getRoleByName = (brand, roleName) :Role => {
      return this.getRoleWithName(brand.roles, this.getConfigRole(roleName).name);
    }

    public getAdmin = (brand) :Role => {
      return this.getRole(brand, this.getConfigRole('Admin').name);
    }

    public getAdminFromRoles = (roles) :Role => {
      return this.getRoleWithName(roles, this.getConfigRole('Admin').name);
    }

    public getDefAuthenticatedRole = (brand:BrandingConfig) :Role => {
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

    public getDefUnathenticatedRole = (brand: BrandingConfig) :Role => {
      return this.getRoleWithName(brand.roles, this.getConfigRole(ConfigService.getBrand(brand.name, 'auth').defaultRole).name);
    }

    public getRolesWithBrand = (brand) :Observable<any> => {
      return super.getObservable(Role.find({branding:brand.id}).populate('users'));
    }

    public getRoleIds = (fromRoles, roleNames) => {
      sails.log.verbose("Getting id of role names...");
      return _.map(_.filter(fromRoles, (role)=> {return _.includes(roleNames, role.name)}), 'id');
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
