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

import { Component, ElementRef, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FormGroup, Validators, FormBuilder } from '@angular/forms';

import { BaseComponent, UtilityService, LoggerService, TranslationService, AppConfigService } from '@researchdatabox/portal-ng-common';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { FormlyJsonschema } from '@ngx-formly/core/json-schema';
import { JSONSchema7 } from 'json-schema';
import { AppConfig } from 'projects/researchdatabox/portal-ng-common/src/public-api';
import { clone as _clone } from 'lodash'
/**
 * Application Config  Component
 *
 */
@Component({
    selector: 'app-config',
    templateUrl: './app-config.component.html',
    standalone: false
})
export class AppConfigComponent extends BaseComponent {

  window: any;
  form = new FormGroup({});
  model = {};
  fields: FormlyFieldConfig[] = [
   
  ];
  configKey: any;
  formSaving: boolean = false;
  formSaveSuccessful: boolean = false;
  formSaveUnsuccessful: boolean = false;


  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(UtilityService) protected utilService: UtilityService,
    @Inject(FormBuilder) private fb: FormBuilder,
    @Inject(DOCUMENT) private document: Document,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(AppConfigService) private appConfigService: AppConfigService,
    private formlyJsonschema: FormlyJsonschema,
    @Inject(ElementRef) elementRef: ElementRef
  ) {
    super();
    this.loggerService.debug(`AppConfig waiting for deps to init...`);
    this.window = this.document.defaultView;
    // set this component's dependencies
    this.configKey = elementRef.nativeElement.getAttribute('configKey');
    this.initDependencies = [translationService, appConfigService];
  }

  protected override async initComponent(): Promise<void> {
    let result: AppConfig = await this.appConfigService.getAppConfigForm(this.configKey)
    const jsonObject: JSONSchema7 = result.schema as JSONSchema7;
    const fieldOrder = result.fieldOrder;
    let originalProperties = _clone(jsonObject.properties);
    jsonObject.properties = {};
    for (let field of fieldOrder) {
      if (originalProperties) {
        jsonObject.properties[field] = originalProperties[field];
      }
    }

    this.fields = [this.formlyJsonschema.toFieldConfig(jsonObject)]
    this.model = result.model;
    this.loggerService.debug(`AppConfig initialised.`);
  }


  onSubmit(model: any) {
    this.formSaving = true;
    this.formSaveUnsuccessful = false;
    this.formSaveSuccessful = false;
    this.appConfigService.saveAppConfig(this.configKey, model).then((result: AppConfig) => {
      this.formSaveSuccessful = true;
      setTimeout(() => {
        this.formSaveSuccessful = false;
      }, 3000);
      this.formSaving = false;
    }).catch((error: any) => {
      this.formSaveSuccessful = false;
      this.formSaveUnsuccessful = true;
      this.formSaving = false;
    });
  }
}
