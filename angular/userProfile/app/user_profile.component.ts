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
import { Location, LocationStrategy, PathLocationStrategy } from '@angular/common';
import { FormArray, FormGroup, FormControl, Validators, FormBuilder } from '@angular/forms';
import { ModalDirective } from 'ngx-bootstrap';
import * as _ from "lodash";

import { UserSimpleService } from './shared/user.service-simple';
import { Role, User, LoginResult, SaveResult } from './shared/user-models';
import { LoadableComponent } from './shared/loadable.component';
import { TranslationService } from './shared/translation-service';
import { UserForm, matchingValuesValidator, optionalEmailValidator } from './forms';
import * as $ from 'jquery';
declare var pageData :any;
/**
 * User Profile component
 *
 *
 * @author <a target='_' href='https://github.com/thomcuddihy'>Thom Cuddihy</a>
 */
@Component({
  moduleId: module.id,
  selector: 'user-profile',
  templateUrl: './userProfile.html',
  providers: [Location, {provide: LocationStrategy, useClass: PathLocationStrategy}]
})

@Injectable()
export class UserProfileComponent extends LoadableComponent {
  currentUser: User = new User();
  roleStr: string;

  updateDetailsMsg = "";
  updateDetailsMsgType ="info";

  initSubs: any;

  @ViewChild('userDetailsModal') userDetailsModal:ModalDirective;

  isDetailsModalShown:boolean = false;
  updateUserForm: FormGroup;
  submitted: boolean;

  constructor (@Inject(UserSimpleService) protected usersService: UserSimpleService, @Inject(FormBuilder) fb: FormBuilder, @Inject(DOCUMENT) protected document:any, translationService:TranslationService, private _fb: FormBuilder, @Inject(Location) protected location: Location) {
    super();
    this.initTranslator(translationService);
    this.initSubs = usersService.waitForInit((initStatUsers:any) => {
      this.initSubs.unsubscribe();
      translationService.isReady(tService => {
        this.refreshUser();
      });
    });
  }

  refreshUser() {
    this.usersService.getInfo().then((user:any) => {
      this.currentUser = user;
      this.roleStr = _.join(_.map(user.roles, 'name'), ', ');
      this.setupForm();
      this.checkIfHasLoaded();
    });
  }

  setupForm() {
    this.submitted = false;
    this.updateUserForm = this._fb.group({
      username: this.currentUser.username,
      name: [this.currentUser.name, Validators.required],
      email: [this.currentUser.email, optionalEmailValidator],
      passwords: this._fb.group({
        password: [''],
        confirmPassword: ['']
      }, {validator: matchingValuesValidator('password', 'confirmPassword')})
    });
  }

  return() {
    this.location.back();
  }

  genKey() {
    this.setUpdateMessage("Generating...", "primary");
    this.usersService.genUserKey().then((saveRes:SaveResult) => {
      if (saveRes.status) {
        this.currentUser.token = saveRes.message;
        this.refreshUser();
        this.setUpdateMessage("Token generated.", "primary");
      } else {
        this.setUpdateMessage(saveRes.message, "danger");
      }
    });
  }

  revokeKey() {
    this.setUpdateMessage("Revoking...", "primary");
    this.usersService.revokeUserKey().then((saveRes:SaveResult) => {
      if (saveRes.status) {
        this.currentUser.token = null;
        this.refreshUser();
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
    var details: { name: string, email: string, password: string } =
      { name: user.name, email: user.email, password: user.passwords.password };
    this.setUpdateMessage("Saving...", "primary");

    this.usersService.updateUserProfile(details).then((saveRes:SaveResult) => {
      if (saveRes.status) {
        this.refreshUser();
        this.setUpdateMessage(this.translationService.t('user-profile-success'), "success");
      } else {
        this.setUpdateMessage(saveRes.message, "danger");
      }
    });
  }

  setUpdateMessage(msg:string="", type:string="primary") {
    this.updateDetailsMsg = msg;
    this.updateDetailsMsgType = type;
  }

}
