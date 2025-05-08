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
import { Component,  Inject, Input, ElementRef, signal, effect, computed, HostBinding } from '@angular/core';
import { Location, LocationStrategy, PathLocationStrategy } from '@angular/common';
import { FormGroup } from '@angular/forms';
import { isEmpty as _isEmpty, isString as _isString } from 'lodash-es';
import { ConfigService, LoggerService, TranslationService, BaseComponent, FormFieldCompMapEntry, FormFieldComponentStatus, FormStatus } from '@researchdatabox/portal-ng-common';

import { FormComponentsMap, FormService } from './form.service';
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
  formDefMap?: FormComponentsMap;
  modulePaths:string[] = [];
  
  status = signal<FormStatus>(FormStatus.INIT);
  componentsLoaded = signal<boolean>(false);

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
    effect(() => {
      if (this.componentsLoaded()) {
        this.status.set(FormStatus.READY);
      }
    });
  }

  protected async initComponent(): Promise<void> {
    this.loggerService.debug(`Loading form with OID: ${this.oid}, on edit mode:${this.editMode}, Record Type: ${this.recordType}, formName: ${this.formName}`);
    try {
      this.formDefMap = await this.formService.downloadFormComponents(this.oid, this.recordType, this.editMode, this.formName, this.modulePaths);
      this.createFormGroup();
      // TODO: set up the event handlers
    } catch (error) {
      this.loggerService.error(`Error loading form: ${error}`);
      this.status.set(FormStatus.LOAD_ERROR);
      throw error;
    }
  }
  /**
   * Notification hook for when a component is ready.
   * 
   * @param componentEntry - The component entry that is ready.
   */
  protected registerComponentReady(componentEntry: FormFieldCompMapEntry): void {
    if (this.formDefMap && this.formDefMap.components && this.componentsLoaded() == false) {
      // Set the overall loaded flag to true if all components are loaded
      this.componentsLoaded.set(this.formDefMap.components.every(componentDef => componentDef.component && componentDef.component.status() === FormFieldComponentStatus.READY));
    }
  }
  /**
   * Create the form group based on the form definition map.
   */
  private createFormGroup(): void {
    if (this.formDefMap && this.formDefMap.formConfig) {
      const components = this.formDefMap.components;
      // set up the form group  
      const formGroupMap = this.formService.groupComponentsByName(this.formDefMap);
      this.loggerService.debug(`FormComponent: formGroup:`, formGroupMap);
      // create the form group
      if (!_isEmpty(formGroupMap.withFormControl)) {
        this.form = new FormGroup(formGroupMap.withFormControl);
        // setting this will trigger the form to be rendered
        this.components = components;
      } else {
        this.loggerService.warn(`FormComponent: No form controls found in the form definition. Form will not be rendered.`);
        throw new Error(`FormComponent: No form controls found in the form definition. Form will not be rendered.`);
      }
    }
  }

  @HostBinding('class.edit-mode') get isEditMode() {
    return this.editMode;
  }

  @HostBinding('class') get hostClasses(): string {
    if (!this.formDefMap?.formConfig) {
      return '';
    }
    
    const cssClasses = this.editMode ? this.formDefMap.formConfig.editCssClasses : this.formDefMap.formConfig.viewCssClasses;
    
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
