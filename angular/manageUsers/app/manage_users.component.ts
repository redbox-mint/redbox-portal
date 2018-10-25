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

import { Component, Injectable, Inject, ViewChild } from '@angular/core';
import { DOCUMENT } from '@angular/platform-browser';
import { FormArray, FormGroup, FormControl, Validators, FormBuilder } from '@angular/forms';
import { ModalDirective } from 'ngx-bootstrap';
import * as _ from "lodash";

import { UserSimpleService } from './shared/user.service-simple';
import { RolesService } from './shared/roles-service';
import { Role, User, LoginResult, SaveResult } from './shared/user-models';
import { LoadableComponent } from './shared/loadable.component';
import { TranslationService } from './shared/translation-service';
import { UserForm, matchingValuesValidator, optionalEmailValidator } from './forms';

declare var pageData :any;
/**
 * Manage Users component
 *
 *
 * @author <a target='_' href='https://github.com/thomcuddihy'>Thom Cuddihy</a>
 */
@Component({
  moduleId: module.id,
  selector: 'manage-users',
  templateUrl: './manageUsers.html'
})

@Injectable()
export class ManageUsersComponent extends LoadableComponent {
  allUsers: User[] = [];
  filteredUsers: User[] = [];
  allRoles: Role[];

  searchFilter: { name: string, prevName: string, users: any[] } = {
    name: null, prevName: null, users: [ {value: null, label:'Any', checked:true}]};
  hiddenUsers = [''];
  currentUser: User = new User();

  updateDetailsMsg = "";
  updateDetailsMsgType ="info";
  newUserMsg = "";
  newUserMsgType ="info";

  @ViewChild('userDetailsModal') userDetailsModal:ModalDirective;
  @ViewChild('userNewModal') userNewModal:ModalDirective;

  isDetailsModalShown:boolean = false;
  isNewUserModalShown:boolean = false;
  updateUserForm: FormGroup;
  newUserForm: FormGroup;
  submitted: boolean;
  showToken: boolean;

  constructor (@Inject(UserSimpleService) protected usersService: UserSimpleService, @Inject(RolesService) protected rolesService: RolesService, @Inject(FormBuilder) fb: FormBuilder, @Inject(DOCUMENT) protected document:any, translationService:TranslationService, private _fb: FormBuilder) {
    super();
    this.initTranslator(translationService);
    translationService.isReady(tService => {
      this.waitForInit([
        usersService,
        rolesService
      ], () => {
        rolesService.getBrandRoles().then((roles:any) => {
          this.allRoles = roles;
          this.refreshUsers();
        });
      });
    });
  }

  setupForms() {
    this.submitted = false;
    let updateRolesControlArray = new FormArray(this.allRoles.map((role) => {
      return new FormGroup({
        key: new FormControl(role.id),
        value: new FormControl(role.name),
        checked: new FormControl(_.includes(_.flatMap(this.currentUser.roles, role => { return role['name']; }), role.name)),
      });
    }));

    let newRolesControlArray = new FormArray(this.allRoles.map((role) => {
      return new FormGroup({
        key: new FormControl(role.id),
        value: new FormControl(role.name),
        checked: new FormControl(false),
      });
    }));

    this.updateUserForm = this._fb.group({
      userid: this.currentUser.id,
      username: this.currentUser.username,
      name: [this.currentUser.name, Validators.required],
      email: [this.currentUser.email, optionalEmailValidator],
      passwords: this._fb.group({
        password: [''],
        confirmPassword: ['']
      }, {validator: matchingValuesValidator('password', 'confirmPassword')}),
      allRoles: updateRolesControlArray,
      roles: [this.mapRoles(updateRolesControlArray.value), Validators.required]
    });

    this.newUserForm = this._fb.group({
      username: ['', Validators.required],
      name: ['', Validators.required],
      email: ['', optionalEmailValidator],
      passwords: this._fb.group({
        password: ['', Validators.required],
        confirmPassword: ['', Validators.required]
      }, {validator: matchingValuesValidator('password', 'confirmPassword')}),
      allRoles: newRolesControlArray,
      roles: [this.mapRoles(newRolesControlArray.value), Validators.required]
    });

    updateRolesControlArray.valueChanges.subscribe((v) => {
      this.updateUserForm.controls.roles.setValue(this.mapRoles(v));
    });

    newRolesControlArray.valueChanges.subscribe((v) => {
      this.newUserForm.controls.roles.setValue(this.mapRoles(v));
    });

  }

  mapRoles(roles) {
    let selectedRoles = roles.filter((role) => role.checked).map((r) => {
      let ret = new Role();
      ret.id = r.key;
      ret.name = r.value;
      return ret;
      });
    return selectedRoles.length ? selectedRoles : null;
  }

