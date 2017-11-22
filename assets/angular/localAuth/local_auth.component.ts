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
import { FormGroup, FormControl, Validators, FormBuilder } from '@angular/forms';
import { UserSimpleService } from '../shared/user.service-simple';
import { LoginResult } from '../shared/user-models'
import { LoadableComponent } from '../shared/loadable.component';
import { TranslationService } from '../shared/translation-service';

/**
 * Local Authentication  Component
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
@Component({
  moduleId: module.id,
  selector: 'local-auth',
  templateUrl: './localAuth.html'
})

@Injectable()
export class LocalAuthComponent extends LoadableComponent {
  form: FormGroup;
  loginMessage: string;
  isLoginDisabled: boolean;
  constructor (@Inject(UserSimpleService) protected userService: UserSimpleService, @Inject(FormBuilder) protected fb: FormBuilder, @Inject(DOCUMENT) protected document:any, translationService: TranslationService) {
    super();
    this.initTranslator(translationService);
    translationService.isReady(tService => {
      userService.waitForInit((whatever:any)=> {
        this.form = this.fb.group({
            "username": ["", Validators.required],
            "password":["", Validators.required]
        });
        this.form.valueChanges.subscribe(data => {
          this.isLoginDisabled = this.form.status == 'INVALID';
          if (this.isLoginDisabled) {
            this.getErrors();
          }
        });
        this.checkIfHasLoaded();
      });
    });
  }

  onLogin(event:any) {
    if (this.isLoginDisabled || this.form.status == 'INVALID') {
      this.getErrors();
      return;
    }
    event.preventDefault();
    this.isLoginDisabled = true;
    this.userService.loginLocal(this.form.value.username, this.form.value.password)
    .then((res:LoginResult) => {
      console.log(res);
      if (res.user) {
        console.log("Login success, redirecting...");
        this.document.location.href = res.url;
      } else {
        this.loginMessage = res.message;
        this.isLoginDisabled = false;
      }
    });
  }

  getErrors() {
    if (this.form.controls['username'].hasError('required')) {
      this.loginMessage = "Please provide a username.";
    } else {
      this.loginMessage = "Please provide a password.";
    }
  }
}
