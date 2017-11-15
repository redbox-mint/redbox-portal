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
import * as _ from "lodash-lib";

import { UserSimpleService } from '../shared/user.service-simple';
import { RolesService } from '../shared/roles-service';
import { Role, User, LoginResult, SaveResult } from '../shared/user-models';
import { LoadableComponent } from '../shared/loadable.component';
import { TranslationService } from '../shared/translation-service';
import { NewUser, UpdateUser } from './app.interfaces';

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
export class AppComponent extends LoadableComponent {
  allUsers: User[] = [];
  filteredUsers: User[] = [];
  roles: Role[];
  updateRoles: any[];
  newRoles: any[];

  searchFilter: { name: string, prevName: string, users: any[] } = { 
    name: null, prevName: null, users: [ {value: null, label:'Any', checked:true}]};
  detailsUser: { userid: string, name: string, email: string, password: string, confirmPassword: string, roles: Role[] } =
    { userid: null, name: null, email: null, password: null, confirmPassword: null, roles: [] };
  newUser: { username: string, name: string, email: string, password: string, confirmPassword: string, roles: Role[] } =
    { username: null, name: null, email: null, password: null, confirmPassword: null, roles: []};

  hiddenUsers = ['']; //include local admin
  currentUser: User = new User();

  updateDetailsMsg = "";
  updateDetailsMsgType ="info";
  newUserMsg = "";
  newUserMsgType ="info";

  initSubs: any;

  @ViewChild('userDetailsModal') userDetailsModal:ModalDirective;
  @ViewChild('userNewModal') userNewModal:ModalDirective;

  isDetailsModalShown:boolean = false;
  isNewUserModalShown:boolean = false;
  isDetailsValidated:boolean = false;
  isNewUserValidated:boolean = false;
  