  refreshUsers() {
    this.usersService.getUsers().then((users:any) => {
      this.allUsers = users;
      _.forEach(this.searchFilter.users, (user:any) => {
        this.searchFilter.users.pop();
      });
      this.filteredUsers = [];
      _.forEach(users, (user:any) => {
        this.searchFilter.users.push({value:user.name, label:user.name, checked:false});
        if (!_.includes(this.hiddenUsers, user.username)) {
          this.filteredUsers.push(user);
        }
      });
      _.map(this.filteredUsers, (user:any)=> {user.roleStr = _.join(_.map(user.roles, 'name'), ', ')});
      this.checkIfHasLoaded();
    });
  }

  editUser(username: string) {
    this.showToken = false;
    this.setUpdateMessage();
    this.currentUser = _.find(this.allUsers, (user:any)=>{return user.username == username});
    this.setupForms();
    this.showDetailsModal();
  }

  newUser() {
    this.setNewUserMessage();
    this.setupForms();
    this.showNewUserModal();
  }

  showDetailsModal():void {this.isDetailsModalShown = true;}
  hideDetailsModal():void {this.userDetailsModal.hide();}
  onDetailsModalHidden():void {this.isDetailsModalShown = false;}

  showNewUserModal():void {this.isNewUserModalShown = true;}
  hideNewUserModal():void {this.userNewModal.hide();}
  onNewUserHidden():void {this.isNewUserModalShown = false;}

  genKey(userid: string) {
    this.setUpdateMessage("Generating...", "primary");
    this.usersService.genKey(userid).then((saveRes:SaveResult) => {
      if (saveRes.status) {
        this.showToken = true;
        this.currentUser.token = saveRes.message;
        this.refreshUsers();
        this.setUpdateMessage("Token generated.", "primary");
      } else {
        this.setUpdateMessage(saveRes.message, "danger");
      }
    });
  }

  revokeKey(userid: string) {
    this.setUpdateMessage("Revoking...", "primary");
    this.usersService.revokeKey(userid).then((saveRes:SaveResult) => {
      if (saveRes.status) {
        this.currentUser.token = null;
        this.refreshUsers();
        this.setUpdateMessage("Token revoked.", "primary");
      } else {
        this.setUpdateMessage(saveRes.message, "danger");
      }
    });
  }

  updateUserSubmit(user: UserForm, isValid: boolean) {
    this.submitted = true;
    if (!isValid){
      this.setUpdateMessage(this.translationService.t('manage-users-validation-submit'), "danger");
      return;
    }
    var details: { name: string, email: string, password: string, roles: any[] } =
      { name: user.name, email: user.email, password: user.passwords.password, roles: [] };
    _.forEach(user.roles, (role:any) => {
      details.roles.push(role.name);
    });
    this.setUpdateMessage("Saving...", "primary");

    this.usersService.updateUserDetails(user.userid, details).then((saveRes:SaveResult) => {
      if (saveRes.status) {
        this.hideDetailsModal();
        this.refreshUsers();
        this.setUpdateMessage();
      } else {
        this.setUpdateMessage(saveRes.message, "danger");
      }
    });
  }

  newUserSubmit(user: UserForm, isValid: boolean) {
    this.submitted = true;
    if (!isValid){
      this.setNewUserMessage(this.translationService.t('manage-users-validation-submit'), "danger");
      return;
    }
    var details: { name: string, email: string, password: string, roles: any[] } =
      { name: user.name, email: user.email, password: user.passwords.password, roles: [] };

    var userRoles:any[] = [];
    _.forEach(user.roles, (role:any) => {
      details.roles.push(role.name);
    });

    this.setNewUserMessage("Saving...", "primary");
    this.usersService.addLocalUser(user.username, details).then((saveRes:SaveResult) => {
      if (saveRes.status) {
        this.hideNewUserModal();
        this.refreshUsers();
        this.setNewUserMessage();
      } else {
        this.setNewUserMessage(saveRes.message, "danger");
      }
    });
  }

  setUpdateMessage(msg:string="", type:string="primary") {
    this.updateDetailsMsg = msg;
    this.updateDetailsMsgType = type;
  }

  setNewUserMessage(msg:string="", type:string="primary") {
    this.newUserMsg = msg;
    this.newUserMsgType = type;
  }

  onFilterChange() {
    if (this.searchFilter.name != this.searchFilter.prevName) {
      this.searchFilter.prevName = this.searchFilter.name;
      var nameFilter =_.isEmpty(this.searchFilter.name) ? "" : _.trim(this.searchFilter.name);

      this.filteredUsers = _.filter(this.allUsers, (user:any) => {
        var hasNameMatch = nameFilter == "" ? true : (_.toLower(user.name).indexOf(_.toLower(this.searchFilter.name)) >= 0);
        return hasNameMatch;
      });
    }
  }

  resetFilter() {
    this.searchFilter.name = null;
    _.map(this.searchFilter.users, (user:any)=> user.checked = user.value == null);
    this.onFilterChange();
  }
}
