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

import { Component, Injectable, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/platform-browser';
import { FormArray, FormGroup, FormControl, Validators, FormBuilder } from '@angular/forms';
import { UserSimpleService } from './shared/user.service-simple';
import { RolesService } from './shared/roles-service';
import { Role, User, LoginResult, SaveResult } from './shared/user-models';
import * as _ from "lodash";
import { LoadableComponent } from './shared/loadable.component';
import { TranslationService } from './shared/translation-service';

declare var pageData :any;
declare var jQuery: any;
/**
 * Manage Roles component
 *
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 */
@Component({
  moduleId: module.id,
  selector: 'manage-roles',
  templateUrl: './manageRoles.html'
})

// TODO: find a way to remove jQuery dependency
@Injectable()
export class ManageRolesComponent extends LoadableComponent {
  users: any[] = [];
  filteredUsers: any[];
  searchFilter: { name: string, role: any, prevName: string, prevRole: any, roles: any[] } = { name: null, role: null, prevName: null, prevRole:null, roles: [ {value: null, label:'Any', checked:true}]};
  roles: Role[];
  hiddenUsers = ['admin'];
  currentUser: any = {username:'', name:'', email:'', roles:[]};
  saveMsg = "";
  saveMsgType ="info";
  initSubs: any;

  constructor (@Inject(RolesService) protected rolesService: RolesService, @Inject(FormBuilder) fb: FormBuilder, @Inject(DOCUMENT) protected document:any, translationService:TranslationService) {
    super();
    this.initTranslator(translationService);
    this.initSubs = rolesService.waitForInit((initStat:any) => {
      this.initSubs.unsubscribe();
      translationService.isReady(tService => {
        rolesService.getBrandRoles().then((roles:any) => {
          this.roles = roles;
          _.forEach(roles, (role:any) => {
            this.searchFilter.roles.push({value:role.name, label:role.name, checked:false});
            _.forEach(role.users, (user:any) => {
              if (!_.includes(this.hiddenUsers, user.username)) {
                // flattening the tree, match by username
                let existingUser: any = _.find(this.users, (existingUser:any) => { return existingUser.username == user.username});
                if (_.isEmpty(existingUser)) {
                  existingUser = user;
                  existingUser.roles = [role.name];
                  this.users.push(existingUser);
                } else {
                  existingUser.roles.push(role.name);
                }
              }
            });
          });
          _.map(this.users, (user:any)=> {user.roleStr = _.join(user.roles, ', ')});
          this.filteredUsers = this.users;
          this.checkIfHasLoaded();
        });
      });
    });
  }

  editUser(username:string) {
    this.setSaveMessage();
    this.currentUser = _.find(this.users, (user:any)=>{return user.username == username});
    this.currentUser.newRoles = _.map(this.roles, (r:any) => {
      return {name: r.name, id:r.id, hasRole: _.includes(this.currentUser.roles, r.name)};
    });
  }

  saveCurrentUser($event:any) {
    let hasRole:boolean = false;
    let newRoles:any[] = [];
    _.forEach(this.currentUser.newRoles, (role:any) => {
      hasRole = hasRole || role.hasRole;
      if (role.hasRole)
        newRoles.push(role.name);
    });
    if (!hasRole) {
      this.setSaveMessage("Please select at least one role!", "danger");
      return;
    }
    this.setSaveMessage("Saving...", "primary");
    this.rolesService.updateUserRoles(this.currentUser.id, newRoles).then((saveRes:SaveResult) => {
      if (saveRes.status) {
        this.currentUser.roles = newRoles;
        this.currentUser.roleStr =  _.join(this.currentUser.roles);
        this.setSaveMessage();
        jQuery('#myModal').modal('hide');
      } else {
        this.setSaveMessage(saveRes.message, "danger");
      }
    });
  }

  setSaveMessage(msg:string="", type:string="primary") {
    this.saveMsg = msg;
    this.saveMsgType = type;
  }

  onFilterChange(roleFilter:any=null) {
    if (roleFilter) {
      roleFilter.checked = true;
      this.searchFilter.role = roleFilter.value;
      _.map(this.searchFilter.roles, (role:any)=> role.checked = roleFilter.value == role.value );
    }
    if (this.searchFilter.name != this.searchFilter.prevName || this.searchFilter.role != this.searchFilter.prevRole) {
      this.searchFilter.prevName = this.searchFilter.name;
      this.searchFilter.prevRole = this.searchFilter.role;
      var nameFilter =_.isEmpty(this.searchFilter.name) ? "" : _.trim(this.searchFilter.name);
      // run filter change...
      this.filteredUsers = _.filter(this.users, (user:any) => {
        var hasRole = this.searchFilter.role == null ?  true : _.includes(user.roles, this.searchFilter.role);
        var hasNameMatch = nameFilter == "" ? true : (_.toLower(user.name).indexOf(_.toLower(this.searchFilter.name)) >= 0);
        return hasRole && hasNameMatch;
      });
    }
  }

  resetFilter() {
    this.searchFilter.name = null;
    this.searchFilter.role = null;
    _.map(this.searchFilter.roles, (role:any)=> role.checked = role.value == null);
    this.onFilterChange();
  }
}