  constructor (@Inject(UserSimpleService, RolesService) protected usersService: UserSimpleService, protected rolesService: RolesService, @Inject(FormBuilder) fb: FormBuilder, @Inject(DOCUMENT) protected document:any, translationService:TranslationService) {
    super();
    this.initTranslator(translationService);
    this.initSubs = usersService.waitForInit((initStatUsers:any) => {
      rolesService.waitForInit((initStatRole:any) => {
        this.initSubs.unsubscribe();
        translationService.isReady(tService => {
          rolesService.getBrandRoles().then((roles:any) => {
            this.roles = roles;
            this.newRoles = _.map(this.roles, (r:any) => {
              return {name: r.name, id:r.id, hasRole: false };
            });
          });
          this.refreshUsers();
        });
      });      
    });
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
          // filter out any system accounts e.g.
          this.filteredUsers.push(user);
        }
      });
      _.map(this.filteredUsers, (user:any)=> {user.roleStr = _.join(_.map(user.roles, 'name'), ', ')});
      this.checkIfHasLoaded();
    });
  }

  resetNewUser() {
    this.newUser.username = null;
    this.newUser.name = null;
    this.newUser.email = null;
    this.newUser.password = null;
    this.newUser.confirmPassword = null;
    this.newRoles = _.map(this.roles, (r:any) => {
      return {name: r.name, id:r.id, hasRole: false };
    });
    this.setNewUserMessage();
    this.hideNewUserModal();
  }

  // reset model if user clicks "cancel" on modal
  resetDetailsUser() {
    this.detailsUser.userid = null; //only need to reset uid, editUser() handles rest
    this.setUpdateMessage();
    this.hideDetailsModal();
  }

  editUser(username: string) {
    //this.setUpdateMessage();
    this.currentUser = _.find(this.allUsers, (user:any)=>{return user.username == username});
    this.updateRoles = _.map(this.roles, (r:any) => {
      return {name: r.name, id:r.id, hasRole: _.includes(
        _.flatMap(this.currentUser.roles, role => { return role['name']; }), r.name)};
    });
    if (this.detailsUser.userid != this.currentUser.id){
      this.detailsUser.userid = this.currentUser.id;
      this.detailsUser.name = this.currentUser.name;
      this.detailsUser.email = this.currentUser.email;
      this.detailsUser.password = "";
      this.detailsUser.confirmPassword = "";
    }
    this.onDetailsChange();
    this.showDetailsModal();
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
        this.currentUser.token = saveRes.message;
        this.refreshUsers();
        this.setUpdateMessage();
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
        this.setUpdateMessage();
      } else {
        this.setUpdateMessage(saveRes.message, "danger");
      }
    });
  }

  // note: can rm this, was used for testing
  setCurrentUser(username: string) {
    //this.currentUser = _.find(this.allUsers, (user:any)=>{return user.username == username});
  }

  updateCurrentUser($event:any) {
    if (!this.isDetailsValidated){
      this.setUpdateMessage("Please validate form", "danger");
      return;
    }
    var details: { name: string, email: string, password: string } = 
      { name: this.detailsUser.name, email: this.detailsUser.email, password: this.detailsUser.password };
    var userRoles:any[] = [];
    _.forEach(this.updateRoles, (role:any) => {
      if (role.hasRole)
      userRoles.push(role.name);
    });
    this.setUpdateMessage("Saving...", "primary");

    let returnedOk:boolean = false;
    this.rolesService.updateUserRoles(this.detailsUser.userid, userRoles).then((saveRes:SaveResult) => {
      if (saveRes.status) {
        if (returnedOk) {
          this.hideDetailsModal();
          this.refreshUsers();
          this.setUpdateMessage();
        } else {
          returnedOk = true;
        }
      } else {
        this.setUpdateMessage(saveRes.message, "danger");
      }
    });

    this.usersService.updateUserDetails(this.detailsUser.userid, details).then((saveRes:SaveResult) => {
      if (saveRes.status) {
        if (returnedOk) {
          this.hideDetailsModal();
          this.refreshUsers();
          this.setUpdateMessage();
        } else {
          returnedOk = true;
        }
      } else {
        this.setUpdateMessage(saveRes.message, "danger");
      }
    });
  }

  addUser() {
    if (this.isNewUserValidated){
      this.setNewUserMessage("Please validate form", "danger");
      return;
    }
    var details: { name: string, email: string, password: string, roles: any[] } = 
      { name: this.newUser.name, email: this.newUser.email, password: this.newUser.password, roles: [] };
    
    _.forEach(this.newRoles, (role:any) => {
      if (role.hasRole)
      details.roles.push(role.name);
      });

    this.setNewUserMessage("Saving...", "primary");
    this.usersService.addLocalUser(this.newUser.username, details).then((saveRes:SaveResult) => {
      if (saveRes.status) {
        this.resetNewUser();
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

  onDetailsChange() {
    var validated = true;
    if (_.isEmpty(this.detailsUser.name)) {
      validated = false; 
      this.setUpdateMessage("Name cannot be empty", "danger"); 
    }

    if (!_.isEmpty(this.detailsUser.password)) {
      if (this.detailsUser.password != this.detailsUser.confirmPassword) {
        validated = false;
        this.setUpdateMessage("Passwords do not match", "danger"); 
      }
    }

    if (validated) {
      this.setUpdateMessage();
    }

    this.isDetailsValidated = validated;
  }

  onNewUserChange() {
    var validated = true;
    if (_.isEmpty(this.newUser.username)) {
      validated = false; 
      this.setNewUserMessage("Username cannot be empty", "danger"); 
    }

    if (_.isEmpty(this.newUser.name)) {
      validated = false; 
      this.setNewUserMessage("Name cannot be empty", "danger"); 
    }

    if (_.isEmpty(this.newUser.password)) {
      validated = false; 
      this.setNewUserMessage("Password cannot be empty", "danger"); 
    }

    if (!_.isEmpty(this.newUser.password)) {
      if (this.newUser.password != this.newUser.confirmPassword) {
        validated = false;
        this.setNewUserMessage("Passwords do not match", "danger"); 
      }
    }

    if (validated) {
      this.setNewUserMessage();
    }
    
    this.isNewUserValidated = validated;
    this.isNewUserValidated = true;
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
