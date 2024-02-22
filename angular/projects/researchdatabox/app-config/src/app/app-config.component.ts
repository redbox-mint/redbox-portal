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
import { FormGroup, Validators, FormBuilder } from '@angular/forms';
import { DOCUMENT } from "@angular/common"
import { BaseComponent, UserService, UserLoginResult, UtilityService, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { FormlyJsonschema } from '@ngx-formly/core/json-schema';
import { JSONSchema7 } from 'json-schema';

/**
 * Application Config  Component
 *
 */
@Component({
  selector: 'app-config',
  templateUrl: './app-config.component.html'
})
export class AppConfigComponent extends BaseComponent {
  // form: FormGroup = null as any;
  // loginMessage: string = null as any;
  // isLoginDisabled: boolean = false;
  // loginResult:  UserLoginResult = null as any;
  window: any;
  form = new FormGroup({});
  model = { email: 'email@gmail.com' };
  fields: FormlyFieldConfig[] = [
    {
      key: 'email',
      type: 'input',
      props: {
        label: 'Email address',
        placeholder: 'Enter email',
        required: true,
      }
    }
  ];
  

  jsonSchema:string = 
  `{
      "title": "A list of tasks",
      "type": "object",
      "required": [
        "title"
      ],
      "properties": {
        "title": {
          "type": "string",
          "title": "Task list title"
        },
        "tasks": {
          "type": "array",
          "title": "Tasks",
          "items": {
            "type": "object",
            "required": [
              "title"
            ],
            "properties": {
              "title": {
                "type": "string",
                "title": "Title",
                "description": "A sample title"
              },
              "details": {
                "type": "string",
                "title": "Task details",
                "description": "Enter the task details"
              },
              "done": {
                "type": "boolean",
                "title": "Done?",
                "default": false
              }
            }
          }
        }
      }
    }`

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(UserService) private userService: UserService,
    @Inject(UtilityService) protected utilService: UtilityService,
    @Inject(FormBuilder) private fb: FormBuilder,
    @Inject(DOCUMENT) private document: Document,
    @Inject(TranslationService) private translationService: TranslationService,
    private formlyJsonschema: FormlyJsonschema
  ) {
    super();
    this.loggerService.debug(`AppConfig waiting for deps to init...`); 
    this.window = this.document.defaultView;
    // set this component's dependencies
    const jsonObject:JSONSchema7 = JSON.parse(this.jsonSchema);

    this.fields = [this.formlyJsonschema.toFieldConfig(jsonObject)]
    this.initDependencies = [translationService, userService];
  }

  protected override async initComponent():Promise<void> {
    
    this.loggerService.debug(`AppConfig initialised.`); 
  }


  onSubmit(model:any) {
    console.log(model);
  }

}
