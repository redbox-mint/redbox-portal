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

import { Component, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FormGroup, Validators, FormBuilder } from '@angular/forms';

import { BaseComponent, UserService, UserLoginResult, UtilityService, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
/**
 * Local Authentication  Component
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Component({
    selector: 'local-auth',
    templateUrl: './local-auth.component.html',
    standalone: false
})
export class LocalAuthComponent extends BaseComponent {
  form: FormGroup = null as any;
  loginMessage: string = null as any;
  isLoginDisabled: boolean = false;
  loginResult:  UserLoginResult = null as any;
  window: any;

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(UserService) private userService: UserService,
    @Inject(UtilityService) protected utilService: UtilityService,
    @Inject(FormBuilder) private fb: FormBuilder,
    @Inject(DOCUMENT) private document: Document,
    @Inject(TranslationService) private translationService: TranslationService
  ) {
    super();
    this.loggerService.debug(`LocalAuth waiting for deps to init...`); 
    this.window = this.document.defaultView;
    // set this component's dependencies
    this.initDependencies = [translationService, userService];
  }

  protected override async initComponent():Promise<void> {
    this.form = this.fb.group({
      "username": ["", Validators.required],
      "password":["", Validators.required]
    });
    this.form.valueChanges.subscribe((data:any) => {
      this.isLoginDisabled = this.form.status == 'INVALID';
      if (this.isLoginDisabled) {
        this.getErrors();
      }
    });
    this.loggerService.debug(`LocalAuth initialised.`); 
  }

  async onLogin(event:any) {
    if (this.isLoginDisabled || this.form.status == 'INVALID') {
      this.getErrors();
      return;
    }
    event.preventDefault();
    this.isLoginDisabled = true;
    this.loginResult = await this.userService.loginLocal(this.form.value.username, this.form.value.password);
    this.loggerService.debug(`LocalAuth, login result: `, this.loginResult);
    if (this.loginResult.user) {
      this.loggerService.debug(`LocalAuth, login success, redirecting...${this.loginResult.url}`);
      this.window.location.href = this.loginResult.url;
    } else {
      this.loginMessage = this.loginResult.message;
      this.isLoginDisabled = false;
    }
  }

  private getErrors():void {
    if (this.form.controls['username'].hasError('required')) {
      this.loginMessage = "Please provide a username.";
    } else {
      this.loginMessage = "Please provide a password.";
    }
  }
}
