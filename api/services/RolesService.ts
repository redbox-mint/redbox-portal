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
import services = require('../../typescript/services/CoreService.js');
import {Sails, Model} from "sails";

declare var sails: Sails;
declare var Role, BrandingConfig: Model;
declare var ConfigService;
declare var _this;

export module Services {
  /**
   * Roles services
   *
   *
   * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
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
      'getDefAuthenticatedRole',
      'getDefUnathenticatedRole',
      'getNestedRoles'
    ];

    public getRoleWithName = (roles, roleName) :Role => {
      return _.find(roles, (o) => {return o.name == roleName});
    }

    public getRole = (brand, roleName) :Role => {
      return _this.getRoleWithName(brand.roles, roleName);
    }

    public getAdmin = (brand) :Role => {
      return _this.getRole(brand, _this.getConfigRole('Admin').name);
    }

    public getAdminFromRoles = (roles) :Role => {
      return _this.getRoleWithName(roles, _this.getConfigRole('Admin').name);
    }

    public getDefAuthenticatedRole = (brand:BrandingConfig) :Role => {
      sails.log.verbose(_this.getRoleWithName(brand.roles, _this.getConfigRole(ConfigService.getBrand(brand.name, 'auth').aaf.defaultRole).name));
      return _this.getRoleWithName(brand.roles, _this.getConfigRole(ConfigService.getBrand(brand.name, 'auth').aaf.defaultRole).name);
    }

    public getNestedRoles = (role, brandRoles) => {
      var roles = [];
      switch (role) {
        case "Admin":
          roles.push(_this.getRoleWithName(brandRoles, 'Admin'));
        case "Maintainer":
          roles.push(_this.getRoleWithName(brandRoles, 'Maintainer'));
        case "Researcher":
          roles.push(_this.getRoleWithName(brandRoles, 'Researcher'));
        case "Guest":
          roles.push(_this.getRoleWithName(brandRoles, 'Guest'));
          break;
      }
      return roles;
    }

    public getDefUnathenticatedRole = (brand: BrandingConfig) :Role => {
      return _this.getRoleWithName(brand.roles, _this.getConfigRole(ConfigService.getBrand(brand.name, 'auth').defaultRole).name);
    }

    public getRolesWithBrand = (brand) :Observable<any> => {
      return super.getObservable(Role.find({branding:brand.id}).populate('users'));
    }

    public getRoleIds = (fromRoles, roleNames) => {
      sails.log.verbose("Getting id of role names...");
      return _.map(_.filter(fromRoles, (role)=> {return _.includes(roleNames, role.name)}), 'id');
    }

    public bootstrap = (defBrand) => {
      var adminRole = _this.getAdmin(defBrand);
      if (adminRole == null) {
        sails.log.verbose("Creating default admin, and other roles...");
        return Observable.from(_this.getConfigRoles())
                         .flatMap(roleConfig => {
                           return super.getObservable(Role.create(roleConfig))
                                       .flatMap(newRole => {
                                         sails.log.verbose("Adding role to brand:" + newRole.id);
                                         var brand = sails.services.brandingservice.getDefault();
                                         brand.roles.add(newRole.id);
                                         return super.getObservable(brand, 'save', 'simplecb');
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
