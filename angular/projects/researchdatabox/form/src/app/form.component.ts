// Copyright (c) 2023 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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
import { Component,  Inject, Input, ElementRef, EventEmitter, Output, ChangeDetectorRef } from '@angular/core';
import { Location, LocationStrategy, PathLocationStrategy } from '@angular/common';

import { isEmpty as _isEmpty } from 'lodash-es';
import { ConfigService, LoggerService, TranslationService, BaseComponent } from '@researchdatabox/portal-ng-common';

import { FormService } from './form.service';
/**
 * The ReDBox Form
 * 
 * Goals:
  - unopinionated layout
  - dynamic component loading at runtime
  - support concurrent modifications
  
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
/**

 */
@Component({
    selector: 'redbox-form',
    templateUrl: './form.component.html',
    styleUrls: ['./form.component.scss'],
    providers: [Location, { provide: LocationStrategy, useClass: PathLocationStrategy }],
    standalone: false
})
export class FormComponent extends BaseComponent {
  appName: string;
  @Input() oid:string;
  @Input() recordType: string;
  @Input() editMode: boolean;
  @Input() formName: string;
  // TODO: remove any
  fields: any[] = [];
  modulePaths:string[] = [];
  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(ElementRef) elementRef: ElementRef,
    @Inject(FormService) private formService: FormService
  ) {
    super();
    this.initDependencies = [this.translationService];
    this.oid = elementRef.nativeElement.getAttribute('oid');
    this.recordType = elementRef.nativeElement.getAttribute('recordType');
    this.editMode = elementRef.nativeElement.getAttribute('editMode') === "true";
    this.formName = elementRef.nativeElement.getAttribute('formName') || "";
    this.appName = `Form::${this.recordType}::${this.formName} ${ this.oid ? ' - ' + this.oid : ''}`;
    this.loggerService.debug(`'${this.appName}' waiting for deps to init...`); 
  }

  protected async initComponent(): Promise<void> {
    this.loggerService.debug(`Loading form with OID: ${this.oid}, on edit mode:${this.editMode}, Record Type: ${this.recordType}, formName: ${this.formName}`);
    this.fields = await this.formService.get(this.oid, this.recordType, this.editMode, this.formName, this.modulePaths);
    
  }


}
