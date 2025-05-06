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
import { Component,  Inject, Input, ElementRef, EventEmitter, Output, ChangeDetectorRef, HostBinding } from '@angular/core';
import { Location, LocationStrategy, PathLocationStrategy } from '@angular/common';
import { FormGroup } from '@angular/forms';
import { isEmpty as _isEmpty, isString as _isString } from 'lodash-es';
import { ConfigService, LoggerService, TranslationService, BaseComponent, FormConfig, FormFieldCompMapEntry } from '@researchdatabox/portal-ng-common';

import { FormService } from './form.service';
/**
 * The ReDBox Form
 * 
 * Goals:
  - unopinionated layout
  - dynamic component loading at runtime
  - defined form event lifecycle and ability to listen 
  - validation and error handling
  
  Pending Goals:
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
  /** 
   * The FormGroup instance
   */
  form?: FormGroup;
  /**
   * The form components
   */
  components: FormFieldCompMapEntry[] = [];
  formConfig?: FormConfig;
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
    try {
      const formDef = await this.formService.getFormComponents(this.oid, this.recordType, this.editMode, this.formName, this.modulePaths);
      const components = formDef.components;
      this.formConfig = formDef.formConfig;
      // set up the form group
      const formGroupMap = this.formService.groupComponentsByName(components);
      this.loggerService.debug(`FormComponent: formGroup:`, formGroupMap);
      // TODO: set up the event handlers

      // create the form group
      this.form = new FormGroup(formGroupMap.withFormControl);

      // setting this will trigger the form to be rendered
      this.components = components;
    } catch (error) {
      this.loggerService.error(`Error loading form: ${error}`);
      throw error;
    }
    
  }

  @HostBinding('class.edit-mode') get isEditMode() {
    return this.editMode;
  }

  @HostBinding('class') get hostClasses(): string {
    if (!this.formConfig) {
      return '';
    }
    
    const cssClasses = this.editMode ? this.formConfig.editCssClasses : this.formConfig.viewCssClasses;
    
    if (!cssClasses) {
      return '';
    }
    
    if (_isString(cssClasses)) {
      return cssClasses as string;
    }
    
    // If cssClasses is an object with key-value pairs, transform it to space-delimited string
    // where keys with truthy values become class names
    return Object.entries(cssClasses as { [key: string]: string })
      .filter(([_, value]) => value)
      .map(([className, _]) => className)
      .join(' ');
  }
}
